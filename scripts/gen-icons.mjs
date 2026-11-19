// Renders the ShelfLife logo (mockup #logo symbol) to the PWA icons in public/icons.
// Run with `npm run icons` after changing the logo; the PNGs are committed.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const ring = (dashoffset, color) =>
  `<circle cx="16" cy="16" r="11" fill="none" stroke="${color}" stroke-width="3.4" stroke-dasharray="14 55.1" stroke-dashoffset="${dashoffset}"/>`;

/** The logo on the indigo tile. `pad` shrinks the mark for maskable safe zones. */
function svg(size, { radius = 0.24, pad = 0.14 } = {}) {
  const inner = size * (1 - pad * 2);
  const s = inner / 32;
  const o = size * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="#2E31A0"/>
  <g transform="translate(${o} ${o}) scale(${s})">
    <g transform="rotate(-90 16 16)">
      ${ring(0, "#3D8B3F")}${ring(-17.3, "#D99A06")}${ring(-34.6, "#DD4527")}${ring(-51.9, "#7C5569")}
    </g>
    <path d="M11 21.5c0-6.3 4-10.5 10.5-10.5 0 6.3-4 10.5-10.5 10.5z" fill="#FFFFFF"/>
    <path d="M11.5 21 17 15.5" fill="none" stroke="#2E31A0" stroke-width="1.4" stroke-linecap="round"/>
  </g>
</svg>`;
}

const out = new URL("../public/icons/", import.meta.url);
await mkdir(out, { recursive: true });

const jobs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  // Maskable: full-bleed square, mark inside the 80% safe zone.
  ["icon-maskable-512.png", 512, { radius: 0, pad: 0.22 }],
  // iOS rounds the corners itself.
  ["apple-touch-icon.png", 180, { radius: 0, pad: 0.16 }],
];

for (const [name, size, opts] of jobs) {
  const png = await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(name, out), png);
  console.log(`public/icons/${name} ${size}px ${png.length} bytes`);
}
await writeFile(new URL("logo.svg", out), svg(512));
