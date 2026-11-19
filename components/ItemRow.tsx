import Link from "next/link";
import { DayCount, FreshnessRing } from "./Freshness";
import { totalDaysFor } from "@/lib/freshness";
import type { WithDays } from "@/lib/hooks";
import { LOCATION_LABEL, displayName, isLow } from "@/lib/types";

/** A kitchen row: ring, name, one line of detail, day count. Tapping opens the item. */
export function ItemRow({ item, meta, showLocation = false }: { item: WithDays; meta?: string; showLocation?: boolean }) {
  const total = totalDaysFor(item.added_at, item.expires_on);
  const low = isLow(item);
  const detail =
    meta ??
    (item.daysLeft < 0
      ? "Used or binned?"
      : low && item.usual_quantity
        ? `${item.quantity} of usual ${item.usual_quantity}`
        : showLocation
          ? LOCATION_LABEL[item.location]
          : "");
  return (
    <Link href={`/item/${encodeURIComponent(item.id)}`} className="li" data-testid="item-row" data-item-id={item.id} data-item-name={item.name}>
      <FreshnessRing name={item.name} daysLeft={item.daysLeft} totalDays={total} />
      <span className="tx">
        <b className="nm">
          {displayName(item.name, item.quantity, item.unit)}
          {low && (
            <span className="low" aria-label="running low">
              LOW
            </span>
          )}
        </b>
        {detail && <span className="mt">{detail}</span>}
      </span>
      <DayCount daysLeft={item.daysLeft} />
    </Link>
  );
}
