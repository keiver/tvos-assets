import sharp, { type Sharp } from "sharp";
import { cardBox, filterReach, renderRows, riders, risenCard } from "./svg-rows.js";
import type { RowArtwork } from "./svg-rows.js";

/** Heights a card is drawn at on its way up; a frame uses the nearest. */
const STATES = 48;
/** Seconds a card spends out of the surface, and between its appearances, in a long loop. */
const LIFE = 4.4, PERIOD = 10;
/** Mean difference per channel (0-255) every card fully up may show against the still. */
const TOLERANCE = 0.5;
/** Cards drawn at once while the sprites are made. */
const IN_FLIGHT = 4;

export interface RiseFrames {
  /** The frame at `t` seconds as raw RGB, `width` x `height`. */
  frame(t: number): Promise<Buffer>;
}

/** How often a card comes up in a `seconds` loop, and how long it stays: both divide the loop. */
export function riseTiming(seconds: number): { period: number; life: number } {
  const period = seconds / Math.max(1, Math.round(seconds / PERIOD));
  return { period, life: Math.min(LIFE, period * 0.44) };
}

const smooth = (from: number, to: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Height (0 flat, 1 fully up) `t` seconds into a card's `life`: a faint relief, the rise, then the same back down. */
export function riseHeight(t: number, life: number): number {
  if (t <= 0 || t >= life) return 0;
  const u = Math.min(t, life - t), half = life / 2;
  return 0.2 * smooth(0, half * 0.4, u) + 0.8 * smooth(half * 0.42, half * 0.96, u);
}

/** When in each `period` the card at column `n` of row `k` starts up: neighbours land far apart. */
export function risePhase(n: number, k: number, period: number): number {
  const turn = n * 0.6180339887 + k * 0.3819660113 + 0.11;
  return (turn - Math.floor(turn)) * period;
}

/** Row artwork on the canvas as raw RGB, drawn with bleed so filters see past the canvas edges. */
export function rowStill(art: RowArtwork, width: number, height: number, centre: { x: number; y: number }): Sharp {
  const bleed = filterReach(art.source);
  const svg = renderRows(art, width + 2 * bleed, height + 2 * bleed, undefined, { x: centre.x + bleed, y: centre.y + bleed });
  return sharp(Buffer.from(svg)).extract({ left: bleed, top: bleed, width, height }).flatten({ background: { r: 0, g: 0, b: 0 } }).removeAlpha();
}

function meanDiff(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length;
}

/** 8x8 ordered-dither thresholds, 0-254. */
const DITHER = Uint8Array.from({ length: 64 }, (_v, i) => {
  let x = i & 7, y = i >> 3, rank = 0;
  for (let bit = 0; bit < 3; bit++, x >>= 1, y >>= 1) rank = (rank << 2) | (((x ^ y) & 1) << 1) | (y & 1);
  return Math.floor(((rank + 0.5) / 64) * 255);
});

/**
 * Draw an RGBA sprite over an RGB frame at (`left`, `top`), faded to `opacity` and clipped to the
 * frame. The fade is applied here and dithered: a faint sprite's gradient keeps its full depth,
 * where an 8-bit sprite drawn faint would land on the frame in visible steps.
 */
function over(frame: Buffer, width: number, height: number, sprite: Buffer, w: number, h: number, left: number, top: number, opacity: number): void {
  const c0 = Math.max(0, -left), c1 = Math.min(w, width - left), fade = Math.round(opacity * 256);
  for (let r = Math.max(0, -top); r < h && top + r < height; r++) {
    let s = (r * w + c0) * 4, d = ((top + r) * width + left + c0) * 3;
    const row = ((top + r) & 7) << 3;
    for (let c = c0; c < c1; c++, s += 4, d += 3) {
      const a = sprite[s + 3] * fade;
      if (a === 0) continue;
      const round = DITHER[row | ((left + c) & 7)] << 8;
      frame[d] += Math.floor(((sprite[s] - frame[d]) * a + round) / 65280);
      frame[d + 1] += Math.floor(((sprite[s + 1] - frame[d + 1]) * a + round) / 65280);
      frame[d + 2] += Math.floor(((sprite[s + 2] - frame[d + 2]) * a + round) / 65280);
    }
  }
}

/**
 * Frames of row artwork whose cards rise out of the surface and sink back, a few at a time, each
 * by `riseHeight` from its `risePhase`. A card on its way is the art drawn through the mask for
 * that one card with its filters scaled to the height (`risenCard`), drawn once per height and
 * laid, faded by the height, over the surface (the art with the mask shut). Cards that draw the same share
 * their sprites. Throws when the art breaks rule 9, or when every card up does not match the still.
 */
export async function riseFrames(
  art: RowArtwork,
  width: number,
  height: number,
  centre: { x: number; y: number },
  seconds: number,
): Promise<RiseFrames> {
  const fail = (message: string): never => {
    throw new Error(`Row artwork: ${message}.`);
  };
  const id = art.source.match(/<mask\b[^>]*\sid="([^"]*)"/)?.[1] ?? "";
  if (art.source.split(`url(#${id})`).length - 1 !== 1) {
    fail('for animate.rise one element must draw through the mask; wrap what the cards show in a single <g mask="…">');
  }
  if (/<animate\b/.test(art.source)) fail("animate.rise does not play <animate>; remove it or use animate.rows");

  const { width: W, height: H, pitchX, pitchY } = art;
  const dx = centre.x - W / 2, dy = centre.y - H / 2;
  const reach = filterReach(art.source) + 2;
  const w = Math.ceil(art.card.width) + 2 * reach + 1, h = Math.ceil(art.card.height) + 2 * reach + 1;
  const first = art.rows[0];

  const riding = riders(art.source, art.cards);
  let surface = art.source;
  for (const { tag } of riding) surface = surface.split(tag).join("");
  const base = await sharp(Buffer.from(renderRows({ ...art, source: surface }, width, height, undefined, centre, "shut")))
    .flatten({ background: { r: 0, g: 0, b: 0 } }).removeAlpha().raw().toBuffer();

  interface Cell { k: number; n: number; left: number; top: number; onTop: string; like: number }
  const cells: Cell[] = [];
  for (let k = Math.floor((-dy - h - first.y) / pitchY); first.y + k * pitchY + dy - h < height; k++) {
    const src = art.rows[((k % 2) + 2) % 2] ?? first;
    const y0 = first.y + k * pitchY - art.card.height / 2;
    for (let n = Math.floor((-dx - w - src.xs[0]) / pitchX); src.xs[0] + n * pitchX + dx - w < width; n++) {
      const x0 = src.xs[0] + n * pitchX - art.card.width / 2;
      const left = Math.floor(x0 + dx) - reach, top = Math.floor(y0 + dy) - reach;
      if (left + w <= 0 || top + h <= 0 || left >= width || top >= height) continue;
      const onTop = riding.filter(({ tag }) => {
        const b = cardBox(tag);
        return typeof b !== "string" && b.x0 >= x0 - 1 && b.x1 <= x0 + art.card.width + 1 && b.y0 >= y0 - 1 && b.y1 <= y0 + art.card.height + 1;
      }).map(({ tag }) => tag).join("");
      cells.push({ k, n, left, top, onTop, like: cells.length });
    }
  }

  const draw = (cell: Cell, state: number): Promise<Buffer> => {
    const source = risenCard(art.source, state / STATES, cell.onTop) as string;
    const svg = renderRows({ ...art, source }, w, h, undefined, { x: dx - cell.left + W / 2, y: dy - cell.top + H / 2 }, { k: cell.k, n: cell.n });
    return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
  };

  // Cards whose fully risen sprites match share one set of sprites.
  const sprites = new Map<string, Promise<Buffer>>();
  const up: Buffer[] = [];
  for (let i = 0; i < cells.length; i += IN_FLIGHT) {
    up.push(...await Promise.all(cells.slice(i, i + IN_FLIGHT).map((cell) => draw(cell, STATES))));
  }
  cells.forEach((cell, i) => {
    const twin = cells.findIndex((other, j) => j < i && other.like === j && meanDiff(up[j], up[i]) < 0.25);
    cell.like = twin < 0 ? i : twin;
    if (twin < 0) sprites.set(`${i}|${STATES}`, Promise.resolve(up[i]));
  });
  const sprite = (cell: Cell, state: number): Promise<Buffer> => {
    const key = `${cell.like}|${state}`;
    let hit = sprites.get(key);
    if (!hit) sprites.set(key, (hit = draw(cells[cell.like], state)));
    return hit;
  };

  const compose = async (state: (cell: Cell) => number): Promise<Buffer> => {
    const frame = Buffer.from(base);
    for (const cell of cells) {
      const s = state(cell);
      if (s >= 1) over(frame, width, height, await sprite(cell, s), w, h, cell.left, cell.top, Math.pow(s / STATES, 0.75));
    }
    return frame;
  };

  const diff = meanDiff(await compose(() => STATES), await rowStill(art, width, height, centre).raw().toBuffer());
  if (diff > TOLERANCE) {
    fail(`for animate.rise each card must draw on its own; with every card up the frame is ${diff.toFixed(2)} off the still (shadows reaching the next card, or art that is not drawn through the mask)`);
  }

  const { period, life } = riseTiming(seconds);
  return {
    frame: (t) => compose((cell) => {
      const local = (((t - risePhase(cell.n, cell.k, period)) % period) + period) % period;
      return Math.round(riseHeight(local, life) * STATES);
    }),
  };
}
