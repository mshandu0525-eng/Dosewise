/**
 * Test messaging mode (staging only). Instead of calling WhatsApp or SMS, messages are
 * written to the test_outbox table, rendered exactly as they would be sent. Testers read
 * them through GET /v1/test/outbox and answer as the family member through
 * POST /v1/test/reply, so invites, alerts, summaries and STOP can all be tested before
 * Meta approves the templates. The production stack refuses this mode.
 */
import { TEMPLATES, render, type TemplateName } from "@dosewise/core";
import type { FieldCipher } from "../lib/cipher";
import type { Db } from "../domain/deps";
import type { Messenger, SendResult, SmsSender } from "./messenger";

export const TEST_OUTBOX_RETENTION_DAYS = 7;

async function write(
  db: Db,
  cipher: FieldCipher,
  newId: () => string,
  m: { channel: "whatsapp" | "sms"; to: string; template?: TemplateName; text: string; buttons?: { text: string; payload: string }[] },
): Promise<SendResult> {
  const id = `test.${newId()}`;
  await db.query(
    "INSERT INTO test_outbox (id, channel, to_index, to_enc, template, text, buttons, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, m.channel, await cipher.index(m.to), await cipher.encrypt(m.to), m.template ?? null, m.text, JSON.stringify(m.buttons ?? []), new Date()],
  );
  return { ok: true, id };
}

export class OutboxMessenger implements Messenger {
  constructor(private db: Db, private cipher: FieldCipher, private newId: () => string) {}

  sendTemplate(to: string, name: TemplateName, params: string[], buttonPayloads?: string[]) {
    const buttons = (TEMPLATES[name].buttons ?? []).map((b, i) => ({ text: b.text, payload: buttonPayloads?.[i] ?? b.action }));
    return write(this.db, this.cipher, this.newId, { channel: "whatsapp", to, template: name, text: render(name, params), buttons });
  }

  sendText(to: string, text: string) {
    return write(this.db, this.cipher, this.newId, { channel: "whatsapp", to, text });
  }
}

export class OutboxSms implements SmsSender {
  constructor(private db: Db, private cipher: FieldCipher, private newId: () => string) {}

  send(to: string, text: string) {
    return write(this.db, this.cipher, this.newId, { channel: "sms", to, text });
  }
}
