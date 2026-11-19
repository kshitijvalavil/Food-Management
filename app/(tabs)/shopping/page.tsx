"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FoodTile } from "@/components/Freshness";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { getDB } from "@/lib/demo/db";
import { useItems, useToday, withDays } from "@/lib/hooks";
import { isLow } from "@/lib/types";

// The shopping list is kept on this phone for now; household sync arrives with Sprint 2's table.
const KEY = ["shopping"];

export default function Shopping() {
  const today = useToday();
  const qc = useQueryClient();
  const { data: items } = useItems();
  const { data: list = [] } = useQuery({ queryKey: KEY, queryFn: () => getDB().shopping.orderBy("created_at").toArray() });
  const [name, setName] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const add = useMutation({
    mutationFn: (n: string) => getDB().shopping.add({ id: crypto.randomUUID(), name: n, done: false, added_by: "You", created_at: new Date().toISOString() }),
    onSuccess: invalidate,
  });
  const toggle = useMutation({ mutationFn: (a: { id: string; done: boolean }) => getDB().shopping.update(a.id, { done: a.done }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => getDB().shopping.delete(id), onSuccess: invalidate });
  const low = withDays(items ?? [], today).filter(isLow);

  return (
    <Screen testId="screen-shopping">
      <nav className="nav" aria-label="Back">
        <Link href="/kitchen">
          <Icon name="i-chl" />
          Kitchen
        </Link>
      </nav>
      <header>
        <p className="eyebrow">On this phone</p>
        <h1 className="h-title">Shopping list</h1>
      </header>

      {low.length > 0 && (
        <section className="pnl" aria-label="Running low">
          <h2 className="lb m-0">
            Running low <b>Added for you</b>
          </h2>
          {low.map((i) => {
            const usual = i.usual_quantity ?? 1;
            const pct = Math.min(100, Math.round((i.quantity / usual) * 100));
            return (
              <div key={i.id} className="li" data-testid="shopping-low-row">
                <FoodTile name={i.name} />
                <span className="tx">
                  <b className="nm">{i.name}</b>
                  <span className="flex items-center gap-2">
                    <span className="meter s-t w-20" aria-hidden="true">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mt">
                      {i.quantity} of usual {usual}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </section>
      )}

      <section className="pnl" aria-label="Added by you">
        <h2 className="lb m-0">Added by you</h2>
        {list.map((e) => (
          <div key={e.id} className="li">
            <button
              type="button"
              className="grid min-h-11 min-w-11 place-items-center"
              role="checkbox"
              aria-checked={e.done}
              aria-label={`${e.name}, bought`}
              onClick={() => toggle.mutate({ id: e.id, done: !e.done })}
              data-testid="shopping-check"
            >
              <span className={`ck ${e.done ? "on" : ""}`}>{e.done && <Icon name="i-check" />}</span>
            </button>
            <FoodTile name={e.name} />
            <span className="tx">
              <b className={`nm ${e.done ? "line-through opacity-60" : ""}`}>{e.name}</b>
              <span className="mt">{e.added_by}</span>
            </span>
            <button type="button" className="ib" aria-label={`Remove ${e.name}`} onClick={() => remove.mutate(e.id)} data-testid="shopping-remove">
              <Icon name="i-x" />
            </button>
          </div>
        ))}
        <form
          className="flex gap-2 py-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            const n = name.trim();
            if (n) add.mutate(n.slice(0, 80));
            setName("");
          }}
        >
          <input className="field flex-1" placeholder="Lemons ×4" aria-label="Add to the list" value={name} onChange={(e) => setName(e.target.value)} data-testid="shopping-input" />
          <button type="submit" className="btn sm" data-testid="shopping-add">
            <Icon name="i-plus" />
            Add
          </button>
        </form>
      </section>
    </Screen>
  );
}
