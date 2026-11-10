import { describe, expect, it } from "vitest";
import { handleReply, inviteCaregiver, putProfile } from "../src/domain/caregivers";
import { applyRetention, sendDailySummaries, sweepMissedDoses, syncSlots, type SlotInput } from "../src/domain/doses";
import { CAREGIVER_E164, CAREGIVER_PHONE, PATIENT, makeDeps } from "./helpers";

// 2026-11-06, Johannesburg is UTC+2. 08:00 local = 06:00Z.
const at = (localTime: string, date = "2026-11-06") => Date.parse(`${date}T${localTime}:00+02:00`);
const slot = (time: string, status: SlotInput["status"] = "open", extra: Partial<SlotInput> = {}): SlotInput => ({
  key: `2026-11-06T${time}`,
  dueAt: at(time),
  status,
  ...extra,
});
const WINDOW = { from: at("00:00"), to: at("23:59") };

async function withCaregiver(prefs: "ALERTS" | "SUMMARY" | "BOTH" = "BOTH", names = false) {
  const t = makeDeps("2026-11-06T05:00:00Z");
  await putProfile(t.deps, PATIENT, { displayName: "Thandi", tz: "Africa/Johannesburg", includeMedicineNames: names });
  await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, agreed: true, noticeVersion: t.deps.config.noticeVersion });
  await handleReply(t.deps, { from: CAREGIVER_E164, text: prefs }, "whatsapp");
  t.clear();
  return t;
}

describe("syncing dose times", () => {
  it("keeps nothing when the patient has no family members", async () => {
    const t = makeDeps();
    await putProfile(t.deps, PATIENT, { displayName: "Thandi" });
    expect(await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00")] })).toEqual({ stored: false });
    expect((await t.deps.db.query("SELECT * FROM slots")).rows).toEqual([]);
  });

  it("rejects malformed input", async () => {
    const t = await withCaregiver();
    await expect(syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [{ key: "bad", dueAt: 1, status: "open" }] })).rejects.toMatchObject({ status: 400 });
    await expect(syncSlots(t.deps, PATIENT, { from: 0, to: 9e15, slots: [] })).rejects.toMatchObject({ status: 400 });
  });

  it("drops medicine names unless the patient opted in", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00", "open", { medicines: ["Metformin 500 mg"] })] });
    expect((await t.deps.db.query("SELECT medicines_enc FROM slots")).rows[0].medicines_enc).toBeNull();
  });

  it("removes slots the phone no longer has, unless already alerted", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00"), slot("20:00")] });
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00")] });
    expect((await t.deps.db.query("SELECT key FROM slots")).rows.map((r) => r.key)).toEqual(["2026-11-06T08:00"]);
  });
});

describe("missed-dose alerts", () => {
  it("alerts once after the grace window, with no medicine names by default", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00")] });

    t.setNow("2026-11-06T06:59:00Z"); // 08:59 local: still within 60-minute grace
    expect((await sweepMissedDoses(t.deps)).sent).toBe(0);

    t.setNow("2026-11-06T07:01:00Z");
    expect((await sweepMissedDoses(t.deps)).sent).toBe(1);
    expect(t.sent).toEqual([
      expect.objectContaining({ to: CAREGIVER_E164, template: "dosewise_dose_not_confirmed", params: ["Thandi", "08:00"] }),
    ]);

    t.setNow("2026-11-06T07:06:00Z");
    expect((await sweepMissedDoses(t.deps)).sent).toBe(0); // never twice
  });

  it("sends nothing for doses logged as taken or skipped", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00", "taken"), slot("09:00", "skipped")] });
    t.setNow("2026-11-06T09:00:00Z");
    await sweepMissedDoses(t.deps);
    expect(t.sent).toEqual([]);
  });

  it("alerts even if the phone went quiet, because times were uploaded ahead", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("14:00")] });
    t.setNow("2026-11-06T13:05:00Z"); // 15:05 local, no further sync from the phone
    expect((await sweepMissedDoses(t.deps)).sent).toBe(1);
  });

  it("skips stale slots after an outage instead of sending late alarms", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00")] });
    t.setNow("2026-11-06T14:00:00Z"); // 7 hours after the alert time
    expect((await sweepMissedDoses(t.deps)).sent).toBe(0);
  });

  it("only alerts caregivers who chose alerts", async () => {
    const t = await withCaregiver("SUMMARY");
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00")] });
    t.setNow("2026-11-06T07:01:00Z");
    await sweepMissedDoses(t.deps);
    expect(t.sent).toEqual([]);
  });

  it("caps alerts at 5 per caregiver per day", async () => {
    const t = await withCaregiver();
    const times = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"];
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: times.map((x) => slot(x)) });
    for (const x of times) {
      t.setNow(new Date(at(x) + 61 * 60_000).toISOString());
      await sweepMissedDoses(t.deps);
    }
    expect(t.sent).toHaveLength(5);
  });

  it("includes medicine names only when the patient opted in", async () => {
    const t = await withCaregiver("ALERTS", true);
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00", "open", { medicines: ["Metformin 500 mg"] })] });
    t.setNow("2026-11-06T07:01:00Z");
    await sweepMissedDoses(t.deps);
    expect(t.sent[0]).toMatchObject({ template: "dosewise_dose_not_confirmed_named", params: ["Thandi", "08:00", "Metformin 500 mg"] });
  });
});

describe("daily summary", () => {
  it("sends once at 20:00 local with what was confirmed, skipped and missed", async () => {
    const t = await withCaregiver("SUMMARY");
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00", "taken"), slot("14:00"), slot("18:00", "skipped"), slot("21:00")] });

    t.setNow("2026-11-06T17:50:00Z"); // 19:50 local
    expect((await sendDailySummaries(t.deps)).sent).toBe(0);

    t.setNow("2026-11-06T18:05:00Z"); // 20:05 local: 21:00 dose not yet due, so not counted
    expect((await sendDailySummaries(t.deps)).sent).toBe(1);
    expect(t.sent[0]).toMatchObject({
      template: "dosewise_daily_summary",
      params: ["Thandi", "1", "3", "Not confirmed: 14:00. Skipped: 18:00."],
    });

    t.setNow("2026-11-06T19:00:00Z");
    expect((await sendDailySummaries(t.deps)).sent).toBe(0);
  });
});

describe("retention", () => {
  it("deletes dose times after 90 days", async () => {
    const t = await withCaregiver();
    await syncSlots(t.deps, PATIENT, { ...WINDOW, slots: [slot("08:00")] });
    t.setNow("2027-02-05T07:00:00Z");
    expect((await applyRetention(t.deps)).slots).toBe(1);
  });
});
