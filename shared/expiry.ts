// ShelfLife expiry engine. Pure TypeScript with no imports, so the same file runs in
// Deno (edge functions), Node (vitest) and the browser (review-sheet previews).
//
// Order of precedence:
//   1. printed_date read off the pack, if plausible (a real date, not more than 3 years
//      after addedOn and not more than 5 years before it). A printed date already in the
//      past is KEPT, so the item shows as "gone", and the result carries
//      review_reason "printed_date_in_past" so the review sheet asks the user to check it.
//   2. shelf_life range for the item's location (midpoint, rounded down). Labelled
//      foodkeeper only when the row's source is 'foodkeeper'; curated rows are labelled
//      ai_estimate ("Estimate"), so non-USDA data is never shown as USDA.
//   3. an AI estimate in days, if one was passed in
//   4. a conservative fallback by location, labelled ai_estimate
//
// Dates are calendar dates ("yyyy-mm-dd"). A Date object is read with its local calendar
// fields (the phone's local date in the browser). The server passes a string from
// isoDateInTimeZone(now, APP_TIMEZONE) instead, so both agree on "today".

export type ExpiryLocation = "fridge" | "freezer" | "pantry";
export type ExpirySourceValue = "printed" | "foodkeeper" | "ai_estimate";

/** The parts of a DetectedItem the engine needs. A full DetectedItem fits. */
export interface ExpiryItem {
  location: ExpiryLocation;
  printed_date?: string | null;
}

/** The day columns of a `shelf_life` row. A full row fits. */
export interface ShelfLifeDays {
  pantry_min_days?: number | null;
  pantry_max_days?: number | null;
  fridge_min_days?: number | null;
  fridge_max_days?: number | null;
  freezer_min_days?: number | null;
  freezer_max_days?: number | null;
  /** `shelf_life.source`. Only 'foodkeeper' yields expiry_source 'foodkeeper'. */
  source?: string | null;
}

export interface ExpiryResult {
  expires_on: string;
  expiry_source: ExpirySourceValue;
  /** shelf_life [min, max] days for the item's location, when the row has them. */
  expiry_range_days: [number, number] | null;
  /** Set when the user should check the date: the printed date is already past. */
  review_reason?: "printed_date_in_past";
}

/** Used when nothing better is known. Deliberately on the short side. */
export const FALLBACK_DAYS: Readonly<Record<ExpiryLocation, number>> = Object.freeze({
  fridge: 5,
  freezer: 90,
  pantry: 180,
});

export const PRINTED_MAX_YEARS_AHEAD = 3;
/** Older printed dates are treated as misreads (e.g. a manufacture year or a typo). */
export const PRINTED_MAX_YEARS_PAST = 5;
/** AI estimates above this are ignored (10 years). */
export const AI_ESTIMATE_MAX_DAYS = 3650;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a real calendar date, or null if the string is not one. */
export function parseIsoDate(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null; // e.g. 2026-02-30
  }
  return Math.round(ms / MS_PER_DAY);
}

function toDayNumber(value: string | Date): number {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date");
    return Math.round(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / MS_PER_DAY);
  }
  const n = parseIsoDate(value);
  if (n === null) throw new RangeError(`Invalid ISO date: ${value}`);
  return n;
}

function fromDayNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

function addYears(dayNumber: number, years: number): number {
  const d = new Date(dayNumber * MS_PER_DAY);
  return Math.round(
    Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY,
  );
}

/** "yyyy-mm-dd" for a Date (local calendar fields) or a valid ISO date string. */
export function toIsoDate(value: string | Date): string {
  return fromDayNumber(toDayNumber(value));
}

/** addedOn plus a whole number of days, as "yyyy-mm-dd". */
export function addDays(value: string | Date, days: number): string {
  return fromDayNumber(toDayNumber(value) + Math.trunc(days));
}

/** True when a printed date is a real date within the plausible window around addedOn. */
export function isPlausiblePrintedDate(printed: string | null | undefined, addedOn: string | Date): boolean {
  const p = parseIsoDate(printed);
  if (p === null) return false;
  const added = toDayNumber(addedOn);
  if (p < addYears(added, -PRINTED_MAX_YEARS_PAST)) return false;
  if (p > addYears(added, PRINTED_MAX_YEARS_AHEAD)) return false;
  return true;
}

/**
 * Calendar date ("yyyy-mm-dd") of an instant in an IANA time zone, e.g. "Asia/Kolkata".
 * Uses Intl, which Deno, Node and every phone browser have. Throws RangeError for an
 * unknown zone.
 */
export function isoDateInTimeZone(instant: Date, timeZone: string): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}

function cleanDays(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/**
 * shelf_life [min, max] for a location, or null if the row has no days there
 * (a null pair means "not recommended in this location").
 */
export function shelfLifeRange(
  row: ShelfLifeDays | null | undefined,
  location: ExpiryLocation,
): [number, number] | null {
  if (!row) return null;
  let min = cleanDays(row[`${location}_min_days`]);
  let max = cleanDays(row[`${location}_max_days`]);
  if (min === null && max === null) return null;
  if (min === null) min = max;
  if (max === null) max = min;
  const lo = Math.min(min as number, max as number);
  const hi = Math.max(min as number, max as number);
  return [lo, hi];
}

export function computeExpiry(
  item: ExpiryItem,
  shelfLife: ShelfLifeDays | null | undefined,
  addedOn: string | Date,
  aiEstimateDays?: number | null,
): ExpiryResult {
  const range = shelfLifeRange(shelfLife, item.location);

  if (item.printed_date && isPlausiblePrintedDate(item.printed_date, addedOn)) {
    const printed = parseIsoDate(item.printed_date) as number;
    const result: ExpiryResult = {
      expires_on: fromDayNumber(printed),
      expiry_source: "printed",
      expiry_range_days: range,
    };
    // Already out of date: keep the date (the item shows as "gone") and ask for a check.
    if (printed < toDayNumber(addedOn)) result.review_reason = "printed_date_in_past";
    return result;
  }

  if (range) {
    const mid = Math.floor((range[0] + range[1]) / 2);
    return {
      expires_on: addDays(addedOn, mid),
      expiry_source: shelfLife?.source === "foodkeeper" ? "foodkeeper" : "ai_estimate",
      expiry_range_days: range,
    };
  }

  if (
    typeof aiEstimateDays === "number" &&
    Number.isFinite(aiEstimateDays) &&
    aiEstimateDays >= 0 &&
    aiEstimateDays <= AI_ESTIMATE_MAX_DAYS
  ) {
    return {
      expires_on: addDays(addedOn, Math.floor(aiEstimateDays)),
      expiry_source: "ai_estimate",
      expiry_range_days: null,
    };
  }

  return {
    expires_on: addDays(addedOn, FALLBACK_DAYS[item.location] ?? FALLBACK_DAYS.fridge),
    expiry_source: "ai_estimate",
    expiry_range_days: null,
  };
}

/** Whole days from today until expires_on. 0 = expires today, negative = already past. */
export function daysLeft(expiresOn: string, today: string | Date): number {
  return toDayNumber(expiresOn) - toDayNumber(today);
}
