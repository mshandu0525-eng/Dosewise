/**
 * Sending messages: WhatsApp Cloud API (Meta) first, SMS (Amazon SNS) as the fallback
 * for numbers that are not on WhatsApp. Behind small interfaces so the domain logic
 * can be tested without either service.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PublishCommand, type SNSClient } from "@aws-sdk/client-sns";
import { TEMPLATES, type TemplateName } from "@dosewise/core";

export interface SendResult {
  ok: boolean;
  id?: string;
  errorCode?: number;
  /** The number has no WhatsApp account: fall back to SMS. */
  notOnWhatsApp?: boolean;
}

export interface Messenger {
  sendTemplate(to: string, name: TemplateName, params: string[], buttonPayloads?: string[]): Promise<SendResult>;
  /** Free text: only allowed inside the 24-hour window after the person messaged us. */
  sendText(to: string, text: string): Promise<SendResult>;
}

export interface SmsSender {
  send(to: string, text: string): Promise<SendResult>;
}

/** Meta error codes meaning "this person can't be reached on WhatsApp". */
const NOT_ON_WHATSAPP = new Set([131026, 131030]);

export class WhatsAppCloudMessenger implements Messenger {
  constructor(
    private opts: { phoneNumberId: string; token: () => Promise<string>; graphVersion?: string; fetchImpl?: typeof fetch },
  ) {}

  private async post(body: unknown): Promise<SendResult> {
    const url = `https://graph.facebook.com/${this.opts.graphVersion ?? "v23.0"}/${this.opts.phoneNumberId}/messages`;
    const res = await (this.opts.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.opts.token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number } };
    if (res.ok && json.messages?.[0]?.id) return { ok: true, id: json.messages[0].id };
    const code = json.error?.code;
    return { ok: false, errorCode: code, notOnWhatsApp: code !== undefined && NOT_ON_WHATSAPP.has(code) };
  }

  sendTemplate(to: string, name: TemplateName, params: string[], buttonPayloads?: string[]) {
    const t = TEMPLATES[name];
    const components: unknown[] = [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }];
    (buttonPayloads ?? []).forEach((payload, index) => {
      if (t.buttons?.[index]) components.push({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }] });
    });
    return this.post({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name, language: { code: t.language }, components } });
  }

  sendText(to: string, text: string) {
    return this.post({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text, preview_url: false } });
  }
}

export class SnsSmsSender implements SmsSender {
  constructor(private sns: SNSClient, private senderId?: string) {}
  async send(to: string, text: string): Promise<SendResult> {
    try {
      const r = await this.sns.send(
        new PublishCommand({
          PhoneNumber: to,
          Message: text,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
            ...(this.senderId ? { "AWS.SNS.SMS.SenderID": { DataType: "String", StringValue: this.senderId } } : {}),
          },
        }),
      );
      return { ok: true, id: r.MessageId };
    } catch {
      return { ok: false };
    }
  }
}

/** Meta signs every webhook call with the app secret (X-Hub-Signature-256). */
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"), "hex");
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/* ---------------- webhook payloads ---------------- */

export interface InboundReply {
  from: string;
  payload?: string;
  text?: string;
}

export interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode?: number;
}

/** Pulls replies and delivery statuses out of a WhatsApp webhook body. */
export function parseWebhook(body: unknown): { replies: InboundReply[]; statuses: StatusUpdate[] } {
  const replies: InboundReply[] = [];
  const statuses: StatusUpdate[] = [];
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const m of (value.messages as Record<string, any>[] | undefined) ?? []) {
        const from = `+${String(m.from ?? "").replace(/^\+/, "")}`;
        if (m.type === "button") replies.push({ from, payload: m.button?.payload, text: m.button?.text });
        else if (m.type === "interactive") replies.push({ from, payload: m.interactive?.button_reply?.id, text: m.interactive?.button_reply?.title });
        else if (m.type === "text") replies.push({ from, text: m.text?.body });
      }
      for (const s of (value.statuses as Record<string, any>[] | undefined) ?? []) {
        statuses.push({ id: s.id, status: s.status, errorCode: s.errors?.[0]?.code });
      }
    }
  }
  return { replies, statuses };
}
