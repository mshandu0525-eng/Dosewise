/**
 * Test endpoints, available only when the backend runs in test messaging mode (staging).
 * A signed-in tester can only see messages sent to their own family members, and can
 * only reply as one of those numbers.
 */
import { normalisePhone } from "@dosewise/core";
import { handleReply } from "./caregivers";
import { HttpError, type Deps } from "./deps";
import { sweepMissedDoses } from "./doses";

function requireTestMode(deps: Deps) {
  if (!deps.config.testMessaging) throw new HttpError(404, "Not found.");
}

async function familyIndexes(deps: Deps, patientId: string): Promise<string[]> {
  const { rows } = await deps.db.query<{ phone_index: string }>("SELECT DISTINCT phone_index FROM caregivers WHERE patient_id = $1", [patientId]);
  return rows.map((r) => r.phone_index);
}

/** Messages that would have gone to this patient's family members, newest first. */
export async function listOutbox(deps: Deps, patientId: string) {
  requireTestMode(deps);
  const { rows } = await deps.db.query(
    `SELECT id, channel, to_enc, template, text, buttons, sent_at FROM test_outbox
     WHERE to_index IN (SELECT phone_index FROM caregivers WHERE patient_id = $1)
     ORDER BY sent_at DESC LIMIT 100`,
    [patientId],
  );
  const messages = [];
  for (const r of rows) {
    messages.push({
      id: r.id,
      channel: r.channel,
      to: await deps.cipher.decrypt(r.to_enc),
      template: r.template,
      text: r.text,
      buttons: typeof r.buttons === "string" ? JSON.parse(r.buttons) : r.buttons,
      sentAt: new Date(r.sent_at).toISOString(),
    });
  }
  return { messages };
}

/** Plays the family member: a button tap (payload) or a typed reply, as if from their phone. */
export async function simulateReply(deps: Deps, patientId: string, body: { phone?: unknown; payload?: unknown; text?: unknown }) {
  requireTestMode(deps);
  const phone = typeof body.phone === "string" ? normalisePhone(body.phone) : undefined;
  if (!phone) throw new HttpError(400, "A valid phone number is needed.");
  if (!(await familyIndexes(deps, patientId)).includes(await deps.cipher.index(phone))) {
    throw new HttpError(403, "You can only reply as one of your own family members.");
  }
  const payload = typeof body.payload === "string" ? body.payload : undefined;
  const text = typeof body.text === "string" ? body.text.slice(0, 200) : undefined;
  if (!payload && !text) throw new HttpError(400, "Send a button payload or some text.");
  await handleReply(deps, { from: phone, payload, text }, "whatsapp");
  return listOutbox(deps, patientId);
}

/** Runs the missed-dose check now instead of waiting up to 5 minutes. */
export async function runSweepNow(deps: Deps) {
  requireTestMode(deps);
  return sweepMissedDoses(deps);
}
