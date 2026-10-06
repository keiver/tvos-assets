jest.setTimeout(120000);

import sharp from "sharp";
import { rowFrames } from "../../src/utils/row-frames";
import type { RowMotion } from "../../src/utils/row-frames";
import { animateAt, parseRowArtwork, renderRows } from "../../src/utils/svg-rows";
import { ROW_SVG } from "../fixtures/row-artwork";

// A 5 s loop moving rows 100 px (one pitch), with the riders' crossfade over the last 0.5 s.
const shift = (k: number) => (k % 2 === 0 ? -1 : 1) * 100;
const motion = (t: number): RowMotion => ({
  offsets: (k) => shift(k) * (t / 5),
  seam: t > 4.5 ? { weight: (t - 4.5) / 0.5, shift } : undefined,
});

async function full(svg: string, width: number, height: number, centre: { x: number; y: number }, t: number): Promise<Buffer> {
  const art = parseRowArtwork(svg);
  const m = motion(t);
  const frame = renderRows({ ...art, source: animateAt(art.source, t) }, width, height, m.offsets, centre, "cards", m.seam);
  return sharp(Buffer.from(frame)).flatten({ background: "#000" }).removeAlpha().raw().toBuffer();
}

function meanDiff(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

// Cards filled with a scan-line pattern, and a blinking dot riding the middle card.
const STRIPED = ROW_SVG
  .replace(/fill="white"\/>/g, 'fill="url(#scan)"/>')
  .replace("<defs>", '<defs><pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="white"/><rect width="6" height="2" fill="#B0B0B0"/></pattern>')
  .replace("</g>\n<defs>", '<circle cx="215" cy="92" r="5" fill="#00FF00"><animate attributeName="opacity" values="1;1;0.1;1" keyTimes="0;0.5;0.6;1" dur="1s" repeatCount="indefinite"/></circle></g>\n<defs>');

describe("rowFrames", () => {
  it.each([
    ["plain cards on their own canvas", ROW_SVG, 400, 200, { x: 200, y: 100 }],
    ["striped cards, a blinking rider, an off-centre bigger canvas", STRIPED, 521, 303, { x: 233.5, y: 160.25 }],
  ])("blends frames that match a full render: %s", async (_name, svg, width, height, centre) => {
    const frames = await rowFrames(parseRowArtwork(svg), width, height, centre, motion, [1.3, 4.8]);
    expect(frames.fast).toBe(true);
    for (const t of [0, 0.55, 1.3, 2.71, 4.6, 4.99]) {
      expect(meanDiff(await frames.frame(t), await full(svg, width, height, centre, t))).toBeLessThan(0.5);
    }
  });

  it("falls back to full renders when the rows overlap", async () => {
    // Rows 80 apart: cards 75 tall leave no room between the rows' strips.
    const art = parseRowArtwork(ROW_SVG);
    const crowded = { ...art, card: { ...art.card, height: 75 } };
    const frames = await rowFrames(crowded, 400, 200, { x: 200, y: 100 }, motion);
    expect(frames.fast).toBe(false);
    expect(meanDiff(await frames.frame(1.3), await full(ROW_SVG, 400, 200, { x: 200, y: 100 }, 1.3))).toBe(0);
  });
});
