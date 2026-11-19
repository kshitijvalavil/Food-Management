import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewScreen } from "./ReviewScreen";
import { draft } from "@/lib/draft";
import { demoPhotoShelf } from "@/lib/demo/fixtures";

const TODAY = "2026-11-15";

function loadShelf() {
  draft.reset();
  draft.add(demoPhotoShelf(TODAY), "photo", "From your fridge photo, Sat 15 Nov");
}

function row(name: string) {
  const r = screen.getAllByTestId("review-row").find((el) => el.dataset.name === name);
  if (!r) throw new Error(`no row ${name}`);
  return r;
}

describe("<ReviewScreen>", () => {
  beforeEach(loadShelf);

  it("lists all items, puts the unsure one on top and blocks saving until it is checked", async () => {
    const onSave = vi.fn();
    render(<ReviewScreen onSave={onSave} today={TODAY} />);
    expect(screen.getByTestId("review-title")).toHaveTextContent("Review 7 items");
    expect(screen.getByText("From your fridge photo, Sat 15 Nov")).toBeInTheDocument();
    expect(screen.getAllByTestId("review-row")).toHaveLength(6);

    const check = screen.getByTestId("check-me");
    expect(check).toHaveTextContent("Coriander?");
    expect(check).toHaveTextContent("61% sure.");

    const save = screen.getByTestId("review-save");
    expect(save).toHaveTextContent("Save 7 to Kitchen");
    expect(save).toBeDisabled();
    expect(screen.getByTestId("review-blocked")).toHaveTextContent("Check 1 item first.");

    await userEvent.click(screen.getByTestId("check-me-yes"));
    await waitFor(() => expect(screen.queryByTestId("check-me")).not.toBeInTheDocument());
    expect(screen.getAllByTestId("review-row")).toHaveLength(7);
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toHaveLength(7);
  });

  it("shows location, date and the date-source stamp on each row", () => {
    render(<ReviewScreen onSave={() => {}} today={TODAY} />);
    const milk = row("Toned milk");
    expect(within(milk).getByTestId("review-row-loc")).toHaveTextContent("Fridge");
    expect(within(milk).getByTestId("review-row-date")).toHaveTextContent("20 Nov");
    expect(within(milk).getByTestId("date-source")).toHaveAttribute("data-source", "printed");
    expect(within(milk).getByTestId("day-count")).toHaveAttribute("data-days", "5");
    expect(within(row("Palak")).getByTestId("review-row-date")).toHaveTextContent("~19 Nov");
    expect(within(row("Tomatoes")).getByTestId("date-source")).toHaveTextContent("Estimate");
  });

  it("edits quantity inline", async () => {
    render(<ReviewScreen onSave={() => {}} today={TODAY} />);
    await userEvent.click(within(row("Toned milk")).getByTestId("review-row-toggle"));
    const editor = within(row("Toned milk")).getByTestId("review-editor");
    expect(within(editor).getByTestId("review-qty")).toHaveTextContent("2 packs");
    await userEvent.click(within(editor).getByTestId("review-qty-plus"));
    expect(within(editor).getByTestId("review-qty")).toHaveTextContent("3 packs");
    expect(row("Toned milk")).toHaveTextContent("Toned milk ×3");
    await userEvent.click(within(editor).getByTestId("review-qty-minus"));
    await userEvent.click(within(editor).getByTestId("review-qty-minus"));
    expect(within(editor).getByTestId("review-qty")).toHaveTextContent("1 pack");
    expect(within(editor).getByTestId("review-qty-minus")).toBeDisabled();
  });

  it("moving a FoodKeeper item re-dates it; a printed date stays", async () => {
    render(<ReviewScreen onSave={() => {}} today={TODAY} />);
    await userEvent.click(within(row("Paneer")).getByTestId("review-row-toggle"));
    await userEvent.click(within(row("Paneer")).getByTestId("review-loc-freezer"));
    await waitFor(() => expect(within(row("Paneer")).getByTestId("review-row-loc")).toHaveTextContent("Freezer"));
    // freezer range 90-180 days -> middle is 135 days after 15 Nov = 30 Mar
    expect(within(row("Paneer")).getByTestId("review-row-date")).toHaveTextContent("~30 Mar");
    expect(within(row("Paneer")).getByTestId("review-loc-freezer")).toHaveAttribute("aria-checked", "true");

    await userEvent.click(within(row("Toned milk")).getByTestId("review-row-toggle"));
    await userEvent.click(within(row("Toned milk")).getByTestId("review-loc-freezer"));
    expect(within(row("Toned milk")).getByTestId("review-row-loc")).toHaveTextContent("Freezer");
    expect(within(row("Toned milk")).getByTestId("review-row-date")).toHaveTextContent("20 Nov");
  });

  it("edits the date by hand", async () => {
    render(<ReviewScreen onSave={() => {}} today={TODAY} />);
    await userEvent.click(within(row("Curd")).getByTestId("review-row-toggle"));
    const input = within(row("Curd")).getByTestId("review-date-input");
    fireEvent.change(input, { target: { value: "2026-11-18" } });
    expect(within(row("Curd")).getByTestId("day-count")).toHaveAttribute("data-days", "3");
  });

  it("removes an item and updates the count", async () => {
    render(<ReviewScreen onSave={() => {}} today={TODAY} />);
    await userEvent.click(within(row("Tomatoes")).getByTestId("review-row-toggle"));
    await userEvent.click(within(row("Tomatoes")).getByTestId("review-remove"));
    expect(screen.getByTestId("review-title")).toHaveTextContent("Review 6 items");
    expect(screen.getByTestId("review-save")).toHaveTextContent("Save 6 to Kitchen");
    expect(draft.get().items.map((i) => i.name)).not.toContain("Tomatoes");
  });

  it("Change lets you rename an unsure item before confirming", async () => {
    render(<ReviewScreen onSave={() => {}} today={TODAY} />);
    await userEvent.click(screen.getByTestId("check-me-change"));
    const name = screen.getByTestId("review-name-input");
    await userEvent.clear(name);
    await userEvent.type(name, "Methi");
    await userEvent.click(screen.getByTestId("check-me-done"));
    expect(row("Methi")).toBeInTheDocument();
    expect(screen.getByTestId("review-save")).toBeEnabled();
  });
});
