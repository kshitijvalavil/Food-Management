import { NextResponse, type NextRequest } from "next/server";
import { FORCE_PHONE_COOKIE, OPEN_ON_PHONE_PATH, shouldRedirectUA } from "@/lib/device";

/** Phone-only: obvious desktop and iPad user agents go to the QR handoff page. */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Developer escape hatch: /?phone=1 once sets a cookie and keeps the laptop on the app.
  if (searchParams.get("phone") === "1") {
    const url = req.nextUrl.clone();
    url.searchParams.delete("phone");
    const res = NextResponse.redirect(url);
    res.cookies.set(FORCE_PHONE_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    return res;
  }
  if (pathname === OPEN_ON_PHONE_PATH) return NextResponse.next();
  if (req.cookies.get(FORCE_PHONE_COOKIE)?.value === "1") return NextResponse.next();

  if (shouldRedirectUA(req.headers.get("user-agent"))) {
    const url = req.nextUrl.clone();
    url.pathname = OPEN_ON_PHONE_PATH;
    url.search = "";
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: skip Next internals, the service worker, the manifest, icons and API/auth routes.
  matcher: ["/((?!_next/|api/|auth/|sw.js|swe-worker|manifest.webmanifest|icons/|favicon|robots.txt|offline).*)"],
};
