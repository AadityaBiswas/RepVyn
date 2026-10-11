// Account, sync, Pro and data rights: the Profile "Account" section and the two pages it opens
// (sign in, RepVyn Pro). Built from the kit so it follows DESIGN.md; the UX pass can restyle freely.
import { useEffect, useState } from "preact/hooks";
import { billingEnabled, cloudEnabled, config, marketFor } from "../config";
import { access, PREVIEW_DAYS } from "../entitlements";
import { cancelPro, checkout, cloud, deleteAccount, enablePush, exportData, onCloud, sendCode, signOut, syncNow, verifyCode, type CloudState } from "../cloud";
import { erase } from "../store";
import type { App } from "./app";
import { BackButton, BottomCta, Card, Check, H1, Row, Scroll, Section, Seg, Segmented } from "./kit";
import { pop, useMove } from "./motion";

export function useCloud(): CloudState {
  const [s, setS] = useState(cloud);
  useEffect(() => onCloud(() => setS(cloud())), []);
  return s;
}

const pill = "width: 100%; height: 52px; border: 0; border-radius: 999px; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; cursor: pointer;";
const inkBtn = `${pill} background: var(--ink); color: var(--bg);`;
const quietBtn = `${pill} background: var(--bg); color: var(--ink);`;
const field = "width: 100%; box-sizing: border-box; height: 56px; padding: 0 20px; border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 17px; outline: none;";
const note = "margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); text-wrap: pretty;";
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
function ago(ms: number | null, now: number): string {
  if (!ms) return "Not yet";
  const m = Math.round((now - ms) / 60_000);
  return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(ms);
}

/** The full-access state the rest of the app reads (preview week, Pro, or Free). */
export function useAccess(app: Pick<App, "saved" | "now">) {
  const c = useCloud();
  return access({ enforced: c.billing, ent: c.ent, createdAt: app.saved.createdAt, now: app.now });
}

// ---------------------------------------------------------------- Profile section

export function AccountSection({ app }: { app: App }) {
  const c = useCloud();
  const a = useAccess(app);
  const { ui } = app;
  const row = (key: string) => ({ open: ui.edit === key, toggle: () => app.set({ edit: ui.edit === key ? null : key }) });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await f(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const proValue = !c.billing ? "" : a.reason === "pro" ? "Active" : a.reason === "preview" ? "Free this week" : "Free";
  const syncValue = c.status === "syncing" ? "Syncing" : c.status === "offline" ? "Offline" : c.status === "error" ? "Paused" : ago(c.lastSyncAt, app.now);
  const remindNeedsAccount = cloudEnabled() && !c.account && app.saved.settings.remind !== "Off";

  return (
    <Section title="Account">
      <Card>
        {c.enabled && !c.account && (
          <Row label="Sign in" value="" {...row("signin")}>
            <div ref={pop} style="display: flex; flex-direction: column; gap: 12px;">
              <p style={note}>Keep your training safe and on every device. {remindNeedsAccount ? "Reminders start once you sign in." : ""}</p>
              <button type="button" class="press" onClick={app.openAccount} style={inkBtn}>Sign in with email</button>
            </div>
          </Row>
        )}
        {c.account && (
          <Row label="Synced" value={syncValue} {...row("sync")}>
            <div ref={pop} style="display: flex; flex-direction: column; gap: 12px;">
              <p style={note}>Signed in as {c.account.email ?? "your account"}. {c.error ?? "Your workouts are backed up and shared across your devices."}</p>
              {c.reauth
                ? <button type="button" class="press" onClick={app.openAccount} style={inkBtn}>Sign in again</button>
                : <button type="button" class="press" disabled={c.status === "syncing"} onClick={() => void syncNow()} style={quietBtn}>Sync now</button>}
            </div>
          </Row>
        )}
        {c.account && app.saved.settings.remind !== "Off" && c.push !== "on" && c.push !== "unsupported" && (
          <Row label="Reminders on this phone" value={c.push === "denied" ? "Blocked" : "Off"} {...row("push")}>
            <div ref={pop} style="display: flex; flex-direction: column; gap: 12px;">
              <p style={note}>
                {c.push === "needs_install" ? "On iPhone, add RepVyn to your Home Screen (Share, then Add to Home Screen) to get reminders."
                  : c.push === "denied" ? "Notifications are blocked for RepVyn. Allow them in your browser's site settings."
                  : `A reminder at ${app.saved.settings.remind} on days you have not trained yet.`}
              </p>
              {c.push === "default" && <button type="button" class="press" disabled={busy} onClick={() => void run(async () => { await enablePush(); })} style={inkBtn}>Turn on reminders</button>}
            </div>
          </Row>
        )}
        {c.billing && (
          <Row label="RepVyn Pro" value={proValue} {...row("pro")}>
            <div ref={pop} style="display: flex; flex-direction: column; gap: 12px;">
              {a.reason === "pro" ? (
                <>
                  <p style={note}>{c.ent.cancelAtPeriodEnd ? `Cancelled. Pro stays on until ${c.ent.until ? fmtDate(c.ent.until) : "the end of this period"}.` : c.ent.until ? `Renews on ${fmtDate(c.ent.until)}.` : "Thank you for supporting RepVyn."}</p>
                  {!c.ent.cancelAtPeriodEnd && c.ent.status && (
                    <button type="button" class="press" disabled={busy} onClick={() => void run(cancelPro)} style={quietBtn}>Cancel subscription</button>
                  )}
                </>
              ) : (
                <>
                  <p style={note}>{a.reason === "preview" ? `Everything is open until ${fmtDate(a.previewEndsAt)}, while RepVyn learns how you train.` : "Dumbbells, bench and every program."}</p>
                  <button type="button" class="press" onClick={app.openPro} style={inkBtn}>See Pro</button>
                </>
              )}
            </div>
          </Row>
        )}
        <Row label="Your data" value="" {...row("data")}>
          <div ref={pop} style="display: flex; flex-direction: column; gap: 12px;">
            <p style={note}>Download everything RepVyn keeps about you as a file.</p>
            <button type="button" class="press" onClick={() => exportData(app.saved)} style={quietBtn}>Download my data</button>
            {c.account && (
              confirm ? (
                <button type="button" class="press" disabled={busy} onClick={() => void run(deleteAccount)} style={`${pill} background: var(--w2); color: var(--on-w2);`}>Delete account and all data</button>
              ) : (
                <button type="button" class="press" onClick={() => setConfirm(true)} style={quietBtn}>Delete account</button>
              )
            )}
            {confirm && <p style={note}>This removes your account, your workouts on every device and cancels Pro. It cannot be undone.</p>}
          </div>
        </Row>
        <Row label="Log out" value="" last {...row("logout")}>
          <div ref={pop} style="display: flex; flex-direction: column; gap: 12px;">
            <p style={note}>{c.account ? "Your training stays in your account. This device is cleared." : "You are not signed in, so this erases your training from this device."}</p>
            <button type="button" class="press" disabled={busy} onClick={() => void run(async () => { if (c.account) await signOut(); else { erase(); location.reload(); } })} style={`${pill} background: var(--w2); color: var(--on-w2);`}>{c.account ? "Log out" : "Erase data and log out"}</button>
          </div>
        </Row>
      </Card>
      {err && <p role="alert" style={`${note} color: var(--accent-text); margin-top: 4px;`}>{err}</p>}
      <p style={`${note} font-size: 13px; color: var(--faint); margin-top: 4px;`}>
        <a href="/privacy.html" style="text-decoration: underline;">Privacy</a> · <a href="/terms.html" style="text-decoration: underline;">Terms</a> · <a href="/refunds.html" style="text-decoration: underline;">Refunds</a> · <a href={`mailto:${config.supportEmail}`} style="text-decoration: underline;">Contact</a>
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- Sign in page

export function AccountPage({ app, cls }: { app: App; cls: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (!sent) {
        await sendCode(email);
        setSent(true);
      } else {
        await verifyCode(email, code);
        app.signedIn();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label="Sign in" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
      <BackButton onClick={app.back} />
      <Scroll top="calc(var(--top) + 72px)">
        <H1>{sent ? "Check your email" : "Sign in"}</H1>
        <p style={`${note} margin-top: 12px; font-size: 16px;`}>
          {sent ? `We sent a 6-digit code to ${email.trim()}. It works for 10 minutes.` : "We will email you a code. No password needed. Your training on this phone moves into your account."}
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (!busy && (sent ? code.trim().length >= 6 : valid)) void go(); }} style="margin-top: 28px; display: flex; flex-direction: column; gap: 12px;">
          {!sent ? (
            <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" aria-label="Email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} style={field} />
          ) : (
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Code" maxLength={8} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, ""))} style={`${field} font-family: var(--mono); letter-spacing: 0.3em; text-align: center;`} />
          )}
          {err && <p role="alert" style={`${note} color: var(--accent-text);`}>{err}</p>}
          {sent && <button type="button" class="press" disabled={busy} onClick={() => { setSent(false); setCode(""); }} style={quietBtn}>Use a different email</button>}
          <button type="submit" hidden></button>
        </form>
      </Scroll>
      <BottomCta onClick={() => void go()} disabled={busy || (sent ? code.trim().length < 6 : !valid)}>{busy ? "One moment" : sent ? "Sign in" : "Email me a code"}</BottomCta>
    </div>
  );
}

// ---------------------------------------------------------------- Pro page

// Only what the Free tier actually leaves out. FREE_HISTORY_DAYS (entitlements.ts) is ready for when the
// Progress tab limits history; add "Your whole story" here when it does.
const PERKS = [
  ["Dumbbells and bench", "Weights picked from the dumbbells you own, and bench moves."],
  ["Every program", "Upper body, Legs and glutes, and new ones as they come."],
] as const;

export function ProPage({ app, cls }: { app: App; cls: string }) {
  const c = useCloud();
  const a = useAccess(app);
  const [period, setPeriod] = useState<"yearly" | "monthly">("yearly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const market = marketFor(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language);
  const price = config.prices[market];
  const trial = !c.ent.hadSubscription; // offered once per account; the server decides for sure
  const buy = async () => {
    if (!c.account) return app.openAccount();
    setBusy(true);
    setErr(null);
    try {
      if ((await checkout(`${market.toLowerCase() as "in" | "us"}_${period}`)) === "subscribed") app.back();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label="RepVyn Pro" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
      <BackButton onClick={app.back} />
      <Scroll top="calc(var(--top) + 72px)" bottom={160}>
        <H1>RepVyn Pro</H1>
        <p style={`${note} margin-top: 12px; font-size: 16px;`}>
          {a.reason === "pro" ? "You have Pro. Thank you." : a.reason === "preview" ? `Your first ${PREVIEW_DAYS} days include everything. Keep it all with Pro.` : "RepVyn has learned how you train. Pro uses all of it."}
        </p>
        <ul style="margin: 24px 0 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px;">
          {PERKS.map(([t, d], i) => (
            <li key={t} style={`display: flex; gap: 14px; padding: 16px 0; ${i < PERKS.length - 1 ? "border-bottom: 1px solid var(--soft);" : ""}`}>
              <span style="color: var(--accent-text); padding-top: 2px;"><Check size={18} /></span>
              <span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-weight: 700; letter-spacing: -0.01em;">{t}</span><span style="font-size: 14px; color: var(--muted);">{d}</span></span>
            </li>
          ))}
        </ul>
        {a.reason !== "pro" && (
          <>
            <div style="margin-top: 24px;">
              <Segmented label="Billing period" bg="var(--surface)">
                <Seg label={`Yearly · ${price.yearly}`} on={period === "yearly"} pick={() => setPeriod("yearly")} h={48} />
                <Seg label={`Monthly · ${price.monthly}`} on={period === "monthly"} pick={() => setPeriod("monthly")} h={48} />
              </Segmented>
            </div>
            <p style={`${note} margin-top: 12px; text-align: center;`}>
              {period === "yearly" ? `${price.yearly} a year, about ${price.yearlyPerMonth} a month.` : `${price.monthly} a month.`} {trial ? "7 days free, then billed. " : ""}Cancel any time in Profile.
            </p>
            {err && <p role="alert" style={`${note} margin-top: 12px; color: var(--accent-text); text-align: center;`}>{err}</p>}
          </>
        )}
      </Scroll>
      {a.reason !== "pro" && (
        <BottomCta onClick={() => void buy()} disabled={busy || !billingEnabled()}>
          {busy ? "Opening checkout" : !c.account ? "Sign in to continue" : trial ? "Start 7 days free" : "Subscribe"}
        </BottomCta>
      )}
    </div>
  );
}
