"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DayCount, FreshnessRing, SourceStamp } from "@/components/Freshness";
import { Icon } from "@/components/Icon";
import { EmptyState, Screen } from "@/components/Screen";
import { previewExpiry } from "@/lib/api";
import { dayDate, shortDate } from "@/lib/dates";
import { daysLeftFor, freshClass, totalDaysFor } from "@/lib/freshness";
import { useItem, useSetStatus, useToday, useUpdateItem } from "@/lib/hooks";
import { LOCATION_LABEL, amountLabel, quantityStep, type KitchenItem } from "@/lib/types";

const SOURCE_NOTE: Record<KitchenItem["expiry_source"], (loc: string) => string> = {
  printed: () => "Read off the pack: it's the manufacturer's date.",
  foodkeeper: (loc) => `USDA FoodKeeper range for the ${loc}. ShelfLife uses the middle of it.`,
  ai_estimate: () => "An estimate. Check the pack and change the date if you know better.",
};

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const today = useToday();
  const { data: item, isLoading } = useItem(decodeURIComponent(id));
  const setStatus = useSetStatus();
  const update = useUpdateItem();
  const [msg, setMsg] = useState<string | null>(null);

  if (isLoading) return <Screen><div className="pnl h-64 animate-pulse" aria-busy="true" aria-label="Loading" /></Screen>;
  if (!item || item.status !== "active") {
    return (
      <Screen testId="screen-item">
        <nav className="nav" aria-label="Back">
          <Link href="/kitchen"><Icon name="i-chl" />Kitchen</Link>
        </nav>
        <EmptyState title="Not in your kitchen" body="It was used, binned or removed." />
      </Screen>
    );
  }

  const daysLeft = daysLeftFor(item.expires_on, today);
  const total = totalDaysFor(item.added_at, item.expires_on);
  const loc = LOCATION_LABEL[item.location].toLowerCase();
  const kcal = item.kcal_per_unit;
  const busy = setStatus.isPending || update.isPending;

  const finish = async (status: "used" | "binned") => {
    await setStatus.mutateAsync({ id: item.id, status });
    router.push(`/kitchen?loc=${item.location}`);
  };

  const move = async () => {
    const to = item.location === "freezer" ? "fridge" : "freezer";
    const preview = item.expiry_source === "printed" ? null : await previewExpiry(item.shelf_life_id, to, today);
    await update.mutateAsync({
      id: item.id,
      patch: { location: to, ...(preview ? { expires_on: preview.expires_on, expiry_source: preview.expiry_source } : {}) },
      event: "moved",
    });
    setMsg(`Moved to the ${to}.${preview ? ` New date ${shortDate(preview.expires_on)}.` : ""}`);
  };

  const step = quantityStep(item.unit, item.quantity);
  const setQty = (q: number) => update.mutate({ id: item.id, patch: { quantity: Math.max(step, Math.round(q * 100) / 100) } });

  return (
    <Screen testId="screen-item">
      <nav className="nav" aria-label="Back">
        <Link href={`/kitchen?loc=${item.location}`} data-testid="item-back">
          <Icon name="i-chl" />
          Kitchen
        </Link>
      </nav>

      <header className="flex items-center gap-4">
        <FreshnessRing name={item.name} daysLeft={daysLeft} totalDays={total} size="big" onBg />
        <div className="tx">
          <p className="eyebrow">{LOCATION_LABEL[item.location]}</p>
          <h1 className="h-title" style={{ fontSize: 44 }} data-testid="item-name">
            {item.name}
          </h1>
          <span className="mt wrap">
            {amountLabel(item.quantity, item.unit)} left · added {dayDate(item.added_at)}
          </span>
        </div>
      </header>

      <div className={`facts ${freshClass(daysLeft)}`}>
        <span>
          <DayCount daysLeft={daysLeft} className="!text-left !text-[29px]" />
          {daysLeft < 0 ? "Past date" : "Days left"}
        </span>
        <span>
          <b>{item.expiry_source === "printed" ? "" : "~"}{shortDate(item.expires_on)}</b>Best by
        </span>
        <span>
          <b>{kcal != null ? Math.round(kcal) : "—"}</b>kcal each
        </span>
      </div>

      <div className="flex items-start gap-3">
        <SourceStamp source={item.expiry_source} />
        <span className="mt wrap">{SOURCE_NOTE[item.expiry_source](loc)}</span>
      </div>

      <section className="pnl pb-3" aria-label="Stock">
        <div className="lb">
          Stock {item.usual_quantity ? <b>{item.quantity} of usual {item.usual_quantity}</b> : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="mt">How much is left</span>
          <span className="stepper">
            <button type="button" aria-label="Less" onClick={() => setQty(item.quantity - step)} disabled={busy || item.quantity <= step} data-testid="item-qty-minus">
              −
            </button>
            <span aria-live="polite" data-testid="item-qty">
              {amountLabel(item.quantity, item.unit)}
            </span>
            <button type="button" aria-label="More" onClick={() => setQty(item.quantity + step)} disabled={busy} data-testid="item-qty-plus">
              +
            </button>
          </span>
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {msg}
      </p>
      {msg && <p className="tip m-0" aria-hidden="true"><Icon name="i-snow" />{msg}</p>}

      <div className="mt-auto grid grid-cols-[1.2fr_1fr_1fr] gap-2">
        <button type="button" className="btn px-2" onClick={() => finish("used")} disabled={busy} data-testid="item-used">
          <Icon name="i-check" />
          Used
        </button>
        <button type="button" className="btn g px-2" onClick={() => finish("binned")} disabled={busy} data-testid="item-binned">
          <Icon name="i-bin" />
          Binned
        </button>
        <button type="button" className="btn g px-2" onClick={move} disabled={busy} data-testid="item-freeze">
          <Icon name={item.location === "freezer" ? "i-fridge" : "i-snow"} />
          {item.location === "freezer" ? "Thaw" : "Freeze"}
        </button>
      </div>
    </Screen>
  );
}
