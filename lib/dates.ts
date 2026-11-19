// Calendar-date helpers. Expiry dates are plain yyyy-mm-dd in the household's local time.

const DAY = 86_400_000;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

function utc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from `from` to `to` (both yyyy-mm-dd or ISO timestamps; only the date part counts). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY);
}

export function addDays(iso: string, n: number): string {
  const t = new Date(utc(iso) + n * DAY);
  return t.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parts(iso: string) {
  const t = new Date(utc(iso));
  return { d: t.getUTCDate(), m: t.getUTCMonth(), w: t.getUTCDay() };
}

/** "20 Nov" */
export function shortDate(iso: string): string {
  const { d, m } = parts(iso);
  return `${d} ${MONTHS[m]}`;
}

/** "Sat 15 Nov" */
export function dayDate(iso: string): string {
  const { d, m, w } = parts(iso);
  return `${WEEKDAYS[w]} ${d} ${MONTHS[m]}`;
}

export function monthName(iso: string): string {
  return MONTHS_LONG[parts(iso).m] ?? "";
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
