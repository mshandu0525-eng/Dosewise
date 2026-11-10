import { describe, expect, it } from "vitest";
import { inviteCaregiver, listCaregivers, putProfile } from "../src/domain/caregivers";
import { applyRetention, syncSlots } from "../src/domain/doses";
import { listOutbox, runSweepNow, simulateReply } from "../src/domain/testMode";
import { OutboxMessenger, OutboxSms } from "../src/whatsapp/outbox";
import { CAREGIVER_E164, CAREGIVER_PHONE, PATIENT, makeDeps } from "./helpers";

/** Deps wired as the staging backend is: outbox instead of WhatsApp/SMS. */
function stagingDeps() {
  const t = makeDeps("2026-11-10T05:00:00Z");
  t.deps.config.testMessaging = true;
  t.deps.whatsapp = new OutboxMessenger(t.deps.db, t.deps.cipher, t.deps.newId);
  t.deps.sms = new OutboxSms(t.deps.db, t.deps.cipher, t.deps.newId);
  return t;
}

const at = (time: string) => Date.parse(`2026-11-10T${time}:00+02:00`);

describe("test messaging mode", () => {
  it("runs invite → consent → missed-dose alert → STOP without WhatsApp", async () => {
    const t = stagingDeps();
    await putProfile(t.deps, PATIENT, { displayName: "Thandi", tz: "Africa/Johannesburg" });
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, agreed: true, noticeVersion: t.deps.config.noticeVersion });

    // The invite lands in the outbox, rendered as WhatsApp would show it, with working buttons.
    let { messages } = await listOutbox(t.deps, PATIENT);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ channel: "whatsapp", to: CAREGIVER_E164, template: "dosewise_caregiver_invite" });
    expect(messages[0]!.text).toContain("DoseWise: Thandi has asked us");
    expect(messages[0]!.buttons.map((b: { text: string }) => b.text)).toEqual(["Alerts", "Daily summary", "Both", "No thanks"]);

    // Tapping "Both" as the family member activates them.
    const both = messages[0]!.buttons.find((b: { text: string }) => b.text === "Both")!.payload;
    expect(both).toBe(`BOTH:${cg.id}`);
    await simulateReply(t.deps, PATIENT, { phone: CAREGIVER_PHONE, payload: both });
    expect((await listCaregivers(t.deps, PATIENT))[0]).toMatchObject({ status: "active", alerts: true, summary: true });

    // A missed dose produces an alert once the sweep runs.
    await syncSlots(t.deps, PATIENT, { from: at("00:00"), to: at("23:59"), slots: [{ key: "2026-11-10T08:00", dueAt: at("08:00"), status: "open" }] });
    t.setNow("2026-11-10T07:01:00Z");
    expect((await runSweepNow(t.deps)).sent).toBe(1);
    ({ messages } = await listOutbox(t.deps, PATIENT));
    expect(messages[0]!.text).toBe("DoseWise: Thandi has not yet confirmed their 08:00 medication. Reply STOP to stop these updates.");

    // STOP as typed text.
    await simulateReply(t.deps, PATIENT, { phone: CAREGIVER_E164, text: "stop" });
    expect(await listCaregivers(t.deps, PATIENT)).toEqual([expect.objectContaining({ status: "stopped" })]);
  });

  it("only lets testers see and answer as their own family members", async () => {
    const t = stagingDeps();
    await putProfile(t.deps, PATIENT, { displayName: "Thandi" });
    await putProfile(t.deps, "someone-else", { displayName: "Gogo" });
    await inviteCaregiver(t.deps, "someone-else", { name: "Lerato", phone: "083 444 2222", agreed: true, noticeVersion: t.deps.config.noticeVersion });
    expect((await listOutbox(t.deps, PATIENT)).messages).toEqual([]);
    await expect(simulateReply(t.deps, PATIENT, { phone: "083 444 2222", text: "both" })).rejects.toMatchObject({ status: 403 });
  });

  it("does not exist in live mode", async () => {
    const t = makeDeps();
    await expect(listOutbox(t.deps, PATIENT)).rejects.toMatchObject({ status: 404 });
    await expect(simulateReply(t.deps, PATIENT, { phone: CAREGIVER_PHONE, text: "both" })).rejects.toMatchObject({ status: 404 });
    await expect(runSweepNow(t.deps)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps test messages for 7 days", async () => {
    const t = stagingDeps();
    await putProfile(t.deps, PATIENT, { displayName: "Thandi" });
    await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, agreed: true, noticeVersion: t.deps.config.noticeVersion });
    // Outbox rows use the wall clock; move the test clock 8 days ahead of it.
    t.setNow(new Date(Date.now() + 8 * 86_400_000).toISOString());
    expect((await applyRetention(t.deps)).testOutbox).toBe(1);
  });
});
