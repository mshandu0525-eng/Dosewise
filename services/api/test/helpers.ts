import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { newDb } from "pg-mem";
import { LocalFieldCipher } from "../src/lib/cipher";
import { DEFAULT_CONFIG, type Db, type Deps } from "../src/domain/deps";
import type { Messenger, SendResult, SmsSender } from "../src/whatsapp/messenger";
import type { TemplateName } from "@dosewise/core";

export interface Sent {
  channel: "whatsapp" | "sms";
  to: string;
  template?: TemplateName;
  params?: string[];
  payloads?: string[];
  text?: string;
}

export function makeDeps(start = "2026-11-06T06:00:00Z") {
  const mem = newDb();
  mem.public.none(readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8"));
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;

  const sent: Sent[] = [];
  const notOnWhatsApp = new Set<string>();
  let n = 0;
  const whatsapp: Messenger = {
    async sendTemplate(to, template, params, payloads): Promise<SendResult> {
      if (notOnWhatsApp.has(to)) return { ok: false, errorCode: 131026, notOnWhatsApp: true };
      sent.push({ channel: "whatsapp", to, template, params, payloads });
      return { ok: true, id: `wamid.${++n}` };
    },
    async sendText(to, text) {
      if (notOnWhatsApp.has(to)) return { ok: false, errorCode: 131026, notOnWhatsApp: true };
      sent.push({ channel: "whatsapp", to, text });
      return { ok: true, id: `wamid.${++n}` };
    },
  };
  const sms: SmsSender = {
    async send(to, text) {
      sent.push({ channel: "sms", to, text });
      return { ok: true, id: `sms.${++n}` };
    },
  };
  let now = new Date(start);
  const deps: Deps = {
    db: pool,
    cipher: new LocalFieldCipher("test"),
    whatsapp,
    sms,
    now: () => now,
    newId: () => randomUUID(),
    config: { ...DEFAULT_CONFIG },
  };
  return {
    deps,
    sent,
    notOnWhatsApp,
    setNow: (iso: string) => (now = new Date(iso)),
    clear: () => sent.splice(0),
  };
}

export const PATIENT = "patient-1";
export const CAREGIVER_PHONE = "082 555 0101";
export const CAREGIVER_E164 = "+27825550101";
