/**
 * Patients, caregivers and consent (PRD R5–R7, section 6 consent flow).
 *
 * 1. The patient agrees in the app to share with a named person (consent recorded).
 * 2. The caregiver gets a WhatsApp invite and must choose Alerts / Daily summary / Both.
 *    Nothing else is sent until they do (their consent recorded).
 * 3. Either side can stop at any time: the patient in the app, the caregiver by replying STOP.
 */
import { maskPhone, normalisePhone } from "@dosewise/core";
import { isValidTimeZone } from "../lib/time";
import { parseReply } from "@dosewise/core";
import { HttpError, type Deps } from "./deps";
import { reply, sendTemplate, type Recipient } from "./messaging";

export interface PatientProfile {
  displayName?: string;
  phone?: string;
  tz: string;
  includeMedicineNames: boolean;
}

interface CaregiverRow {
  id: string;
  patient_id: string;
  name_enc: string;
  phone_enc: string;
  status: string;
  wants_alerts: boolean;
  wants_summary: boolean;
  channel: "whatsapp" | "sms";
  invited_at: Date;
  activated_at: Date | null;
}

export async function recordConsent(
  deps: Deps,
  c: { patientId: string; caregiverId?: string; kind: string; actor: "patient" | "caregiver" | "system"; details?: Record<string, unknown> },
) {
  await deps.db.query(
    "INSERT INTO consents (patient_id, caregiver_id, kind, actor, notice_version, details, at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)",
    [c.patientId, c.caregiverId ?? null, c.kind, c.actor, deps.config.noticeVersion, JSON.stringify(c.details ?? {}), deps.now()],
  );
}

/* ---------------- patient profile ---------------- */

export async function getProfile(deps: Deps, patientId: string): Promise<PatientProfile | null> {
  const { rows } = await deps.db.query("SELECT * FROM patients WHERE id = $1", [patientId]);
  const p = rows[0];
  if (!p) return null;
  return {
    displayName: p.display_name_enc ? await deps.cipher.decrypt(p.display_name_enc) : undefined,
    phone: p.phone_enc ? await deps.cipher.decrypt(p.phone_enc) : undefined,
    tz: p.tz,
    includeMedicineNames: p.include_med_names,
  };
}

export async function putProfile(deps: Deps, patientId: string, input: { displayName?: unknown; tz?: unknown; includeMedicineNames?: unknown; phone?: string }) {
  const name = typeof input.displayName === "string" ? input.displayName.trim().slice(0, 40) : undefined;
  const tz = typeof input.tz === "string" && isValidTimeZone(input.tz) ? input.tz : "Africa/Johannesburg";
  const names = input.includeMedicineNames === true;
  const before = await getProfile(deps, patientId);
  const phone = input.phone ? normalisePhone(input.phone) : undefined;
  await deps.db.query(
    `INSERT INTO patients (id, display_name_enc, phone_enc, tz, include_med_names, created_at) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET display_name_enc = EXCLUDED.display_name_enc, phone_enc = COALESCE(EXCLUDED.phone_enc, patients.phone_enc),
       tz = EXCLUDED.tz, include_med_names = EXCLUDED.include_med_names`,
    [patientId, name ? await deps.cipher.encrypt(name) : null, phone ? await deps.cipher.encrypt(phone) : null, tz, names, deps.now()],
  );
  if ((before?.includeMedicineNames ?? false) !== names) {
    await recordConsent(deps, { patientId, kind: names ? "medicine_names_granted" : "medicine_names_withdrawn", actor: "patient" });
    if (!names) await deps.db.query("UPDATE slots SET medicines_enc = NULL WHERE patient_id = $1", [patientId]);
  }
  return getProfile(deps, patientId);
}

/* ---------------- caregivers ---------------- */

async function toView(deps: Deps, r: CaregiverRow) {
  return {
    id: r.id,
    name: await deps.cipher.decrypt(r.name_enc),
    phone: maskPhone(await deps.cipher.decrypt(r.phone_enc)),
    status: r.status,
    alerts: r.wants_alerts,
    summary: r.wants_summary,
    channel: r.channel,
    invitedAt: new Date(r.invited_at).toISOString(),
  };
}

export async function listCaregivers(deps: Deps, patientId: string) {
  const { rows } = await deps.db.query<CaregiverRow>(
    "SELECT * FROM caregivers WHERE patient_id = $1 AND status IN ('invited','active','declined','stopped') ORDER BY invited_at",
    [patientId],
  );
  return Promise.all(rows.map((r) => toView(deps, r)));
}

export async function inviteCaregiver(deps: Deps, patientId: string, input: { name?: unknown; phone?: unknown; agreed?: unknown; noticeVersion?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  const phone = typeof input.phone === "string" ? normalisePhone(input.phone) : undefined;
  if (!name || !phone) throw new HttpError(400, "A name and a valid phone number are needed.");
  if (input.agreed !== true || input.noticeVersion !== deps.config.noticeVersion) {
    throw new HttpError(400, "The patient must agree to the current sharing notice first.");
  }
  const profile = await getProfile(deps, patientId);
  if (!profile?.displayName) throw new HttpError(409, "Set the name your family will see first.");
  if (profile.phone === phone) throw new HttpError(400, "That is your own number.");

  const index = await deps.cipher.index(phone);
  const { rows: existing } = await deps.db.query<CaregiverRow>(
    "SELECT * FROM caregivers WHERE patient_id = $1 AND status IN ('invited','active')",
    [patientId],
  );
  if (existing.length >= deps.config.maxCaregivers) throw new HttpError(409, `Up to ${deps.config.maxCaregivers} family members can get updates.`);
  const { rows: dup } = await deps.db.query("SELECT id FROM caregivers WHERE patient_id = $1 AND phone_index = $2 AND status IN ('invited','active')", [patientId, index]);
  if (dup.length) throw new HttpError(409, "This number is already added.");

  const id = deps.newId();
  await deps.db.query(
    `INSERT INTO caregivers (id, patient_id, name_enc, phone_enc, phone_index, status, channel, invited_at)
     VALUES ($1,$2,$3,$4,$5,'invited','whatsapp',$6)`,
    [id, patientId, await deps.cipher.encrypt(name), await deps.cipher.encrypt(phone), index, deps.now()],
  );
  await recordConsent(deps, { patientId, caregiverId: id, kind: "share_with_caregiver_granted", actor: "patient" });
  await sendTemplate(deps, { caregiverId: id, patientId, phone, channel: "whatsapp" }, "dosewise_caregiver_invite", [profile.displayName]);
  const { rows } = await deps.db.query<CaregiverRow>("SELECT * FROM caregivers WHERE id = $1", [id]);
  return toView(deps, rows[0]!);
}

/** Patient removes a caregiver. Takes effect immediately; the caregiver is told once. */
export async function revokeCaregiver(deps: Deps, patientId: string, caregiverId: string) {
  const { rows } = await deps.db.query<CaregiverRow>("SELECT * FROM caregivers WHERE id = $1 AND patient_id = $2", [caregiverId, patientId]);
  const cg = rows[0];
  if (!cg) throw new HttpError(404, "Not found.");
  await deps.db.query("UPDATE caregivers SET status = 'revoked', ended_at = $2, wants_alerts = FALSE, wants_summary = FALSE WHERE id = $1", [caregiverId, deps.now()]);
  await recordConsent(deps, { patientId, caregiverId, kind: "share_with_caregiver_withdrawn", actor: "patient" });
  // Only someone who agreed to updates is told they've stopped; an unanswered invite gets nothing more.
  if (cg.status === "active") {
    const profile = await getProfile(deps, patientId);
    await sendTemplate(
      deps,
      { caregiverId, patientId, phone: await deps.cipher.decrypt(cg.phone_enc), channel: cg.channel },
      "dosewise_sharing_stopped",
      [profile?.displayName ?? "the patient"],
      false,
    );
  }
}

/* ---------------- caregiver replies (WhatsApp or SMS) ---------------- */

const HELP_TEXT = "DoseWise: reply ALERTS, SUMMARY or BOTH to choose your updates, CALL for the patient's number, or STOP to stop.";

export async function handleReply(deps: Deps, input: { from: string; payload?: string; text?: string }, channel: "whatsapp" | "sms") {
  const from = normalisePhone(input.from);
  if (!from) return;
  const { action, caregiverId } = parseReply(input);
  const index = await deps.cipher.index(from);
  const { rows } = await deps.db.query<CaregiverRow>(
    "SELECT * FROM caregivers WHERE phone_index = $1 AND status IN ('invited','active') ORDER BY invited_at DESC",
    [index],
  );
  if (!rows.length) return; // unknown number or already stopped: say nothing

  // A button carries the caregiver id; it must belong to this sender's number.
  const targeted = caregiverId ? rows.filter((r) => r.id === caregiverId) : rows;
  if (caregiverId && !targeted.length) return;
  const recipient = (r: CaregiverRow): Recipient => ({ caregiverId: r.id, patientId: r.patient_id, phone: from, channel });
  const nameOf = async (r: CaregiverRow) => (await getProfile(deps, r.patient_id))?.displayName ?? "the patient";

  if (action === "STOP") {
    // Text STOP stops everything for this number; a button stops just that link.
    for (const r of targeted) {
      await deps.db.query("UPDATE caregivers SET status = 'stopped', ended_at = $2, wants_alerts = FALSE, wants_summary = FALSE WHERE id = $1", [r.id, deps.now()]);
      await recordConsent(deps, { patientId: r.patient_id, caregiverId: r.id, kind: "caregiver_opt_out", actor: "caregiver", details: { channel } });
    }
    const names = await Promise.all(targeted.map(nameOf));
    await reply(deps, recipient(targeted[0]!), `Done. You will no longer receive DoseWise updates about ${names.join(", ")}.`);
    return;
  }

  // Other actions need to know which patient: from the button, or the only link for this number.
  if (targeted.length > 1) {
    await reply(deps, recipient(targeted[0]!), "You get updates about more than one person. Please tap a button on the message you are answering.");
    return;
  }
  const r = targeted[0]!;
  const who = await nameOf(r);

  if (action === "ALERTS" || action === "SUMMARY" || action === "BOTH") {
    const alerts = action !== "SUMMARY";
    const summary = action !== "ALERTS";
    await deps.db.query(
      "UPDATE caregivers SET status = 'active', wants_alerts = $2, wants_summary = $3, channel = $4, activated_at = COALESCE(activated_at, $5) WHERE id = $1",
      [r.id, alerts, summary, channel, deps.now()],
    );
    await recordConsent(deps, {
      patientId: r.patient_id,
      caregiverId: r.id,
      kind: r.status === "invited" ? "caregiver_opt_in" : "caregiver_preferences_changed",
      actor: "caregiver",
      details: { alerts, summary, channel },
    });
    const what = alerts && summary ? "alerts and a daily summary" : alerts ? "alerts when a dose is not confirmed" : "a daily summary";
    await reply(deps, recipient(r), `Thank you. You will get ${what} about ${who}. Reply STOP at any time to stop.`);
  } else if (action === "NO") {
    if (r.status === "invited") {
      await deps.db.query("UPDATE caregivers SET status = 'declined', ended_at = $2 WHERE id = $1", [r.id, deps.now()]);
      await recordConsent(deps, { patientId: r.patient_id, caregiverId: r.id, kind: "caregiver_declined", actor: "caregiver" });
      await reply(deps, recipient(r), "No problem. You will not receive any DoseWise messages.");
    }
  } else if (action === "CALL" && r.status === "active") {
    const phone = (await getProfile(deps, r.patient_id))?.phone;
    await reply(deps, recipient(r), phone ? `You can call ${who} on ${phone}.` : `${who} hasn't shared a phone number with DoseWise.`);
  } else {
    await reply(deps, recipient(r), HELP_TEXT);
  }
}

/** Delivery status from WhatsApp. A failure because the number isn't on WhatsApp moves that caregiver to SMS. */
export async function handleStatus(deps: Deps, s: { id: string; status: string; errorCode?: number }) {
  await deps.db.query("UPDATE messages SET status = $2, error_code = $3, updated_at = $4 WHERE id = $1", [s.id, s.status, s.errorCode ?? null, deps.now()]);
  if (s.status === "failed" && (s.errorCode === 131026 || s.errorCode === 131030)) {
    await deps.db.query("UPDATE caregivers SET channel = 'sms' WHERE id = (SELECT caregiver_id FROM messages WHERE id = $1)", [s.id]);
  }
}
