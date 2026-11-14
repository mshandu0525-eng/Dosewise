/**
 * Dates are handled as "SA day numbers": whole days since 1970-01-01 in South African
 * Standard Time (UTC+2, no daylight saving), so specials roll over at local midnight.
 */
const DAY_MS = 86_400_000;
const SAST_OFFSET_MS = 2 * 3_600_000;

export function todaySA(now: number = Date.now()): number {
  return Math.floor((now + SAST_OFFSET_MS) / DAY_MS);
}

/** Minutes since local midnight (SAST) and weekday (0 = Sunday). */
export function clockSA(now: number = Date.now()): { minutes: number; weekday: number } {
  const local = new Date(now + SAST_OFFSET_MS);
  return { minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), weekday: local.getUTCDay() };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayToDate(day: number): Date {
  return new Date(day * DAY_MS);
}

/** "Sun 16 Nov" */
export function formatDay(day: number): string {
  const d = dayToDate(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "16 Nov" */
export function formatShortDay(day: number): string {
  const d = dayToDate(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function monthKey(day: number): string {
  const d = dayToDate(day);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthName(day: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][
    dayToDate(day).getUTCMonth()
  ];
}

/** "Ends today", "Ends tomorrow", "Ends Sun 16 Nov" */
export function endsLabel(endDay: number, today: number): string {
  const left = endDay - today;
  if (left <= 0) return 'Ends today';
  if (left === 1) return 'Ends tomorrow';
  return `Until ${formatDay(endDay)}`;
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
