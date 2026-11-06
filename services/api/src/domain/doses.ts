/**
 * Dose times and family alerts.
 *
 * The phone uploads its dose times ("slots") for the next 48 hours and their status
 * as it changes. The backend never sees the schedule rules, only times and statuses.
 * Uploading ahead means family is still told if the phone is off, lost or offline.
 *
 * A scheduled sweep every 5 minutes alerts on slots still open after the grace window.
 * (The PRD sketched one timer per slot; a sweep is simpler, can't leave orphan timers,
 * and stays inside the 15-minute target.)
 */
import { localParts } from "../lib/time";
import { HttpError, type Deps } from "./deps";
import { getProfile } from "./caregivers";
import { sendTemplate } from "./messaging";

export interface SlotInput {
  /** Patient-local "yyyy-mm-ddTHH:MM". */
  key: string;
  /** Epoch ms. */
  dueAt: number;
  status: "open" | "taken" | "skipped";
  critical?: boolean;
  /** Medicine names: stored only if the patient opted in to names in family messages. */
  medicines?: string[];
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Replaces the slots in [from, to] with the given list. Slots already alerted are kept.
 * Returns stored: false when the patient has no family members, so no data is kept.
 */
export async function syncSlots(deps: Deps, patientId: string, body: { from?: unknown; to?: unknown; slots?: unknown }) {
  const now = deps.now().getTime();
  const from = Number(body.from), to = Number(body.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 4 * 86_400_000) throw new HttpError(400, "Invalid window.");
  if (!Array.isArray(body.slots) || body.slots.length > 300) throw new HttpError(400, "Invalid slots.");
  const slots = body.slots as SlotInput[];
  for (const s of slots) {
    if (typeof s?.key !== "string" || !KEY_RE.test(s.key) || !Number.isFinite(s.dueAt) || !["open", "taken", "skipped"].includes(s.status)) {
      throw new HttpError(400, "Invalid slot.");
    }
    if (s.dueAt < from || s.dueAt > to || s.dueAt < now - 2 * 86_400_000 || s.dueAt > now + 4 * 86_400_000) throw new HttpError(400, "Slot outside window.");
  }

  const { rows: family } = await deps.db.query("SELECT 1 FROM caregivers WHERE patient_id = $1 AND status IN ('invited','active') LIMIT 1", [patientId]);
  if (!family.length) {
    await deps.db.query("DELETE FROM slots WHERE patient_id = $1", [patientId]);
    return { stored: false };
  }
  const profile = await getProfile(deps, patientId);
  const graceMs = deps.config.graceMinutes * 60_000;

  for (const s of slots) {
    const meds = profile?.includeMedicineNames && s.medicines?.length ? await deps.cipher.encrypt(s.medicines.slice(0, 10).join(", ").slice(0, 200)) : null;
    await deps.db.query(
      `INSERT INTO slots (patient_id, key, due_at, alert_at, critical, status, medicines_enc, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (patient_id, key) DO UPDATE SET due_at = EXCLUDED.due_at, alert_at = EXCLUDED.alert_at,
         critical = EXCLUDED.critical, status = EXCLUDED.status, medicines_enc = EXCLUDED.medicines_enc, updated_at = EXCLUDED.updated_at`,
      [patientId, s.key, new Date(s.dueAt), new Date(s.dueAt + graceMs), !!s.critical, s.status, meds, deps.now()],
    );
  }
  // Slots in the window the phone no longer has (medicine deleted or rescheduled), unless already alerted.
  const keys = slots.map((s) => s.key);
  const { rows: stale } = await deps.db.query<{ key: string }>(
    "SELECT key FROM slots WHERE patient_id = $1 AND due_at >= $2 AND due_at <= $3 AND alerted_at IS NULL",
    [patientId, new Date(from), new Date(to)],
  );
  for (const { key } of stale) {
    if (!keys.includes(key)) await deps.db.query("DELETE FROM slots WHERE patient_id = $1 AND key = $2", [patientId, key]);
  }
  return { stored: true, count: slots.length };
}

interface DueSlot {
  patient_id: string;
  key: string;
  medicines_enc: string | null;
}

/** Sweep: alert family about doses still not confirmed after the grace window. Safe to run concurrently. */
export async function sweepMissedDoses(deps: Deps) {
  const now = deps.now();
  const oldest = new Date(now.getTime() - deps.config.maxAlertLagMinutes * 60_000);
  const { rows } = await deps.db.query<DueSlot>(
    "SELECT patient_id, key, medicines_enc FROM slots WHERE status = 'open' AND alerted_at IS NULL AND alert_at <= $1 AND alert_at > $2",
    [now, oldest],
  );
  let sent = 0;
  for (const slot of rows) {
    // Claim the slot first, so two overlapping sweeps can't both alert.
    const claim = await deps.db.query(
      "UPDATE slots SET alerted_at = $3 WHERE patient_id = $1 AND key = $2 AND alerted_at IS NULL AND status = 'open'",
      [slot.patient_id, slot.key, now],
    );
    if (!claim.rowCount) continue;
    sent += await alertFamily(deps, slot);
  }
  return { slots: rows.length, sent };
}

async function alertFamily(deps: Deps, slot: DueSlot) {
  const profile = await getProfile(deps, slot.patient_id);
  if (!profile?.displayName) return 0;
  const today = localParts(deps.now(), profile.tz).date;
  const time = slot.key.slice(11);
  const medicines = profile.includeMedicineNames && slot.medicines_enc ? await deps.cipher.decrypt(slot.medicines_enc) : undefined;
  const { rows } = await deps.db.query(
    "SELECT * FROM caregivers WHERE patient_id = $1 AND status = 'active' AND wants_alerts = TRUE",
    [slot.patient_id],
  );
  let sent = 0;
  for (const cg of rows) {
    const count = cg.alerts_date === today ? cg.alerts_today : 0;
    if (count >= deps.config.alertCapPerDay) continue; // folded into the daily summary
    await deps.db.query("UPDATE caregivers SET alerts_date = $2, alerts_today = $3 WHERE id = $1", [cg.id, today, count + 1]);
    const to = { caregiverId: cg.id, patientId: slot.patient_id, phone: await deps.cipher.decrypt(cg.phone_enc), channel: cg.channel };
    const ok = medicines
      ? await sendTemplate(deps, to, "dosewise_dose_not_confirmed_named", [profile.displayName, time, medicines])
      : await sendTemplate(deps, to, "dosewise_dose_not_confirmed", [profile.displayName, time]);
    if (ok) sent++;
  }
  return sent;
}

/** Daily summaries at the patient's local summary hour. Run every 15 minutes; each caregiver gets one per day. */
export async function sendDailySummaries(deps: Deps) {
  const now = deps.now();
  const { rows } = await deps.db.query(
    `SELECT c.*, p.tz FROM caregivers c JOIN patients p ON p.id = c.patient_id
     WHERE c.status = 'active' AND c.wants_summary = TRUE`,
  );
  let sent = 0;
  for (const cg of rows) {
    const local = localParts(now, cg.tz);
    if (local.hour < deps.config.summaryHour || cg.last_summary_date === local.date) continue;
    const { rows: slots } = await deps.db.query<{ key: string; status: string; due_at: Date }>(
      "SELECT key, status, due_at FROM slots WHERE patient_id = $1 AND key LIKE $2 AND due_at <= $3 ORDER BY key",
      [cg.patient_id, `${local.date}T%`, now],
    );
    await deps.db.query("UPDATE caregivers SET last_summary_date = $2 WHERE id = $1", [cg.id, local.date]);
    if (!slots.length) continue;
    const profile = await getProfile(deps, cg.patient_id);
    const taken = slots.filter((s) => s.status === "taken").length;
    const open = slots.filter((s) => s.status === "open").map((s) => s.key.slice(11));
    const skipped = slots.filter((s) => s.status === "skipped").map((s) => s.key.slice(11));
    const detail =
      [open.length ? `Not confirmed: ${open.join(", ")}.` : "", skipped.length ? `Skipped: ${skipped.join(", ")}.` : ""].filter(Boolean).join(" ") ||
      "All doses confirmed.";
    const ok = await sendTemplate(
      deps,
      { caregiverId: cg.id, patientId: cg.patient_id, phone: await deps.cipher.decrypt(cg.phone_enc), channel: cg.channel },
      "dosewise_daily_summary",
      [profile?.displayName ?? "the patient", String(taken), String(slots.length), detail],
    );
    if (ok) sent++;
  }
  return { sent };
}

/** Retention (PRD data inventory): dose times and message logs 90 days; removed family members 30 days. */
export async function applyRetention(deps: Deps) {
  const now = deps.now().getTime();
  const days = (n: number) => new Date(now - n * 86_400_000);
  const slots = await deps.db.query("DELETE FROM slots WHERE due_at < $1", [days(90)]);
  const messages = await deps.db.query("DELETE FROM messages WHERE sent_at < $1", [days(90)]);
  const caregivers = await deps.db.query("DELETE FROM caregivers WHERE ended_at IS NOT NULL AND ended_at < $1", [days(30)]);
  return { slots: slots.rowCount, messages: messages.rowCount, caregivers: caregivers.rowCount };
}
