import { describe, expect, it } from "vitest";
import { buildSlots } from "./family";
import { doseKey, type Medication, type State } from "./schedule";

const med = (over: Partial<Medication> = {}): Medication => ({
  id: "m1", name: "Metformin", dosage: "500 mg", form: "Tablet", instructions: "", times: ["08:00", "20:00"], days: [],
  startDate: "2026-11-01", createdAt: 0, ...over,
});
const now = new Date(2026, 10, 6, 12, 0);

describe("buildSlots", () => {
  it("covers 24 hours back to 48 hours ahead, one slot per dose time", () => {
    const { slots, from, to } = buildSlots({ meds: [med()], logs: {} }, now, false);
    expect(slots.map((s) => s.key)).toEqual([
      "2026-11-05T20:00", "2026-11-06T08:00", "2026-11-06T20:00", "2026-11-07T08:00", "2026-11-07T20:00", "2026-11-08T08:00",
    ]);
    expect(slots.every((s) => s.dueAt >= from && s.dueAt <= to)).toBe(true);
  });

  it("marks a time taken only when every medicine due then was taken", () => {
    const state: State = {
      meds: [med({ times: ["08:00"] }), med({ id: "m2", name: "Amlodipine", dosage: "5 mg", times: ["08:00"], critical: true })],
      logs: { [doseKey("m1", "2026-11-06", "08:00")]: { status: "taken", at: 0 } },
    };
    const today = buildSlots(state, now, false).slots.find((s) => s.key === "2026-11-06T08:00")!;
    expect(today).toMatchObject({ status: "open", critical: true });
    state.logs[doseKey("m2", "2026-11-06", "08:00")] = { status: "skipped", at: 0 };
    expect(buildSlots(state, now, false).slots.find((s) => s.key === "2026-11-06T08:00")!.status).toBe("taken");
  });

  it("sends medicine names only when asked", () => {
    expect(buildSlots({ meds: [med()], logs: {} }, now, false).slots[0]).not.toHaveProperty("medicines");
    expect(buildSlots({ meds: [med()], logs: {} }, now, true).slots[0]!.medicines).toEqual(["Metformin 500 mg"]);
  });
});
