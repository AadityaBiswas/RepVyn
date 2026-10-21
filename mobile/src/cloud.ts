// Account and sync on the phone, after app/src/cloud/index.ts: the same email-code sign-in and the same sync rules
// (syncCore.ts), over plain fetch to Supabase's auth and REST APIs. Pro checkout is not here yet; reminders are local (reminders.ts).
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { adopt, afterPush, applyPull, BATCH, isEmpty, outbox, reminderTime, type PullPage } from "../../app/src/cloud/syncCore";
import type { Saved } from "../../app/src/store";
import appJson from "../app.json";

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const APP_VERSION = `mobile-${appJson.expo.version}`;
const SESSION_KEY = "repvyn-auth";

export type SyncStatus = "off" | "signed_out" | "idle" | "syncing" | "offline" | "error";
export interface CloudState {
  enabled: boolean;
  account: { id: string; email: string | null } | null;
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
  /** The session is gone (signed out elsewhere, or expired): only signing in again restarts sync. */
  reauth: boolean;
}

let state: CloudState = { enabled: !!(URL_ && ANON), account: null, status: URL_ && ANON ? "signed_out" : "off", lastSyncAt: null, error: null, reauth: false };
const listeners = new Set<() => void>();
const set = (p: Partial<CloudState>) => { state = { ...state, ...p }; listeners.forEach((f) => f()); };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useCloud = (): CloudState => useSyncExternalStore(subscribe, () => state);
const sessionEnded = () => set({ status: "error", error: "Your session ended. Sign in again to keep syncing.", reauth: true });

// ---------------------------------------------------------------- session

interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string | null } }
let session: Session | null = null;
let refreshing: Promise<string | null> | null = null;

class Offline extends Error {}
async function call(path: string, body: unknown, bearer?: string): Promise<Response> {
  try {
    return await fetch(`${URL_}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON!, authorization: `Bearer ${bearer ?? ANON}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Offline("No connection. Try again when you are online.");
  }
}

async function keep(s: Session | null): Promise<void> {
  session = s;
  await (s ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)) : AsyncStorage.removeItem(SESSION_KEY)).catch(() => {});
}
const fromAuth = (d: { access_token: string; refresh_token: string; expires_in: number; user: Session["user"] }): Session =>
  ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + d.expires_in, user: d.user });

/** The access token, refreshed when it is about to run out. Null once the session is gone for good. */
async function token(): Promise<string | null> {
  if (!session) return null;
  if (session.expires_at * 1000 > Date.now() + 60_000) return session.access_token;
  // One refresh at a time: a refresh token is spent by its first use.
  refreshing ??= (async () => {
    try {
      const res = await call("/auth/v1/token?grant_type=refresh_token", { refresh_token: session!.refresh_token });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) { await keep(null); sessionEnded(); }
        return null;
      }
      await keep(fromAuth(await res.json()));
      return session!.access_token;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const t = await token();
  if (!t) throw Object.assign(new Error("not signed in"), { code: "28000" });
  const res = await call(`/rest/v1/rpc/${fn}`, args, t);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message ?? `HTTP ${res.status}`), { code: data?.code });
  return data as T;
}

// ---------------------------------------------------------------- lifecycle

interface Host { get: () => Saved; commit: (f: (s: Saved) => Saved) => void; reset: () => void }
let host: Host | null = null;

/** Connects the app's state to the cloud. Returns a detach function. */
export function attach(h: Host): () => void {
  host = h;
  if (!state.enabled) return () => { host = null; };
  const acc = h.get().sync.account;
  if (acc) set({ account: acc, status: "idle", lastSyncAt: h.get().sync.lastSyncAt });
  void AsyncStorage.getItem(SESSION_KEY).catch(() => null).then((raw) => {
    try { session = JSON.parse(raw ?? "null"); } catch { session = null; }
    if (session) signedIn(session.user.id, session.user.email ?? null);
    else if (host?.get().sync.account) sessionEnded();
  });
  const sub = AppState.addEventListener("change", (st) => st === "active" && requestSync(0));
  const every = setInterval(() => requestSync(0), 5 * 60_000);
  return () => { host = null; sub.remove(); clearInterval(every); };
}

/** False when this phone still holds another account's training, which must not be mixed into this one. */
function signedIn(id: string, email: string | null): boolean {
  if (!host) return false;
  const prev = host.get().sync.account;
  if (prev && prev.id !== id) return false;
  host.commit((s) => adopt(s, { id, email }, APP_VERSION));
  set({ account: { id, email }, status: "idle", error: null, reauth: false });
  requestSync(0);
  return true;
}

// ---------------------------------------------------------------- sync

let debounce: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let again = false;

/** Schedules a sync; the app calls this after every local change. */
export function requestSync(delayMs = 4000): void {
  if (!state.account || state.reauth) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

/** Uploads what is pending, then pulls until up to date. One run at a time; a request mid-run runs again after. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try { do { again = false; await syncOnce(); } while (again); } finally { running = null; }
  })();
  return running;
}

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

async function syncOnce(): Promise<void> {
  if (!host || !state.account || !session) return;
  const uid = state.account.id;
  set({ status: "syncing" });
  try {
    for (let round = 0; round < 50; round++) {
      const ob = outbox(host.get());
      if (isEmpty(ob)) break;
      const data = await rpc<{ gone: string[] }>("sync_push", {
        p_events: ob.events, p_deleted: ob.deleted, p_doc: ob.doc, p_doc_at: ob.doc ? ob.docAt : null,
        p_remind_at: ob.doc ? reminderTime(ob.doc.settings.remind) : null, p_tz: ob.doc ? tz() ?? null : null,
      });
      if (!host) return;
      host.commit((s) => afterPush(s, ob, data?.gone ?? []));
      if (ob.events.length < BATCH && ob.deleted.length < BATCH) break;
    }
    for (let round = 0; round < 200; round++) {
      const page = await rpc<PullPage>("sync_pull", { p_cursor: host.get().sync.cursor, p_limit: 1000 });
      if (!host) return;
      host.commit((s) => applyPull(s, page, uid));
      if (!page.more) break;
    }
    // Pulling can leave something to upload (the first device's settings); go round once more.
    if (!isEmpty(outbox(host.get()))) again = true;
    const at = Date.now();
    host.commit((s) => ({ ...s, sync: { ...s.sync, lastSyncAt: at } }));
    set({ status: "idle", lastSyncAt: at, error: null });
  } catch (e) {
    if (e instanceof Offline) return set({ status: "offline", error: null });
    const msg = (e as Error).message ?? String(e);
    const code = (e as { code?: string }).code;
    if (code === "42501" || code === "28000" || /JWT|session|not signed in/i.test(msg)) sessionEnded();
    else set({ status: "error", error: "Sync paused. It will retry on its own." });
  }
}

// ---------------------------------------------------------------- account

export async function sendCode(email: string): Promise<void> {
  const res = await call("/auth/v1/otp", { email: email.trim(), create_user: true });
  if (res.ok) return;
  const d = await res.json().catch(() => ({}));
  const msg: string = d.msg ?? d.message ?? d.error_description ?? "Could not send the code. Try again.";
  throw new Error(res.status === 429 || /rate/i.test(msg) ? "Too many codes asked for. Try again in a minute." : msg);
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const res = await call("/auth/v1/verify", { email: email.trim(), token: code.trim(), type: "email" });
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.access_token) throw new Error("That code did not work. Check it, or ask for a new one.");
  const s = fromAuth(d);
  if (!signedIn(s.user.id, s.user.email ?? null)) {
    void call("/auth/v1/logout?scope=local", {}, s.access_token).catch(() => {});
    const other = host?.get().sync.account?.email;
    throw new Error(`This phone holds ${other ?? "another account"}'s training. Sign in with that email, or log out first.`);
  }
  await keep(s);
}

async function leave(): Promise<void> {
  const h = host;
  clearTimeout(debounce);
  await keep(null);
  set({ account: null, status: "signed_out", lastSyncAt: null, error: null, reauth: false });
  h?.reset();
}

/**
 * Uploads anything pending, then signs out and clears this phone. The account keeps everything.
 * Refuses while something has not reached the server, since clearing the phone would lose it.
 */
export async function signOut(): Promise<void> {
  if (state.account) {
    await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 8000))]);
    if (host && !isEmpty(outbox(host.get()))) {
      throw new Error(state.reauth ? "Some training has not synced yet. Sign in again first, then log out." : "Some training has not synced yet. Connect to the internet, then log out.");
    }
    const t = await token().catch(() => null);
    // This phone only: the account's other devices stay signed in.
    if (t) await call("/auth/v1/logout?scope=local", {}, t).catch(() => {});
  }
  await leave();
}

/** Deletes the account and everything stored with it, then clears this phone. */
export async function deleteAccount(): Promise<void> {
  const t = await token();
  if (!t) throw new Error("Sign in again first.");
  const res = await call("/functions/v1/account-delete", { confirm: "DELETE" }, t);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
  await leave();
}
