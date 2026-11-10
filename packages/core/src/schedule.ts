/**
 * Scheduling and adherence rules, moved unchanged in behaviour from the web
 * prototype (apps/web/src/lib/meds.ts). Pure functions only: no storage, no
 * React, no platform APIs, so the mobile app, the web app and the backend
 * all compute the same dose statuses.
 */
import type { CheckResult, Verification } from "./verify";

export type DoseStatus = "taken" | "skipped" | "missed" | "due" | "upcoming";

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  form: string;
  instructions: string;
  /** Wall-clock times "HH:MM" in the device's current time zone. */
  times: string[];
  /** Days of week 0 (Sun) – 6 (Sat). Empty = every day. */
  days: number[];
  /** yyyy-mm-dd */
  startDate: string;
  createdAt: number;
  /** Critical medicines escalate to a full alarm if a reminder is ignored. */
  critical?: boolean;
}

export interface DoseLog {
  status: "taken" | "skipped";
  at: number;
  /** Photo check made before logging, if any. No check = undefined. */
  check?: { result: CheckResult; method?: Verification["method"] };
}

export interface Dose {
  key: string;
  med: Medication;
  date: string;
  time: string;
  status: DoseStatus;
}

export interface State {
  meds: Medication[];
  logs: Record<string, DoseLog>;
}

/** A dose with no log becomes "missed" this many minutes after its time. */
export const GRACE_MINUTES = 60;

export const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const doseKey = (medId: string, date: string, time: string) => `${medId}|${date}|${time}`;

export function parseDate(date: string) {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The local Date for a dose's date + "HH:MM" time. */
export function doseDateTime(date: string, time: string) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const at = parseDate(date);
  at.setHours(h, m, 0, 0);
  return at;
}

export function isScheduledOn(med: Medication, date: string) {
  if (date < med.startDate) return false;
  return med.days.length === 0 || med.days.includes(parseDate(date).getDay());
}

export function dosesForDate(state: State, date: string, now: Date = new Date()): Dose[] {
  const doses: Dose[] = [];
  for (const med of state.meds) {
    if (!isScheduledOn(med, date)) continue;
    for (const time of med.times) {
      const key = doseKey(med.id, date, time);
      const log = state.logs[key];
      let status: DoseStatus;
      if (log) status = log.status;
      else {
        const diff = (now.getTime() - doseDateTime(date, time).getTime()) / 60000;
        status = diff > GRACE_MINUTES ? "missed" : diff >= 0 ? "due" : "upcoming";
      }
      doses.push({ key, med, date, time, status });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

export interface MonthReport {
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
  /** Taken / (taken + skipped + missed), 0–100, or null when nothing was due. */
  adherence: number | null;
  days: { date: string; scheduled: number; taken: number }[];
  perMed: { med: Medication; taken: number; total: number; adherence: number | null }[];
}

const pct = (taken: number, total: number) => (total ? Math.round((taken / total) * 100) : null);

/** Aggregates past/closed doses for a month (year, month 0-11). Future and pending doses are excluded. */
export function monthReport(state: State, year: number, month: number, now: Date = new Date()): MonthReport {
  const r: MonthReport = { scheduled: 0, taken: 0, skipped: 0, missed: 0, adherence: null, days: [], perMed: [] };
  const per = new Map<string, { taken: number; total: number }>();
  const last = new Date(year, month + 1, 0).getDate();
  const today = dateKey(now);
  for (let d = 1; d <= last; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
    if (date > today) break;
    const day = { date, scheduled: 0, taken: 0 };
    for (const dose of dosesForDate(state, date, now)) {
      if (dose.status === "upcoming" || dose.status === "due") continue;
      day.scheduled++;
      r.scheduled++;
      r[dose.status]++;
      const p = per.get(dose.med.id) ?? { taken: 0, total: 0 };
      p.total++;
      if (dose.status === "taken") {
        day.taken++;
        p.taken++;
      }
      per.set(dose.med.id, p);
    }
    r.days.push(day);
  }
  r.adherence = pct(r.taken, r.scheduled);
  r.perMed = state.meds
    .filter((m) => per.has(m.id))
    .map((med) => {
      const p = per.get(med.id)!;
      return { med, ...p, adherence: pct(p.taken, p.total) };
    });
  return r;
}
