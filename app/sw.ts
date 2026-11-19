/// <reference lib="webworker" />
// ShelfLife service worker (Serwist). Precaches the app shell, caches GETs at runtime, and
// handles Web Push. The push sender ships in Sprint 2; the handlers are wired now.
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache Supabase (auth, data, edge functions): always live, and never other users' data.
    { matcher: ({ url }) => url.hostname.endsWith(".supabase.co"), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// ---------- Web Push ----------
/** Payload the Sprint 2 sender will use. Anything unexpected falls back to a plain alert. */
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  itemId?: string;
  kind?: "expiry" | "low" | "digest";
  actions?: Array<{ action: string; title: string }>;
}

const DEFAULT_ACTIONS: Record<NonNullable<PushPayload["kind"]>, Array<{ action: string; title: string }>> = {
  expiry: [
    { action: "cook", title: "Cook it" },
    { action: "used", title: "Mark used" },
  ],
  low: [
    { action: "list", title: "Add to list" },
    { action: "dismiss", title: "I have more" },
  ],
  digest: [],
};

function parsePayload(event: PushEvent): PushPayload {
  try {
    const data = event.data?.json() as unknown;
    return data && typeof data === "object" ? (data as PushPayload) : {};
  } catch {
    return { body: event.data?.text() };
  }
}

/** Only same-origin paths may be opened from a notification. */
function safePath(url: string | undefined): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return "/";
  return url;
}

self.addEventListener("push", (event) => {
  const p = parsePayload(event);
  const kind = p.kind ?? "digest";
  const options: NotificationOptions & { actions?: Array<{ action: string; title: string }> } = {
    body: p.body ?? "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: p.tag ?? (p.itemId ? `item-${p.itemId}` : kind),
    data: { url: safePath(p.url), itemId: p.itemId ?? null, kind },
    actions: (p.actions ?? DEFAULT_ACTIONS[kind]).slice(0, 2),
  };
  event.waitUntil(self.registration.showNotification(p.title ?? "ShelfLife", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string; itemId?: string | null; kind?: string };
  let target = safePath(data.url);
  if (event.action === "cook") target = "/cook";
  else if (event.action === "used" && data.itemId) target = `/item/${encodeURIComponent(data.itemId)}?action=used`;
  else if (event.action === "list") target = "/shopping";
  else if (event.action === "dismiss") return;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await (client as WindowClient).navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
