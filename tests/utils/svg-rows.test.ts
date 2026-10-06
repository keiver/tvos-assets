jest.setTimeout(60000);

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { parseRowArtwork, pathCentre, renderRows } from "../../src/utils/svg-rows";
import { ROW_SVG } from "../fixtures/row-artwork";

const EXAMPLES = join(__dirname, "../../examples/row-artwork");

describe("pathCentre", () => {
  it("follows H and V, which take one number", () => {
    expect(pathCentre("M10 10H50V30H10Z")).toEqual({ cx: 30, cy: 20 });
    expect(pathCentre("m10 10h40v20h-40z")).toEqual({ cx: 30, cy: 20 });
  });
});

describe("parseRowArtwork", () => {
  it("finds the rows, their pitch and their stagger", () => {
    const art = parseRowArtwork(ROW_SVG);
    expect(art.rows.map((r) => r.y)).toEqual([20, 100, 180]);
    expect(art.rows.map((r) => r.xs[0])).toEqual([50, 0, 50]);
    expect(art.pitchX).toBe(100);
    expect(art.pitchY).toBe(80);
  });

  it.each(readdirSync(EXAMPLES))("accepts examples/row-artwork/%s", (file) => {
    const art = parseRowArtwork(readFileSync(join(EXAMPLES, file), "utf8"));
    expect(art.rows.length).toBeGreaterThan(1);
  });

  it("says what is missing from an SVG that is not row artwork", () => {
    expect(() => parseRowArtwork(`<svg width="10" height="10"></svg>`)).toThrow(/<mask>/);
  });
});

/** Gold-ness of the pixel at (x, y): cards show the gold fill, gaps the black. */
async function goldAt(svg: string, points: [number, number][]): Promise<boolean[]> {
  const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: "#000" }).raw().toBuffer({ resolveWithObject: true });
  return points.map(([x, y]) => data[(y * info.width + x) * info.channels + 1] > 150);
}

describe("renderRows", () => {
  it("draws the source unchanged on its own canvas", async () => {
    const original = await sharp(Buffer.from(ROW_SVG)).flatten({ background: "#000" }).raw().toBuffer();
    const redrawn = await sharp(Buffer.from(renderRows(parseRowArtwork(ROW_SVG), 400, 200))).flatten({ background: "#000" }).raw().toBuffer();
    expect(redrawn.equals(original)).toBe(true);
  });

  it("re-tiles the rows across a taller canvas and keeps the fixed layer centred", async () => {
    const art = parseRowArtwork(ROW_SVG);
    const svg = renderRows(art, 400, 360); // 80 px added above and below
    // New rows at y = 20 (was -60) and 340 (was 260) repeat the stagger: offset 0 rows, like row 100.
    const [newTopCard, newTopGap, newBottomCard] = await goldAt(svg, [[100, 20], [150, 20], [100, 340]]);
    expect([newTopCard, newTopGap, newBottomCard]).toEqual([true, false, true]);
    const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
    const red = (x: number, y: number) => data[(y * info.width + x) * info.channels] > 200 && data[(y * info.width + x) * info.channels + 1] < 60;
    expect(red(200, 180)).toBe(true); // the 20x20 mark, centred at (200, 100) + 80
  });

  it("shifts each row by its own offset", async () => {
    const art = parseRowArtwork(ROW_SVG);
    const svg = renderRows(art, 400, 200, (k) => (k === 1 ? 50 : 0));
    // Row 1 (y 100) moves half a pitch: its gap at x 50 becomes a card, its card at x 100 a gap.
    expect(await goldAt(svg, [[50, 100], [100, 100], [50, 20]])).toEqual([true, false, true]);
  });
});

/** A minimal row artwork whose mask holds `cards`, with optional extra markup. */
const art = (cards: string, extra = "", size = 'width="400" height="200"') =>
  `<svg ${size} xmlns="http://www.w3.org/2000/svg"><rect width="400" height="200" fill="#000"/>` +
  `<mask id="m">${cards}</mask><rect width="400" height="200" fill="#FFC312" mask="url(#m)"/>${extra}</svg>`;
const rects = (y: number, x0: number, n = 4, w = 60) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x0 + i * 100 - w / 2}" y="${y - 20}" width="${w}" height="40" fill="white"/>`).join("");

describe("row artwork contract", () => {
  it("takes rect, circle and polygon cards as well as paths", () => {
    expect(parseRowArtwork(art(rects(50, 0) + rects(150, 50))).pitchX).toBe(100);
    const circles = [0, 100, 200].map((x) => `<circle cx="${x}" cy="60" r="25" fill="white"/>`).join("");
    expect(parseRowArtwork(art(circles)).rows[0].xs).toEqual([0, 100, 200]);
    const hex = (cx: number) => `<polygon points="${cx - 20},60 ${cx - 10},43 ${cx + 10},43 ${cx + 20},60 ${cx + 10},77 ${cx - 10},77" fill="white"/>`;
    expect(parseRowArtwork(art(hex(50) + hex(150))).pitchX).toBe(100);
  });

  it.each([
    ["numeric size", art(rects(50, 0), "", 'width="100%" height="100%"'), /numeric width and height/],
    ["no mask", `<svg width="400" height="200"><rect width="400" height="200"/></svg>`, /exactly one <mask>/],
    ["two masks", art(rects(50, 0), `<mask id="n"><rect width="1" height="1"/></mask>`), /exactly one <mask>.*found 2/],
    ["mask unused", art(rects(50, 0)).replace(' mask="url(#m)"', ""), /nothing draws through the mask/],
    ["one card", art(rects(50, 0, 1)), /at least two cards/],
    ["mixed sizes", art(rects(50, 0) + rects(150, 50, 4, 80)), /same size/],
    ["transformed card", art(rects(50, 0).replace("<rect", '<rect transform="rotate(5)"')), /transform/],
    ["uneven spacing", art(rects(50, 0, 3) + `<rect x="290" y="30" width="60" height="40"/>`), /evenly spaced/],
    ["uneven rows", art(rects(50, 0) + rects(150, 50) + rects(220, 0)), /rows must be evenly spaced/],
    ["no two-row repeat", art(rects(50, 0) + rects(150, 50) + rects(250, 25)), /repeat every two/],
    ["live text", art(rects(50, 0), `<text>TOMO</text>`), /convert text to outlines/],
    ["external image", art(rects(50, 0), `<image href="https://example.com/a.png" width="10" height="10"/>`), /outside the file/],
  ])("rejects %s, saying which rule", (_name, svg, message) => {
    expect(() => parseRowArtwork(svg)).toThrow(message);
  });
});
