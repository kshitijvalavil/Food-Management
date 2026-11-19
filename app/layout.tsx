import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Sprite } from "@/components/Icon";
import { Providers } from "@/components/Providers";
import { PhoneGate } from "@/components/PhoneGate";
import { InstallHint } from "@/components/InstallHint";

// Archivo needs its width axis: every display heading is set at font-stretch 72%.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ShelfLife", template: "%s · ShelfLife" },
  description: "Know what's in your fridge, freezer and pantry, and hear about it a day before it turns.",
  applicationName: "ShelfLife",
  appleWebApp: { capable: true, title: "ShelfLife", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeefea" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1015" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${instrument.variable} ${plex.variable}`}>
      <body>
        <Sprite />
        <Providers>
          <PhoneGate />
          {children}
          <InstallHint />
        </Providers>
      </body>
    </html>
  );
}
