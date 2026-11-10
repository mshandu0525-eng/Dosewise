import { describe, expect, it } from "vitest";
import { handleReply, handleStatus, inviteCaregiver, listCaregivers, putProfile, revokeCaregiver } from "../src/domain/caregivers";
import { deleteAccount, exportData } from "../src/domain/privacy";
import { CAREGIVER_E164, CAREGIVER_PHONE, PATIENT, makeDeps } from "./helpers";

const agree = (deps: { config: { noticeVersion: string } }) => ({ agreed: true, noticeVersion: deps.config.noticeVersion });

async function setup() {
  const t = makeDeps();
  await putProfile(t.deps, PATIENT, { displayName: "Thandi", tz: "Africa/Johannesburg", phone: "072 000 1111" });
  return t;
}

async function consentKinds(t: Awaited<ReturnType<typeof setup>>) {
  return (await t.deps.db.query("SELECT kind FROM consents ORDER BY id")).rows.map((r) => r.kind);
}

describe("inviting a caregiver", () => {
  it("records the patient's consent and sends the invite with one button payload per choice", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    expect(cg).toMatchObject({ name: "Sipho", phone: "+27 82 *** 0101", status: "invited", alerts: false, summary: false });
    expect(t.sent).toEqual([
      {
        channel: "whatsapp",
        to: CAREGIVER_E164,
        template: "dosewise_caregiver_invite",
        params: ["Thandi"],
        payloads: [`ALERTS:${cg.id}`, `SUMMARY:${cg.id}`, `BOTH:${cg.id}`, `NO:${cg.id}`],
      },
    ]);
    expect(await consentKinds(t)).toContain("share_with_caregiver_granted");
  });

  it("stores names and numbers only as ciphertext", async () => {
    const t = await setup();
    await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    const row = (await t.deps.db.query("SELECT * FROM caregivers")).rows[0];
    expect(JSON.stringify(row)).not.toMatch(/Sipho|825550101/);
  });

  it.each([
    [{ name: "Sipho", phone: CAREGIVER_PHONE }, 400, "without the patient agreeing"],
    [{ name: "Sipho", phone: CAREGIVER_PHONE, agreed: true, noticeVersion: "old" }, 400, "with an outdated notice"],
    [{ name: "Sipho", phone: "12" }, 400, "with a bad number"],
    [{ name: "Me", phone: "072 000 1111", agreed: true }, 400, "with the patient's own number"],
  ])("refuses %j (%s): %s", async (input, status, _why) => {
    const t = await setup();
    const body = "agreed" in input && !("noticeVersion" in input) ? { ...input, noticeVersion: t.deps.config.noticeVersion } : input;
    await expect(inviteCaregiver(t.deps, PATIENT, body)).rejects.toMatchObject({ status });
    expect(t.sent).toEqual([]);
  });

  it("refuses duplicates and more than five family members", async () => {
    const t = await setup();
    await inviteCaregiver(t.deps, PATIENT, { name: "A", phone: "082 555 0100", ...agree(t.deps) });
    await expect(inviteCaregiver(t.deps, PATIENT, { name: "A", phone: "+27825550100", ...agree(t.deps) })).rejects.toMatchObject({ status: 409 });
    for (let i = 1; i < 5; i++) await inviteCaregiver(t.deps, PATIENT, { name: `C${i}`, phone: `082 555 010${i}`, ...agree(t.deps) });
    await expect(inviteCaregiver(t.deps, PATIENT, { name: "F", phone: "082 555 0109", ...agree(t.deps) })).rejects.toMatchObject({ status: 409 });
  });

  it("falls back to SMS when the number isn't on WhatsApp", async () => {
    const t = await setup();
    t.notOnWhatsApp.add(CAREGIVER_E164);
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ channel: "sms", to: CAREGIVER_E164 });
    expect(t.sent[0]!.text).toContain("Reply ALERTS, SUMMARY or BOTH");
    expect((await listCaregivers(t.deps, PATIENT)).find((c) => c.id === cg.id)?.channel).toBe("sms");
  });
});

describe("caregiver replies", () => {
  it("activates with the chosen preferences and records the caregiver's consent", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    t.clear();
    await handleReply(t.deps, { from: "27825550101", payload: `SUMMARY:${cg.id}`, text: "Daily summary" }, "whatsapp");
    expect((await listCaregivers(t.deps, PATIENT))[0]).toMatchObject({ status: "active", alerts: false, summary: true });
    expect(t.sent[0]?.text).toContain("a daily summary about Thandi");
    expect(await consentKinds(t)).toContain("caregiver_opt_in");

    await handleReply(t.deps, { from: CAREGIVER_E164, text: "both" }, "whatsapp");
    expect((await listCaregivers(t.deps, PATIENT))[0]).toMatchObject({ alerts: true, summary: true });
    expect(await consentKinds(t)).toContain("caregiver_preferences_changed");
  });

  it("ignores a button payload that belongs to someone else's number", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    await inviteCaregiver(t.deps, PATIENT, { name: "Lerato", phone: "083 444 2222", ...agree(t.deps) });
    t.clear();
    await handleReply(t.deps, { from: "+27834442222", payload: `BOTH:${cg.id}` }, "whatsapp");
    expect(t.sent).toEqual([]);
    expect((await listCaregivers(t.deps, PATIENT)).every((c) => c.status === "invited")).toBe(true);
  });

  it("says nothing to unknown numbers", async () => {
    const t = await setup();
    await handleReply(t.deps, { from: "+27831112222", text: "STOP" }, "whatsapp");
    expect(t.sent).toEqual([]);
  });

  it("text STOP stops updates about everyone for that number", async () => {
    const t = await setup();
    await putProfile(t.deps, "patient-2", { displayName: "Gogo" });
    await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    await inviteCaregiver(t.deps, "patient-2", { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    t.clear();
    await handleReply(t.deps, { from: CAREGIVER_E164, text: "Stop" }, "whatsapp");
    const rows = (await t.deps.db.query("SELECT status FROM caregivers")).rows;
    expect(rows.map((r) => r.status)).toEqual(["stopped", "stopped"]);
    expect(t.sent[0]?.text).toContain("Thandi");
    expect(t.sent[0]?.text).toContain("Gogo");
  });

  it("asks which person when a number cares for two and replies without a button", async () => {
    const t = await setup();
    await putProfile(t.deps, "patient-2", { displayName: "Gogo" });
    await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    await inviteCaregiver(t.deps, "patient-2", { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    t.clear();
    await handleReply(t.deps, { from: CAREGIVER_E164, text: "ALERTS" }, "whatsapp");
    expect(t.sent[0]?.text).toContain("more than one person");
    expect((await t.deps.db.query("SELECT status FROM caregivers")).rows.every((r) => r.status === "invited")).toBe(true);
  });

  it("CALL returns the patient's number only to an active caregiver", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    t.clear();
    await handleReply(t.deps, { from: CAREGIVER_E164, payload: `CALL:${cg.id}` }, "whatsapp");
    expect(JSON.stringify(t.sent)).not.toContain("720001111"); // not agreed yet: gets help text, not the number
    await handleReply(t.deps, { from: CAREGIVER_E164, text: "alerts" }, "whatsapp");
    t.clear();
    await handleReply(t.deps, { from: CAREGIVER_E164, payload: `CALL:${cg.id}` }, "whatsapp");
    expect(t.sent[0]?.text).toBe("You can call Thandi on +27720001111.");
  });

  it("moves a caregiver to SMS when a WhatsApp delivery fails as undeliverable", async () => {
    const t = await setup();
    await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    await handleStatus(t.deps, { id: "wamid.1", status: "failed", errorCode: 131026 });
    expect((await listCaregivers(t.deps, PATIENT))[0]?.channel).toBe("sms");
  });
});

describe("patient withdrawing consent", () => {
  it("revokes immediately and tells an active caregiver once", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    await handleReply(t.deps, { from: CAREGIVER_E164, text: "both" }, "whatsapp");
    t.clear();
    await revokeCaregiver(t.deps, PATIENT, cg.id);
    expect(await listCaregivers(t.deps, PATIENT)).toEqual([]);
    expect(t.sent).toEqual([expect.objectContaining({ template: "dosewise_sharing_stopped", params: ["Thandi"] })]);
    expect(await consentKinds(t)).toContain("share_with_caregiver_withdrawn");
  });

  it("does not message someone who never answered the invite", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    t.clear();
    await revokeCaregiver(t.deps, PATIENT, cg.id);
    expect(t.sent).toEqual([]);
  });

  it("records turning medicine names on and off, and clears stored names when turned off", async () => {
    const t = await setup();
    await putProfile(t.deps, PATIENT, { displayName: "Thandi", includeMedicineNames: true });
    await putProfile(t.deps, PATIENT, { displayName: "Thandi", includeMedicineNames: false });
    expect(await consentKinds(t)).toEqual(expect.arrayContaining(["medicine_names_granted", "medicine_names_withdrawn"]));
  });
});

describe("data subject rights", () => {
  it("exports what is held and deletes everything except the consent log", async () => {
    const t = await setup();
    const cg = await inviteCaregiver(t.deps, PATIENT, { name: "Sipho", phone: CAREGIVER_PHONE, ...agree(t.deps) });
    await handleReply(t.deps, { from: CAREGIVER_E164, payload: `BOTH:${cg.id}` }, "whatsapp");
    const data = await exportData(t.deps, PATIENT);
    expect(data.profile?.displayName).toBe("Thandi");
    expect(data.familyMembers).toHaveLength(1);
    expect(data.consentHistory.length).toBeGreaterThanOrEqual(2);

    t.clear();
    await deleteAccount(t.deps, PATIENT);
    expect(t.sent.map((s) => s.template)).toEqual(["dosewise_sharing_stopped"]);
    for (const table of ["patients", "caregivers", "slots", "messages"]) {
      expect((await t.deps.db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    }
    const consents = (await t.deps.db.query("SELECT * FROM consents")).rows;
    expect(consents.at(-1)?.kind).toBe("account_deleted");
    expect(JSON.stringify(consents)).not.toMatch(/Sipho|Thandi|825550101/);
  });
});
