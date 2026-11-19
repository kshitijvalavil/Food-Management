import { freshness } from "@/shared/schema";
import { daysBetween } from "./dates";

export { freshness };
export type Freshness = ReturnType<typeof freshness>;

const CLASS: Record<Freshness, string> = { fresh: "s-f", soon: "s-s", today: "s-t", gone: "s-g" };
const LABEL: Record<Freshness, string> = { fresh: "Fresh", soon: "Use soon", today: "Today", gone: "Gone" };

export function freshClass(daysLeft: number): string {
  return CLASS[freshness(daysLeft)];
}

export function freshLabel(daysLeft: number): string {
  return LABEL[freshness(daysLeft)];
}

/**
 * Share of shelf life left, 0..100, for the ring. Past-date items show a full ring in the
 * "gone" colour (as in the mockups); otherwise days left over the item's whole shelf life.
 */
export function ringPercent(daysLeft: number, totalDays: number): number {
  if (daysLeft < 0) return 100;
  if (totalDays <= 0) return daysLeft > 0 ? 100 : 8;
  const p = Math.round((daysLeft / totalDays) * 100);
  return Math.max(8, Math.min(100, p));
}

/** Days left for an item, from today (yyyy-mm-dd). */
export function daysLeftFor(expiresOn: string, today: string): number {
  return daysBetween(today, expiresOn);
}

export function totalDaysFor(addedAt: string, expiresOn: string): number {
  return daysBetween(addedAt, expiresOn);
}

/** Big number for the day count. Uses a real minus sign. */
export function dayNumber(daysLeft: number): string {
  return daysLeft < 0 ? `−${Math.abs(daysLeft)}` : String(daysLeft);
}

export function dayUnit(daysLeft: number): string {
  return Math.abs(daysLeft) === 1 ? "day" : "days";
}

/** What VoiceOver/TalkBack says for a day count. */
export function daySpoken(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return `${n} ${n === 1 ? "day" : "days"} past its date`;
  }
  if (daysLeft === 0) return "use today";
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
}
