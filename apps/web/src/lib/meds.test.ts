import { describe, expect, it } from "vitest";
import { dosesForDate, doseKey, monthReport, type Medication, type State } from "./meds";

const med = (over: Partial<Medication> = {}): Medication => ({
  id: "m1",
  name: "Metformin",
  dosage: "500 mg",
  form: "Tablet",
  instructions: "",
  times: ["08:00", "20:00"],
  days: [],
  startDate: "2026-11-01",
  createdAt: 0,
  ...over,
});

describe("scheduling", () => {
  it("only schedules on the chosen weekdays", () => {
    // 2026-11-02 is a Monday, 2026-11-03 a Tuesday
    const s: State = { meds: [med({ days: [1] })], logs: {} };
    const now = new Date(2026, 10, 1);
    expect(dosesForDate(s, "2026-11-02", now)).toHaveLength(2);
    expect(dosesForDate(s, "2026-11-03", now)).toHaveLength(0);
  });

  it("marks an unlogged dose missed only after the 60-minute grace period", () => {
    const s: State = { meds: [med({ times: ["08:00"] })], logs: {} };
    expect(dosesForDate(s, "2026-11-02", new Date(2026, 10, 2, 8, 59))[0]?.status).toBe("due");
    expect(dosesForDate(s, "2026-11-02", new Date(2026, 10, 2, 9, 1))[0]?.status).toBe("missed");
  });
});

describe("monthly report", () => {
  it("counts taken, skipped and missed doses into an adherence percentage", () => {
    const s: State = {
      meds: [med()],
      logs: {
        [doseKey("m1", "2026-11-01", "08:00")]: { status: "taken", at: 0 },
        [doseKey("m1", "2026-11-01", "20:00")]: { status: "taken", at: 0 },
        [doseKey("m1", "2026-11-02", "08:00")]: { status: "skipped", at: 0 },
      },
    };
    // Nov 2 at 22:00: 4 closed doses (2 taken, 1 skipped, 1 missed)
    const r = monthReport(s, 2026, 10, new Date(2026, 10, 2, 22, 0));
    expect(r).toMatchObject({ scheduled: 4, taken: 2, skipped: 1, missed: 1, adherence: 50 });
  });
});
