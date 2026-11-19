"use client";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useId, useState } from "react";
import { DayCount, FreshnessRing, SourceStamp } from "./Freshness";
import { Icon } from "./Icon";
import { previewExpiry } from "@/lib/api";
import { shortDate, todayISO } from "@/lib/dates";
import { draft, useDraft } from "@/lib/draft";
import { daysLeftFor, totalDaysFor } from "@/lib/freshness";
import { LOCATIONS, LOCATION_ICON, LOCATION_LABEL, amountLabel, displayName, needsCheck, quantityStep, type DraftItem, type Location } from "@/lib/types";

async function changeLocation(item: DraftItem, location: Location, today: string) {
  const patch: Partial<DraftItem> = { location };
  // A printed date stays; FoodKeeper and estimated dates follow the new location.
  if (item.expiry_source !== "printed") {
    const p = await previewExpiry(item.shelf_life_id, location, today);
    if (p) Object.assign(patch, p);
  }
  draft.update(item.key, patch);
}

function Editor({ item, today, showName }: { item: DraftItem; today: string; showName?: boolean }) {
  const id = useId();
  const step = quantityStep(item.unit, item.quantity);
  const setQty = (q: number) => draft.update(item.key, { quantity: Math.min(1000, Math.max(step, Math.round(q * 100) / 100)) });
  return (
    <div className="editor" data-testid="review-editor">
      {showName && (
        <label className="grid gap-1 text-[14px] text-muted">
          Name
          <input
            className="field"
            value={item.name}
            maxLength={80}
            onChange={(e) => draft.update(item.key, { name: e.target.value })}
            data-testid="review-name-input"
          />
        </label>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] text-ink-2" id={`${id}-q`}>
          Quantity
        </span>
        <span className="stepper" role="group" aria-labelledby={`${id}-q`}>
          <button type="button" aria-label={`Less ${item.name}`} onClick={() => setQty(item.quantity - step)} disabled={item.quantity <= step} data-testid="review-qty-minus">
            −
          </button>
          <span className="min-w-16 text-center" aria-live="polite" data-testid="review-qty">
            {amountLabel(item.quantity, item.unit)}
          </span>
          <button type="button" aria-label={`More ${item.name}`} onClick={() => setQty(item.quantity + step)} data-testid="review-qty-plus">
            +
          </button>
        </span>
      </div>
      <div className="seg" role="radiogroup" aria-label={`Where ${item.name} goes`}>
        {LOCATIONS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={item.location === l}
            onClick={() => changeLocation(item, l, today)}
            data-testid={`review-loc-${l}`}
          >
            <Icon name={LOCATION_ICON[l]} className="!h-[18px] !w-[18px]" />
            {LOCATION_LABEL[l]}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 text-[15px] text-ink-2">
        Use by
        <input
          type="date"
          className="field !w-auto"
          value={item.expires_on}
          min={today}
          onChange={(e) => e.target.value && draft.update(item.key, { expires_on: e.target.value, confirmed: true })}
          data-testid="review-date-input"
        />
      </label>
      <button type="button" className="btn g sm text-today-ink" onClick={() => draft.remove(item.key)} data-testid="review-remove">
        <Icon name="i-bin" />
        Remove {item.name}
      </button>
    </div>
  );
}

function Row({ item, today, open, onToggle }: { item: DraftItem; today: string; open: boolean; onToggle: () => void }) {
  const daysLeft = daysLeftFor(item.expires_on, today);
  const total = item.expiry_range_days ? Math.max(item.expiry_range_days[1], daysLeft) : totalDaysFor(today, item.expires_on) * 1.25;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -110) draft.remove(item.key);
  };
  const approx = item.expiry_source === "printed" ? "" : "~";
  return (
    <motion.div layout exit={{ opacity: 0, x: -80, height: 0 }} className="li-sep first:shadow-none" data-testid="review-row" data-name={item.name}>
      <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.5, right: 0 }} onDragEnd={onDragEnd}>
        <button type="button" className="li" aria-expanded={open} onClick={onToggle} data-testid="review-row-toggle">
          <FreshnessRing name={item.name} daysLeft={daysLeft} totalDays={total} />
          <span className="tx">
            <b className="nm">{displayName(item.name, item.quantity, item.unit)}</b>
            <span className="ml">
              <Icon name={LOCATION_ICON[item.location]} />
              <span data-testid="review-row-loc">{LOCATION_LABEL[item.location]}</span> ·{" "}
              <span data-testid="review-row-date">
                {approx}
                {shortDate(item.expires_on)}
              </span>
              <SourceStamp source={item.expiry_source} />
            </span>
          </span>
          <DayCount daysLeft={daysLeft} />
        </button>
      </motion.div>
      {open && <Editor item={item} today={today} />}
    </motion.div>
  );
}

function CheckMe({ item, today }: { item: DraftItem; today: string }) {
  const [changing, setChanging] = useState(false);
  const daysLeft = daysLeftFor(item.expires_on, today);
  const pct = Math.round(item.confidence * 100);
  return (
    <motion.div layout exit={{ opacity: 0, height: 0 }} className="chk" data-testid="check-me" data-name={item.name}>
      <div className="flex items-center gap-3">
        <FreshnessRing name={item.name} daysLeft={daysLeft} totalDays={item.expiry_range_days?.[1] ?? 7} />
        <span className="tx">
          <b className="nm">{item.name}?</b>
          <span className="mt wrap" style={{ color: "var(--soon-ink)" }}>
            {pct}% sure.{item.category_hint ? ` Looks like ${item.category_hint}.` : ""}
          </span>
        </span>
        <span className="stamp ai">Check me</span>
      </div>
      {changing ? (
        <>
          <Editor item={item} today={today} showName />
          <button type="button" className="btn sm" onClick={() => draft.update(item.key, { confirmed: true })} data-testid="check-me-done">
            Done
          </button>
        </>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn sm flex-1" onClick={() => draft.update(item.key, { confirmed: true })} data-testid="check-me-yes">
            Yes, {item.name.toLowerCase()}
          </button>
          <button type="button" className="btn sm g flex-1" onClick={() => setChanging(true)} data-testid="check-me-change">
            Change
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Review: every capture route ends here. Nothing is saved until "Save N to Kitchen". */
export function ReviewScreen({ onSave, saving = false, error, today = todayISO(), backHref = "/" }: { onSave: (items: DraftItem[]) => void; saving?: boolean; error?: string | null; today?: string; backHref?: string }) {
  const { items, sourceLabel } = useDraft();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const unsure = items.filter(needsCheck);
  const sure = items.filter((i) => !needsCheck(i));
  const n = items.length;
  const blocked = unsure.length > 0;

  return (
    <>
      <nav className="nav" aria-label="Back">
        <Link href={backHref} data-testid="review-back">
          <Icon name="i-chl" />
          Back
        </Link>
        <span className="eyebrow">Nothing saved yet</span>
      </nav>
      <header>
        <h1 className="h-title" data-testid="review-title">
          Review {n} {n === 1 ? "item" : "items"}
        </h1>
        {sourceLabel && <p className="sub">{sourceLabel}</p>}
      </header>

      <AnimatePresence initial={false}>
        {unsure.map((i) => (
          <CheckMe key={i.key} item={i} today={today} />
        ))}
      </AnimatePresence>

      {sure.length > 0 && (
        <section className="pnl" aria-label="Items to save" data-testid="review-list">
          <AnimatePresence initial={false}>
            {sure.map((i) => (
              <Row key={i.key} item={i} today={today} open={openKey === i.key} onToggle={() => setOpenKey(openKey === i.key ? null : i.key)} />
            ))}
          </AnimatePresence>
        </section>
      )}

      {n === 0 && (
        <div className="pnl grid gap-2 px-5 py-8 text-center">
          <p className="d m-0 text-[26px]">Nothing to review</p>
          <p className="m-0 text-[15px] text-muted">Take a photo, scan a barcode, say it or search.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Add more">
        <Link className="chip" href="/capture/camera?mode=photo" data-testid="review-more-photo"><Icon name="i-cam" />Photo</Link>
        <Link className="chip" href="/capture/camera?mode=barcode" data-testid="review-more-barcode"><Icon name="i-bar" />Barcode</Link>
        <Link className="chip" href="/capture/voice" data-testid="review-more-voice"><Icon name="i-mic" />Voice</Link>
        <Link className="chip" href="/capture/search" data-testid="review-more-search"><Icon name="i-search" />Search</Link>
      </div>

      <div className="mt-auto grid gap-2 pt-2">
        {error && (
          <p className="m-0 text-[15px] text-today-ink" role="alert">
            {error}
          </p>
        )}
        {blocked && (
          <p className="m-0 text-center text-[14px] text-muted" data-testid="review-blocked">
            Check {unsure.length === 1 ? "1 item" : `${unsure.length} items`} first.
          </p>
        )}
        <button type="button" className="btn" disabled={n === 0 || blocked || saving} onClick={() => onSave(items)} data-testid="review-save">
          {saving ? "Saving…" : `Save ${n} to Kitchen`}
        </button>
      </div>
    </>
  );
}
