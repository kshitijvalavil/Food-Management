import type { ExpirySource } from "@/shared/schema";
import { foodSymbol } from "@/lib/food-art";
import { dayNumber, daySpoken, dayUnit, freshClass, freshness, ringPercent } from "@/lib/freshness";
import { SOURCE_STAMP } from "@/lib/types";

/** Food illustration from the mockups, or the item's initial when there is no mark for it. */
export function FoodMark({ name }: { name: string }) {
  const id = foodSymbol(name);
  if (!id) {
    return (
      <span className="ring-in initial" aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

export function FoodTile({ name, daysLeft }: { name: string; daysLeft?: number }) {
  const id = foodSymbol(name);
  return (
    <span className={`tile ${daysLeft == null ? "" : freshClass(daysLeft)}`} aria-hidden="true">
      {id ? (
        <svg viewBox="0 0 40 40">
          <use href={`#${id}`} />
        </svg>
      ) : (
        <span className="initial">{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

/**
 * The freshness ring: colour = freshness band, fill = share of shelf life left.
 * Decorative for screen readers; the row's text carries the same information.
 */
export function FreshnessRing({
  name,
  daysLeft,
  totalDays,
  size = "md",
  onBg = false,
}: {
  name: string;
  daysLeft: number;
  totalDays: number;
  size?: "md" | "big";
  onBg?: boolean;
}) {
  const p = ringPercent(daysLeft, totalDays);
  return (
    <span
      className={`ring ${freshClass(daysLeft)} ${size === "big" ? "big" : ""} ${onBg ? "on-bg" : ""}`}
      style={{ "--p": p } as React.CSSProperties}
      data-testid="fresh-ring"
      data-freshness={freshness(daysLeft)}
      data-percent={p}
      aria-hidden="true"
    >
      <FoodMark name={name} />
    </span>
  );
}

/** "2 days" / "-1 day" in the freshness colour, read out as "2 days left" / "1 day past its date". */
export function DayCount({ daysLeft, className = "" }: { daysLeft: number; className?: string }) {
  return (
    <span className={`dl ${freshClass(daysLeft)} ${className}`} data-testid="day-count" data-days={daysLeft}>
      <span aria-hidden="true">
        {dayNumber(daysLeft)}
        <small>{dayUnit(daysLeft)}</small>
      </span>
      <span className="sr-only">{daySpoken(daysLeft)}</span>
    </span>
  );
}

export function SourceStamp({ source }: { source: ExpirySource }) {
  const s = SOURCE_STAMP[source];
  return (
    <span className={`stamp ${s.cls}`} data-testid="date-source" data-source={source}>
      <span aria-hidden="true">{s.label}</span>
      <span className="sr-only">{s.spoken}</span>
    </span>
  );
}
