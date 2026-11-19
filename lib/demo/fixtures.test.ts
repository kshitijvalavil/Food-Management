import { describe, expect, it } from "vitest";
import { AnalyzePhotoResponse, LookupBarcodeResponse, ParseTextResponse } from "@/shared/schema";
import { DEMO_FOODS, demoBarcode, demoParseText, demoPhotoShelf, searchDemoFoods } from "./fixtures";

describe("demo fixtures match the shared contract", () => {
  it("photo shelf: 7 items, one under 0.7", () => {
    const items = demoPhotoShelf("2026-11-15");
    expect(() => AnalyzePhotoResponse.parse({ items, flagged: 1 })).not.toThrow();
    expect(items).toHaveLength(7);
    expect(items.filter((i) => i.confidence < 0.7).map((i) => i.name)).toEqual(["Coriander"]);
  });

  it("Amul butter barcode", () => {
    const hit = demoBarcode("8901262010023", "2026-11-15");
    expect(hit?.product_name).toBe("Amul Butter, pasteurised");
    expect(() => LookupBarcodeResponse.parse({ found: true, ...hit })).not.toThrow();
    expect(hit?.item.expiry_source).toBe("printed");
    expect(demoBarcode("0000000000000")).toBeNull();
  });

  it("30 searchable foods", () => {
    expect(DEMO_FOODS).toHaveLength(30);
    expect(new Set(DEMO_FOODS.map((f) => f.shelf_life_id)).size).toBe(30);
    expect(searchDemoFoods("pan")[0]?.name).toBe("Paneer");
    expect(searchDemoFoods("dahi")[0]?.name).toBe("Curd");
  });

  it("parses the mockup voice note", () => {
    const items = demoParseText("Got a dozen eggs, half a kilo of paneer, five kilos of basmati and two Parle-G. Put the paneer in the freezer", "2026-11-15");
    expect(() => ParseTextResponse.parse({ items })).not.toThrow();
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(by.Eggs).toMatchObject({ quantity: 12, unit: "count", location: "fridge" });
    expect(by.Paneer).toMatchObject({ quantity: 500, unit: "g", location: "freezer" });
    expect(by["Basmati rice"]).toMatchObject({ quantity: 5, unit: "kg", location: "pantry" });
    expect(by["Parle-G"]).toMatchObject({ quantity: 2, location: "pantry" });
  });
});
