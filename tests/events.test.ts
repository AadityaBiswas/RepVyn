import { describe, expect, it } from "vitest";
import { EventSchema } from "../src/engine";

const base = { id: "3f1c2a7e-8b4d-4c1a-9e2f-1a2b3c4d5e6f", userId: "u1", ts: 0, seq: 0, schemaVersion: 1 };
const set = (p: Record<string, unknown>) => ({
  ...base, type: "set_logged",
  payload: { sessionId: "s1", exerciseId: "push_up_standard", rir: 2, isWarmup: false, isAmrap: false, ...p },
});

describe("event schemas", () => {
  it("accepts every event type", () => {
    for (const e of [
      { ...base, type: "profile_set", payload: { goal: "muscle", experience: "beginner", equipment: ["resistance_band"], excludeExercises: [], excludeRegions: ["abs"], daysPerWeek: 3, sessionMinutes: 30 } },
      { ...base, type: "session_started", payload: { sessionId: "s1" } },
      set({ reps: 10 }),
      set({ holdSeconds: 30 }),
      { ...base, type: "session_ended", payload: { sessionId: "s1" } },
      { ...base, type: "checkin", payload: { feel: "beat_up", soreRegions: ["chest"] } },
      { ...base, type: "external_activity", payload: { presetId: "football", minutes: 90, intensity: "hard" } },
    ]) expect(() => EventSchema.parse(e), e.type).not.toThrow();
  });

  it("rir must be an int in 0..5", () => {
    expect(() => EventSchema.parse(set({ reps: 10, rir: 6 }))).toThrow();
    expect(() => EventSchema.parse(set({ reps: 10, rir: -1 }))).toThrow();
    expect(() => EventSchema.parse(set({ reps: 10, rir: 1.5 }))).toThrow();
    expect(() => EventSchema.parse(set({ reps: 10, rir: 5 }))).not.toThrow();
  });

  it("set needs exactly one of reps / holdSeconds", () => {
    expect(() => EventSchema.parse(set({}))).toThrow();
    expect(() => EventSchema.parse(set({ reps: 10, holdSeconds: 30 }))).toThrow();
    expect(() => EventSchema.parse(set({ reps: 10.5 }))).toThrow();
  });

  it("rejects bad ids, unknown types, bad regions and presets", () => {
    expect(() => EventSchema.parse({ ...set({ reps: 1 }), id: "not-a-uuid" })).toThrow();
    expect(() => EventSchema.parse({ ...base, type: "nap", payload: {} })).toThrow();
    expect(() => EventSchema.parse({ ...base, type: "checkin", payload: { feel: "normal", soreRegions: ["neck"] } })).toThrow();
    expect(() => EventSchema.parse({ ...base, type: "external_activity", payload: { presetId: "golf", minutes: 60, intensity: "light" } })).toThrow();
  });
});
