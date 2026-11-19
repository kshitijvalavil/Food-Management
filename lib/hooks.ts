"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { EnrichedItem } from "@/shared/schema";
import { kitchen, type ItemPatch } from "@/lib/kitchen";
import type { UsageKind } from "@/lib/demo/db";
import { todayISO } from "@/lib/dates";
import { daysLeftFor } from "@/lib/freshness";
import type { KitchenItem } from "@/lib/types";

export const ITEMS_KEY = ["items"] as const;

export function useItems() {
  return useQuery({ queryKey: ITEMS_KEY, queryFn: () => kitchen.list() });
}

export function useItem(id: string) {
  return useQuery({ queryKey: [...ITEMS_KEY, id], queryFn: () => kitchen.get(id) });
}

export function useMonthStats() {
  return useQuery({ queryKey: ["month-stats"], queryFn: () => kitchen.monthStats() });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ITEMS_KEY }), qc.invalidateQueries({ queryKey: ["month-stats"] })]);
}

export function useSaveItems() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (items: EnrichedItem[]) => kitchen.addMany(items), onSuccess: invalidate });
}

export function useUpdateItem() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (a: { id: string; patch: ItemPatch; event?: UsageKind }) => kitchen.update(a.id, a.patch, a.event), onSuccess: invalidate });
}

export function useSetStatus() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (a: { id: string; status: "used" | "binned" }) => kitchen.setStatus(a.id, a.status), onSuccess: invalidate });
}

/** Today's date, refreshed when the app comes back to the foreground after midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const onVis = () => setToday(todayISO());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return today;
}

export interface WithDays extends KitchenItem {
  daysLeft: number;
}

export function withDays(items: KitchenItem[], today: string): WithDays[] {
  return items
    .map((i) => ({ ...i, daysLeft: daysLeftFor(i.expires_on, today) }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}
