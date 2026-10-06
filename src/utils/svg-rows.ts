/**
 * Row artwork: an SVG that re-tiles to any canvas and animates by sliding its rows.
 *
 * What the SVG must be (each rule is checked, and a broken one throws naming it):
 * 1. `<svg>` has numeric `width` and `height` in px (the design canvas).
 * 2. It has exactly one `<mask>`, and something draws through it (`mask="url(#id)"`).
 * 3. The mask's children are the cards: two or more `path`, `rect`, `circle`, `ellipse` or
 *    `polygon` elements, all the same size, none with a `transform`.
 * 4. Cards sit in rows: cards in a row are evenly spaced, every row uses the same spacing, rows are
 *    evenly spaced vertically, and rows repeat every two (row 3 lines up with row 1).
 * 5. Fills that cover exactly the whole canvas (`rect` or a rectangular `path` from 0,0 to
 *    width,height) are stretched to a bigger canvas; everything else stays where it is, centred.
 * 6. No `<text>` (convert it to outlines) and no `<image>` pointing outside the file, so every
 *    machine renders the same pixels.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RowArtwork {
  width: number;
  height: number;
  /** Rows of card centres in source coordinates, top to bottom. */
  rows: { y: number; xs: number[]; template: string; cx: number; cy: number }[];
  pitchX: number;
  pitchY: number;
  /** The card under the centre of the fixed layer (what is drawn outside the mask), if any. */
  anchor?: Box;
  source: string;
}

const TOKEN = /[MLHVCSQTAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Bounding box of a path (end and control points), from its commands. */
export function pathBox(d: string): Box {
  const tokens = d.match(TOKEN) ?? [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = "M", i = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const see = (px: number, py: number) => {
    box.x0 = Math.min(box.x0, px); box.x1 = Math.max(box.x1, px); box.y0 = Math.min(box.y0, py); box.y1 = Math.max(box.y1, py);
  };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const up = cmd.toUpperCase(), rel = cmd !== up;
    if (up === "Z") { x = sx; y = sy; continue; }
    const n = tokens.slice(i, i + ARITY[up]).map(Number);
    i += ARITY[up];
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (up === "H") x = ox + n[0];
    else if (up === "V") y = oy + n[0];
    else if (up === "A") { x = ox + n[5]; y = oy + n[6]; }
    else {
      for (let k = 0; k < n.length - 2; k += 2) see(ox + n[k], oy + n[k + 1]);
      x = ox + n[n.length - 2]; y = oy + n[n.length - 1];
    }
    if (up === "M") { sx = x; sy = y; cmd = rel ? "l" : "L"; }
    see(x, y);
  }
  return box;
}

/** Centre of a path's bounding box. */
export function pathCentre(d: string): { cx: number; cy: number } {
  const b = pathBox(d);
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
}

const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const num = (tag: string, name: string, fallback = 0): number => {
  const v = attr(tag, name);
  return v === undefined ? fallback : Number(v);
};

/** Bounding box of one card element, or a message saying why it cannot be a card. */
function cardBox(tag: string): Box | string {
  const name = tag.match(/^<(\w+)/)?.[1] ?? "";
  if (attr(tag, "transform")) return `a mask card has a transform; flatten transforms before exporting`;
  if (name === "path") return pathBox(attr(tag, "d") ?? "");
  if (name === "rect") {
    const x = num(tag, "x"), y = num(tag, "y");
    return { x0: x, y0: y, x1: x + num(tag, "width"), y1: y + num(tag, "height") };
  }
  if (name === "circle") {
    const cx = num(tag, "cx"), cy = num(tag, "cy"), r = num(tag, "r");
    return { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
  }
  if (name === "ellipse") {
    const cx = num(tag, "cx"), cy = num(tag, "cy"), rx = num(tag, "rx"), ry = num(tag, "ry");
    return { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
  }
  if (name === "polygon") return pathBox(`M${(attr(tag, "points") ?? "").trim()}Z`);
  return `<${name}> cannot be a mask card; use path, rect, circle, ellipse or polygon`;
}

const ELEMENT = /<(path|rect|circle|ellipse|polygon|g|use|image|text|line|polyline)\b[^>]*?(?:\/>|>(?:[\s\S]*?)<\/\1>)/g;
const TOL = 1;
const close = (a: number, b: number) => Math.abs(a - b) <= TOL;

/** Parse the rows out of row artwork, or throw naming the rule it breaks. */
export function parseRowArtwork(svg: string): RowArtwork {
  const fail = (message: string): never => {
    throw new Error(`Row artwork: ${message}.`);
  };

  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? fail("no <svg> element");
  const width = Number(attr(root, "width")), height = Number(attr(root, "height"));
  if (!(width > 0) || !(height > 0)) fail('<svg> needs numeric width and height in px (not "100%")');
  if (/<text\b/.test(svg)) fail("it contains <text>; convert text to outlines so every machine renders the same");
  for (const image of svg.match(/<image\b[^>]*>/g) ?? []) {
    const href = attr(image, "href") ?? attr(image, "xlink:href") ?? "";
    if (!href.startsWith("data:")) fail(`an <image> points outside the file (${href.slice(0, 60)}); embed it as a data: URI`);
  }

  const masks = [...svg.matchAll(/<mask\b([^>]*)>([\s\S]*?)<\/mask>/g)];
  if (masks.length !== 1) fail(`it needs exactly one <mask> holding the cards, found ${masks.length}`);
  const id = attr(`<m ${masks[0][1]}>`, "id");
  if (!id || !svg.includes(`url(#${id})`)) fail(`nothing draws through the mask; give the fill behind the cards mask="url(#${id ?? "…"})"`);

  const cards = [...masks[0][2].matchAll(ELEMENT)].map((m) => m[0]);
  if (cards.length < 2) fail("the <mask> needs at least two cards");
  const boxes = cards.map((tag) => {
    const box = cardBox(tag);
    return typeof box === "string" ? fail(box) : { tag, ...box, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 };
  });
  const size = (b: Box) => [b.x1 - b.x0, b.y1 - b.y0];
  const [w0, h0] = size(boxes[0]);
  for (const b of boxes) {
    const [w, h] = size(b);
    if (!close(w, w0) || !close(h, h0)) fail(`every card must be the same size; found ${w0.toFixed(1)}x${h0.toFixed(1)} and ${w.toFixed(1)}x${h.toFixed(1)}`);
  }

  const rowList: (typeof boxes)[] = [];
  for (const b of [...boxes].sort((p, q) => p.cy - q.cy)) {
    const row = rowList.find((r) => close(r[0].cy, b.cy));
    if (row) row.push(b);
    else rowList.push([b]);
  }
  const rows = rowList.map((list) => {
    const sorted = list.sort((p, q) => p.cx - q.cx);
    return { y: sorted[0].cy, xs: sorted.map((c) => c.cx), template: sorted[0].tag, cx: sorted[0].cx, cy: sorted[0].cy };
  });

  const gaps = rows.flatMap((r) => r.xs.slice(1).map((x, i) => ({ y: r.y, gap: x - r.xs[i] })));
  if (gaps.length === 0) fail("at least one row needs two or more cards, to set the spacing");
  const pitchX = gaps[0].gap;
  for (const g of gaps) {
    if (!close(g.gap, pitchX)) fail(`cards must be evenly spaced with one spacing for every row; row at y=${g.y.toFixed(1)} has a gap of ${g.gap.toFixed(1)}, expected ${pitchX.toFixed(1)}`);
  }
  const rowGaps = rows.slice(1).map((r, i) => r.y - rows[i].y);
  const pitchY = rowGaps[0] ?? height;
  for (const g of rowGaps) if (!close(g, pitchY)) fail(`rows must be evenly spaced; found row gaps of ${pitchY.toFixed(1)} and ${g.toFixed(1)}`);
  const phase = (x: number) => ((x % pitchX) + pitchX) % pitchX;
  for (let i = 2; i < rows.length; i++) {
    const d = Math.abs(phase(rows[i].xs[0]) - phase(rows[i - 2].xs[0]));
    if (!close(Math.min(d, pitchX - d), 0)) fail(`rows must repeat every two; the row at y=${rows[i].y.toFixed(1)} does not line up with the row at y=${rows[i - 2].y.toFixed(1)}`);
  }

  return { width, height, rows, pitchX, pitchY, anchor: anchorCard(svg, width, height, boxes), source: svg };
}

const SHAPE = /<(path|rect|circle|ellipse|polygon)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g;

/** The card whose box holds the centre of every non-full-canvas shape outside the mask and defs. */
function anchorCard(svg: string, width: number, height: number, cards: Box[]): Box | undefined {
  const drawn = svg.replace(/<mask\b[\s\S]*?<\/mask>/g, "").replace(/<defs\b[\s\S]*?<\/defs>/g, "");
  const fixed = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [tag] of drawn.matchAll(SHAPE)) {
    const b = cardBox(tag);
    if (typeof b === "string" || (b.x0 <= TOL && b.y0 <= TOL && b.x1 >= width - TOL && b.y1 >= height - TOL)) continue;
    fixed.x0 = Math.min(fixed.x0, b.x0); fixed.y0 = Math.min(fixed.y0, b.y0);
    fixed.x1 = Math.max(fixed.x1, b.x1); fixed.y1 = Math.max(fixed.y1, b.y1);
  }
  const cx = (fixed.x0 + fixed.x1) / 2, cy = (fixed.y0 + fixed.y1) / 2;
  const card = cards.find((c) => c.x0 <= cx && cx <= c.x1 && c.y0 <= cy && cy <= c.y1);
  return card && { x0: card.x0, y0: card.y0, x1: card.x1, y1: card.y1 };
}

/**
 * The artwork on a `width` x `height` canvas: the original's centre placed at `centre` (default the
 * canvas centre), its full-canvas fills stretched to cover the canvas, its rows re-tiled across it
 * with the source's spacing and stagger, each row shifted horizontally by `offsets(k)` (row 0 is the
 * top source row; rows above and below repeat the stagger).
 */
export function renderRows(
  art: RowArtwork,
  width: number,
  height: number,
  offsets: (row: number) => number = () => 0,
  centre: { x: number; y: number } = { x: width / 2, y: height / 2 },
): string {
  const { width: W, height: H, pitchX, pitchY } = art;
  // The canvas in source coordinates runs from (-dx, -dy) to (width - dx, height - dy).
  const dx = centre.x - W / 2, dy = centre.y - H / 2;
  const left = -dx - 2 * pitchX, right = width - dx + 2 * pitchX;
  const top = -dy - pitchY, bottom = height - dy + pitchY;

  const cells: string[] = [];
  const first = art.rows[0];
  for (let k = Math.floor((top - first.y) / pitchY); first.y + k * pitchY < bottom; k++) {
    const y = first.y + k * pitchY;
    const src = art.rows[((k % 2) + 2) % 2] ?? first;
    const origin = src.xs[0] + offsets(k);
    const start = origin + Math.floor((left - origin) / pitchX) * pitchX;
    for (let x = start; x < right; x += pitchX) {
      cells.push(`<g transform="translate(${(x - src.cx).toFixed(3)} ${(y - src.cy).toFixed(3)})">${src.template}</g>`);
    }
  }

  // Full-canvas fills stretch to the new canvas; nothing else moves.
  const stretch = (tag: string): string => {
    const name = tag.match(/^<(\w+)/)?.[1];
    if (name === "rect") {
      const covers = num(tag, "x") === 0 && num(tag, "y") === 0 &&
        ((attr(tag, "width") === "100%" && attr(tag, "height") === "100%") || (num(tag, "width") === W && num(tag, "height") === H));
      if (!covers) return tag;
      return tag
        .replace(/\s(x|y|width|height)="[^"]*"/g, "")
        .replace(/^<rect/, `<rect x="${-dx}" y="${-dy}" width="${width}" height="${height}"`);
    }
    if (name === "path") {
      const d = attr(tag, "d") ?? "";
      const b = pathBox(d);
      const commands = (d.match(/[a-z]/gi) ?? []).length;
      if (commands > 6 || !close(b.x0, 0) || !close(b.y0, 0) || !close(b.x1, W) || !close(b.y1, H)) return tag;
      return tag.replace(/\sd="[^"]*"/, ` d="M${-dx} ${-dy}H${width - dx}V${height - dy}H${-dx}Z"`);
    }
    return tag;
  };

  const body = art.source
    .replace(/^[\s\S]*?<svg\b[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<mask\b([^>]*)>[\s\S]*?<\/mask>/, (_m, attrs: string) => {
      const region = attrs.replace(/\s(x|y|width|height)="[^"]*"/g, "");
      return `<mask${region} x="${left}" y="${top}" width="${right - left}" height="${bottom - top}">${cells.join("")}</mask>`;
    })
    .replace(/<(rect|path)\b[^>]*\/?>/g, stretch);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g transform="translate(${dx} ${dy})">${body}</g></svg>`;
}
