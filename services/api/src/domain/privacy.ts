/**
 * Data subject rights (POPIA sections 23–25): download everything held, and delete the account.
 */
import type { Deps } from "./deps";
import { getProfile, listCaregivers, recordConsent, revokeCaregiver } from "./caregivers";

export async function exportData(deps: Deps, patientId: string) {
  const [profile, caregivers, slots, consents, messages] = await Promise.all([
    getProfile(deps, patientId),
    listCaregivers(deps, patientId),
    deps.db.query("SELECT key, due_at, status, critical, alerted_at FROM slots WHERE patient_id = $1 ORDER BY key", [patientId]),
    deps.db.query("SELECT caregiver_id, kind, actor, notice_version, details, at FROM consents WHERE patient_id = $1 ORDER BY at", [patientId]),
    deps.db.query("SELECT caregiver_id, kind, channel, status, sent_at FROM messages WHERE patient_id = $1 ORDER BY sent_at", [patientId]),
  ]);
  return {
    exportedAt: deps.now().toISOString(),
    profile,
    familyMembers: caregivers,
    doseTimes: slots.rows,
    consentHistory: consents.rows,
    messagesSent: messages.rows,
    note: "Medicines, dose history and photos are stored only on your phone and are not held by DoseWise.",
  };
}

/**
 * Deletes everything except the consent log, which is kept for 5 years as evidence of
 * consent and holds no names or numbers. Active family members are told sharing has stopped.
 */
export async function deleteAccount(deps: Deps, patientId: string) {
  const { rows } = await deps.db.query<{ id: string }>("SELECT id FROM caregivers WHERE patient_id = $1 AND status IN ('invited','active')", [patientId]);
  for (const r of rows) await revokeCaregiver(deps, patientId, r.id);
  await deps.db.query("DELETE FROM messages WHERE patient_id = $1", [patientId]);
  await deps.db.query("DELETE FROM slots WHERE patient_id = $1", [patientId]);
  await deps.db.query("DELETE FROM caregivers WHERE patient_id = $1", [patientId]);
  await deps.db.query("DELETE FROM patients WHERE id = $1", [patientId]);
  await recordConsent(deps, { patientId, kind: "account_deleted", actor: "patient" });
}
