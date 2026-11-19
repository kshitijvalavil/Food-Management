"use client";
import Link from "next/link";
import { useState } from "react";
import { FoodTile, FreshnessRing } from "@/components/Freshness";
import { Icon } from "@/components/Icon";
import { EmptyState, Screen } from "@/components/Screen";
import { shortDate } from "@/lib/dates";
import { totalDaysFor } from "@/lib/freshness";
import { useItems, useToday, withDays, type WithDays } from "@/lib/hooks";
import { isLow } from "@/lib/types";

type Filter = "all" | "expiring" | "low";

function Group({ title, items, line }: { title: string; items: WithDays[]; line: (i: WithDays) => string }) {
  if (!items.length) return null;
  return (
    <>
      <h3 className="lb m-0">{title}</h3>
      {items.map((i) => (
        <Link key={i.id} href={`/item/${encodeURIComponent(i.id)}`} className="li" data-testid="alert-row">
          <FreshnessRing name={i.name} daysLeft={i.daysLeft} totalDays={totalDaysFor(i.added_at, i.expires_on)} />
          <span className="tx">
            <b className="nm">{i.daysLeft < 0 ? `${i.name} is past its date` : i.name}</b>
            <span className="mt">{line(i)}</span>
          </span>
          <Icon name="i-chr" className="chv" />
        </Link>
      ))}
    </>
  );
}

/** Alerts inbox, worked out from the kitchen (push delivery arrives in Sprint 2). */
export default function Alerts() {
  const today = useToday();
  const { data } = useItems();
  const [filter, setFilter] = useState<Filter>("all");
  const items = withDays(data ?? [], today);
  const gone = items.filter((i) => i.daysLeft <= 0);
  const tomorrow = items.filter((i) => i.daysLeft === 1);
  const week = items.filter((i) => i.daysLeft >= 2 && i.daysLeft <= 7);
  const low = items.filter(isLow);
  const showExp = filter !== "low";
  const showLow = filter !== "expiring";

  return (
    <Screen testId="screen-alerts">
      <nav className="nav" aria-label="Back">
        <Link href="/">
          <Icon name="i-chl" />
          Today
        </Link>
        <Link href="/me/notifications" aria-label="Notification settings" data-testid="alerts-settings">
          <Icon name="i-gear" style={{ color: "var(--a-ink)" }} />
        </Link>
      </nav>
      <h1 className="h-title">Alerts</h1>
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["expiring", "Expiring"],
            ["low", "Running low"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`alerts-filter-${k}`}>
            {label}
          </button>
        ))}
      </div>

      {showExp && gone.length + tomorrow.length + week.length > 0 && (
        <section className="pnl" aria-label="Expiring">
          <Group title="Expiring · today" items={gone} line={(i) => (i.daysLeft < 0 ? "Check it, or bin it" : "Use it today")} />
          <Group title="Tomorrow" items={tomorrow} line={() => "Goes off tomorrow"} />
          <Group title="This week" items={week} line={(i) => shortDate(i.expires_on)} />
        </section>
      )}
      {showLow && low.length > 0 && (
        <section className="pnl" aria-label="Running low">
          <h3 className="lb m-0">Running low</h3>
          {low.map((i) => (
            <Link key={i.id} href="/shopping" className="li" data-testid="alert-low-row">
              <FoodTile name={i.name} />
              <span className="tx">
                <b className="nm">{i.name}</b>
                <span className="mt">
                  {i.quantity} of usual {i.usual_quantity ?? "?"}
                </span>
              </span>
              <span className="btn sm s" aria-hidden="true">
                <Icon name="i-cart" />
                List
              </span>
            </Link>
          ))}
        </section>
      )}
      {gone.length + tomorrow.length + week.length + low.length === 0 && <EmptyState title="All quiet" body="Nothing is close to its date and nothing is running low." />}
    </Screen>
  );
}
