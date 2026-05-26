// Generate PWA icons (PNG) at the sizes the manifest declares. Runs at
// build time and any time you want to refresh the icons locally:
//
//   npm run icons:gen
//
// Output: public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon-180}.png

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "public", "icons");
const LOGO_PATH = path.join(ROOT, "public", "logo.png");

fs.mkdirSync(ICONS_DIR, { recursive: true });

function generateIcons() {
  if (!fs.existsSync(LOGO_PATH)) {
    console.warn(`logo.png not found at ${LOGO_PATH}. Skipping icon generation.`);
    return;
  }

  console.log(`Reading source logo from ${LOGO_PATH}...`);
  const srcData = fs.readFileSync(LOGO_PATH);
  const srcPng = PNG.sync.read(srcData);
  const srcWidth = srcPng.width;
  const srcHeight = srcPng.height;

  function resizeAndWrite(name, targetSize) {
    const dstPng = new PNG({ width: targetSize, height: targetSize });
    
    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        // Simple nearest-neighbor pixel sampling
        const sx = Math.floor((x / targetSize) * srcWidth);
        const sy = Math.floor((y / targetSize) * srcHeight);
        const srcIdx = (srcWidth * sy + sx) << 2;
        const dstIdx = (targetSize * y + x) << 2;
        
        dstPng.data[dstIdx] = srcPng.data[srcIdx];
        dstPng.data[dstIdx + 1] = srcPng.data[srcIdx + 1];
        dstPng.data[dstIdx + 2] = srcPng.data[srcIdx + 2];
        dstPng.data[dstIdx + 3] = srcPng.data[srcIdx + 3];
      }
    }
    
    const out = path.join(ICONS_DIR, name);
    const buf = PNG.sync.write(dstPng);
    fs.writeFileSync(out, buf);
    console.log(`  wrote ${name} (${targetSize}x${targetSize}, ${buf.length} bytes)`);
  }

  console.log(`Generating PWA icons in ${ICONS_DIR}`);
  resizeAndWrite("icon-192.png", 192);
  resizeAndWrite("icon-512.png", 512);
  resizeAndWrite("icon-512-maskable.png", 512);
  resizeAndWrite("apple-touch-icon-180.png", 180);
  console.log("Done.");
}

generateIcons();
