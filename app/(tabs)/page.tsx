"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState, Screen } from "@/components/Screen";
import { useAddSheet } from "@/components/AddSheet";
import { dayDate, greeting, monthName } from "@/lib/dates";
import { useItems, useMonthStats, useToday, withDays } from "@/lib/hooks";

export default function Today() {
  const today = useToday();
  const { data, isLoading } = useItems();
  const stats = useMonthStats();
  const { setOpen } = useAddSheet();
  const items = withDays(data ?? [], today);
  const useSoon = items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 3);
  const alerts = items.filter((i) => i.daysLeft <= 1).length;
  const first = useSoon[0];

  return (
    <Screen testId="screen-today">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{dayDate(today)}</p>
          <h1 className="h-title">{greeting()}</h1>
        </div>
        <Link href="/alerts" className="ib" aria-label={alerts ? `Alerts, ${alerts} new` : "Alerts"} data-testid="today-bell">
          <Icon name="i-bell" />
          {alerts > 0 && (
            <span className="badge" aria-hidden="true">
              {alerts}
            </span>
          )}
        </Link>
      </header>

      {isLoading ? (
        <div className="pnl h-48 animate-pulse" aria-busy="true" aria-label="Loading" />
      ) : useSoon.length ? (
        <section className="pnl" aria-labelledby="use-soon-h" data-testid="use-soon">
          <h2 id="use-soon-h" className="lb m-0">
            Use soon <b>{useSoon.length === 1 ? "1 item" : `${useSoon.length} items`}</b>
          </h2>
          {useSoon.slice(0, 5).map((i) => (
            <ItemRow key={i.id} item={i} showLocation />
          ))}
        </section>
      ) : (
        <EmptyState title="Nothing to rush" body="Nothing in your kitchen turns in the next three days.">
          <button type="button" className="btn sm mt-2" onClick={() => setOpen(true)} data-testid="today-add">
            <Icon name="i-plus" /> Add food
          </button>
        </EmptyState>
      )}

      <section className="tonight" aria-labelledby="tonight-h" data-testid="tonight-card">
        <svg className="plate" viewBox="0 0 120 120" aria-hidden="true">
          <use href="#d-palak" />
        </svg>
        <p className="eyebrow">Tonight</p>
        <h2 id="tonight-h" className="dn m-0">
          {first ? `Something with ${first.name.toLowerCase()}` : "Cook from your kitchen"}
        </h2>
        <span className="mt">Dishes picked from what turns first arrive in the next update.</span>
        <Link href="/cook" className="btn" data-testid="tonight-cook">
          <Icon name="i-pan" />
          See Cook
        </Link>
      </section>

      <section className="tag" aria-label={`${monthName(today)}: ${stats.data?.used ?? 0} items used in time, ${stats.data?.binned ?? 0} binned`} data-testid="saved-tag">
        <span className="eyebrow" style={{ color: "var(--a-kraft-ink)", opacity: 0.75 }}>
          Saved in {monthName(today)}
        </span>
        <span className="flex items-center gap-3" aria-hidden="true">
          <b className="big-n">{stats.data?.used ?? 0}</b>
          <span className="mt wrap" style={{ color: "var(--a-kraft-ink)" }}>
            {stats.data?.used === 1 ? "item" : "items"} used in time, {stats.data?.binned ?? 0} binned
          </span>
        </span>
      </section>
    </Screen>
  );
}
