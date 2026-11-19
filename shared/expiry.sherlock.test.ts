// Sherlock Bugs: adversarial tests for the expiry engine.
// Run: npx -y vitest@2 run shared/expiry --root .
// Tests named "FINDING" pin CURRENT behaviour that the review reports as a bug.
//
// Timezone: the browser reads a Date with its local fields, so these run as a phone in India.
process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import {
  addDays,
  computeExpiry,
  daysLeft,
  FALLBACK_DAYS,
  isoDateInTimeZone,
  isPlausiblePrintedDate,
  parseIsoDate,
  shelfLifeRange,
  toIsoDate,
  type ShelfLifeDays,
} from "./expiry";

const ADDED = "2026-11-18";
const fridge = (printed_date: string | null = null) => ({ location: "fridge" as const, printed_date });

describe("sherlock: leap years", () => {
  it("knows which Feb 29s exist", () => {
    expect(parseIsoDate("2028-02-29")).not.toBeNull();
    expect(parseIsoDate("2000-02-29")).not.toBeNull();
    expect(parseIsoDate("2027-02-29")).toBeNull();
    expect(parseIsoDate("1900-02-29")).toBeNull();
    expect(parseIsoDate("2100-02-29")).toBeNull();
  });
  it("adds days across Feb 28/29", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2028-01-01", 366)).toBe("2029-01-01");
    expect(daysLeft("2028-03-01", "2028-02-28")).toBe(2);
  });
  it("3-year window from Feb 29 ends on Mar 1", () => {
    expect(isPlausiblePrintedDate("2031-03-01", "2028-02-29")).toBe(true);
    expect(isPlausiblePrintedDate("2031-03-02", "2028-02-29")).toBe(false);
  });
  it("rejects malformed dates", () => {
    for (const s of ["2026-1-01", "26-11-18", "2026/11/18", "2026-11-18T00:00:00Z", "0099-01-01", "2026-00-10", "2026-11-31", "", " ", "null"]) {
      expect(parseIsoDate(s), s).toBeNull();
    }
    expect(parseIsoDate(" 2026-11-18 ")).not.toBeNull(); // trimmed
  });
});

describe("sherlock: timezone boundaries around midnight IST", () => {
  it("a phone in India flips the day at 18:30 UTC", () => {
    expect(toIsoDate(new Date("2026-11-18T18:29:59Z"))).toBe("2026-11-18");
    expect(toIsoDate(new Date("2026-11-18T18:30:00Z"))).toBe("2026-11-19");
  });
  it("computeExpiry with a Date uses the phone's local calendar day", () => {
    const justAfterMidnightIst = new Date("2026-11-18T18:30:00Z");
    expect(computeExpiry(fridge(), null, justAfterMidnightIst).expires_on).toBe(addDays("2026-11-19", FALLBACK_DAYS.fridge));
    expect(daysLeft("2026-11-19", justAfterMidnightIst)).toBe(0);
  });
  it("FIXED: the server (APP_TIMEZONE date) and the phone (local Date) agree after midnight IST", () => {
    // Was: the server passed the UTC date ("2026-11-18") and disagreed with the phone for
    // 5.5 h each night. Now it passes isoDateInTimeZone(now, APP_TIMEZONE = Asia/Kolkata).
    const at = new Date("2026-11-18T20:00:00Z"); // 01:30 IST, 19 Nov
    const serverToday = isoDateInTimeZone(at, "Asia/Kolkata");
    expect(serverToday).toBe("2026-11-19");
    const server = computeExpiry(fridge(), null, serverToday).expires_on;
    const phone = computeExpiry(fridge(), null, at).expires_on;
    expect(server).toBe(phone);
    expect(daysLeft(server, at)).toBe(FALLBACK_DAYS.fridge);
  });
  it("rejects an invalid Date", () => {
    expect(() => toIsoDate(new Date("nope"))).toThrow(RangeError);
    expect(() => computeExpiry(fridge(), null, "2026-13-01")).toThrow(RangeError);
  });
});

describe("sherlock: printed date far in the past or future", () => {
  it("exactly 30 days past is still printed (shows as gone)", () => {
    const r = computeExpiry(fridge("2026-10-19"), null, ADDED);
    expect(r).toMatchObject({ expiry_source: "printed", expires_on: "2026-10-19" });
    expect(daysLeft(r.expires_on, ADDED)).toBe(-30);
  });
  it("FIXED: 31+ days past keeps the printed date (shows as gone) and is marked for review", () => {
    // Was: the printed date was discarded and the fallback said "good for 5 more days".
    const r = computeExpiry(fridge("2026-09-01"), null, ADDED);
    expect(r).toMatchObject({ expiry_source: "printed", expires_on: "2026-09-01", review_reason: "printed_date_in_past" });
    expect(daysLeft(r.expires_on, ADDED)).toBe(-78);
    // Truly implausible dates are still rejected: > 3 years ahead or > 5 years back.
    expect(computeExpiry(fridge("2021-11-17"), null, ADDED).expiry_source).toBe("ai_estimate");
  });
  it("exactly 3 years ahead is printed, one day more is not", () => {
    expect(computeExpiry(fridge("2029-11-18"), null, ADDED).expiry_source).toBe("printed");
    expect(computeExpiry(fridge("2029-11-19"), null, ADDED).expiry_source).toBe("ai_estimate");
    expect(computeExpiry(fridge("9999-12-31"), null, ADDED).expiry_source).toBe("ai_estimate");
    expect(computeExpiry(fridge("1970-01-01"), null, ADDED).expiry_source).toBe("ai_estimate");
  });
});

describe("sherlock: every null min/max combination", () => {
  const base: ShelfLifeDays = { source: "foodkeeper" };
  const cases: Array<[number | null, number | null, [number, number] | null]> = [
    [null, null, null],
    [4, null, [4, 4]],
    [null, 6, [6, 6]],
    [4, 6, [4, 6]],
    [9, 3, [3, 9]], // swapped
    [0, 0, [0, 0]],
    [-1, 5, [5, 5]], // negative ignored
    [-1, -1, null],
    [2.7, 5.2, [2, 5]], // floored
    [Number.NaN, 5, [5, 5]],
    [Number.POSITIVE_INFINITY, null, null],
  ];
  for (const [min, max, want] of cases) {
    it(`fridge min=${min} max=${max} -> ${JSON.stringify(want)}`, () => {
      const row = { ...base, fridge_min_days: min, fridge_max_days: max };
      expect(shelfLifeRange(row, "fridge")).toEqual(want);
      const r = computeExpiry(fridge(), row, ADDED, 2);
      if (want) {
        expect(r.expiry_source).toBe("foodkeeper");
        expect(r.expires_on).toBe(addDays(ADDED, Math.floor((want[0] + want[1]) / 2)));
      } else {
        expect(r).toMatchObject({ expiry_source: "ai_estimate", expires_on: addDays(ADDED, 2), expiry_range_days: null });
      }
    });
  }
  it("other locations' columns are never used", () => {
    const row: ShelfLifeDays = { source: "foodkeeper", pantry_min_days: 300, pantry_max_days: 400 };
    expect(computeExpiry(fridge(), row, ADDED).expires_on).toBe(addDays(ADDED, FALLBACK_DAYS.fridge));
  });
  it("source other than 'foodkeeper' is never labelled foodkeeper", () => {
    for (const source of ["curated", "FoodKeeper", "", null, undefined]) {
      const row: ShelfLifeDays = { source, fridge_min_days: 3, fridge_max_days: 5 };
      expect(computeExpiry(fridge(), row, ADDED).expiry_source).toBe("ai_estimate");
    }
  });
});

describe("sherlock: AI estimate bounds", () => {
  it.each([
    [0, 0],
    [1.9, 1],
    [3650, 3650],
  ])("estimate %s -> +%s days", (est, days) => {
    expect(computeExpiry(fridge(), null, ADDED, est)).toMatchObject({ expiry_source: "ai_estimate", expires_on: addDays(ADDED, days) });
  });
  it.each([-1, 3651, Number.NaN, Number.POSITIVE_INFINITY])("estimate %s -> fallback", (est) => {
    expect(computeExpiry(fridge(), null, ADDED, est).expires_on).toBe(addDays(ADDED, FALLBACK_DAYS.fridge));
  });
});
