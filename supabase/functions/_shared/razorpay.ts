// Razorpay logic shared by the billing and webhook functions. Pure apart from `fetch`
// and Web Crypto, so it runs in Deno (Edge Functions) and in Node (tests) unchanged.

export type Market = "IN" | "US";
export type Period = "monthly" | "yearly";
export type PlanKey = `${Lowercase<Market>}_${Period}`;
export const PLAN_KEYS: PlanKey[] = ["in_monthly", "in_yearly", "us_monthly", "us_yearly"];

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  /** Razorpay plan ids by our plan key. */
  plans: Partial<Record<PlanKey, string>>;
  trialDays: number;
}

/** Reads config from an env getter (Deno.env.get in functions). Throws naming the missing variable. */
export function razorpayConfig(get: (k: string) => string | undefined): RazorpayConfig {
  const need = (k: string) => {
    const v = get(k);
    if (!v) throw new Error(`missing secret ${k}`);
    return v;
  };
  const plans: RazorpayConfig["plans"] = {};
  for (const k of PLAN_KEYS) {
    const v = get(`RAZORPAY_PLAN_${k.toUpperCase()}`);
    if (v) plans[k] = v;
  }
  return {
    keyId: need("RAZORPAY_KEY_ID"), keySecret: need("RAZORPAY_KEY_SECRET"), webhookSecret: get("RAZORPAY_WEBHOOK_SECRET") ?? "",
    plans, trialDays: Number(get("PRO_TRIAL_DAYS") ?? 7),
  };
}

export function isPlanKey(x: unknown): x is PlanKey {
  return typeof x === "string" && (PLAN_KEYS as string[]).includes(x);
}

// ---------------------------------------------------------------- signatures

const enc = new TextEncoder();
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** Webhook: HMAC-SHA256 of the raw body with the webhook secret. */
export async function verifyWebhook(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return safeEqual(await hmacHex(secret, rawBody), signature);
}
/** Checkout result for a subscription: HMAC-SHA256 of "payment_id|subscription_id" with the key secret. */
export async function verifyCheckout(paymentId: string, subscriptionId: string, signature: string, keySecret: string): Promise<boolean> {
  if (!paymentId || !subscriptionId || !signature) return false;
  return safeEqual(await hmacHex(keySecret, `${paymentId}|${subscriptionId}`), signature);
}

// ---------------------------------------------------------------- API

export interface RzpSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  start_at?: number | null;
  charge_at?: number | null;
  ended_at?: number | null;
  notes?: Record<string, string> | unknown[];
}

export class RazorpayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function razorpayApi(cfg: Pick<RazorpayConfig, "keyId" | "keySecret">, fetchImpl: typeof fetch = fetch) {
  const auth = "Basic " + btoa(`${cfg.keyId}:${cfg.keySecret}`);
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
      method, headers: { authorization: auth, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try { msg = JSON.parse(text)?.error?.description ?? msg; } catch { /* keep text */ }
      throw new RazorpayError(res.status, `Razorpay ${method} ${path} failed (${res.status}): ${msg}`);
    }
    return JSON.parse(text) as T;
  };
  return {
    createSubscription: (b: { plan_id: string; total_count: number; customer_notify: 0 | 1; start_at?: number; notes: Record<string, string> }) =>
      call<RzpSubscription & { short_url?: string }>("POST", "/subscriptions", b),
    fetchSubscription: (id: string) => call<RzpSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`),
    cancelSubscription: (id: string, atCycleEnd: boolean) =>
      call<RzpSubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  };
}

/** How many billing cycles a subscription is authorised for (Razorpay requires a count): about ten years. */
export const totalCount = (k: PlanKey) => (k.endsWith("monthly") ? 120 : 10);

/** Builds the create-subscription body. The trial is offered once per user. */
export function subscriptionRequest(cfg: RazorpayConfig, plan: PlanKey, userId: string, hadSubscription: boolean, nowMs: number) {
  const planId = cfg.plans[plan];
  if (!planId) throw new Error(`plan ${plan} is not configured`);
  const trial = !hadSubscription && cfg.trialDays > 0;
  return {
    plan_id: planId,
    total_count: totalCount(plan),
    customer_notify: 1 as const,
    ...(trial ? { start_at: Math.floor(nowMs / 1000) + cfg.trialDays * 86400 } : {}),
    notes: { user_id: userId, plan_key: plan },
  };
}

// ---------------------------------------------------------------- webhook → row

export interface SubscriptionRow {
  user_id: string;
  provider: "razorpay";
  provider_subscription_id: string;
  plan_key: string;
  status: string;
  trial_end: string | null;
  current_start: string | null;
  current_end: string | null;
  cancel_at_period_end: boolean;
  provider_updated_at: number;
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
const noteOf = (s: RzpSubscription, k: string) => (s.notes && !Array.isArray(s.notes) ? (s.notes as Record<string, string>)[k] : undefined);

/** The subscriptions row for a Razorpay subscription entity. Null when it carries no user (not ours). */
export function rowFromSubscription(s: RzpSubscription, updatedAt: number, cancelAtPeriodEnd = false): SubscriptionRow | null {
  const userId = noteOf(s, "user_id");
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  // A future start_at with no charge yet is a trial.
  const trialEnd = s.status === "authenticated" && s.start_at ? iso(s.start_at) : null;
  return {
    user_id: userId, provider: "razorpay", provider_subscription_id: s.id, plan_key: noteOf(s, "plan_key") ?? s.plan_id,
    status: s.status, trial_end: trialEnd, current_start: iso(s.current_start), current_end: iso(s.current_end),
    cancel_at_period_end: cancelAtPeriodEnd, provider_updated_at: updatedAt,
  };
}

export interface WebhookBody {
  event: string;
  created_at: number;
  payload: { subscription?: { entity: RzpSubscription } };
}
/** Events that change a subscription's state; others (payment.*, invoice.*) are recorded only. */
export const SUBSCRIPTION_EVENTS = new Set([
  "subscription.authenticated", "subscription.activated", "subscription.charged", "subscription.pending",
  "subscription.halted", "subscription.cancelled", "subscription.completed", "subscription.paused",
  "subscription.resumed", "subscription.updated",
]);
