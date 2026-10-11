// Cloud features at run time: account, sync, Pro entitlement, checkout, push reminders and data rights.
// The UI talks to this module only; it does nothing when the build has no backend configured.
import { billingEnabled, cloudEnabled, config } from "../config";
import { NO_ENTITLEMENT, type Entitlement } from "../entitlements";
import { erase, type Saved } from "../store";
import { callFunction, supabase } from "./client";
import { adopt, afterPush, applyPull, BATCH, isEmpty, outbox, reminderTime, type PullPage } from "./syncCore";
import { identify, track } from "./telemetry";

export type SyncStatus = "off" | "signed_out" | "idle" | "syncing" | "offline" | "error";
export type PushState = "unsupported" | "needs_install" | "default" | "denied" | "on";
export interface CloudState {
  enabled: boolean;
  billing: boolean;
  account: { id: string; email: string | null } | null;
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
  /** The account's session is gone (signed out elsewhere, or expired): only signing in again restarts sync. */
  reauth: boolean;
  ent: Entitlement;
  push: PushState;
}

type Host = { get: () => Saved; commit: (f: (s: Saved) => Saved) => void };
let host: Host | null = null;
const listeners = new Set<() => void>();
const ENT_KEY = "repvyn-entitlement";

function readEnt(): Entitlement {
  try {
    const e = JSON.parse(localStorage.getItem(ENT_KEY) ?? "null") as Entitlement | null;
    if (e && typeof e.pro === "boolean") return { ...NO_ENTITLEMENT, ...e };
  } catch { /* none cached */ }
  return NO_ENTITLEMENT;
}

let state: CloudState = {
  enabled: cloudEnabled(), billing: billingEnabled(), account: null, status: cloudEnabled() ? "signed_out" : "off",
  lastSyncAt: null, error: null, reauth: false, ent: readEnt(), push: "unsupported",
};
export const cloud = () => state;
export function onCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const sessionEnded = () => set({ status: "error", error: "Your session ended. Sign in again to keep syncing.", reauth: true });
function set(p: Partial<CloudState>): void {
  state = { ...state, ...p };
  if (p.ent) {
    try { localStorage.setItem(ENT_KEY, JSON.stringify(p.ent)); } catch { /* storage full or blocked */ }
  }
  listeners.forEach((f) => f());
}

// ---------------------------------------------------------------- lifecycle

/** Connects the app's state to the cloud. Returns a detach function. */
export function attach(get: Host["get"], commit: Host["commit"]): () => void {
  const sb = supabase();
  host = { get, commit };
  set({ push: pushSupport() });
  if (!sb) return () => { host = null; };
  const acc = get().sync.account;
  if (acc) set({ account: acc, status: "idle", lastSyncAt: get().sync.lastSyncAt });

  void sb.auth.getSession().then(({ data, error }) => {
    if (data.session) signedIn(data.session.user.id, data.session.user.email ?? null);
    // An error here is a token refresh that could not reach the server (opened offline): the session is still good.
    else if (!error && get().sync.account) sessionEnded();
  });
  const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) signedIn(session.user.id, session.user.email ?? null);
    else if (event === "SIGNED_OUT" && host?.get().sync.account) sessionEnded();
  });
  const wake = () => document.visibilityState === "visible" && requestSync(0);
  const online = () => requestSync(0);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", online);
  const every = setInterval(() => requestSync(0), 5 * 60_000);
  return () => {
    host = null;
    sub.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", online);
    clearInterval(every);
  };
}

/** The account this page load has already greeted; the auth client reports "signed in" every time the app comes to the front. */
let greeted: string | null = null;

/** False when this phone still holds another account's training, which must not be mixed into this one. */
function signedIn(id: string, email: string | null): boolean {
  if (!host) return false;
  const prev = host.get().sync.account;
  if (prev && prev.id !== id) {
    void supabase()?.auth.signOut({ scope: "local" }).catch(() => {});
    return false;
  }
  host.commit((s) => adopt(s, { id, email }, config.version ?? "dev"));
  if (!prev) set({ ent: NO_ENTITLEMENT });
  if (greeted === id && !state.reauth && state.account?.email === email) return true;
  greeted = id;
  set({ account: { id, email }, status: "idle", error: null, reauth: false });
  identify(id);
  requestSync(0);
  // Reminders already allowed on this device start working with the account.
  if (host.get().settings.remind !== "Off" && pushSupport() === "on") void enablePush().catch(() => {});
  return true;
}

// ---------------------------------------------------------------- sync

let debounce: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let again = false;

/** Schedules a sync; the app calls this after every local change. */
export function requestSync(delayMs = 4000): void {
  if (!state.account) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

/** Uploads what is pending, then pulls until up to date. One run at a time; a request mid-run runs again after. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

const tz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
};

async function syncOnce(): Promise<void> {
  const sb = supabase();
  if (!sb || !host || !state.account) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    set({ status: "offline" });
    return;
  }
  const uid = state.account.id;
  set({ status: "syncing" });
  try {
    for (let round = 0; round < 50; round++) {
      const ob = outbox(host.get());
      if (isEmpty(ob)) break;
      const { data, error } = await sb.rpc<{ gone: string[] }>("sync_push", {
        p_events: ob.events, p_deleted: ob.deleted, p_doc: ob.doc, p_doc_at: ob.doc ? ob.docAt : null,
        p_remind_at: ob.doc ? reminderTime(ob.doc.settings.remind) : null, p_tz: ob.doc ? tz() ?? null : null,
      });
      if (error) throw error;
      host.commit((s) => afterPush(s, ob, data?.gone ?? []));
      if (ob.events.length < BATCH && ob.deleted.length < BATCH) break;
    }
    for (let round = 0; round < 200; round++) {
      const { data, error } = await sb.rpc<PullPage>("sync_pull", { p_cursor: host.get().sync.cursor, p_limit: 1000 });
      if (error) throw error;
      const page = data!;
      host.commit((s) => applyPull(s, page, uid));
      if (!page.more) break;
    }
    // Pulling can leave something to upload (the first device's settings); go round once more.
    if (!isEmpty(outbox(host.get()))) again = true;
    const at = Date.now();
    host.commit((s) => ({ ...s, sync: { ...s.sync, lastSyncAt: at } }));
    set({ status: "idle", lastSyncAt: at, error: null });
    await refreshEntitlement();
  } catch (e) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const msg = (e as { message?: string }).message ?? String(e);
    // 42501: the call went out without a session, as the public role, which may not sync.
    if ((e as { code?: string }).code === "42501" || /JWT|session|not signed in/i.test(msg)) {
      sessionEnded();
    } else {
      set({ status: offline ? "offline" : "error", error: offline ? null : "Sync paused. It will retry on its own." });
      if (!offline) track("$exception", { $exception_type: "SyncError", $exception_message: msg.slice(0, 300), kind: "sync" });
    }
  }
}

// ---------------------------------------------------------------- account

export async function sendCode(email: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Accounts are not available in this build.");
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw new Error(/rate/i.test(error.message) ? "Too many codes asked for. Try again in a minute." : error.message);
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Accounts are not available in this build.");
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  if (error || !data.user) throw new Error("That code did not work. Check it, or ask for a new one.");
  if (!signedIn(data.user.id, data.user.email ?? null)) {
    const other = host?.get().sync.account?.email;
    throw new Error(`This phone holds ${other ?? "another account"}'s training. Sign in with that email, or log out first.`);
  }
}

async function leave(): Promise<void> {
  await disablePush().catch(() => {});
  host = null; // a sync still in flight must not write the old state back
  clearTimeout(debounce);
  try { localStorage.removeItem(ENT_KEY); } catch { /* ignore */ }
  erase();
  location.reload();
}

/**
 * Uploads anything pending, then signs out and clears this device. The account keeps everything.
 * Refuses while something has not reached the server, since clearing the device would lose it.
 */
export async function signOut(): Promise<void> {
  const sb = supabase();
  if (sb && state.account) {
    await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 8000))]);
    if (host && !isEmpty(outbox(host.get()))) {
      throw new Error(state.reauth ? "Some training has not synced yet. Sign in again first, then log out." : "Some training has not synced yet. Connect to the internet, then log out.");
    }
    // While the session can still remove this device's reminder subscription from the server.
    await disablePush().catch(() => {});
    // This device only: the account's other phones stay signed in.
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    track("signed_out");
  }
  await leave();
}

/** Deletes the account and everything stored with it, then clears this device. */
export async function deleteAccount(): Promise<void> {
  await callFunction("account-delete", { confirm: "DELETE" });
  track("account_deleted");
  await supabase()?.auth.signOut({ scope: "local" }).catch(() => {});
  await leave();
}

/** Everything the app keeps about the user, as a JSON file download. */
export function exportData(s: Saved, now = new Date()): void {
  const { sync: _sync, ...data } = s;
  const blob = new Blob([JSON.stringify({ exportedAt: now.toISOString(), app: "RepVyn", ...data }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `repvyn-data-${now.toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---------------------------------------------------------------- Pro

interface ServerEnt { pro: boolean; until: string | null; status: string | null; plan: string | null; cancelAtPeriodEnd: boolean; hadSubscription?: boolean }
const toEnt = (e: ServerEnt): Entitlement => ({
  pro: !!e.pro, until: e.until ? Date.parse(e.until) : null, status: e.status, plan: e.plan, cancelAtPeriodEnd: !!e.cancelAtPeriodEnd,
  hadSubscription: !!e.hadSubscription, checkedAt: Date.now(),
});

export async function refreshEntitlement(): Promise<void> {
  const sb = supabase();
  if (!sb || !state.account) return;
  const { data, error } = await sb.rpc<ServerEnt>("my_entitlement");
  if (!error && data) set({ ent: toEnt(data) });
}

type Plan = "in_monthly" | "in_yearly" | "us_monthly" | "us_yearly";
interface RazorpayResult { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }
declare global {
  interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(ev: string, f: (r: unknown) => void): void } }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error("Could not reach the payment page. Check your connection.")); };
    document.head.appendChild(s);
  });
}

/** Opens Razorpay Checkout for a plan. Resolves "subscribed" once the server has verified the payment. */
export async function checkout(plan: Plan): Promise<"subscribed" | "dismissed"> {
  track("checkout_started", { plan });
  const r = await callFunction<{ keyId: string; subscriptionId: string; trial: boolean; email: string | null }>("billing", { action: "checkout", plan });
  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!window.Razorpay) throw new Error("The payment page did not load. Try again.");
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: r.keyId,
      subscription_id: r.subscriptionId,
      name: "RepVyn",
      description: r.trial ? "RepVyn Pro, 7 days free" : "RepVyn Pro",
      prefill: r.email ? { email: r.email } : {},
      theme: { color: "#D91E36" },
      modal: { ondismiss: () => resolve("dismissed"), confirm_close: true },
      handler: (res: RazorpayResult) => {
        callFunction<ServerEnt>("billing", { action: "verify", paymentId: res.razorpay_payment_id, subscriptionId: res.razorpay_subscription_id, signature: res.razorpay_signature })
          .then((e) => {
            set({ ent: toEnt(e) });
            track("subscribed", { plan });
            resolve("subscribed");
          })
          // The payment went through; Razorpay's webhook will record it even if this check failed.
          .catch(() => {
            setTimeout(() => void refreshEntitlement(), 5000);
            setTimeout(() => void refreshEntitlement(), 30_000);
            reject(new Error("Payment received. Pro will switch on within a minute."));
          });
      },
    });
    rzp.open();
  });
}

/** Cancels Pro at the end of the paid period (a trial ends now). */
export async function cancelPro(): Promise<void> {
  set({ ent: toEnt(await callFunction<ServerEnt>("billing", { action: "cancel" })) });
}

// ---------------------------------------------------------------- push reminders

const standalone = () =>
  typeof matchMedia !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

function pushSupport(): PushState {
  if (typeof window === "undefined" || !config.vapidPublicKey || !("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window) || typeof Notification === "undefined") return isIos() && !standalone() ? "needs_install" : "unsupported";
  return Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "default";
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Turns reminders on for this device. Must run from a tap (browsers only ask for permission then).
 * Signed out, nothing is sent: the reminder time is kept and starts working after sign-in.
 */
export async function enablePush(): Promise<PushState> {
  const sb = supabase();
  if (pushSupport() === "unsupported" || pushSupport() === "needs_install") return pushSupport();
  // Signed out nothing can be delivered, so do not ask yet; the Account section offers it after sign-in.
  if (!sb || !state.account) return state.push;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    set({ push: perm === "denied" ? "denied" : "default" });
    return state.push;
  }
  if (sb && state.account) {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.vapidPublicKey!) }));
    const j = sub.toJSON();
    const { error } = await (await sb.db()).from("push_subscriptions").insert({ user_id: state.account.id, endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth });
    if (error && error.code !== "23505") throw error;
  }
  set({ push: "on" });
  requestSync(0); // uploads the reminder time
  return "on";
}

/** Removes this device's push subscription (sign-out, or reminders turned off). */
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const sb = supabase();
  if (sb && state.account) await (await sb.db()).from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
