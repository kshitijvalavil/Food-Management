"use client";
import { Screen } from "@/components/Screen";
import { freshClass } from "@/lib/freshness";
import { useItems, useToday, withDays } from "@/lib/hooks";

/** Sprint 1 placeholder: what to cook first. Ranked dishes and YouTube cook-alongs ship in Sprint 2. */
export default function Cook() {
  const today = useToday();
  const { data } = useItems();
  const first = withDays(data ?? [], today).filter((i) => i.daysLeft >= 0).slice(0, 4);
  return (
    <Screen testId="screen-cook">
      <header>
        <h1 className="h-title">Cook</h1>
        <p className="sub">Ranked by what goes off first</p>
      </header>
      <section className="overflow-hidden rounded-[26px] bg-surf" aria-labelledby="cook-soon">
        <div className="relative h-40 overflow-hidden" style={{ background: "var(--dt1)" }}>
          <svg className="absolute -top-8 -right-4 h-56 w-56" viewBox="0 0 120 120" aria-hidden="true">
            <use href="#d-palak" />
          </svg>
        </div>
        <div className="grid gap-3 p-4">
          <h2 id="cook-soon" className="d m-0 text-[28px]">
            Dish ideas are on the way
          </h2>
          <p className="m-0 text-[15px] text-muted">The next update suggests dishes that use these first, each with time, kcal and a cook-along video.</p>
          {first.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Use these first">
              {first.map((i) => (
                <li key={i.id} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold ${freshClass(i.daysLeft)}`} style={{ background: "var(--t)" }}>
                  <i className="h-2 w-2 rounded-full" style={{ background: "var(--c)" }} aria-hidden="true" />
                  {i.name} {i.daysLeft}d
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Screen>
  );
}
