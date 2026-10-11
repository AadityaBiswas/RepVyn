// Free vs Pro (ADR-0005, launch plan "Pricing and monetization"). Pure: the app passes in
// whether billing is live, the cached entitlement and the clock.
import type { Equipment } from "../../src/engine";
import type { Settings } from "./store";

/** Programs and equipment in the free tier. Everything else needs Pro. */
export const FREE_PROGRAMS: readonly string[] = ["balanced"];
export const PRO_EQUIPMENT: readonly Equipment[] = ["dumbbell", "bench"];
/** Progress history the free tier shows. */
export const FREE_HISTORY_DAYS = 28;
/** Everything is open for the calibration week; the trial is offered when it ends. */
export const PREVIEW_DAYS = 7;
const DAY = 86_400_000;
/** How long Pro stays on after its end date while a renewal charge is still on its way (the server allows the same). */
export const RENEWAL_GRACE_DAYS = 3;

export interface Entitlement {
  pro: boolean;
  /** When Pro ends (ms), if known. */
  until: number | null;
  status: string | null;
  plan: string | null;
  cancelAtPeriodEnd: boolean;
  /** True once the account has used its free trial (any paid or trial subscription, past or present). */
  hadSubscription: boolean;
  /** When the server last confirmed this. */
  checkedAt: number;
}
export const NO_ENTITLEMENT: Entitlement = { pro: false, until: null, status: null, plan: null, cancelAtPeriodEnd: false, hadSubscription: false, checkedAt: 0 };

export type AccessReason = "unenforced" | "pro" | "preview" | "free";
export interface Access {
  /** True when every feature is open. */
  full: boolean;
  reason: AccessReason;
  /** End of the calibration-week preview (ms). */
  previewEndsAt: number;
}

/**
 * Who gets what right now. With billing not live (`enforced` false) everything is open.
 * A cached Pro entitlement keeps working offline until its end date, plus the renewal grace: the end date is
 * when the next charge is due, and Pro must not drop out for the hours that charge takes to be confirmed.
 */
export function access(o: { enforced: boolean; ent: Entitlement; createdAt: number; now: number }): Access {
  const previewEndsAt = o.createdAt + PREVIEW_DAYS * DAY;
  if (!o.enforced) return { full: true, reason: "unenforced", previewEndsAt };
  if (o.ent.pro && (o.ent.until === null || o.ent.until + RENEWAL_GRACE_DAYS * DAY > o.now)) return { full: true, reason: "pro", previewEndsAt };
  if (o.now < previewEndsAt) return { full: true, reason: "preview", previewEndsAt };
  return { full: false, reason: "free", previewEndsAt };
}

export const programAllowed = (programId: string, full: boolean) => full || FREE_PROGRAMS.includes(programId);
export const equipmentAllowed = (eq: Equipment, full: boolean) => full || !PRO_EQUIPMENT.includes(eq);
export const allowedEquipment = (eq: Equipment[], full: boolean) => (full ? eq : eq.filter((e) => equipmentAllowed(e, false)));
/** True when a settings change would turn on something the user does not have. */
export function needsPro(p: Partial<Settings>, full: boolean): boolean {
  if (full) return false;
  if (p.programId !== undefined && !programAllowed(p.programId, false)) return true;
  return !!p.equipment?.some((e) => !equipmentAllowed(e, false));
}
/** The settings the engine plans with: the user's choices, minus what their tier does not include. */
export function effectiveSettings(st: Settings, full: boolean): Settings {
  if (full) return st;
  return { ...st, equipment: allowedEquipment(st.equipment, false), programId: programAllowed(st.programId, false) ? st.programId : FREE_PROGRAMS[0]! };
}
/** Show the Pro offer once, after the first workout finished at or after the end of the preview week. */
export const offerDue = (a: Access, shownAt: number | null, now: number) => a.reason === "free" && shownAt === null && now >= a.previewEndsAt;
