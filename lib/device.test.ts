import { describe, expect, it } from "vitest";
import { classifyUserAgent, isIOSSafari, shouldBlockClient, shouldRedirectUA } from "./device";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  lighthouseDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Chrome-Lighthouse",
};

describe("middleware user-agent gate", () => {
  it("lets phones through", () => {
    expect(classifyUserAgent(UA.iphone)).toBe("phone");
    expect(classifyUserAgent(UA.pixel)).toBe("phone");
    expect(shouldRedirectUA(UA.iphone)).toBe(false);
    expect(shouldRedirectUA(UA.iphoneChrome)).toBe(false);
    expect(shouldRedirectUA(UA.pixel)).toBe(false);
  });

  it("sends laptops, desktops and tablets to /open-on-phone", () => {
    expect(shouldRedirectUA(UA.mac)).toBe(true);
    expect(shouldRedirectUA(UA.windows)).toBe(true);
    expect(shouldRedirectUA(UA.linux)).toBe(true);
    expect(shouldRedirectUA(UA.ipadOld)).toBe(true);
    expect(classifyUserAgent(UA.androidTablet)).toBe("tablet");
    expect(shouldRedirectUA(UA.androidTablet)).toBe(true);
  });

  it("does not redirect unknown agents or audit bots", () => {
    expect(shouldRedirectUA(null)).toBe(false);
    expect(shouldRedirectUA("curl/8.0")).toBe(false);
    expect(shouldRedirectUA(UA.lighthouseDesktop)).toBe(false);
  });
});

describe("client gate", () => {
  const phone = { innerWidth: 393, innerHeight: 852, userAgent: UA.iphone, platform: "iPhone", maxTouchPoints: 5 };

  it("allows a phone in portrait and landscape", () => {
    expect(shouldBlockClient(phone)).toBe(false);
    expect(shouldBlockClient({ ...phone, innerWidth: 852, innerHeight: 393 })).toBe(false);
  });

  it("blocks a big screen even with a phone user agent", () => {
    expect(shouldBlockClient({ ...phone, innerWidth: 1280, innerHeight: 800 })).toBe(true);
    expect(shouldBlockClient({ ...phone, innerWidth: 601, innerHeight: 900 })).toBe(true);
  });

  it("catches iPadOS pretending to be a Mac", () => {
    expect(shouldBlockClient({ innerWidth: 500, innerHeight: 500, userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    // a real Mac has no touch points; the size check handles it
    expect(shouldBlockClient({ innerWidth: 500, innerHeight: 500, userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });
});

describe("iPhone Safari detection (Add to Home Screen hint)", () => {
  it("is only Safari on iPhone", () => {
    expect(isIOSSafari(UA.iphone)).toBe(true);
    expect(isIOSSafari(UA.iphoneChrome)).toBe(false);
    expect(isIOSSafari(UA.pixel)).toBe(false);
  });
});
