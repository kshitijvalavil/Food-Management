"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Icon } from "@/components/Icon";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState, Screen } from "@/components/Screen";
import { freshness, type Freshness } from "@/lib/freshness";
import { useItems, useToday, withDays } from "@/lib/hooks";
import { LOCATIONS, LOCATION_LABEL, type Location } from "@/lib/types";

const BANDS: Array<{ key: Freshness; cls: string; label: string }> = [
  { key: "gone", cls: "s-g", label: "gone" },
  { key: "today", cls: "s-t", label: "today" },
  { key: "soon", cls: "s-s", label: "soon" },
  { key: "fresh", cls: "s-f", label: "fresh" },
];

function KitchenBody() {
  const params = useSearchParams();
  const router = useRouter();
  const today = useToday();
  const loc = (LOCATIONS as string[]).includes(params.get("loc") ?? "") ? (params.get("loc") as Location) : "fridge";
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const { data, isLoading } = useItems();
  const all = withDays(data ?? [], today);
  const counts = Object.fromEntries(LOCATIONS.map((l) => [l, all.filter((i) => i.location === l).length])) as Record<Location, number>;
  const here = all.filter((i) => i.location === loc);
  const shown = query ? here.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())) : here;
  const bands = BANDS.map((b) => ({ ...b, n: here.filter((i) => freshness(i.daysLeft) === b.key).length }));

  return (
    <Screen testId="screen-kitchen">
      <header className="flex items-end justify-between gap-3">
        <h1 className="h-title">Kitchen</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="ib"
            aria-label={searching ? "Close search" : "Search the kitchen"}
            aria-expanded={searching}
            onClick={() => {
              setSearching(!searching);
              setQuery("");
            }}
            data-testid="kitchen-search-toggle"
          >
            <Icon name={searching ? "i-x" : "i-search"} />
          </button>
          <Link href="/shopping" className="ib" aria-label="Shopping list" data-testid="kitchen-shopping">
            <Icon name="i-cart" />
          </Link>
        </div>
      </header>

      {searching && (
        <input
          className="field"
          type="search"
          autoFocus
          placeholder={`Search the ${LOCATION_LABEL[loc].toLowerCase()}`}
          aria-label="Search the kitchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="kitchen-search-input"
        />
      )}

      <div className="seg" role="tablist" aria-label="Where it's kept">
        {LOCATIONS.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={l === loc}
            aria-controls="kitchen-list"
            onClick={() => router.replace(`/kitchen?loc=${l}`, { scroll: false })}
            data-testid={`kitchen-tab-${l}`}
          >
            {LOCATION_LABEL[l]} <em>{counts[l]}</em>
          </button>
        ))}
      </div>

      {here.length > 0 && (
        <div data-testid="freshness-bar">
          <div className="fbar" aria-hidden="true">
            {bands.filter((b) => b.n > 0).map((b) => (
              <i key={b.key} className={b.cls} style={{ flex: b.n }} />
            ))}
          </div>
          <p className="fleg m-0">
            {bands.map((b) => (
              <span key={b.key} className={b.cls}>
                <i aria-hidden="true" />
                {b.n} {b.label}
              </span>
            ))}
          </p>
        </div>
      )}

      <section id="kitchen-list" role="tabpanel" aria-label={`${LOCATION_LABEL[loc]}, sorted by days left`} data-testid="kitchen-list">
        {isLoading ? (
          <div className="pnl h-64 animate-pulse" aria-busy="true" aria-label="Loading" />
        ) : shown.length ? (
          <div className="pnl">
            <AnimatePresence initial={false}>
              {shown.map((i) => (
                <motion.div key={i.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="li-sep first:shadow-none">
                  <ItemRow item={i} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <EmptyState
            title={query ? "No match" : `Nothing in the ${LOCATION_LABEL[loc].toLowerCase()}`}
            body={query ? "Try another word." : "Tap + to add a photo, barcode, voice note or search."}
          />
        )}
      </section>
    </Screen>
  );
}

export default function Kitchen() {
  return (
    <Suspense>
      <KitchenBody />
    </Suspense>
  );
}
