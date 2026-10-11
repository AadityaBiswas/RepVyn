// Razorpay helpers used by the billing and webhook functions (supabase/functions/_shared/razorpay.ts).
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { corsHeaders } from "../../supabase/functions/_shared/http";
import { razorpayApi, razorpayConfig, rowFromSubscription, safeEqual, subscriptionRequest, verifyCheckout, verifyWebhook, type RzpSubscription } from "../../supabase/functions/_shared/razorpay";

const hmac = (secret: string, msg: string) => createHmac("sha256", secret).update(msg).digest("hex");
const USER = "00000000-0000-4000-8000-0000000000aa";
const env: Record<string, string> = {
  RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sec", RAZORPAY_WEBHOOK_SECRET: "whsec",
  RAZORPAY_PLAN_IN_YEARLY: "plan_in_y", RAZORPAY_PLAN_US_MONTHLY: "plan_us_m",
};
const cfg = razorpayConfig((k) => env[k]);

describe("razorpay", () => {
  it("verifies webhook signatures over the raw body", async () => {
    const body = '{"event":"subscription.charged"}';
    expect(await verifyWebhook(body, hmac("whsec", body), "whsec")).toBe(true);
    expect(await verifyWebhook(body + " ", hmac("whsec", body), "whsec")).toBe(false);
    expect(await verifyWebhook(body, null, "whsec")).toBe(false);
    expect(await verifyWebhook(body, hmac("", body), "")).toBe(false); // no secret configured: refuse everything
  });

  it("verifies checkout signatures as payment_id|subscription_id", async () => {
    const sig = hmac("sec", "pay_1|sub_1");
    expect(await verifyCheckout("pay_1", "sub_1", sig, "sec")).toBe(true);
    expect(await verifyCheckout("pay_2", "sub_1", sig, "sec")).toBe(false);
    expect(await verifyCheckout("", "", "", "sec")).toBe(false);
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });

  it("reads config and names a missing secret", () => {
    expect(cfg.plans).toEqual({ in_yearly: "plan_in_y", us_monthly: "plan_us_m" });
    expect(cfg.trialDays).toBe(7);
    expect(() => razorpayConfig(() => undefined)).toThrow(/RAZORPAY_KEY_ID/);
  });

  it("offers the trial once and refuses unconfigured plans", () => {
    const now = Date.UTC(2026, 9, 11);
    const first = subscriptionRequest(cfg, "in_yearly", USER, false, now);
    expect(first).toMatchObject({ plan_id: "plan_in_y", total_count: 10, notes: { user_id: USER, plan_key: "in_yearly" } });
    expect(first.start_at).toBe(now / 1000 + 7 * 86400);
    expect(subscriptionRequest(cfg, "in_yearly", USER, true, now)).not.toHaveProperty("start_at");
    expect(subscriptionRequest(cfg, "us_monthly", USER, true, now).total_count).toBe(120);
    expect(() => subscriptionRequest(cfg, "us_yearly", USER, false, now)).toThrow(/not configured/);
  });

  it("maps a subscription to our row, and ignores ones without our user", () => {
    const sub: RzpSubscription = { id: "sub_1", plan_id: "plan_in_y", status: "active", current_start: 1_790_000_000, current_end: 1_821_536_000, notes: { user_id: USER, plan_key: "in_yearly" } };
    expect(rowFromSubscription(sub, 5)).toMatchObject({
      user_id: USER, provider_subscription_id: "sub_1", plan_key: "in_yearly", status: "active",
      current_end: new Date(1_821_536_000_000).toISOString(), trial_end: null, provider_updated_at: 5,
    });
    expect(rowFromSubscription({ ...sub, status: "authenticated", current_start: null, current_end: null, start_at: 1_791_000_000 }, 1)?.trial_end)
      .toBe(new Date(1_791_000_000_000).toISOString());
    expect(rowFromSubscription({ ...sub, notes: [] }, 1)).toBeNull();
    expect(rowFromSubscription({ ...sub, notes: { user_id: "x' or 1=1" } }, 1)).toBeNull();
  });

  it("calls the API with basic auth and surfaces Razorpay's error text", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { description: "plan_id is invalid" } }), { status: 400 }));
    const api = razorpayApi(cfg, f as unknown as typeof fetch);
    await expect(api.createSubscription({ plan_id: "x", total_count: 1, customer_notify: 1, notes: {} })).rejects.toThrow(/plan_id is invalid/);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions");
    expect((init.headers as Record<string, string>).authorization).toBe("Basic " + btoa("rzp_test_x:sec"));
  });

  it("only reflects allowed origins in CORS", () => {
    expect(corsHeaders("https://app.repvyn.com", ["https://app.repvyn.com"])["access-control-allow-origin"]).toBe("https://app.repvyn.com");
    expect(corsHeaders("https://evil.example", ["https://app.repvyn.com"])["access-control-allow-origin"]).toBe("https://app.repvyn.com");
  });
});

describe("apply_subscription", () => {
  it("ignores stale webhooks and other users' rows", async () => {
    const { freshDb, addUser, as } = await import("./pg");
    const db = await freshDb();
    await addUser(db, USER);
    const B = "00000000-0000-4000-8000-0000000000bb";
    await addUser(db, B);
    const apply = (row: object) => as(db, "service", "select public.apply_subscription($1::jsonb)", [JSON.stringify(row)]);
    const base = { user_id: USER, provider: "razorpay", provider_subscription_id: "sub_1", plan_key: "in_yearly", trial_end: null, current_start: null, cancel_at_period_end: false };
    await apply({ ...base, status: "active", current_end: "2999-01-01T00:00:00Z", provider_updated_at: 20 });
    await apply({ ...base, status: "authenticated", current_end: null, provider_updated_at: 10 }); // older, arrives late
    await apply({ ...base, user_id: B, status: "cancelled", current_end: null, provider_updated_at: 30 }); // someone else's id
    const rows = await as<{ status: string; user_id: string; current_end: string }>(db, "service", "select status, user_id, current_end from public.subscriptions");
    expect(rows).toEqual([expect.objectContaining({ status: "active", user_id: USER })]);
    await expect(as(db, USER, "select public.apply_subscription('{}'::jsonb)")).rejects.toThrow();
    // A webhook for an account that has since been deleted is accepted and dropped, not an error Razorpay would retry.
    await db.query("delete from auth.users where id = $1", [USER]);
    await apply({ ...base, status: "cancelled", current_end: null, provider_updated_at: 40 });
    expect(await as(db, "service", "select 1 from public.subscriptions")).toEqual([]);
  }, 30_000);
});
