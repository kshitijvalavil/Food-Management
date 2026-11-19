"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { isIOSSafari } from "@/lib/device";

export const A2HS_DISMISSED_KEY = "shelflife.a2hs.dismissed";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** iPhone Safari has no install prompt, so explain Add to Home Screen (needed for Web Push on iOS). */
export function InstallHint() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/capture") || pathname === "/open-on-phone" || pathname === "/login") return;
    if (!isIOSSafari(navigator.userAgent) || isStandalone()) return;
    try {
      if (localStorage.getItem(A2HS_DISMISSED_KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(A2HS_DISMISSED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <Sheet open={open} onClose={close} title="Add ShelfLife to your Home Screen" testId="a2hs-sheet">
      <div>
        <p className="h-title" aria-hidden="true">
          Put ShelfLife on your Home Screen
        </p>
        <p className="sub">It opens full screen, and on iPhone it&apos;s the only way to get expiry alerts.</p>
      </div>
      <ol className="pnl m-0 list-none">
        <li className="li">
          <span className="oi" aria-hidden="true">
            <Icon name="i-share" />
          </span>
          <span className="tx">
            <b className="nm">Tap Share</b>
            <span className="mt">In Safari&apos;s toolbar</span>
          </span>
        </li>
        <li className="li">
          <span className="oi" aria-hidden="true">
            <Icon name="i-plus" />
          </span>
          <span className="tx">
            <b className="nm">Choose Add to Home Screen</b>
            <span className="mt">Scroll down the share sheet if you don&apos;t see it</span>
          </span>
        </li>
        <li className="li">
          <span className="oi" aria-hidden="true">
            <Icon name="i-home" />
          </span>
          <span className="tx">
            <b className="nm">Open ShelfLife from there</b>
            <span className="mt">Alerts need iOS 16.4 or later</span>
          </span>
        </li>
      </ol>
      <button type="button" className="btn" onClick={close} data-testid="a2hs-dismiss">
        Got it
      </button>
    </Sheet>
  );
}
