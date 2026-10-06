import sharp from "sharp";
import { animateAt, animationPeriods, renderRows } from "./svg-rows.js";
import type { RowArtwork } from "./svg-rows.js";

/** Sub-pixel positions each row strip is drawn at; a row lands within 1/32 px of its true place. */
const PHASES = 16;
/** Blank pixels above and below a card in its strip, for antialiasing. */
const PAD = 4;
/** Mean difference per channel (0-255) the fast frames may show against a full render. */
const TOLERANCE = 0.5;

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

/**
 * Frames of row artwork in motion. Only the cards (the mask) move, and a single masked layer is
 * linear in its mask, so each frame is `shut + mask * (open - shut)`: the art with the mask fully
 * open and fully shut, rendered once per animation state, blended through a mask assembled from
 * row strips rendered once per sub-pixel phase. Art that breaks those assumptions, or whose blend
 * differs from a full render, gets full SVG renders instead.
 */
export async function rowFrames(
  art: RowArtwork,
  width: number,
  height: number,
  centre: { x: number; y: number },
  offsets: (row: number, t: number) => number,
): Promise<RowFrames> {
  const full = (t: number): Promise<Buffer> =>
    rgb(renderRows({ ...art, source: animateAt(art.source, t) }, width, height, (k) => offsets(k, t), centre));
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

  // The mask alone: a white canvas seen through the cards, so a strip's alpha is the mask.
  const defs = (art.source.match(/<defs\b[\s\S]*?<\/defs>/g) ?? []).join("");
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

  const layers = memo(async (state) => {
    const animated = { ...art, source: state };
    const [open, shut] = await Promise.all([
      rgb(renderRows(animated, width, height, () => 0, centre, "open")),
      rgb(renderRows(animated, width, height, () => 0, centre, "shut")),
    ]);
    // `open` with an alpha slot each frame fills from its mask.
    const overlay = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < open.length; i += 3, j += 4) {
      overlay[j] = open[i]; overlay[j + 1] = open[i + 1]; overlay[j + 2] = open[i + 2];
    }
    return { overlay, shut };
  });

  const blend = async (t: number): Promise<Buffer> => {
    const { overlay, shut } = await layers(animateAt(art.source, t));
    const out = Buffer.from(overlay);
    const kFirst = Math.floor((-dy - art.card.height - first.y) / pitchY);
    for (let k = kFirst; first.y + k * pitchY + dy - art.card.height / 2 < height; k++) {
      const p = ((k % 2) + 2) % 2;
      const src = art.rows[p] ?? first;
      const yc = first.y + k * pitchY + dy;
      const top = Math.floor(yc - art.card.height / 2) - PAD;
      const fy = +(yc - top).toFixed(4);
      const x = src.xs[0] + offsets(k, t) + dx;
      const u = ((x % pitchX) + pitchX) % pitchX;
      let whole = Math.floor(u), phase = Math.round((u - whole) * PHASES);
      if (phase === PHASES) { phase = 0; whole += 1; }
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
    return sharp(shut, { raw: { width, height, channels: 3 } })
      .composite([{ input: out, raw: { width, height, channels: 4 } }])
      .removeAlpha()
      .raw()
      .toBuffer();
  };

  // A frame partway through, with rows off their source spacing, has to match a full render.
  const probeTime = 0.37 * Math.max(1, ...animationPeriods(art.source));
  const [a, b] = await Promise.all([full(probeTime), blend(probeTime)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length <= TOLERANCE ? { fast: true, frame: blend } : slow;
}
