// Pages pushed over Today, after Setup, Sore and Done in app/src/ui/pages.tsx (without the body figures for now).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { REGIONS, REGION_NAMES } from "../../../src/engine";
import { CORE, UPPER, dayStart, doneDay, isLegsDay, planActivation, planRegions, planRows, planTitle, regionWords } from "../../../app/src/model";
import { Figures } from "../figure";
import { BADGE, Enter, Later, LIVELY, POP, PULSE, ROW, Roll, SWAP, Press } from "../motion";
import { useApp } from "../app";
import { More, BackButton, BottomCta, Card, Chevron, Clock, EquipStack, Faint, Grid, H1, IntensityIcon, MuscleDot, Opt, Page, Play, Segmented, Sheet, Swap, T, ThumbDown, ThumbUp, tick } from "../kit";
import { EquipOptions, equipLabel } from "../pickers";

const DURATIONS = [20, 30, 40, 50];
const INTENSITY = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]] as const;
const cap = (w: string) => (w ? w[0]!.toUpperCase() + w.slice(1) : "");

export function Setup() {
  const app = useApp();
  const { s, ui, c } = app;
  const plan = app.setupPlan;
  const ch = ui.choice;
  const regions = planRegions(s, plan);
  const legs = isLegsDay(regions);
  const [words] = regionWords(regions);
  const rows = plan.kind === "workout" ? planRows(s, plan, app.saved.settings.units) : [];
  const count = rows.length;
  // The rows shown last time: anything not among them has just arrived.
  const shown = useRef<string[] | null>(null);
  const before = shown.current;
  const ids = rows.map((r) => r.id);
  const arrived = before ? ids.filter((id) => !before.includes(id)) : [];
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    shown.current = ids;
    if (!arrived.length) return;
    tick();
    setFresh(arrived);
    const t = setTimeout(() => setFresh([]), 2400);
    return () => clearTimeout(t);
  }, [ids.join()]);
  const chip = (key: "duration" | "intensity" | "equip", label: string, icon: ReactNode, value: string | null) => {
    const on = ui.open === key;
    return (
      <Press onPress={() => app.set({ open: on ? null : key })} accessibilityLabel={label} accessibilityState={{ expanded: on }}
        style={{ ...(key === "equip" ? { flexShrink: 0 } : { flex: 1 }), minHeight: 48, paddingVertical: 6, paddingLeft: 10, paddingRight: 8, borderRadius: 999, backgroundColor: on ? c.ink : c.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 }}>{icon}{value !== null && <T w={600} lines={1} color={on ? c.bg : c.ink}>{value}</T>}</View>
        <Chevron size={14} rot={on ? 270 : 90} color={on ? c.bg : c.ink} />
      </Press>
    );
  };
  const panel = { marginTop: 10, padding: 16, backgroundColor: c.surface, borderRadius: 24, gap: 12 } as const;
  const ink = (k: string) => (ui.open === k ? c.bg : c.ink);
  const intensity = INTENSITY.find((i) => i[0] === ch.intensity)![1];
  return (
    <Sheet>
      <Page top={64} bottom={150}>
        <H1>{planTitle(plan)}</H1>
        <T color={c.muted} style={{ marginTop: 10, lineHeight: 21 }}>{plan.kind === "workout" ? cap(words) : plan.reasons[0] ?? ""}</T>
        <View style={{ marginTop: 16 }}><Later height={legs ? 280 : 310}><Enter key={regions.join()} from={SWAP}><Figures lead="Worked in this workout" kind="level" values={planActivation(s, plan)} theme={app.theme} h={legs ? 280 : 310} part={legs ? "legs" : "all"} gap={legs ? 8 : 0} /></Enter></Later></View>

        <View style={{ marginTop: 20, flexDirection: "row", gap: 8 }}>
          {chip("duration", `Duration: ${ch.minutes} min`, <Clock size={18} color={ink("duration")} />, `${ch.minutes} min`)}
          {chip("intensity", `Intensity: ${intensity}`, <IntensityIcon level={ch.intensity} color={ink("intensity")} />, intensity)}
          {chip("equip", `Equipment: ${equipLabel(ch.equipment)}`, <EquipStack items={ch.equipment} size={30} body ring={ui.open === "equip" ? c.ink : c.surface} />, null)}
        </View>
        {ui.open === "duration" && (
          <Enter from={POP} ms={200} style={panel}><T w={600} size={13} color={c.muted}>Duration</T>
            <Segmented options={DURATIONS.map((m) => ({ key: String(m), label: `${m} min`, on: ch.minutes === m, pick: () => app.choose({ minutes: m }) }))} />
          </Enter>
        )}
        {ui.open === "intensity" && (
          <Enter from={POP} ms={200} style={panel}><T w={600} size={13} color={c.muted}>Intensity</T>
            <Segmented options={INTENSITY.map(([k, l]) => ({ key: k, label: l, on: ch.intensity === k, pick: () => app.choose({ intensity: k }), icon: <IntensityIcon level={k} size={16} color={ch.intensity === k ? c.bg : c.ink} /> }))} />
          </Enter>
        )}
        {ui.open === "equip" && (
          <Enter from={POP} ms={200} style={panel}><T w={600} size={13} color={c.muted}>Equipment</T>
            <EquipOptions value={ch.equipment} set={(equipment) => app.choose({ equipment })} />
          </Enter>
        )}

        {plan.kind === "workout" && (
          <View style={{ marginTop: 32, gap: 12 }}>
            <View style={{ flexDirection: "row" }}><View style={{ overflow: "hidden" }}><Roll value={count}><T w={700} size={20}>{count}</T></Roll></View><T w={700} size={20}> exercise{count === 1 ? "" : "s"}</T></View>
            <Card>
              {rows.map((x, i) => {
                const mark = app.saved.feedback[x.id]?.liked;
                const open = ui.row === x.id;
                const flag = (liked: boolean) => () => { tick(); app.feedback(x.id, mark === liked ? null : liked); };
                const pill = (on: boolean) => ({ flex: 1, minHeight: 48, paddingVertical: 6, borderRadius: 999, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : c.bg } as const);
                const nu = arrived.indexOf(x.id);
                return (
                  <Enter key={x.id} from={nu >= 0 ? ROW : {}} delay={Math.max(0, nu) * 70} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.soft }}>
                    <Press onPress={() => app.set({ row: open ? null : x.id })} accessibilityLabel={x.name + (mark === true ? ", liked" : mark === false ? ", disliked" : "")} accessibilityState={{ expanded: open }}
                      style={{ minHeight: 80, flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <Enter from={nu >= 0 ? { scale: 0.8 } : {}} cfg={LIVELY} delay={Math.max(0, nu) * 70 + 100}><MuscleDot region={x.region} levels={x.levels} /></Enter>
                      <View style={{ flex: 1, gap: 3 }}>
                        <T w={700} size={17}>{x.name}</T>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <T color={c.muted}>{x.detail}</T>
                          {(s.catalog.byId[x.id]?.equipment.length ?? 0) > 0 && <EquipStack items={s.catalog.byId[x.id]!.equipment} size={20} ring={c.surface} />}
                        </View>
                      </View>
                      {fresh.includes(x.id) ? <Enter from={BADGE} cfg={LIVELY} delay={260} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: c.accent }}><T w={700} size={12} color={c.onAccent}>New</T></Enter>
                        : mark === true ? <ThumbUp color={c.ink} /> : mark === false ? <ThumbDown color={c.muted} /> : <More color={c.faint} />}
                    </Press>
                    {open && (
                      <Enter from={POP} ms={200} style={{ paddingBottom: 16, gap: 12 }}>
                        <T color={c.muted} style={{ lineHeight: 21 }}>{x.why ? `${x.why.replace(/\.$/, "")}. ` : ""}{x.muscles}{x.kcal !== null ? ` About ${x.kcal} kcal.` : ""}</T>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Press onPress={flag(true)} accessibilityState={{ selected: mark === true }} style={pill(mark === true)}><ThumbUp size={18} color={mark === true ? c.bg : c.ink} /><T w={600} color={mark === true ? c.bg : c.ink}>Like</T></Press>
                          <Press onPress={flag(false)} accessibilityState={{ selected: mark === false }} style={pill(mark === false)}><ThumbDown size={18} color={mark === false ? c.bg : c.ink} /><T w={600} color={mark === false ? c.bg : c.ink}>Dislike</T></Press>
                          <Press onPress={() => app.swap(x.id)} accessibilityLabel={`Swap ${x.name} for another exercise`} style={pill(false)}><Swap color={c.ink} /><T w={600}>Swap</T></Press>
                        </View>
                      </Enter>
                    )}
                  </Enter>
                );
              })}
            </Card>
          </View>
        )}
      </Page>
      <BackButton onPress={app.back} label="Back to home" />
      <BottomCta onPress={app.startWorkout} disabled={plan.kind !== "workout"}>
        <Play color={c.onAccent} />
        {plan.kind === "workout" ? (<><T w={700} size={17} color={c.onAccent}>Start</T><Enter key={count} from={PULSE} cfg={LIVELY} style={{ minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}><T w={700} size={17} color={c.onAccent}>{count}</T></Enter><T w={700} size={17} color={c.onAccent}>{`exercise${count === 1 ? "" : "s"}`}</T></>) : <T w={700} size={17} color={c.onAccent}>Start workout</T>}
      </BottomCta>
    </Sheet>
  );
}

export function Sore() {
  const app = useApp();
  const { ui, c } = app;
  return (
    <Sheet>
      <Page top={64} bottom={132}>
        <H1>What's <Faint>sore</Faint></H1>
        <View style={{ marginTop: 24 }}>
          <Grid cols={2}>
            {REGIONS.map((m) => (
              <Opt key={m} label={REGION_NAMES[m]} on={ui.sore.includes(m)} off={c.surface} h={52}
                pick={() => app.set({ sore: ui.sore.includes(m) ? ui.sore.filter((x) => x !== m) : [...ui.sore, m] })} />
            ))}
          </Grid>
        </View>
      </Page>
      <BackButton onPress={app.back} />
      <BottomCta onPress={() => app.checkin(ui.sore)}>Done</BottomCta>
    </Sheet>
  );
}

const dayName = (day: number, now: number) =>
  day === dayStart(now) ? "Today" : new Date(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

/** A finished workout: what was trained, and every set of every exercise. */
export function DoneDay() {
  const app = useApp();
  const { s, ui, saved, now, c } = app;
  const d = doneDay(s, saved.events, ui.day, saved.settings.units);
  const regions = d?.regions ?? [];
  const [words] = regionWords(regions);
  const title = !regions.length ? "Workout" : isLegsDay(regions) ? "Legs" : regions.every((m) => UPPER.includes(m) || CORE.includes(m)) ? "Upper body" : "Full body";
  const stats: [string, string][] = d ? [[`${d.minutes}`, "min"], [`${d.sets}`, d.sets === 1 ? "set" : "sets"], [`${d.reps}`, "reps"], ...(d.kcal !== null ? [[`${d.kcal}`, "kcal"] as [string, string]] : [])] : [];
  return (
    <Sheet>
      <Page top={64} bottom={150}>
        <T w={600} color={c.muted} style={{ marginBottom: 8 }}>{dayName(ui.day, now)}</T>
        <H1>{title} <Faint>done</Faint></H1>
        {!!words && <T color={c.muted} style={{ marginTop: 10, lineHeight: 21 }}>{cap(words)}</T>}
        <View style={{ marginTop: 16 }}><Later height={isLegsDay(regions) ? 280 : 310}><Figures lead="Trained" kind="level" values={Object.fromEntries(regions.map((m) => [m, 1]))} theme={app.theme} h={isLegsDay(regions) ? 280 : 310} part={isLegsDay(regions) ? "legs" : "all"} gap={isLegsDay(regions) ? 8 : 0} /></Later></View>
        <View style={{ marginTop: 20, flexDirection: "row", gap: 8 }}>
          {stats.map(([v, l]) => (
            <View key={l} style={{ flex: 1, height: 72, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", gap: 2 }}>
              <T w={800} size={24}>{v}</T><T w={600} size={13} color={c.muted}>{l}</T>
            </View>
          ))}
        </View>
        {d && (
          <View style={{ marginTop: 32, gap: 12 }}>
            <T w={700} size={20}>{d.exercises.length} exercise{d.exercises.length === 1 ? "" : "s"}</T>
            <Card>
              {d.exercises.map((x, i) => (
                <View key={x.id} style={{ minHeight: 80, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.soft }}>
                  <MuscleDot region={x.region} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <T w={700} size={17}>{x.name}</T>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                      {x.sets.map((r, j) => <View key={j} style={{ minWidth: 28, height: 26, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}><T w={700} size={13}>{r}</T></View>)}
                    </View>
                  </View>
                  <T w={600} size={13} color={c.muted}>{x.total}</T>
                </View>
              ))}
            </Card>
          </View>
        )}
      </Page>
      <BackButton onPress={app.back} label="Back to home" />
      <BottomCta onPress={app.back}>Done</BottomCta>
    </Sheet>
  );
}
