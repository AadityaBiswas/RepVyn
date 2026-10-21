// Free vs Pro (shared/entitlements.ts) and market detection (shared/config.ts).
import { describe, expect, it } from "vitest";
import { marketFor } from "../shared/config";
import { access, effectiveSettings, NO_ENTITLEMENT, needsPro, offerDue, PREVIEW_DAYS } from "../shared/entitlements";
import { DEFAULT_SETTINGS, fresh, withProfile } from "../shared/store";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);
const pro = { ...NO_ENTITLEMENT, pro: true, until: T0 + 30 * DAY };

describe("access", () => {
  it("opens everything while billing is not live", () => {
    expect(access({ enforced: false, ent: NO_ENTITLEMENT, createdAt: T0, now: T0 + 100 * DAY })).toMatchObject({ full: true, reason: "unenforced" });
  });
  it("opens everything during the first week, then falls back to Free", () => {
    expect(access({ enforced: true, ent: NO_ENTITLEMENT, createdAt: T0, now: T0 + (PREVIEW_DAYS - 1) * DAY }).reason).toBe("preview");
    expect(access({ enforced: true, ent: NO_ENTITLEMENT, createdAt: T0, now: T0 + PREVIEW_DAYS * DAY })).toMatchObject({ full: false, reason: "free" });
  });
  it("honours a cached Pro entitlement until it ends, with a few days for the renewal to arrive", () => {
    expect(access({ enforced: true, ent: pro, createdAt: T0, now: T0 + 20 * DAY }).reason).toBe("pro");
    expect(access({ enforced: true, ent: pro, createdAt: T0, now: T0 + 31 * DAY }).reason).toBe("pro");
    expect(access({ enforced: true, ent: pro, createdAt: T0, now: T0 + 34 * DAY }).reason).toBe("free");
  });
  it("offers Pro once, after the free week", () => {
    const free = access({ enforced: true, ent: NO_ENTITLEMENT, createdAt: T0, now: T0 + 8 * DAY });
    expect(offerDue(free, null, T0 + 8 * DAY)).toBe(true);
    expect(offerDue(free, T0, T0 + 8 * DAY)).toBe(false);
    expect(offerDue(access({ enforced: true, ent: pro, createdAt: T0, now: T0 + 8 * DAY }), null, T0 + 8 * DAY)).toBe(false);
  });
});

describe("gating", () => {
  const st = { ...DEFAULT_SETTINGS, equipment: ["dumbbell", "pullup_bar"] as const, programId: "legs_glutes" };
  it("plans Free users with free equipment and the Balanced program", () => {
    expect(effectiveSettings({ ...st, equipment: [...st.equipment] }, false)).toMatchObject({ equipment: ["pullup_bar"], programId: "balanced" });
    expect(effectiveSettings({ ...st, equipment: [...st.equipment] }, true).programId).toBe("legs_glutes");
  });
  it("asks for Pro only when a change turns on a Pro feature", () => {
    expect(needsPro({ equipment: ["dumbbell"] }, false)).toBe(true);
    expect(needsPro({ equipment: ["chair"] }, false)).toBe(false);
    expect(needsPro({ programId: "upper_body" }, false)).toBe(true);
    expect(needsPro({ days: 5 }, false)).toBe(false);
    expect(needsPro({ equipment: ["dumbbell"] }, true)).toBe(false);
  });
  it("records the gated profile for the engine", () => {
    let s = fresh(T0, "en-IN");
    s = { ...s, onboarded: true, settings: { ...s.settings, equipment: ["dumbbell", "chair"], programId: "upper_body" } };
    const free = withProfile(s, T0, false).events.at(-1)!;
    expect(free.payload).toMatchObject({ equipment: ["chair"], programId: "balanced" });
    const full = withProfile(s, T0, true).events.at(-1)!;
    expect(full.payload).toMatchObject({ equipment: ["dumbbell", "chair"], programId: "upper_body" });
  });
});

describe("market", () => {
  it("uses rupees in India whatever the locale, dollars elsewhere", () => {
    expect(marketFor("Asia/Kolkata", "en-US")).toBe("IN");
    expect(marketFor("Asia/Calcutta", "en-GB")).toBe("IN");
    expect(marketFor("America/New_York", "en-IN")).toBe("IN");
    expect(marketFor("America/New_York", "en-US")).toBe("US");
    expect(marketFor(undefined, undefined)).toBe("US");
  });
});
