/**
 * Makes the paper around each guinea pig scene see-through, so a scene sits on whatever is behind
 * it (a dark page, a coloured card) with no pale box round it.
 *
 * Run from the project root after adding or replacing a scene:
 *   node art/clear-background.mjs
 *
 * How: the paper is whatever colour the top-left corner is. Starting from every edge, it spreads
 * through pixels of that colour and clears them, so paper-coloured fur inside an outline is left
 * alone. Pixels on the boundary are a blend of paper and ink; they are given part transparency and
 * their paper tint is taken out, so no pale fringe is left on a dark page.
 * A scene that already has a clear corner is skipped, so running it twice does nothing.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DIR = "public/art/scenes";
/** How far from the paper colour still counts as paper (0–441). */
const PAPER = 16;
/** A boundary pixel this far from the paper colour is fully ink. */
const INK = 90;

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".webp"))) {
  const path = join(DIR, file);
  const { data, info } = await sharp(readFileSync(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (data[3] === 0) {
    console.log(`${file}: already clear`);
    continue;
  }
  const paper = [data[0], data[1], data[2]];
  const dist = (i) => Math.hypot(data[i] - paper[0], data[i + 1] - paper[1], data[i + 2] - paper[2]);

  // Spread from the edges through paper-coloured pixels.
  const cleared = new Uint8Array(w * h);
  const queue = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (cleared[p] || dist(p * 4) > PAPER) return;
    cleared[p] = 1;
    queue.push(p);
  };
  for (let x = 0; x < w; x++) visit(x, 0), visit(x, h - 1);
  for (let y = 0; y < h; y++) visit(0, y), visit(w - 1, y);
  while (queue.length) {
    const p = queue.pop();
    const x = p % w;
    const y = (p - x) / w;
    visit(x + 1, y), visit(x - 1, y), visit(x, y + 1), visit(x, y - 1);
  }

  // Two rings of boundary pixels: part-clear, with the paper taken out of their colour.
  let ring = cleared;
  for (let pass = 0; pass < 2; pass++) {
    const next = Uint8Array.from(ring);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (ring[p]) continue;
        const beside = (x > 0 && ring[p - 1]) || (x < w - 1 && ring[p + 1]) || (y > 0 && ring[p - w]) || (y < h - 1 && ring[p + w]);
        if (!beside) continue;
        const i = p * 4;
        const a = Math.min(1, dist(i) / INK);
        if (a >= 1) continue;
        next[p] = 1;
        for (let c = 0; c < 3; c++) data[i + c] = a > 0 ? Math.max(0, Math.min(255, Math.round((data[i + c] - paper[c] * (1 - a)) / a))) : 0;
        data[i + 3] = Math.round(a * 255);
      }
    }
    ring = next;
  }
  let n = 0;
  for (let p = 0; p < w * h; p++) {
    if (cleared[p]) {
      data[p * 4 + 3] = 0;
      n++;
    }
  }
  writeFileSync(path, await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
  console.log(`${file}: cleared ${Math.round((n / (w * h)) * 100)}% of the picture`);
}
