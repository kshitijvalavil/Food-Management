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

const milk: ShelfLifeDays = {
  pantry_min_days: null,
  pantry_max_days: null,
  fridge_min_days: 5,
  fridge_max_days: 8,
  freezer_min_days: 90,
  freezer_max_days: 90,
  source: "foodkeeper",
};
const curatedMilk: ShelfLifeDays = { ...milk, source: "curated" };

describe("parseIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(parseIsoDate("1970-01-01")).toBe(0);
    expect(parseIsoDate("1970-01-02")).toBe(1);
    expect(parseIsoDate("2028-02-29")).not.toBeNull();
  });
  it("rejects impossible or malformed dates", () => {
    for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "26-11-18", "2026/11/18", "", "tomorrow"]) {
      expect(parseIsoDate(bad)).toBeNull();
    }
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });
});

describe("date helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("reads a Date by its local calendar fields", () => {
    expect(toIsoDate(new Date(2026, 10, 18, 23, 59))).toBe("2026-11-18");
    expect(toIsoDate(new Date(2026, 10, 18, 0, 1))).toBe("2026-11-18");
  });
  it("throws on an invalid addedOn", () => {
    expect(() => addDays("not-a-date", 1)).toThrow(RangeError);
    expect(() => toIsoDate(new Date("nope"))).toThrow(RangeError);
  });
});

describe("isPlausiblePrintedDate", () => {
  it("accepts dates in the window", () => {
    expect(isPlausiblePrintedDate("2026-11-25", ADDED)).toBe(true);
    expect(isPlausiblePrintedDate(ADDED, ADDED)).toBe(true);
    expect(isPlausiblePrintedDate("2026-10-19", ADDED)).toBe(true); // 30 days ago
    expect(isPlausiblePrintedDate("2026-09-01", ADDED)).toBe(true); // long expired, still real
    expect(isPlausiblePrintedDate("2021-11-18", ADDED)).toBe(true); // exactly 5 years ago
    expect(isPlausiblePrintedDate("2029-11-18", ADDED)).toBe(true); // exactly 3 years ahead
  });
  it("rejects dates outside the window", () => {
    expect(isPlausiblePrintedDate("2021-11-17", ADDED)).toBe(false); // 5 years + 1 day ago
    expect(isPlausiblePrintedDate("2029-11-19", ADDED)).toBe(false); // 3 years + 1 day
    expect(isPlausiblePrintedDate("2062-01-01", ADDED)).toBe(false);
  });
  it("rejects junk", () => {
    expect(isPlausiblePrintedDate("2026-02-30", ADDED)).toBe(false);
    expect(isPlausiblePrintedDate(null, ADDED)).toBe(false);
  });
});

describe("shelfLifeRange", () => {
  it("returns [min, max] for the location", () => {
    expect(shelfLifeRange(milk, "fridge")).toEqual([5, 8]);
    expect(shelfLifeRange(milk, "freezer")).toEqual([90, 90]);
  });
  it("returns null when the location has no days", () => {
    expect(shelfLifeRange(milk, "pantry")).toBeNull();
    expect(shelfLifeRange(null, "fridge")).toBeNull();
    expect(shelfLifeRange(undefined, "fridge")).toBeNull();
    expect(shelfLifeRange({}, "fridge")).toBeNull();
  });
  it("fills a missing bound from the other one", () => {
    expect(shelfLifeRange({ pantry_min_days: null, pantry_max_days: 30 }, "pantry")).toEqual([30, 30]);
    expect(shelfLifeRange({ pantry_min_days: 14, pantry_max_days: null }, "pantry")).toEqual([14, 14]);
  });
  it("orders swapped bounds and ignores negative or non-finite values", () => {
    expect(shelfLifeRange({ fridge_min_days: 10, fridge_max_days: 3 }, "fridge")).toEqual([3, 10]);
    expect(shelfLifeRange({ fridge_min_days: -1, fridge_max_days: Number.NaN }, "fridge")).toBeNull();
  });
});

describe("computeExpiry", () => {
  it("1. uses a plausible printed date first, and still reports the FoodKeeper range", () => {
    const r = computeExpiry({ location: "fridge", printed_date: "2026-11-22" }, milk, ADDED, 3);
    expect(r).toEqual({ expires_on: "2026-11-22", expiry_source: "printed", expiry_range_days: [5, 8] });
  });

  it("keeps a passed printed date (the item shows as gone) and marks it for review", () => {
    const r = computeExpiry({ location: "fridge", printed_date: "2026-11-10" }, null, ADDED);
    expect(r.expiry_source).toBe("printed");
    expect(r.review_reason).toBe("printed_date_in_past");
    expect(daysLeft(r.expires_on, ADDED)).toBe(-8);
    const longAgo = computeExpiry({ location: "fridge", printed_date: "2026-09-01" }, milk, ADDED);
    expect(longAgo).toMatchObject({ expiry_source: "printed", expires_on: "2026-09-01", review_reason: "printed_date_in_past" });
  });

  it("does not mark today's or a future printed date for review", () => {
    expect(computeExpiry({ location: "fridge", printed_date: ADDED }, null, ADDED).review_reason).toBeUndefined();
    expect(computeExpiry({ location: "fridge", printed_date: "2026-11-19" }, null, ADDED).review_reason).toBeUndefined();
  });

  it("2. ignores an implausible printed date and uses the FoodKeeper midpoint, rounded down", () => {
    const tooOld = computeExpiry({ location: "fridge", printed_date: "2020-01-01" }, milk, ADDED);
    expect(tooOld).toEqual({ expires_on: "2026-11-24", expiry_source: "foodkeeper", expiry_range_days: [5, 8] }); // floor(6.5) = 6
    const tooFar = computeExpiry({ location: "fridge", printed_date: "2099-01-01" }, milk, ADDED);
    expect(tooFar.expiry_source).toBe("foodkeeper");
  });

  it("uses the range for the chosen location, not the default one", () => {
    const r = computeExpiry({ location: "freezer", printed_date: null }, milk, ADDED);
    expect(r).toEqual({ expires_on: addDays(ADDED, 90), expiry_source: "foodkeeper", expiry_range_days: [90, 90] });
  });

  it("handles a 0-day range (eat today)", () => {
    const r = computeExpiry(
      { location: "pantry" },
      { pantry_min_days: 0, pantry_max_days: 0, source: "foodkeeper" },
      ADDED,
    );
    expect(r.expires_on).toBe(ADDED);
    expect(r.expiry_source).toBe("foodkeeper");
  });

  it("labels a date from a curated (non-USDA) row as ai_estimate, same date and range", () => {
    const r = computeExpiry({ location: "fridge", printed_date: null }, curatedMilk, ADDED);
    expect(r).toEqual({ expires_on: "2026-11-24", expiry_source: "ai_estimate", expiry_range_days: [5, 8] });
  });

  it("labels a row with no source as ai_estimate (only an explicit 'foodkeeper' counts)", () => {
    const { source: _omit, ...noSource } = milk;
    expect(computeExpiry({ location: "fridge" }, noSource, ADDED).expiry_source).toBe("ai_estimate");
    expect(computeExpiry({ location: "fridge" }, { ...milk, source: null }, ADDED).expiry_source).toBe("ai_estimate");
  });

  it("a curated row still beats the model's estimate (the row's range is used)", () => {
    const r = computeExpiry({ location: "fridge" }, curatedMilk, ADDED, 30);
    expect(r.expires_on).toBe("2026-11-24");
  });

  it("a printed date stays printed even with a curated row", () => {
    expect(computeExpiry({ location: "fridge", printed_date: "2026-11-21" }, curatedMilk, ADDED).expiry_source)
      .toBe("printed");
  });

  it("3. falls through to the AI estimate when the row has nothing for the location", () => {
    const r = computeExpiry({ location: "pantry", printed_date: null }, milk, ADDED, 12.9);
    expect(r).toEqual({ expires_on: "2026-11-30", expiry_source: "ai_estimate", expiry_range_days: null });
  });

  it("ignores negative, NaN or absurd AI estimates", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 99999]) {
      const r = computeExpiry({ location: "fridge" }, null, ADDED, bad);
      expect(r.expires_on).toBe(addDays(ADDED, FALLBACK_DAYS.fridge));
    }
  });

  it("4. uses the conservative fallback by location, labelled ai_estimate", () => {
    expect(computeExpiry({ location: "fridge" }, null, ADDED)).toEqual({
      expires_on: "2026-11-23",
      expiry_source: "ai_estimate",
      expiry_range_days: null,
    });
    expect(computeExpiry({ location: "freezer" }, null, ADDED).expires_on).toBe(addDays(ADDED, 90));
    expect(computeExpiry({ location: "pantry" }, undefined, ADDED, null).expires_on).toBe(addDays(ADDED, 180));
  });

  it("accepts a full DetectedItem and a Date for addedOn", () => {
    const item = {
      name: "Toned milk",
      quantity: 2,
      unit: "pack" as const,
      location: "fridge" as const,
      printed_date: null,
      confidence: 0.9,
      category_hint: "milk",
      barcode: null,
    };
    const r = computeExpiry(item, milk, new Date(2026, 10, 18, 21, 0));
    expect(r.expires_on).toBe("2026-11-24");
  });

  it("every result carries a source", () => {
    const sources = new Set(
      [
        computeExpiry({ location: "fridge", printed_date: "2026-11-20" }, null, ADDED),
        computeExpiry({ location: "fridge" }, milk, ADDED),
        computeExpiry({ location: "fridge" }, null, ADDED, 2),
        computeExpiry({ location: "fridge" }, null, ADDED),
      ].map((r) => r.expiry_source),
    );
    expect([...sources].sort()).toEqual(["ai_estimate", "foodkeeper", "printed"]);
  });
});

describe("isoDateInTimeZone", () => {
  it("gives the calendar date in the named zone", () => {
    expect(isoDateInTimeZone(new Date("2026-11-18T18:29:59Z"), "Asia/Kolkata")).toBe("2026-11-18");
    expect(isoDateInTimeZone(new Date("2026-11-18T18:30:00Z"), "Asia/Kolkata")).toBe("2026-11-19");
    expect(isoDateInTimeZone(new Date("2026-11-18T18:30:00Z"), "UTC")).toBe("2026-11-18");
    expect(isoDateInTimeZone(new Date("2026-01-01T03:00:00Z"), "America/Los_Angeles")).toBe("2025-12-31");
  });
  it("throws on an unknown zone or an invalid Date", () => {
    expect(() => isoDateInTimeZone(new Date(), "Mars/Olympus")).toThrow(RangeError);
    expect(() => isoDateInTimeZone(new Date("nope"), "UTC")).toThrow(RangeError);
  });
});

describe("daysLeft", () => {
  it("counts whole calendar days", () => {
    expect(daysLeft("2026-11-18", "2026-11-18")).toBe(0);
    expect(daysLeft("2026-11-21", "2026-11-18")).toBe(3);
    expect(daysLeft("2026-11-17", "2026-11-18")).toBe(-1);
    expect(daysLeft("2027-01-01", "2026-12-31")).toBe(1);
  });
  it("accepts a Date for today", () => {
    expect(daysLeft("2026-11-20", new Date(2026, 10, 18, 23, 30))).toBe(2);
  });
  it("is unaffected by DST changes (calendar arithmetic)", () => {
    expect(daysLeft("2026-03-30", "2026-03-28")).toBe(2);
    expect(daysLeft("2026-11-02", "2026-10-31")).toBe(2);
  });
});
