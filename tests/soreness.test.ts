import { describe, expect, it } from "vitest";
import { insights, readiness, replay, soreness, type EngineEvent, type Experience, type Region } from "../src/engine";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const PUSH3: [string, number, number][] = [["push_up_standard", 12, 2], ["push_up_standard", 12, 2], ["push_up_standard", 12, 2]];
const run = (events: EngineEvent[], experience: Experience = "intermediate") => replay([profile(T0 - D, { experience }), ...events], catalog, p);
const checkin = (ts: number, sore: Region[], checked = true) =>
  ev(ts, { type: "checkin", payload: { feel: "normal", soreRegions: sore, ...(checked ? { sorenessChecked: true } : {}) } });

describe("soreness (DOMS) curve", () => {
  it("rises after training and peaks about a day and a half later, while fatigue only falls", () => {
    const s = run(session(T0, "a", PUSH3));
    const felt = (h: number) => soreness(s, T0 + h * H).chest.felt;
    expect(felt(0)).toBe(0);
    expect(felt(12)).toBeGreaterThan(felt(2));
    expect(felt(33)).toBeGreaterThan(felt(12));
    expect(felt(33)).toBeGreaterThan(felt(60));
    expect(soreness(s, T0).chest.peakInH).toBeGreaterThanOrEqual(30);
    expect(soreness(s, T0).chest.peakInH).toBeLessThanOrEqual(36);
    // It starts at zero, rises above mild, and clears after the peak.
    const f = soreness(s, T0).chest;
    expect(f.clearInH).toBeGreaterThan(f.peakInH);
    expect(soreness(s, T0 + (f.clearInH + 1) * H).chest.level).toBe(0);
    expect(soreness(s, T0 + (f.clearInH - 2) * H).chest.level).toBeGreaterThan(0);
    expect(readiness(s, T0 + 33 * H).chest.fatigue).toBeLessThan(readiness(s, T0 + 12 * H).chest.fatigue);
  });

  it("new exercises make you far sorer than familiar ones (repeated-bout effect)", () => {
    const first = run(session(T0, "a", PUSH3));
    // 10 days apart so nothing is left over from the previous session.
    const fourth = run([0, 10, 20, 30].flatMap((d) => session(T0 + d * D, `s${d}`, PUSH3)));
    const peak = (s: ReturnType<typeof run>, t: number) => soreness(s, t + 33 * H).chest.felt;
    expect(peak(first, T0)).toBeGreaterThan(1.8 * peak(fourth, T0 + 30 * D));
    expect(soreness(first, T0).chest.peakLevel).toBeGreaterThanOrEqual(2);
  });

  it("advanced lifters get less sore from the same session", () => {
    expect(soreness(run(session(T0, "a", PUSH3), "advanced"), T0 + 33 * H).chest.felt).toBeLessThan(
      soreness(run(session(T0, "a", PUSH3), "beginner"), T0 + 33 * H).chest.felt,
    );
  });
});

describe("learning from body-map check-ins", () => {
  // Push-ups every 3 days; the user checks in each morning.
  const days = [0, 3, 6, 9, 12, 15];
  const history = (sore: (day: number) => Region[], checked = true) =>
    days.flatMap((d) => [...session(T0 + d * D, `s${d}`, PUSH3), checkin(T0 + (d + 1.6) * D, sore(d), checked), checkin(T0 + (d + 2.6) * D, sore(d), checked)]);

  it("someone who is always sore is fitted as more sensitive; someone never sore as less", () => {
    const always = run(history(() => ["chest", "triceps", "front_delt"]));
    const never = run(history(() => []));
    expect(always.sigma.value).toBeGreaterThan(1.3);
    expect(never.sigma.value).toBeLessThan(0.8);
    expect(always.sigma.obs).toBe(days.length * 2);
  });

  it("a check-in without the body map (sorenessChecked unset) teaches nothing", () => {
    const s = run(history(() => [], false));
    expect(s.sigma.obs).toBe(0);
    expect(s.sigma.value).toBe(1);
  });

  it("the fitted values change the forecast", () => {
    const always = run(history(() => ["chest", "triceps", "front_delt"]));
    const base = run(days.flatMap((d) => session(T0 + d * D, `s${d}`, PUSH3)));
    const t = T0 + 16 * D;
    expect(soreness(always, t).chest.felt).toBeGreaterThan(soreness(base, t).chest.felt);
  });
});

describe("insights", () => {
  it("reports calibration finishing and a new max, in plain words", () => {
    const sets = (reps: number): [string, number, number][] => [["push_up_standard", reps, 2], ["squat_bodyweight", 20, 2]];
    const before = run([0, 2, 4].flatMap((d) => session(T0 + d * D, `s${d}`, sets(15))));
    const after = run([...[0, 2, 4].flatMap((d) => session(T0 + d * D, `s${d}`, sets(15))), ...session(T0 + 8 * D, "s8", sets(20))]);
    const out = insights(before, after);
    expect(out.map((x) => x.kind)).toContain("calibrated");
    const record = out.find((x) => x.kind === "record")!;
    expect(record.text).toMatch(/^Your standard push-up max went from 17 to \d+ reps/);
    expect(insights(after, after)).toEqual([]);
  });

  it("announces a trait when it becomes established, even if the value moved earlier", () => {
    // Never sore: sigma drops within the first check-ins; the insight waits for the third check-in.
    const days = [0, 3, 6, 9];
    const events = days.flatMap((d) => [...session(T0 + d * D, `s${d}`, [["push_up_standard", 15, 1], ["squat_bodyweight", 25, 1]]), checkin(T0 + (d + 1.4) * D, [])]);
    const states = [1, 2, 3, 4].map((n) => run(events.slice(0, n * 5))); // 5 events per day: start, 2 sets, end, check-in
    expect(states[1]!.sigma.value).toBeLessThan(0.8); // already low after 2 check-ins
    const said = [1, 2, 3].map((i) => insights(states[i - 1]!, states[i]!).some((x) => x.kind === "soreness"));
    expect(said).toEqual([false, true, false]); // announced exactly once, at check-in 3
    // Never sore says nothing about how long soreness lasts.
    expect(states.slice(1).some((x, i) => insights(states[i]!, x).some((y) => y.kind === "soreness_recovery"))).toBe(false);
  });

  it("tells a sore-prone user what it learned about them", () => {
    const days = [0, 3, 6, 9, 12];
    const events = days.flatMap((d) => [...session(T0 + d * D, `s${d}`, PUSH3), checkin(T0 + (d + 1.6) * D, ["chest", "triceps", "front_delt"])]);
    const texts = insights(run(events.slice(0, 5)), run(events)).map((x) => x.text).join(" ");
    expect(texts).toMatch(/more sore than most people/);
  });
});
