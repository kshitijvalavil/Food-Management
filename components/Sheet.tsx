"use client";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, useId, useRef } from "react";

/** Bottom sheet: scrim, grab handle, drag down or Escape to close, focus moves in and back out. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
  bottomOffset = 0,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testId?: string;
  /** Leave the tab bar visible under the sheet (mockup 1.1). */
  bottomOffset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = setTimeout(() => ref.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            style={{ bottom: bottomOffset }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="sheet outline-none"
            style={{ bottom: bottomOffset, paddingBottom: bottomOffset ? 16 : undefined }}
            data-testid={testId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <i className="grab" aria-hidden="true" />
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
