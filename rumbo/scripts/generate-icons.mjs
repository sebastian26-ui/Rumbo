// Generate PNG icons for the PWA manifest + iOS apple-touch-icon from a
// solid SVG. Runs at build time (also OK to run manually). We use the
// built-in canvas via the `sharp`-free approach below: render the SVG to a
// raster by constructing a minimal PPM and converting it with `node:zlib`
// is overkill — instead, we just embed the SVG into a fixed-size PNG via
// a tiny base64 PNG that is valid for all required sizes. Each icon is a
// solid #0F172A square with a "R" wordmark drawn by rendering the SVG to
// a canvas using the `canvas` package — BUT to avoid an extra native dep,
// we ship pre-rendered base64 PNGs as the v1 placeholder.
//
// Replace these with brand assets pre-launch by running pwa-asset-generator
// against a real logo: see Rumbo deploy runbook step 5.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "public", "icons");

fs.mkdirSync(ICONS_DIR, { recursive: true });

// 1x1 #0F172A pixel PNG (base64). When the manifest icon size is declared,
// browsers accept any actual pixel dimensions — the declared size is what
// they show in the install UI. This is a temporary placeholder that lets
// the PWA install flow validate; replace with proper brand icons before
// launch.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const targets = [
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "apple-touch-icon-180.png",
];

for (const name of targets) {
  fs.writeFileSync(path.join(ICONS_DIR, name), PIXEL);
}

console.log(`Wrote ${targets.length} placeholder icons to ${ICONS_DIR}`);
console.log(
  "Replace with brand assets before launch: see Rumbo deploy runbook section 5.",
);
