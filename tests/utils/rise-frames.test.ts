jest.setTimeout(120000);

import sharp from "sharp";
import { riseFrames, riseHeight, risePhase, riseTiming, rowStill } from "../../src/utils/rise-frames";
import { parseRowArtwork, renderRows } from "../../src/utils/svg-rows";
import { RAISED_SVG, ROW_SVG } from "../fixtures/row-artwork";

const CENTRE = { x: 200, y: 100 };

function meanDiff(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

const pixel = (frame: Buffer, x: number, y: number, width = 400): number[] => [...frame.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];

describe("riseTiming", () => {
  it("gives every card a whole number of appearances per loop", () => {
    expect(riseTiming(20)).toEqual({ period: 10, life: 4.4 });
    expect(riseTiming(30)).toEqual({ period: 10, life: 4.4 });
    expect(riseTiming(15).period).toBe(7.5);
    expect(riseTiming(15).life).toBeCloseTo(3.3, 9);
    expect(riseTiming(5)).toEqual({ period: 5, life: 2.2 });
  });
});

describe("riseHeight", () => {
  it("is flat at both ends, fully up in the middle, and the same on the way down", () => {
    expect(riseHeight(0, 4.4)).toBe(0);
    expect(riseHeight(4.4, 4.4)).toBe(0);
    expect(riseHeight(-1, 4.4)).toBe(0);
    expect(riseHeight(9, 4.4)).toBe(0);
    expect(riseHeight(2.2, 4.4)).toBeCloseTo(1, 9);
    expect(riseHeight(1.3, 4.4)).toBeCloseTo(riseHeight(3.1, 4.4), 9);
  });

  it("holds a faint relief before the rise, and only ever climbs on the way up", () => {
    expect(riseHeight(0.9, 4.4)).toBeCloseTo(0.2, 2);
    let last = 0;
    for (let t = 0; t <= 2.2; t += 0.05) {
      const h = riseHeight(t, 4.4);
      expect(h).toBeGreaterThanOrEqual(last);
      last = h;
    }
  });
});

describe("risePhase", () => {
  it("starts each card inside the period, neighbours well apart", () => {
    for (let k = -2; k < 4; k++) {
      for (let n = -2; n < 6; n++) {
        const p = risePhase(n, k, 10);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(10);
        // Apart around the loop: the next card in the row, and the one below.
        for (const other of [risePhase(n + 1, k, 10), risePhase(n, k + 1, 10)]) {
          const gap = Math.abs(p - other);
          expect(Math.min(gap, 10 - gap)).toBeGreaterThan(2);
        }
      }
    }
  });
});

describe("rowStill", () => {
  it("draws filtered art as part of a bigger wall, with no edge of its own at the canvas", async () => {
    const art = parseRowArtwork(RAISED_SVG);
    const still = await rowStill(art, 400, 200, CENTRE).raw().toBuffer();
    const wall = await sharp(Buffer.from(renderRows(art, 480, 280, undefined, { x: 240, y: 140 })))
      .extract({ left: 40, top: 40, width: 400, height: 200 }).flatten({ background: "#000" }).removeAlpha().raw().toBuffer();
    expect(meanDiff(still, wall)).toBeLessThan(0.005);
    // Drawn at the canvas size, the shadows at its edges come out differently.
    const cropped = await sharp(Buffer.from(renderRows(art, 400, 200))).flatten({ background: "#000" }).removeAlpha().raw().toBuffer();
    expect(meanDiff(cropped, wall)).toBeGreaterThan(0.03);
  });

  it("draws art without filters exactly as the canvas-sized render does", async () => {
    const art = parseRowArtwork(ROW_SVG);
    const plain = await sharp(Buffer.from(renderRows(art, 400, 200))).flatten({ background: "#000" }).removeAlpha().raw().toBuffer();
    expect((await rowStill(art, 400, 200, CENTRE).raw().toBuffer()).equals(plain)).toBe(true);
  });
});

describe("riseFrames", () => {
  // The card under the red mark: row 1 (y 100), its third card (x 200).
  const start = risePhase(2, 1, 5), { life } = riseTiming(5);

  it("lifts a card out of the bare surface, with what rides it, and back", async () => {
    const art = parseRowArtwork(RAISED_SVG);
    const frames = await riseFrames(art, 400, 200, CENTRE, 5);
    const still = await rowStill(art, 400, 200, CENTRE).raw().toBuffer();

    const flat = await frames.frame(start);
    expect(pixel(flat, 200, 100)).toEqual([0, 0, 0]); // no card, no mark
    expect(pixel(flat, 180, 100)).toEqual([0, 0, 0]);

    const up = await frames.frame(start + life / 2);
    for (const [x, y] of [[200, 100], [180, 100], [233, 123], [165, 100]]) {
      // The mark, the gold face, the shadow below and right, the gap to the left: as in the still.
      for (let c = 0; c < 3; c++) expect(Math.abs(pixel(up, x, y)[c] - pixel(still, x, y)[c])).toBeLessThanOrEqual(2);
    }
    expect(pixel(up, 200, 100)[0]).toBeGreaterThan(200);
    expect(pixel(up, 200, 100)[1]).toBeLessThan(60);

    const half = await frames.frame(start + life * 0.36);
    const gold = pixel(half, 180, 100)[0];
    expect(gold).toBeGreaterThan(40); // on its way
    expect(gold).toBeLessThan(pixel(up, 180, 100)[0]);
  });

  it("casts a shorter shadow from a card part of the way up", async () => {
    const art = parseRowArtwork(RAISED_SVG);
    const frames = await riseFrames(art, 400, 200, CENTRE, 5);
    // 4 px right of the card's edge at x 230: inside the full shadow (offset 5), outside the low one.
    const up = pixel(await frames.frame(start + life / 2), 234, 104)[0];
    const low = pixel(await frames.frame(start + life * 0.15), 234, 104)[0];
    expect(up).toBeGreaterThan(60);
    expect(low).toBeLessThan(10);
  });

  it("loops: a frame one loop later is the same frame", async () => {
    const frames = await riseFrames(parseRowArtwork(RAISED_SVG), 521, 303, { x: 233.5, y: 160.25 }, 5);
    for (const t of [0, 0.4, 2.71]) expect((await frames.frame(t)).equals(await frames.frame(t + 5))).toBe(true);
  });

  it("refuses art drawn through the mask by more than one element, and <animate>", async () => {
    const twice = ROW_SVG.replace("</g>\n<defs>", '<rect width="400" height="200" fill="#FFFFFF" opacity="0.1" mask="url(#m)"/></g>\n<defs>');
    await expect(riseFrames(parseRowArtwork(twice), 400, 200, CENTRE, 5)).rejects.toThrow(/one element must draw through the mask/);
    const blinking = ROW_SVG.replace('fill="#FF0000"/>', 'fill="#FF0000"><animate attributeName="opacity" values="1;0" dur="1s"/></rect>');
    await expect(riseFrames(parseRowArtwork(blinking), 400, 200, CENTRE, 5)).rejects.toThrow(/does not play <animate>/);
  });

  it("refuses art whose cards do not draw on their own", async () => {
    // A shadow thrown 60 px sideways lands on the next card: sprites laid in turn cannot match the still.
    const far = RAISED_SVG.replace('dx="5" dy="5"', 'dx="60" dy="0"').replace('flood-color="#808080"', 'flood-color="#FFFFFF"').replace('<feMergeNode in="s"/><feMergeNode in="SourceGraphic"/>', '<feMergeNode in="SourceGraphic"/><feMergeNode in="s"/>');
    await expect(riseFrames(parseRowArtwork(far), 400, 200, CENTRE, 5)).rejects.toThrow(/each card must draw on its own/);
  });
});
