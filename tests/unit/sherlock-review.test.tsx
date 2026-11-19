// Sherlock Bugs: Review screen edge cases (unit level). E2E versions live in e2e/sherlock-review.spec.ts.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewScreen } from "@/components/ReviewScreen";
import { draft } from "@/lib/draft";
import { EnrichedItem } from "@/shared/schema";
import type { EnrichedItem as EnrichedItemT } from "@/shared/schema";

const TODAY = "2026-11-15";
const XSS = `<img src=x onerror="alert(1)">`;

function item(patch: Partial<EnrichedItemT> = {}): EnrichedItemT {
  return {
    name: "Paneer",
    quantity: 1,
    unit: "count",
    location: "fridge",
    printed_date: null,
    confidence: 0.95,
    category_hint: null,
    barcode: null,
    shelf_life_id: null,
    expires_on: "2026-11-20",
    expiry_source: "ai_estimate",
    expiry_range_days: null,
    kcal_per_unit: null,
    kcal_per_100g: null,
    ...patch,
  };
}

beforeEach(() => draft.reset());

describe("Review edge cases", () => {
  it("removing every row shows the empty state and disables Save", async () => {
    draft.add([item({ name: "A" }), item({ name: "B" })], "search");
    render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    while (screen.queryAllByTestId("review-row-toggle").length) {
      await userEvent.click(screen.getAllByTestId("review-row-toggle")[0]!);
      await userEvent.click(screen.getByTestId("review-remove"));
    }
    expect(screen.getByTestId("review-title")).toHaveTextContent("Review 0 items");
    expect(screen.getByText("Nothing to review")).toBeInTheDocument();
    expect(screen.getByTestId("review-save")).toBeDisabled();
  });

  it("an XSS-looking name is rendered as text, not HTML", () => {
    draft.add([item({ name: XSS }), item({ name: XSS, confidence: 0.4 })], "voice");
    const { container } = render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getAllByText(XSS, { exact: false }).length).toBeGreaterThan(0);
  });

  it("the stepper never goes to 0 or below", async () => {
    draft.add([item({ quantity: 1 })], "search");
    render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    await userEvent.click(screen.getByTestId("review-row-toggle"));
    expect(screen.getByTestId("review-qty-minus")).toBeDisabled();
    fireEvent.click(screen.getByTestId("review-qty-minus"));
    expect(draft.get().items[0]!.quantity).toBe(1);
  });

  it("caps quantity at 1000 (schema max)", async () => {
    draft.add([item({ quantity: 1000 })], "search");
    render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    await userEvent.click(screen.getByTestId("review-row-toggle"));
    await userEvent.click(screen.getByTestId("review-qty-plus"));
    expect(draft.get().items[0]!.quantity).toBe(1000);
  });

  it("clearing the date keeps the old date", async () => {
    draft.add([item()], "search");
    render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    await userEvent.click(screen.getByTestId("review-row-toggle"));
    fireEvent.change(screen.getByTestId("review-date-input"), { target: { value: "" } });
    expect(draft.get().items[0]!.expires_on).toBe("2026-11-20");
  });

  // FINDING (low): min={today} is only a hint. A typed past date is accepted into the draft and saved
  // as an already-expired item, and its expiry_source stays ai_estimate/foodkeeper (not "printed").
  it("documents that a past date typed by hand is accepted", async () => {
    draft.add([item({ expiry_source: "foodkeeper" })], "search");
    render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    await userEvent.click(screen.getByTestId("review-row-toggle"));
    fireEvent.change(screen.getByTestId("review-date-input"), { target: { value: "2020-01-01" } });
    const it0 = draft.get().items[0]!;
    expect(it0.expires_on).toBe("2020-01-01");
    expect(it0.expiry_source).toBe("foodkeeper");
  });

  it("a check-me item blocks Save until Yes, and Change -> Done also unblocks", async () => {
    draft.add([item({ name: "Coriander", confidence: 0.5 }), item({ name: "Mint", confidence: 0.3 })], "photo");
    const onSave = vi.fn();
    render(<ReviewScreen onSave={onSave} today={TODAY} />);
    expect(screen.getByTestId("review-save")).toBeDisabled();
    expect(screen.getByTestId("review-blocked")).toHaveTextContent("Check 2 items first.");
    await userEvent.click(screen.getAllByTestId("check-me-yes")[0]!);
    expect(screen.getByTestId("review-save")).toBeDisabled();
    await userEvent.click(screen.getByTestId("check-me-change"));
    await userEvent.clear(screen.getByTestId("review-name-input"));
    await userEvent.type(screen.getByTestId("review-name-input"), "Spinach");
    await userEvent.click(screen.getByTestId("check-me-done"));
    expect(screen.getByTestId("review-save")).toBeEnabled();
    await userEvent.click(screen.getByTestId("review-save"));
    expect(onSave.mock.calls[0]![0].map((i: EnrichedItemT) => i.name).sort()).toEqual(["Coriander", "Spinach"]);
  });

  it("a check-me item renamed to an empty name can be confirmed, and the schema then rejects it on save", async () => {
    draft.add([item({ name: "Coriander", confidence: 0.5 })], "photo");
    const onSave = vi.fn();
    render(<ReviewScreen onSave={onSave} today={TODAY} />);
    await userEvent.click(screen.getByTestId("check-me-change"));
    await userEvent.clear(screen.getByTestId("review-name-input"));
    await userEvent.click(screen.getByTestId("check-me-done"));
    // ReviewScreen lets it through; app/capture/review/page.tsx re-validates with zod.
    await userEvent.click(screen.getByTestId("review-save"));
    const saved = onSave.mock.calls[0]![0] as EnrichedItemT[];
    expect(EnrichedItem.array().safeParse(saved.map((s) => ({ ...s, name: s.name.trim() }))).success).toBe(false);
  });

  it("the name field enforces 80 characters", async () => {
    draft.add([item({ name: "Coriander", confidence: 0.5 })], "photo");
    render(<ReviewScreen onSave={vi.fn()} today={TODAY} />);
    await userEvent.click(screen.getByTestId("check-me-change"));
    expect(screen.getByTestId("review-name-input")).toHaveAttribute("maxLength", "80");
  });
});

describe("schema guards used before saving", () => {
  it("rejects quantity 0, negative, NaN and Infinity", () => {
    for (const q of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1001]) {
      expect(EnrichedItem.safeParse(item({ quantity: q })).success, String(q)).toBe(false);
    }
  });
  it("rejects a bad date and a whitespace-only name after trim", () => {
    expect(EnrichedItem.safeParse(item({ expires_on: "2026-02-30" })).success).toBe(false);
    expect(EnrichedItem.safeParse(item({ expires_on: "" })).success).toBe(false);
    expect(EnrichedItem.safeParse(item({ name: "   ".trim() })).success).toBe(false);
  });
});
