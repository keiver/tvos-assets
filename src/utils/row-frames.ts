import sharp from "sharp";
import { animateAt, animationPeriods, cardBox, renderRows, riders } from "./svg-rows.js";
import type { RowArtwork } from "./svg-rows.js";

/** Sub-pixel positions strips and riders are drawn at; each lands within 1/32 px of its true place. */
const PHASES = 16;
/** Blank pixels above and below a card in its strip, for antialiasing. */
const PAD = 4;
/** Blank pixels around a rider, for antialiasing and soft edges. */
const RIDER_PAD = 32;
/** Mean difference per channel (0-255) the fast frames may show against a full render. */
const TOLERANCE = 0.5;

/** Where the rows are at one moment: each row's offset, and the loop seam's crossfade if in it. */
export interface RowMotion {
  offsets: (row: number) => number;
  seam?: { weight: number; shift: (row: number) => number };
}

export interface RowFrames {
  /** True when frames are blended from pre-rendered layers, false when each is a full SVG render. */
  fast: boolean;
  /** The frame at `t` seconds as raw RGB, `width` x `height`. */
  frame(t: number): Promise<Buffer>;
}

const rgb = (svg: string): Promise<Buffer> =>
  sharp(Buffer.from(svg)).flatten({ background: { r: 0, g: 0, b: 0 } }).removeAlpha().raw().toBuffer();

const alpha = (svg: string): Promise<Buffer> =>
  sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer();

/** Cache of promises, so frames rendered concurrently share one render per key. */
function memo<T>(make: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key) => {
    let hit = cache.get(key);
    if (!hit) cache.set(key, (hit = make(key)));
    return hit;
  };
}

/** Split a position into a whole pixel and one of `PHASES` sub-pixel steps. */
function snap(x: number): [number, number] {
  let whole = Math.floor(x), phase = Math.round((x - whole) * PHASES);
  if (phase === PHASES) { phase = 0; whole += 1; }
  return [whole, phase];
}

/**
 * Frames of row artwork in motion. The cards (the mask) and the shapes riding them move; a single
 * masked layer is linear in its mask, so each frame is `shut + mask * (open - shut)` with the
 * riders on top: the art with the mask fully open and fully shut, rendered once per animation
 * state, blended through a mask assembled from row strips rendered once per sub-pixel phase.
 * Art that breaks those assumptions, or whose blend differs from a full render, gets full SVG
 * renders instead.
 */
export async function rowFrames(
  art: RowArtwork,
  width: number,
  height: number,
  centre: { x: number; y: number },
  motion: (t: number) => RowMotion,
  /** Times checked against a full render before the fast path is trusted. */
  checks: number[] = [0.37],
): Promise<RowFrames> {
  const full = (t: number): Promise<Buffer> => {
    const m = motion(t);
    return rgb(renderRows({ ...art, source: animateAt(art.source, t) }, width, height, m.offsets, centre, "cards", m.seam));
  };
  const slow: RowFrames = { fast: false, frame: full };

  const maskElement = art.source.match(/<mask\b[^>]*>[\s\S]*?<\/mask>/)?.[0] ?? "";
  const id = maskElement.match(/\sid="([^"]*)"/)?.[1] ?? "";
  const uses = art.source.split(`url(#${id})`).length - 1;
  const rowGap = art.pitchY - art.card.height;
  if (uses !== 1 || animationPeriods(maskElement).length > 0 || rowGap < 2 * PAD + 2) return slow;

  const { width: W, height: H, pitchX, pitchY } = art;
  const dx = centre.x - W / 2, dy = centre.y - H / 2;
  const first = art.rows[0];
  const bandHeight = Math.ceil(art.card.height) + 2 * PAD + 2;
  const margin = Math.ceil(pitchX) + 2;
  const stripWidth = width + margin + 2;
  const defs = (art.source.match(/<defs\b[\s\S]*?<\/defs>/g) ?? []).join("");

  // The mask alone: a white canvas seen through the cards, so a strip's alpha is the mask.
  const probe: RowArtwork = {
    ...art,
    source: `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${maskElement}<rect x="0" y="0" width="${W}" height="${H}" fill="white" mask="url(#${id})"/>${defs}</svg>`,
  };

  // One row (parity `p`) with its card centres at y `fy` and x `margin + phase / PHASES` + n pitches.
  const strip = memo(async (key) => {
    const [p, fy, phase] = key.split("|").map(Number);
    const src = art.rows[p] ?? first;
    const sx = margin + phase / PHASES - src.xs[0], sy = fy - (first.y + p * pitchY);
    return alpha(renderRows(probe, stripWidth, bandHeight, () => 0, { x: sx + W / 2, y: sy + H / 2 }));
  });

  // The art without its riders, mask fully open and fully shut, `open` with an alpha slot to fill.
  const layers = memo(async (state) => {
    let still = state;
    for (const { tag } of riders(state, art.cards)) still = still.split(tag).join("");
    const animated = { ...art, source: still };
    const [open, shut] = await Promise.all([
      rgb(renderRows(animated, width, height, () => 0, centre, "open")),
      rgb(renderRows(animated, width, height, () => 0, centre, "shut")),
    ]);
    const overlay = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < open.length; i += 3, j += 4) {
      overlay[j] = open[i]; overlay[j + 1] = open[i + 1]; overlay[j + 2] = open[i + 2];
    }
    return { overlay, shut };
  });

  // One rider drawn on its own, `RIDER_PAD` from its box's top left plus the sub-pixel offsets.
  const sprite = memo(async (key) => {
    const split = key.indexOf("|", key.indexOf("|") + 1);
    const [phase, fy] = key.slice(0, split).split("|").map(Number);
    const tag = key.slice(split + 1);
    const b = cardBox(tag) as { x0: number; y0: number; x1: number; y1: number };
    const w = Math.ceil(b.x1 - b.x0) + 2 * RIDER_PAD + 2, h = Math.ceil(b.y1 - b.y0) + 2 * RIDER_PAD + 2;
    const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${defs}<g transform="translate(${RIDER_PAD + phase / PHASES - b.x0} ${RIDER_PAD + fy - b.y0})">${tag}</g></svg>`;
    return { data: await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer(), w, h };
  });

  /** A rider's sprite at canvas offset `shift`, faded to `opacity` and clipped to the canvas. */
  const place = async (tag: string, shift: number, opacity: number): Promise<sharp.OverlayOptions | undefined> => {
    const b = cardBox(tag) as { x0: number; y0: number };
    const [ix, phase] = snap(b.x0 + dx + shift);
    const iy = Math.floor(b.y0 + dy), fy = +(b.y0 + dy - iy).toFixed(4);
    const s = await sprite(`${phase}|${fy}|${tag}`);
    const left = ix - RIDER_PAD, top = iy - RIDER_PAD;
    const x0 = Math.max(0, left), y0 = Math.max(0, top);
    const x1 = Math.min(width, left + s.w), y1 = Math.min(height, top + s.h);
    if (x1 <= x0 || y1 <= y0 || opacity <= 0) return undefined;
    const cw = x1 - x0, ch = y1 - y0;
    const data = Buffer.alloc(cw * ch * 4);
    for (let r = 0; r < ch; r++) {
      const from = ((y0 - top + r) * s.w + (x0 - left)) * 4;
      s.data.copy(data, r * cw * 4, from, from + cw * 4);
    }
    if (opacity < 1) for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
    return { input: data, raw: { width: cw, height: ch, channels: 4 }, left: x0, top: y0 };
  };

  const blend = async (t: number): Promise<Buffer> => {
    const m = motion(t);
    const state = animateAt(art.source, t);
    const { overlay, shut } = await layers(state);
    const out = Buffer.from(overlay);
    const kFirst = Math.floor((-dy - art.card.height - first.y) / pitchY);
    for (let k = kFirst; first.y + k * pitchY + dy - art.card.height / 2 < height; k++) {
      const p = ((k % 2) + 2) % 2;
      const src = art.rows[p] ?? first;
      const yc = first.y + k * pitchY + dy;
      const top = Math.floor(yc - art.card.height / 2) - PAD;
      const fy = +(yc - top).toFixed(4);
      const u = (((src.xs[0] + m.offsets(k) + dx) % pitchX) + pitchX) % pitchX;
      const [whole, phase] = snap(u);
      const band = await strip(`${p}|${fy}|${phase}`);
      const from = margin - whole;
      for (let r = 0; r < bandHeight; r++) {
        const y = top + r;
        if (y < 0 || y >= height) continue;
        const s = r * stripWidth + from;
        let o = y * width * 4 + 3;
        for (let c = 0; c < width; c++, o += 4) {
          const v = band[s + c];
          if (v > out[o]) out[o] = v;
        }
      }
    }
    const placed: sharp.OverlayOptions[] = [{ input: out, raw: { width, height, channels: 4 } }];
    for (const { tag, row } of riders(state, art.cards)) {
      const w = m.seam?.weight ?? 0;
      for (const copy of [
        await place(tag, m.offsets(row), 1 - w),
        w > 0 ? await place(tag, m.offsets(row) - (m.seam as NonNullable<RowMotion["seam"]>).shift(row), w) : undefined,
      ]) if (copy) placed.push(copy);
    }
    return sharp(shut, { raw: { width, height, channels: 3 } }).composite(placed).removeAlpha().raw().toBuffer();
  };

  for (const t of checks) {
    const [a, b] = await Promise.all([full(t), blend(t)]);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    if (diff / a.length > TOLERANCE) return slow;
  }
  return { fast: true, frame: blend };
}
