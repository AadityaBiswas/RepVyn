// Product analytics and error reports through PostHog's capture API (ADR-0008).
// No SDK, no personal data: a random install id (or the account id), the event name and a few plain properties.
import { config } from "../config";

const ID_KEY = "repvyn-install-id";
let distinctId: string | null = null;
let queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

const optedOut = () =>
  typeof navigator === "undefined" ||
  (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
  navigator.doNotTrack === "1";
const enabled = () => !!config.posthogKey && !optedOut();

function id(): string {
  if (distinctId) return distinctId;
  try {
    distinctId = localStorage.getItem(ID_KEY);
    if (!distinctId) localStorage.setItem(ID_KEY, (distinctId = crypto.randomUUID()));
  } catch {
    distinctId = crypto.randomUUID();
  }
  return distinctId;
}

function flush(): void {
  timer = undefined;
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  const body = JSON.stringify({ api_key: config.posthogKey, batch });
  const url = `${config.posthogHost ?? "https://us.i.posthog.com"}/batch/`;
  // sendBeacon survives the page closing; fall back to fetch.
  if (!(navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" })))) {
    void fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }
}

export type TrackEvent = "app_opened" | "onboarding_done" | "workout_finished" | "paywall_viewed" | "checkout_started" | "subscribed" | "signed_in" | "signed_out" | "account_deleted" | "$exception";

export function track(event: TrackEvent, props: Record<string, string | number | boolean | null> = {}): void {
  if (!enabled()) return;
  queue.push({ event, distinct_id: id(), timestamp: new Date().toISOString(), properties: { ...props, app_version: config.version ?? "dev", $process_person_profile: false } });
  timer ??= setTimeout(flush, 2000);
}

/** After sign-in, later events use the account id; the install id is linked to it once. */
export function identify(accountId: string): void {
  if (!enabled() || distinctId === accountId) return;
  let linked = false;
  try { linked = localStorage.getItem(`${ID_KEY}-alias`) === accountId; } catch { /* ignore */ }
  if (!linked) {
    track("signed_in", {});
    queue.push({ event: "$create_alias", distinct_id: id(), properties: { alias: accountId } });
    try { localStorage.setItem(`${ID_KEY}-alias`, accountId); } catch { /* ignore */ }
  }
  distinctId = accountId;
}

/** Reports uncaught errors, rate-limited so a render loop cannot flood the project. */
export function watchErrors(): void {
  if (typeof window === "undefined") return;
  let sent = 0;
  const report = (err: unknown, kind: string) => {
    if (++sent > 20) return;
    const e = err instanceof Error ? err : new Error(String(err));
    track("$exception", { $exception_type: e.name, $exception_message: e.message.slice(0, 500), $exception_stack: (e.stack ?? "").slice(0, 2000), kind });
  };
  window.addEventListener("error", (ev) => report(ev.error ?? ev.message, "error"));
  window.addEventListener("unhandledrejection", (ev) => report(ev.reason, "unhandledrejection"));
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}
