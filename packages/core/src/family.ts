/**
 * What the phone uploads for family updates: one entry per dose time with its
 * status, for 24 hours back and 48 hours ahead. No schedules, history or photos.
 * Medicine names only if the patient opted in.
 */
import { dateKey, dosesForDate, parseDate, type State } from "./schedule";

const BACK_MS = 24 * 3_600_000;
const AHEAD_MS = 48 * 3_600_000;

export interface Slot {
  key: string;
  dueAt: number;
  status: "open" | "taken" | "skipped";
  critical: boolean;
  medicines?: string[];
}

/** One slot per dose time; a time is "taken" only when every medicine due then is. */
export function buildSlots(state: State, now: Date, withNames: boolean): { from: number; to: number; slots: Slot[] } {
  const from = now.getTime() - BACK_MS;
  const to = now.getTime() + AHEAD_MS;
  const slots: Slot[] = [];
  const first = parseDate(dateKey(new Date(from)));
  for (let d = new Date(first); d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    const date = dateKey(d);
    const groups = new Map<string, ReturnType<typeof dosesForDate>>();
    for (const dose of dosesForDate(state, date, now)) groups.set(dose.time, [...(groups.get(dose.time) ?? []), dose]);
    for (const [time, doses] of groups) {
      const [h = 0, m = 0] = time.split(":").map(Number);
      const due = parseDate(date);
      due.setHours(h, m, 0, 0);
      if (due.getTime() < from || due.getTime() > to) continue;
      const logged = doses.map((x) => state.logs[x.key]?.status);
      const status = logged.some((s) => !s) ? "open" : logged.some((s) => s === "taken") ? "taken" : "skipped";
      slots.push({
        key: `${date}T${time}`,
        dueAt: due.getTime(),
        status,
        critical: doses.some((x) => !!x.med.critical),
        ...(withNames ? { medicines: doses.map((x) => `${x.med.name} ${x.med.dosage}`.trim()) } : {}),
      });
    }
  }
  return { from, to, slots };
}
