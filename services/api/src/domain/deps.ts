import type { FieldCipher } from "../lib/cipher";
import type { Messenger, SmsSender } from "../whatsapp/messenger";

/** Minimal database interface: satisfied by a pg Pool (production) and pg-mem (tests). */
export interface Db {
  query<R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface Config {
  /** Minutes after a dose is due before family is alerted. Matches the app's GRACE_MINUTES. */
  graceMinutes: number;
  /** Alerts per caregiver per day before further misses go into the daily summary. */
  alertCapPerDay: number;
  /** Patient-local hour the daily summary is sent. */
  summaryHour: number;
  /** Don't alert for slots older than this (e.g. after an outage), to avoid stale alarms. */
  maxAlertLagMinutes: number;
  /** Version of the caregiver-sharing notice shown in the app; recorded with each consent. */
  noticeVersion: string;
  maxCaregivers: number;
  /** Staging only: messages go to the test outbox instead of WhatsApp/SMS, and /v1/test routes work. */
  testMessaging: boolean;
}

export const DEFAULT_CONFIG: Config = {
  graceMinutes: 60,
  alertCapPerDay: 5,
  summaryHour: 20,
  maxAlertLagMinutes: 360,
  noticeVersion: "2026-11-caregiver-v1",
  maxCaregivers: 5,
  testMessaging: false,
};

export interface Deps {
  db: Db;
  cipher: FieldCipher;
  whatsapp: Messenger;
  sms: SmsSender;
  now: () => Date;
  newId: () => string;
  config: Config;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
