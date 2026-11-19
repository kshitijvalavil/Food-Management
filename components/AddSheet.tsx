"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";
import { useItems } from "@/lib/hooks";
import { displayName } from "@/lib/types";

interface AddSheetCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const Ctx = createContext<AddSheetCtx>({ open: false, setOpen: () => {} });

export function AddSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAddSheet = () => useContext(Ctx);

const OPTIONS: Array<{ href: string; icon: IconName; title: string; hint: string; testId: string }> = [
  { href: "/capture/camera?mode=barcode", icon: "i-bar", title: "Barcode", hint: "Pack size, kcal and the printed date", testId: "add-option-barcode" },
  { href: "/capture/voice", icon: "i-mic", title: "Voice note", hint: "Say what you bought, we list it", testId: "add-option-voice" },
  { href: "/capture/search", icon: "i-search", title: "Search", hint: "Loose things: salt, nuts, biscuits", testId: "add-option-search" },
];

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function LastAdded() {
  const { data } = useItems();
  if (!data?.length) return null;
  const last = [...data].sort((a, b) => b.added_at.localeCompare(a.added_at))[0];
  if (!last) return null;
  const day = WEEKDAY[new Date(last.added_at).getDay()];
  return (
    <p className="text-center text-[14px] text-muted">
      Last added: {displayName(last.name, last.quantity, last.unit)}, {day}
    </p>
  );
}

export function AddSheet() {
  const { open, setOpen } = useAddSheet();
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    // Sits above the tab bar, whose "x" closes it (mockup 1.1).
    <Sheet open={open} onClose={close} title="Add food" testId="add-sheet" bottomOffset="calc(var(--tabbar-h) + var(--safe-bottom))">
      <div>
        <p className="h-title" aria-hidden="true">
          Add food
        </p>
        <p className="sub">You&apos;ll check everything before it&apos;s saved.</p>
      </div>
      <Link href="/capture/camera?mode=photo" className="bigo" onClick={close} data-testid="add-option-photo">
        <span className="oi" aria-hidden="true">
          <Icon name="i-cam" />
        </span>
        <span className="tx">
          <b>Photo of a shelf</b>
          <span>Finds many items at once. Flags the ones it&apos;s unsure of.</span>
        </span>
      </Link>
      <div className="pnl">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="li" onClick={close} data-testid={o.testId}>
            <span className="oi" aria-hidden="true">
              <Icon name={o.icon} />
            </span>
            <span className="tx">
              <b className="nm">{o.title}</b>
              <span className="mt">{o.hint}</span>
            </span>
            <Icon name="i-chr" className="chv" />
          </Link>
        ))}
      </div>
      <LastAdded />
    </Sheet>
  );
}
