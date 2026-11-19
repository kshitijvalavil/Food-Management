import { headers } from "next/headers";
import QRCode from "qrcode";
import { AppMark } from "@/components/Icon";

export const metadata = { title: "Open on your phone" };
export const dynamic = "force-dynamic";

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Laptops and iPads land here: one line, a QR code of this site, and the URL as text. */
export default async function OpenOnPhone() {
  const origin = await currentOrigin();
  // Generated on the server as inline SVG: no third-party image service sees the URL.
  const svg = await QRCode.toString(origin, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#15172b", light: "#ffffff" } });
  return (
    <main className="mx-auto grid min-h-dvh max-w-[560px] content-center justify-items-center gap-7 px-6 py-10 text-center">
      <div className="flex items-center gap-4">
        <AppMark size={64} />
        <span className="d text-[64px]">ShelfLife</span>
      </div>
      <h1 className="m-0 max-w-[24ch] text-[22px] font-medium leading-snug">ShelfLife is made for phones. Scan this with your phone&apos;s camera to open it.</h1>
      <div
        className="w-[240px] rounded-[24px] bg-white p-4 shadow-[0_20px_40px_-24px_var(--shadow)]"
        role="img"
        aria-label={`QR code for ${origin}`}
        data-testid="open-on-phone-qr"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="m-0 select-all rounded-xl bg-surf px-4 py-3 font-mono text-[15px]" data-testid="open-on-phone-url">
        {origin}
      </p>
    </main>
  );
}
