import { ladderName } from "./catalog";
import { REGION_NAMES } from "./planner";
import { level } from "./level";
import { toleranceOf } from "./recovery";
import { REGIONS, type EngineState, type Region } from "./types";

/**
 * What the engine learned between two states (e.g. before and after a workout or check-in), in plain words.
 * Each insight names what was noticed and what changed because of it. Pure; ordered most personal first.
 */
export interface Insight {
  kind: "calibrated" | "level_up" | "level_down" | "record" | "tolerance" | "soreness" | "soreness_recovery" | "rir_bias" | "pain" | "liked" | "disliked";
  text: string;
}

const MIN_OBS_SORENESS = 3;
const RECORD_GAIN = 0.08;
const TOLERANCE_GAIN = 0.3;
const SORENESS_BAND = 1.25;
const RIR_BIAS = 1;
/** How long soreness lasts can't be judged from someone who is never sore. */
const MIN_SORE_REPORTS = 2;

const lower = (m: Region) => REGION_NAMES[m].toLowerCase();
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function insights(before: EngineState, after: EngineState): Insight[] {
  const out: Insight[] = [];
  const lb = level(before);
  const la = level(after);

  if (!lb.calibrated && la.calibrated) {
    const byLadder = Object.entries(la.byLadder).sort((a, b) => b[1].score - a[1].score);
    const best = byLadder[0];
    const weakest = byLadder.at(-1);
    out.push({
      kind: "calibrated",
      text: `Calibration done: you train like ${article(la.experience)} ${la.experience}` +
        (best && weakest && best !== weakest && best[1].score - weakest[1].score >= 0.5
          ? `. Strongest: ${ladderName(after.catalog, best[0]).toLowerCase()}. Most room to grow: ${ladderName(after.catalog, weakest[0]).toLowerCase()}. Each is planned at its own level.`
          : ". Your plan now uses your own numbers instead of a guess."),
    });
  } else if (lb.calibrated && la.experience !== lb.experience) {
    const up = la.score > lb.score;
    out.push({
      kind: up ? "level_up" : "level_down",
      text: up
        ? `Your reps now match ${article(la.experience)} ${la.experience}. Targets and recovery are adjusted up to match.`
        : `Your recent reps look more like ${article(la.experience)} ${la.experience} level. I've eased targets while you get back into it.`,
    });
  }

  for (const [id, a] of Object.entries(after.capacity)) {
    const b = before.capacity[id];
    if (!b || b.obs < 1 || a.obs <= b.obs || a.M < b.M * (1 + RECORD_GAIN)) continue;
    const ex = after.catalog.byId[id]!;
    const unit = ex.isHold ? " seconds" : " reps";
    const f = ex.isHold ? after.params.hold.secondsPerRep : 1;
    out.push({ kind: "record", text: `Your ${ex.name.toLowerCase()} max went from ${Math.round(b.M * f)} to ${Math.round(a.M * f)}${unit}. Your next sets are set from the new number.` });
  }

  const raised = REGIONS.filter((m) => toleranceOf(after, m) > toleranceOf(before, m) + TOLERANCE_GAIN && after.tolerance[m] > before.tolerance[m]);
  if (raised.length) {
    out.push({ kind: "tolerance", text: `You handled more ${list(raised.map(lower))} work than your usual. I've raised what counts as a full session for ${raised.length === 1 ? "it" : "them"}, so it won't be flagged as too much next time.` });
  }

  // A trait is announced once it is both established (enough check-ins) and outside the typical band, whichever comes last.
  const band = (x: { value: number; obs: number }) => (x.obs < MIN_OBS_SORENESS ? 0 : x.value >= SORENESS_BAND ? 1 : x.value <= 1 / SORENESS_BAND ? -1 : 0);
  const crossed = (b: { value: number; obs: number }, a: { value: number; obs: number }) => band(a) !== 0 && band(a) !== band(b);
  if (crossed(before.sigma, after.sigma)) {
    const s = after.sigma.value;
    if (s >= SORENESS_BAND) out.push({ kind: "soreness", text: "You get more sore than most people from the same work. I'll warn you earlier and space out new exercises." });
    else if (s <= 1 / SORENESS_BAND) out.push({ kind: "soreness", text: "You get less sore than most people from the same work. I've stopped expecting soreness you don't feel." });
  }
  if (after.soreness.soreReports >= MIN_SORE_REPORTS && crossed(before.rhoS, after.rhoS)) {
    const r = after.rhoS.value;
    if (r >= SORENESS_BAND) out.push({ kind: "soreness_recovery", text: "Your soreness lasts longer than typical. I now expect it to take an extra day to clear." });
    else if (r <= 1 / SORENESS_BAND) out.push({ kind: "soreness_recovery", text: "Your soreness clears faster than typical. I now expect you to feel fresh sooner." });
  }

  for (const [id, f] of Object.entries(after.feedback)) {
    const was = before.feedback[id];
    const name = after.catalog.byId[id]?.name ?? id;
    if (f.painTs !== null && f.painTs !== was?.painTs) {
      out.push({ kind: "pain", text: `You said ${name.toLowerCase()} hurt. I've taken it out of your plans for ${after.params.planner.painAvoidDays} days and will use other exercises for those muscles.` });
    }
    if (f.liked !== (was?.liked ?? null) && f.liked !== null) {
      out.push(f.liked
        ? { kind: "liked", text: `Noted that you like ${name.toLowerCase()}. I'll pick it when it fits.` }
        : { kind: "disliked", text: `Noted that ${name.toLowerCase()} isn't for you. I'll pick something else when I can.` });
    }
  }

  if (after.b.obs >= 2 && after.b.value >= RIR_BIAS && before.b.value < RIR_BIAS) {
    const n = Math.round(after.b.value);
    out.push({ kind: "rir_bias", text: `Your all-out sets show about ${n} more rep${n === 1 ? "" : "s"} in you than you rate. I'm correcting for that, so your targets fit better.` });
  }
  return out;
}

const article = (w: string) => (/^[aeiou]/.test(w) ? "an" : "a");
