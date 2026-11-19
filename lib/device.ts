// Phone-only gate. Server side (middleware) only sees the user agent; the client check also
// sees the screen and touch support, which is how iPadOS (which reports a Mac UA) is caught.

export const OPEN_ON_PHONE_PATH = "/open-on-phone";
/** Cookie that lets a developer use a laptop anyway: visit /?phone=1 once. */
export const FORCE_PHONE_COOKIE = "sl_force_phone";

const PHONE_UA = /iPhone|iPod|Android.+Mobile|Mobile.+Android|Windows Phone|Opera Mini|IEMobile|Mobile Safari/i;
const TABLET_UA = /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i;
const DESKTOP_UA = /Windows NT|Macintosh|Mac OS X|X11|Linux x86_64|CrOS/i;
const BOT_UA = /bot|crawler|spider|Chrome-Lighthouse|facebookexternalhit|Slackbot|WhatsApp|TelegramBot/i;

export type UAKind = "phone" | "tablet" | "desktop" | "unknown";

export function classifyUserAgent(ua: string | null | undefined): UAKind {
  if (!ua) return "unknown";
  if (/iPhone|iPod/i.test(ua)) return "phone";
  if (TABLET_UA.test(ua)) return "tablet";
  if (PHONE_UA.test(ua)) return "phone";
  if (DESKTOP_UA.test(ua)) return "desktop";
  return "unknown";
}

/** Middleware decision: only send away user agents that are obviously not phones. */
export function shouldRedirectUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (BOT_UA.test(ua)) return false; // link previews and audits get the real page
  const kind = classifyUserAgent(ua);
  return kind === "desktop" || kind === "tablet";
}

export interface ClientEnv {
  innerWidth: number;
  innerHeight: number;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** iPadOS 13+ Safari claims to be a Mac; real Macs have no touch points. */
export function isIPadOSDesktopUA(env: Pick<ClientEnv, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  const macLike = /Macintosh/i.test(env.userAgent) || env.platform === "MacIntel";
  return macLike && (env.maxTouchPoints ?? 0) > 1;
}

/** Client fallback: a screen whose short side is over 600 CSS px is not a phone. */
export function shouldBlockClient(env: ClientEnv): boolean {
  if (Math.min(env.innerWidth, env.innerHeight) > 600) return true;
  if (isIPadOSDesktopUA(env)) return true;
  return false;
}

export function isIOSSafari(ua: string): boolean {
  return /iPhone|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua);
}
