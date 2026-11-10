import { TEMPLATES, renderSms, type TemplateName } from "@dosewise/core";
import type { Deps } from "./deps";

export interface Recipient {
  caregiverId: string;
  patientId: string;
  phone: string;
  channel: "whatsapp" | "sms";
}

/**
 * Sends a template to a caregiver on their channel. If WhatsApp says the number
 * isn't on WhatsApp, switches that caregiver to SMS and sends the SMS version.
 * Only ids and delivery status are logged, never message text.
 */
export async function sendTemplate(deps: Deps, to: Recipient, name: TemplateName, params: string[], withButtons = true): Promise<boolean> {
  const payloads = withButtons ? (TEMPLATES[name].buttons ?? []).map((b) => `${b.action}:${to.caregiverId}`) : undefined;
  if (to.channel === "whatsapp") {
    const r = await deps.whatsapp.sendTemplate(to.phone, name, params, payloads);
    if (r.ok) {
      await logMessage(deps, r.id!, to, name, "whatsapp", "sent");
      return true;
    }
    if (!r.notOnWhatsApp) {
      await logMessage(deps, `failed-${deps.newId()}`, to, name, "whatsapp", "failed", r.errorCode);
      return false;
    }
    await deps.db.query("UPDATE caregivers SET channel = 'sms' WHERE id = $1", [to.caregiverId]);
  }
  const s = await deps.sms.send(to.phone, renderSms(name, params));
  await logMessage(deps, s.id ?? `failed-${deps.newId()}`, to, name, "sms", s.ok ? "sent" : "failed");
  return s.ok;
}

/** Free-text reply, only used right after the caregiver messaged us (inside WhatsApp's 24-hour window). */
export async function reply(deps: Deps, to: Recipient, text: string) {
  const r = to.channel === "whatsapp" ? await deps.whatsapp.sendText(to.phone, text) : await deps.sms.send(to.phone, text);
  if (!r.ok && to.channel === "whatsapp" && r.notOnWhatsApp) await deps.sms.send(to.phone, text);
}

async function logMessage(deps: Deps, id: string, to: Recipient, kind: string, channel: string, status: string, errorCode?: number) {
  await deps.db.query(
    "INSERT INTO messages (id, patient_id, caregiver_id, kind, channel, status, error_code, sent_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)",
    [id, to.patientId, to.caregiverId, kind, channel, status, errorCode ?? null, deps.now()],
  );
}
