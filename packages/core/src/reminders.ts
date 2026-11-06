/**
 * Reminder planning: turns the schedule into the exact list of local
 * notifications the phone should hold. Pure and deterministic, so the
 * platform layer just cancels everything and schedules this list.
 *
 * - One notification per (date, time) covers every medicine due then.
 * - Escalation ladder: due → nudge (+10 min) → alarm (+30 min, critical medicines only).
 * - Logged doses drop out, so nothing fires once a dose is recorded.
 * - A rolling window with a hard cap keeps iOS under its 64 pending-notification limit.
 */
import { dateKey, doseDateTime, dosesForDate, parseDate, type State } from "./schedule";

export type ReminderStage = "due" | "nudge" | "alarm";

export const LADDER: { stage: ReminderStage; afterMinutes: number; criticalOnly: boolean }[] = [
  { stage: "due", afterMinutes: 0, criticalOnly: false },
  { stage: "nudge", afterMinutes: 10, criticalOnly: false },
  { stage: "alarm", afterMinutes: 30, criticalOnly: true },
];

export interface PlannedReminder {
  /** Stable id, so re-planning produces the same identifiers. */
  id: string;
  /** Epoch ms when it should fire. */
  at: number;
  stage: ReminderStage;
  date: string;
  time: string;
  doseKeys: string[];
  title: string;
  body: string;
}

export interface PlanOptions {
  /** How far ahead to schedule. */
  windowHours?: number;
  /** Hard cap on scheduled notifications (iOS keeps at most 64). */
  max?: number;
  /** Hide medicine names on the lock screen. */
  hideNames?: boolean;
}

export const DEFAULT_WINDOW_HOURS = 48;
export const DEFAULT_MAX_REMINDERS = 60;

function describe(names: string[], hideNames: boolean) {
  if (hideNames) return names.length === 1 ? "1 medicine" : `${names.length} medicines`;
  return names.join(", ");
}

export function planReminders(state: State, now: Date = new Date(), opts: PlanOptions = {}): PlannedReminder[] {
  const windowMs = (opts.windowHours ?? DEFAULT_WINDOW_HOURS) * 3_600_000;
  const max = opts.max ?? DEFAULT_MAX_REMINDERS;
  const hideNames = opts.hideNames ?? false;
  const end = now.getTime() + windowMs;
  // Escalations for a dose that started before now may still be ahead, so look back one day.
  const first = parseDate(dateKey(now));
  first.setDate(first.getDate() - 1);
  const days = Math.ceil(windowMs / 86_400_000) + 2;

  const out: PlannedReminder[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(first);
    day.setDate(first.getDate() + i);
    const date = dateKey(day);
    const groups = new Map<string, { keys: string[]; names: string[]; critical: boolean }>();
    for (const dose of dosesForDate(state, date, now)) {
      if (state.logs[dose.key]) continue;
      const g = groups.get(dose.time) ?? { keys: [], names: [], critical: false };
      g.keys.push(dose.key);
      g.names.push(`${dose.med.name} ${dose.med.dosage}`.trim());
      g.critical ||= !!dose.med.critical;
      groups.set(dose.time, g);
    }
    for (const [time, g] of groups) {
      const base = doseDateTime(date, time).getTime();
      const what = describe(g.names, hideNames);
      for (const step of LADDER) {
        if (step.criticalOnly && !g.critical) continue;
        const at = base + step.afterMinutes * 60_000;
        if (at <= now.getTime() || at > end) continue;
        const copy = {
          due: { title: `Time for your ${time} medicine`, body: what },
          nudge: { title: `Reminder: ${time} medicine not logged yet`, body: `${what}. Tap Taken once you have had it.` },
          alarm: { title: `Please take your ${time} medicine now`, body: what },
        }[step.stage];
        out.push({ id: `${step.stage}|${date}|${time}`, at, stage: step.stage, date, time, doseKeys: g.keys, ...copy });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}
