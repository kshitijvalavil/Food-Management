import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayCount, FreshnessRing, SourceStamp } from "./Freshness";
import { dayNumber, daySpoken, freshness, ringPercent } from "@/lib/freshness";

describe("freshness scale", () => {
  it.each([
    [-1, "gone"],
    [0, "today"],
    [1, "today"],
    [2, "soon"],
    [3, "soon"],
    [4, "fresh"],
    [28, "fresh"],
  ])("%i days left is %s", (days, band) => {
    expect(freshness(days)).toBe(band);
  });

  it("ring is the share of shelf life left, full for past-date items", () => {
    expect(ringPercent(1, 5)).toBe(20);
    expect(ringPercent(28, 35)).toBe(80);
    expect(ringPercent(-1, 6)).toBe(100);
    expect(ringPercent(0, 5)).toBe(8); // never an empty ring
    expect(ringPercent(40, 30)).toBe(100);
  });

  it("day numbers use a real minus sign and read naturally", () => {
    expect(dayNumber(-1)).toBe("−1");
    expect(daySpoken(-1)).toBe("1 day past its date");
    expect(daySpoken(0)).toBe("use today");
    expect(daySpoken(1)).toBe("1 day left");
    expect(daySpoken(5)).toBe("5 days left");
  });
});

describe("<FreshnessRing>", () => {
  it("sets the band class and fill from days left", () => {
    render(<FreshnessRing name="Palak" daysLeft={1} totalDays={5} />);
    const ring = screen.getByTestId("fresh-ring");
    expect(ring).toHaveClass("fring", "s-t");
    expect(ring).toHaveAttribute("data-freshness", "today");
    expect(ring).toHaveAttribute("data-percent", "20");
    expect(ring.style.getPropertyValue("--p")).toBe("20");
    expect(ring).toHaveAttribute("aria-hidden", "true");
    expect(ring.querySelector("use")?.getAttribute("href")).toBe("#f-palak");
  });

  it("falls back to the initial when there is no food mark", () => {
    render(<FreshnessRing name="Quinoa" daysLeft={10} totalDays={20} />);
    expect(screen.getByTestId("fresh-ring")).toHaveTextContent("Q");
    expect(screen.getByTestId("fresh-ring")).toHaveClass("s-f");
  });
});

describe("<DayCount>", () => {
  it("shows the number and unit, and says it in words", () => {
    render(<DayCount daysLeft={2} />);
    const el = screen.getByTestId("day-count");
    expect(el).toHaveClass("s-s");
    expect(el).toHaveTextContent("2days");
    expect(screen.getByText("2 days left")).toHaveClass("sr-only");
  });

  it("singular day and past-date wording", () => {
    render(<DayCount daysLeft={-1} />);
    expect(screen.getByTestId("day-count")).toHaveClass("s-g");
    expect(screen.getByText("1 day past its date")).toBeInTheDocument();
    expect(screen.getByTestId("day-count")).toHaveTextContent("−1day");
  });
});

describe("<SourceStamp>", () => {
  it.each([
    ["printed", "Printed", "pr"],
    ["foodkeeper", "USDA", "us"],
    ["ai_estimate", "Estimate", "ai"],
  ] as const)("%s reads %s", (source, label, cls) => {
    render(<SourceStamp source={source} />);
    const el = screen.getByTestId("date-source");
    expect(el).toHaveClass("stamp", cls);
    expect(el).toHaveTextContent(label);
  });
});
