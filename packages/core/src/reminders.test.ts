import { describe, expect, it } from "vitest";
import { planReminders } from "./reminders";
import { doseKey, type Medication, type State } from "./schedule";

const med = (over: Partial<Medication> = {}): Medication => ({
  id: "m1",
  name: "Metformin",
  dosage: "500 mg",
  form: "Tablet",
  instructions: "",
  times: ["08:00"],
  days: [],
  startDate: "2026-11-01",
  createdAt: 0,
  ...over,
});

const at = (h: number, m = 0, d = 2) => new Date(2026, 10, d, h, m);

describe("reminder plan", () => {
  it("schedules due and nudge, and an alarm only for critical medicines", () => {
    const now = at(7);
    const plain = planReminders({ meds: [med()], logs: {} }, now, { windowHours: 2 });
    expect(plain.map((r) => r.stage)).toEqual(["due", "nudge"]);
    expect(plain[0]!.at).toBe(at(8).getTime());
    expect(plain[1]!.at).toBe(at(8, 10).getTime());

    const critical = planReminders({ meds: [med({ critical: true })], logs: {} }, now, { windowHours: 2 });
    expect(critical.map((r) => r.stage)).toEqual(["due", "nudge", "alarm"]);
    expect(critical[2]!.at).toBe(at(8, 30).getTime());
  });

  it("groups medicines due at the same time into one notification", () => {
    const s: State = { meds: [med(), med({ id: "m2", name: "Amlodipine", dosage: "5 mg" })], logs: {} };
    const plan = planReminders(s, at(7), { windowHours: 1.5 }).filter((r) => r.stage === "due");
    expect(plan).toHaveLength(1);
    expect(plan[0]!.doseKeys).toHaveLength(2);
    expect(plan[0]!.body).toBe("Metformin 500 mg, Amlodipine 5 mg");
  });

  it("drops reminders for doses already logged", () => {
    const s: State = { meds: [med()], logs: { [doseKey("m1", "2026-11-02", "08:00")]: { status: "taken", at: 0 } } };
    expect(planReminders(s, at(7), { windowHours: 2 })).toEqual([]);
  });

  it("keeps escalations still ahead for a dose that is already due", () => {
    const plan = planReminders({ meds: [med({ critical: true })], logs: {} }, at(8, 5), { windowHours: 1 });
    expect(plan.map((r) => r.stage)).toEqual(["nudge", "alarm"]);
  });

  it("includes yesterday's late-evening escalations just after midnight", () => {
    const plan = planReminders({ meds: [med({ times: ["23:50"], critical: true })], logs: {} }, at(0, 5, 3), {
      windowHours: 1,
    });
    expect(plan.map((r) => [r.date, r.stage])).toEqual([["2026-11-02", "alarm"]]);
  });

  it("caps the plan and stays inside the window", () => {
    const s: State = { meds: [med({ times: ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] })], logs: {} };
    const plan = planReminders(s, at(5), { windowHours: 48, max: 10 });
    expect(plan).toHaveLength(10);
    expect(plan.every((r, i) => i === 0 || r.at >= plan[i - 1]!.at)).toBe(true);
    const full = planReminders(s, at(5), { windowHours: 48, max: 1000 });
    expect(full.every((r) => r.at <= at(5).getTime() + 48 * 3_600_000)).toBe(true);
  });

  it("hides medicine names when asked", () => {
    const plan = planReminders({ meds: [med()], logs: {} }, at(7), { windowHours: 1.5, hideNames: true });
    expect(plan[0]!.body).toBe("1 medicine");
  });
});
