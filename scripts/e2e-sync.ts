// End-to-end check of accounts and sync in a real browser, against scripts/dev-backend.ts.
// Device A has a week of training and signs in; device B signs in fresh and must receive it all;
// a change on B must reach A. Needs Playwright with a Chromium (not a project dependency):
//   npm run dev:backend &
//   REPVYN_SUPABASE_URL=http://localhost:54321 REPVYN_SUPABASE_ANON_KEY=dev npm run app -- --serve &
//   PLAYWRIGHT=/path/to/playwright/index.mjs npx tsx scripts/e2e-sync.ts
import { append, fresh, withProfile, type Saved } from "../app/src/store";

const pw = (await import(process.env.PLAYWRIGHT ?? "playwright")) as typeof import("playwright");
const APP = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = `e2e-${Date.now()}@example.com`;
const T = Date.now() - 3 * 86_400_000;

function seeded(): Saved {
  let s = fresh(T, "en-IN");
  s = withProfile({ ...s, onboarded: true, programStart: T }, T);
  for (let d = 0; d < 3; d++) s = append(s, [{ ts: T + d * 86_400_000, type: "checkin", payload: { feel: "normal", soreRegions: [], sorenessChecked: false } } as never]);
  return s;
}

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const fail = (m: string) => { console.error("FAIL", m); process.exitCode = 1; };

async function device(seed: Saved | null) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  if (seed) await ctx.addInitScript((v) => { if (!localStorage.getItem("home-v2")) localStorage.setItem("home-v2", v); }, JSON.stringify(seed));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  await page.goto(APP);
  return page;
}
const saved = async (p: import("playwright").Page) => JSON.parse((await p.evaluate(() => localStorage.getItem("home-v2"))) ?? "null") as Saved;

async function signIn(p: import("playwright").Page) {
  await p.getByRole("button", { name: "Profile" }).click();
  await p.getByRole("button", { name: /Sign in/ }).first().click();
  await p.getByRole("button", { name: "Sign in with email" }).click();
  await p.getByLabel("Email").fill(EMAIL);
  await p.getByRole("button", { name: "Email me a code" }).click();
  await p.getByLabel("Code").fill("123456");
  await p.getByRole("dialog", { name: "Sign in" }).getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("home-v2") ?? "{}").sync?.lastSyncAt, null, { timeout: 15_000 });
}

const a = await device(seeded());
await signIn(a);
await a.waitForTimeout(2000);
const sa = await saved(a);
console.log("A after sign-in:", sa.events.length, "events, known", sa.sync.known.length, "account", sa.sync.account?.email);
if (sa.sync.known.length !== sa.events.length) fail("A did not upload everything");
if (sa.events.some((e) => e.userId !== sa.sync.account?.id)) fail("A's events were not moved to the account");

// Device B: a second phone, already set up, signing in to the same account.
const bFresh = fresh(Date.now(), "en-US");
const bSeed = withProfile({ ...bFresh, onboarded: true, programStart: Date.now(), settings: { ...bFresh.settings, days: 2 } }, Date.now());
const plannedDays = (s: Saved) => ([...s.events].reverse().find((e) => e.type === "profile_set")?.payload as { daysPerWeek?: number } | undefined)?.daysPerWeek;
const b3 = await device(bSeed);
await signIn(b3);
await b3.waitForTimeout(1500);
const sb = await saved(b3);
const want = new Set(sa.events.map((e) => e.id));
const got = sb.events.filter((e) => want.has(e.id)).length;
console.log("B after sign-in:", sb.events.length, "events,", got, "of A's", want.size);
if (got !== want.size) fail("B did not receive A's events");
if (sb.settings.units !== sa.settings.units) fail("B did not take the account's settings at sign-in");
if (plannedDays(sb) !== sa.settings.days) fail("B's engine still plans from its own quick setup, not the account's settings");

// A change on B (settings) reaches A.
await b3.getByRole("button", { name: /Days per week/ }).click();
await b3.getByRole("group", { name: "Days per week" }).getByRole("button", { name: "6", exact: true }).click();
await b3.waitForTimeout(6000); // debounce + push
await a.evaluate(() => window.dispatchEvent(new Event("online")));
await a.waitForTimeout(3000);
const sa2 = await saved(a);
console.log("A days per week after B's change:", sa2.settings.days);
if (sa2.settings.days !== 6) fail("B's settings change did not reach A");

await a.screenshot({ path: process.env.SHOT ?? "e2e-profile.png", fullPage: true });
await browser.close();
console.log(process.exitCode ? "E2E FAILED" : "E2E OK");
