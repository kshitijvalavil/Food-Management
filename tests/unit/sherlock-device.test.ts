// Sherlock Bugs: edge cases for the phone-only gate (lib/device.ts).
import { describe, expect, it } from "vitest";
import { classifyUserAgent, isIOSSafari, isIPadOSDesktopUA, shouldBlockClient, shouldRedirectUA } from "@/lib/device";

const UA = {
  iPadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  pixelFold: "Mozilla/5.0 (Linux; Android 14; Pixel Fold) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  operaMini: "Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54",
  kindle: "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0.0.0 Safari/537.36",
  galaxyTab: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  googlebotSmartphone: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  winPhone: "Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.14977",
  iPhoneGoogleApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/340.0.682986389 Mobile/15E148 Safari/604.1",
};

describe("classifyUserAgent / shouldRedirectUA edge cases", () => {
  it("never redirects phones, including Windows Phone (which also says Android) and Opera Mini", () => {
    for (const ua of [UA.iPhone, UA.pixel, UA.pixelFold, UA.operaMini, UA.winPhone, UA.iPhoneGoogleApp]) {
      expect(shouldRedirectUA(ua), ua).toBe(false);
    }
  });

  it("redirects tablets: Galaxy Tab (Android without Mobile) and Kindle Silk", () => {
    expect(classifyUserAgent(UA.galaxyTab)).toBe("tablet");
    expect(classifyUserAgent(UA.kindle)).toBe("tablet");
    expect(shouldRedirectUA(UA.kindle)).toBe(true);
  });

  it("lets search bots through on the server", () => {
    expect(shouldRedirectUA(UA.googlebotSmartphone)).toBe(false);
  });

  it("treats null, empty and garbage user agents as not-a-redirect", () => {
    expect(shouldRedirectUA(null)).toBe(false);
    expect(shouldRedirectUA("")).toBe(false);
    expect(shouldRedirectUA("x".repeat(10_000))).toBe(false);
  });

  it("isIOSSafari excludes the Google app", () => {
    expect(isIOSSafari(UA.iPhone)).toBe(true);
    expect(isIOSSafari(UA.iPhoneGoogleApp)).toBe(false);
  });
});

describe("shouldBlockClient edge cases", () => {
  const phone = { userAgent: UA.iPhone, platform: "iPhone", maxTouchPoints: 5 };

  it("allows 320px and 430px phones in both orientations", () => {
    for (const [w, h] of [[320, 568], [568, 320], [430, 932], [932, 430]] as const) {
      expect(shouldBlockClient({ ...phone, innerWidth: w, innerHeight: h }), `${w}x${h}`).toBe(false);
    }
  });

  it("blocks iPadOS (Mac UA + touch) even in a small Split View window", () => {
    expect(isIPadOSDesktopUA({ userAgent: UA.iPadOS, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(shouldBlockClient({ userAgent: UA.iPadOS, platform: "MacIntel", maxTouchPoints: 5, innerWidth: 320, innerHeight: 1000 })).toBe(true);
  });

  it("does not treat a touch-less Mac as an iPad", () => {
    expect(isIPadOSDesktopUA({ userAgent: UA.iPadOS, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("blocks iPad mini (744 short side)", () => {
    expect(shouldBlockClient({ userAgent: "x", innerWidth: 744, innerHeight: 1133, maxTouchPoints: 5 })).toBe(true);
  });

  // FINDING (low, product decision): an unfolded foldable phone (Pixel Fold ~ 841x701, Galaxy Z Fold ~ 884x1104)
  // has a phone UA but a short side over 600 px, so the client gate sends it to the QR page.
  it("documents that an unfolded Pixel Fold is blocked by the client gate", () => {
    expect(shouldBlockClient({ userAgent: UA.pixelFold, innerWidth: 841, innerHeight: 701, maxTouchPoints: 5 })).toBe(true);
  });
});
