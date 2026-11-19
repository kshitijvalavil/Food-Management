"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FORCE_PHONE_COOKIE, OPEN_ON_PHONE_PATH, shouldBlockClient } from "@/lib/device";

/**
 * Client fallback for the phone-only rule. The middleware catches obvious desktop and iPad user
 * agents; this catches iPadOS (which reports a Mac UA) and large screens.
 */
export function PhoneGate() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname === OPEN_ON_PHONE_PATH) return;
    if (document.cookie.split("; ").includes(`${FORCE_PHONE_COOKIE}=1`)) return;
    const blocked = shouldBlockClient({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    if (blocked) router.replace(OPEN_ON_PHONE_PATH);
  }, [pathname, router]);
  return null;
}
