// Generates the PWA / home-screen icons from an inline SVG.
// Run: node scripts/gen-icons.mjs   (sharp rasterizes SVG → PNG)
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const INK = "#0A0B09";   // VOLT page black
const LIME = "#C8F542";  // VOLT electric-lime accent (rgb 200 245 66)

// 512×512. A leaning running pictogram in lime + "26.2", kept inside the
// maskable safe zone (~80% center) so Android's circle/squircle crop is clean.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  <g fill="none" stroke="${LIME}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
    <!-- back leg (drive back) -->
    <polyline points="232,250 188,296 150,318"/>
    <!-- front leg (knee up) -->
    <polyline points="236,248 298,250 288,302"/>
    <!-- torso -->
    <polyline points="276,150 232,250"/>
    <!-- back arm -->
    <polyline points="266,170 214,196 238,228"/>
    <!-- front arm -->
    <polyline points="270,162 318,172 300,206"/>
  </g>
  <!-- head -->
  <circle cx="296" cy="118" r="28" fill="${LIME}"/>
  <!-- distance -->
  <text x="256" y="446" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
        font-size="116" font-weight="800" letter-spacing="-3" fill="${LIME}">26.2</text>
</svg>`;

const sizes = [
  { px: 512, out: "public/icon-512.png" },
  { px: 192, out: "public/icon-192.png" },
  { px: 180, out: "public/apple-touch-icon.png" }
];

for (const { px, out } of sizes) {
  const buf = await sharp(Buffer.from(svg)).resize(px, px).png().toBuffer();
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${px}×${px})`);
}
