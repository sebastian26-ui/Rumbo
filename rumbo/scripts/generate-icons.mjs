// Generate PWA icons (PNG) at the sizes the manifest declares. Runs at
// build time and any time you want to refresh the icons locally:
//
//   npm run icons:gen
//
// Output: public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon-180}.png
//
// These are intentionally simple — solid Rumbo brand color (#0F172A) with
// no glyph — so they're guaranteed to be the right pixel dimensions
// (PWA install criteria require exact 192/512). When you have a real
// brand asset, swap them out using pwa-asset-generator against a logo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "public", "icons");
fs.mkdirSync(ICONS_DIR, { recursive: true });

// Rumbo brand: navy background, mint accent dot.
const BG = { r: 0x0f, g: 0x17, b: 0x22, a: 0xff };
const FG = { r: 0x00, g: 0xc8, b: 0x96, a: 0xff };

function writePng(name, size, options = {}) {
  const { maskablePadding = 0 } = options;
  const png = new PNG({ width: size, height: size });

  // Center-aligned circle for the brand mark. Maskable variant adds a
  // safe-zone padding so it doesn't get clipped by Android's icon mask.
  const safeRadius = Math.floor((size / 2) * (1 - maskablePadding * 0.2));
  const innerRadius = Math.floor(safeRadius * 0.35);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - cx;
      const dy = y - cy;
      const inMark = dx * dx + dy * dy < innerRadius * innerRadius;
      const c = inMark ? FG : BG;
      png.data[idx] = c.r;
      png.data[idx + 1] = c.g;
      png.data[idx + 2] = c.b;
      png.data[idx + 3] = c.a;
    }
  }

  const out = path.join(ICONS_DIR, name);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(out, buf);
  console.log(`  wrote ${name} (${size}x${size}, ${buf.length} bytes)`);
}

console.log(`Generating PWA icons in ${ICONS_DIR}`);
writePng("icon-192.png", 192);
writePng("icon-512.png", 512);
writePng("icon-512-maskable.png", 512, { maskablePadding: 1 });
writePng("apple-touch-icon-180.png", 180);
console.log("Done.");
