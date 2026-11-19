"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewScreen } from "@/components/ReviewScreen";
import { Screen } from "@/components/Screen";
import { EnrichedItem } from "@/shared/schema";
import { draft } from "@/lib/draft";
import { useSaveItems, useToday } from "@/lib/hooks";
import type { DraftItem, Location } from "@/lib/types";

function mostCommon(items: DraftItem[]): Location {
  const n: Record<Location, number> = { fridge: 0, freezer: 0, pantry: 0 };
  for (const i of items) n[i.location] += 1;
  return (Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] as Location) ?? "fridge";
}

export default function ReviewPage() {
  const router = useRouter();
  const today = useToday();
  const save = useSaveItems();
  const [error, setError] = useState<string | null>(null);

  const onSave = async (items: DraftItem[]) => {
    setError(null);
    // Edited rows are validated again before anything is written.
    const parsed = EnrichedItem.array().safeParse(items.map(({ key: _k, origin: _o, confirmed: _c, ...rest }) => ({ ...rest, name: rest.name.trim() })));
    if (!parsed.success) {
      setError("One of the rows has a problem (an empty name or a bad date). Fix it and try again.");
      return;
    }
    try {
      await save.mutateAsync(parsed.data);
      const loc = mostCommon(items);
      draft.clear();
      router.push(`/kitchen?loc=${loc}`);
    } catch {
      setError("Couldn't save. Nothing was lost: try again.");
    }
  };

  return (
    <Screen tabs={false} testId="screen-review">
      <ReviewScreen onSave={onSave} saving={save.isPending} error={error} today={today} />
    </Screen>
  );
}
