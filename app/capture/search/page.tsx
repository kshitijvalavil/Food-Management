"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FoodTile } from "@/components/Freshness";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { friendlyError, itemFromSearch, searchFood, type SearchHit } from "@/lib/api";
import { draft, useDraft } from "@/lib/draft";
import { useDebounced } from "@/lib/useDebounced";
import { LOCATION_ICON, LOCATION_LABEL } from "@/lib/types";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 250);
  const { items } = useDraft();
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState("");
  const { data, isFetching, error } = useQuery({
    queryKey: ["search-food", debounced],
    queryFn: () => searchFood(debounced),
    enabled: debounced.length > 0,
    staleTime: 5 * 60_000,
  });
  const results = debounced ? (data?.results ?? []) : [];

  const add = async (hit: SearchHit) => {
    const item = await itemFromSearch(hit);
    draft.add([item], "search", draft.get().sourceLabel ?? "Added from search");
    setAdded((a) => ({ ...a, [hit.shelf_life_id]: true }));
    setStatus(`${hit.name} added to Review.`);
  };

  return (
    <Screen tabs={false} testId="screen-search">
      <nav className="nav" aria-label="Back">
        <Link href="/" data-testid="search-back">
          <Icon name="i-chl" />
          Back
        </Link>
      </nav>
      <h1 className="h-title">Search</h1>
      <div className="relative">
        <Icon name="i-search" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          className="field !pl-11"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoFocus
          autoComplete="off"
          placeholder="Salt, nuts, paneer…"
          aria-label="Search food"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
          data-testid="search-input"
        />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {status || (debounced && !isFetching ? `${results.length} results` : "")}
      </p>

      {error && (
        <p className="m-0 text-[15px] text-today-ink" role="alert">
          {friendlyError(error)}
        </p>
      )}

      {results.length > 0 && (
        <ul className="pnl m-0 list-none" data-testid="search-results" aria-label="Results">
          {results.map((r) => (
            <li key={r.shelf_life_id} className="li">
              <FoodTile name={r.name} />
              <span className="tx">
                <b className="nm">{r.name}</b>
                <span className="ml">
                  <Icon name={LOCATION_ICON[r.default_location]} />
                  {LOCATION_LABEL[r.default_location]} · {r.category}
                </span>
              </span>
              <button
                type="button"
                className={`btn sm ${added[r.shelf_life_id] ? "g" : "s"}`}
                onClick={() => add(r)}
                aria-label={added[r.shelf_life_id] ? `Add another ${r.name}` : `Add ${r.name}`}
                data-testid="search-add"
                data-name={r.name}
              >
                <Icon name={added[r.shelf_life_id] ? "i-check" : "i-plus"} />
                {added[r.shelf_life_id] ? "Added" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {debounced && !isFetching && !error && results.length === 0 && (
        <p className="m-0 text-center text-[15px] text-muted" data-testid="search-empty">
          Nothing called &ldquo;{debounced}&rdquo;. Try a shorter word, or use a voice note.
        </p>
      )}

      {items.length > 0 && (
        <Link href="/capture/review" className="btn sticky bottom-[calc(var(--safe-bottom)+16px)] mt-auto" data-testid="review-cta">
          Review
          <span className="count">{items.length}</span>
          <Icon name="i-chr" />
        </Link>
      )}
    </Screen>
  );
}
