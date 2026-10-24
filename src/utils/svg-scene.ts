/**
 * Scene artwork: any SVG a placement shows whole, cover-fitted to the canvas, animated by its own
 * SMIL and by `animate.elements` rules this file writes into it as `<animate>` tags. The frames
 * come from a browser (`scene-browser.ts`); this file only reads and rewrites the SVG text.
 *
 * What the SVG must be (each rule is checked, and a broken one throws naming it):
 * 1. `<svg>` has a `viewBox`, or numeric `width` and `height` to make one from.
 * 2. No `<text>` (fonts differ per machine), no `<script>`, no `<image>` pointing outside the
 *    file, no CSS `@keyframes` (animate with SMIL so the loop can be checked).
 * 3. Every `<animate>`, `<animateTransform>` and `<animateMotion>` has a `dur`, and each `dur`
 *    divides the loop, so the last frame runs into the first.
 * 4. A rule's `select` is `#id`, `tag` or `#id tag`, and matches at least one element.
 */
import type { SceneAnimation } from "../types.js";
import type { ContentBox, Rect } from "./image-processing.js";

export interface SceneElement {
  name: string;
  /** Offsets into the source: the element's first character, the end of its open tag, its end. */
  start: number;
  openEnd: number;
  end: number;
  selfClosing: boolean;
  /** Indexes into the element list, outermost first. */
  ancestors: number[];
  id?: string;
}

const TAG = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
const HIDDEN = new Set(["defs", "mask", "clipPath"]);

/** Every element in document order, with its span and ancestry. */
export function sceneElements(svg: string): SceneElement[] {
  const list: SceneElement[] = [];
  const open: number[] = [];
  for (const m of svg.matchAll(TAG)) {
    const [tag, closing, name, attrs, selfClose] = m;
    const at = m.index as number;
    if (closing) {
      for (let i = open.length - 1; i >= 0; i--) {
        if (list[open[i]].name === name) {
          list[open[i]].end = at + tag.length;
          open.length = i;
          break;
        }
      }
      continue;
    }
    const element: SceneElement = {
      name,
      start: at,
      openEnd: at + tag.length,
      end: at + tag.length,
      selfClosing: Boolean(selfClose),
      ancestors: [...open],
      id: attrs.match(/\sid="([^"]*)"/)?.[1],
    };
    list.push(element);
    if (!selfClose) open.push(list.length - 1);
  }
  return list;
}

const SELECT = /^(?:#([\w:.-]+))?\s*([A-Za-z][\w:-]*)?$/;

/** The id and tag a `select` names; throws when it is not `#id`, `tag` or `#id tag`. */
export function parseSelect(select: unknown): { id?: string; tag?: string } {
  const m = typeof select === "string" ? select.trim().match(SELECT) : null;
  if (!m || (!m[1] && !m[2])) {
    throw new Error(`Scene artwork: select "${String(select)}" is not one of #id, tag or #id tag.`);
  }
  return { id: m[1], tag: m[2] };
}

/** The elements `select` names, in document order; throws when the form is wrong or nothing matches. */
export function selectElements(svg: string, select: string): SceneElement[] {
  const { id, tag } = parseSelect(select);
  const all = sceneElements(svg);
  let found: SceneElement[];
  if (id && !tag) {
    found = all.filter((e) => e.id === id);
  } else {
    const root = id ? all.findIndex((e) => e.id === id) : -1;
    if (id && root < 0) throw new Error(`Scene artwork: select "${select}" matches nothing; no element has id="${id}".`);
    found = all.filter((e, i) =>
      e.name === tag && i !== root &&
      (id ? e.ancestors.includes(root) : !e.ancestors.some((a) => HIDDEN.has(all[a].name))));
  }
  if (found.length === 0) throw new Error(`Scene artwork: select "${select}" matches nothing.`);
  return found;
}

const GOLDEN = 0.6180339887;

/** Seconds before the loop's start the i-th match begins, so staggered matches sit apart. */
export function scenePhase(rule: SceneAnimation, i: number): number {
  const turn = i * GOLDEN + 0.11;
  const spread = rule.stagger ? (turn - Math.floor(turn)) * rule.dur : 0;
  return (rule.begin ?? 0) + spread;
}

const xml = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const secs = (n: number): string => `${+n.toFixed(4)}s`;

/** The `<animate>` tag rule `r` writes on its i-th match. */
export function animateTag(r: SceneAnimation, i: number): string {
  const attrs = [`attributeName="${xml(r.attributeName)}"`, `values="${xml(r.values)}"`, `dur="${secs(r.dur)}"`];
  if (r.keyTimes) attrs.push(`keyTimes="${xml(r.keyTimes)}"`);
  if (r.calcMode) attrs.push(`calcMode="${r.calcMode}"`);
  if (r.keySplines) attrs.push(`keySplines="${xml(r.keySplines)}"`);
  if (r.additive) attrs.push(`additive="${r.additive}"`);
  const phase = scenePhase(r, i);
  if (phase !== 0) attrs.push(`begin="-${secs(phase)}"`);
  attrs.push('repeatCount="indefinite"');
  return `<animate ${attrs.join(" ")}/>`;
}

/** The SVG with every rule written in as `<animate>` tags, each the first child of its element. */
export function expandScene(svg: string, elements: SceneAnimation[] = []): string {
  const inserts = new Map<number, string[]>();
  for (const rule of elements) {
    selectElements(svg, rule.select).forEach((e, i) => {
      const list = inserts.get(e.start) ?? [];
      list.push(animateTag(rule, i));
      inserts.set(e.start, list);
    });
  }
  if (inserts.size === 0) return svg;
  const all = sceneElements(svg);
  let out = svg;
  for (const e of [...all].sort((a, b) => b.start - a.start)) {
    const tags = inserts.get(e.start);
    if (!tags) continue;
    const body = tags.join("");
    if (e.selfClosing) {
      const open = out.slice(e.start, e.openEnd).replace(/\s*\/>$/, ">");
      out = out.slice(0, e.start) + open + body + `</${e.name}>` + out.slice(e.openEnd);
    } else {
      out = out.slice(0, e.openEnd) + body + out.slice(e.openEnd);
    }
  }
  return out;
}

/** Seconds in an SMIL clock value: "1.5s", "800ms" or a bare number. */
function clockSeconds(value: string): number {
  const v = value.trim();
  return v.endsWith("ms") ? parseFloat(v) / 1000 : parseFloat(v);
}

const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

export interface SceneArtwork {
  viewBox: string;
  /** The `dur` of every SMIL animation in the file, in seconds. */
  periods: number[];
}

/** Check the scene rules against `svg`, and against `loop` seconds when given; throws naming a broken one. */
export function sceneRules(svg: string, loop?: number): SceneArtwork {
  const fail = (message: string): never => {
    throw new Error(`Scene artwork: ${message}.`);
  };
  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? fail("no <svg> element");
  let viewBox = attr(root, "viewBox")?.trim();
  if (!viewBox) {
    const px = (name: string): number => {
      const v = (attr(root, name) ?? "").trim();
      return /^\d*\.?\d+(px)?$/.test(v) ? parseFloat(v) : NaN;
    };
    const width = px("width"), height = px("height");
    if (!(width > 0) || !(height > 0)) fail('<svg> needs a viewBox, or numeric width and height in px (not "100%")');
    viewBox = `0 0 ${width} ${height}`;
  }
  if (/<text\b/.test(svg)) fail("it contains <text>; convert text to outlines so every machine renders the same");
  if (/<script\b/.test(svg)) fail("it contains <script>; a scene animates with SMIL only");
  if (/@keyframes\b/.test(svg)) fail("it contains CSS @keyframes; animate with SMIL (<animate>) so the loop can be checked");
  for (const image of svg.match(/<image\b[^>]*>/g) ?? []) {
    const href = attr(image, "href") ?? attr(image, "xlink:href") ?? "";
    if (!href.startsWith("data:")) fail(`an <image> points outside the file (${href.slice(0, 60)}); embed it as a data: URI`);
  }
  const periods: number[] = [];
  for (const tag of svg.match(/<animate(?:Transform|Motion)?\b[^>]*>/g) ?? []) {
    const dur = clockSeconds(attr(tag, "dur") ?? "");
    if (!(dur > 0)) fail(`${tag.slice(0, 60)} has no dur; every animation needs one so the loop can be checked`);
    if (loop !== undefined) {
      const cycles = loop / dur;
      if (Math.abs(cycles - Math.round(cycles)) > 1e-6) {
        fail(`an animation lasts ${dur} s, which does not divide the ${loop} s loop, so the loop would jump`);
      }
    }
    periods.push(dur);
  }
  return { viewBox, periods };
}

/** The mark as art to draw into a scene: the file's text or bytes with the measurements `Mark` carries. */
export interface MarkArt {
  /** The file's text when it is an SVG. */
  svg?: string;
  /** The file's bytes when it is a PNG. */
  png?: Buffer;
  /** The file's own coordinate space: an SVG's viewBox, a PNG's pixels. */
  viewBox: Rect;
  content?: ContentBox;
  sourceSize?: number;
  borderRadius: number;
}

const num = (n: number): string => String(+n.toFixed(4));
/** The square `contentBox` measures in. */
const BOX_SPACE = 1024;
/** Root attributes that describe the file, not how it draws; the rest ride along onto the group. */
const ROOT_ONLY = /^(xmlns(:\w+)?|width|height|viewBox|preserveAspectRatio|x|y|id|version|baseProfile|role|aria-[\w-]+|xml:space)$/;

/** The four numbers of a viewBox. */
export function parseViewBox(viewBox: string): Rect {
  const [x, y, width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
  return { x, y, width, height };
}

/** The content box, measured contain-fit in 1024 space, back in the mark's own coordinates. */
export function markCrop(mark: MarkArt): Rect {
  const m = mark.viewBox;
  if (!mark.content) return m;
  const fit = Math.min(BOX_SPACE / m.width, BOX_SPACE / m.height);
  const padX = (BOX_SPACE - m.width * fit) / 2;
  const padY = (BOX_SPACE - m.height * fit) / 2;
  const size = mark.content.size / fit;
  return { x: m.x + (mark.content.left - padX) / fit, y: m.y + (mark.content.top - padY) / fit, width: size, height: size };
}

/**
 * The scene with the mark drawn in `box` (canvas pixels, from `centerBox`), as a `<g id="mark">` in
 * the scene's own coordinates, so one timeline drives both and `elements` rules reach it. The
 * mark's ids are prefixed `mark-`, its content box is what the box fits (`meet`, centred), and a
 * clip keeps it to that box, rounded by the icon's border radius when the mark is the icon.
 */
export function placeMark(scene: string, mark: MarkArt, box: Rect, canvas: { width: number; height: number }): string {
  const v = parseViewBox(sceneRules(scene).viewBox);
  const s = Math.max(canvas.width / v.width, canvas.height / v.height);
  const offX = (canvas.width - v.width * s) / 2;
  const offY = (canvas.height - v.height * s) / 2;
  const bx = v.x + (box.x - offX) / s, by = v.y + (box.y - offY) / s, bw = box.width / s, bh = box.height / s;

  const crop = markCrop(mark);
  const k = Math.min(bw / crop.width, bh / crop.height);
  const tx = bx + (bw - crop.width * k) / 2 - crop.x * k;
  const ty = by + (bh - crop.height * k) / 2 - crop.y * k;
  const rx = mark.borderRadius > 0 && mark.sourceSize ? (mark.borderRadius / mark.sourceSize) * crop.width : 0;

  let carried = "";
  let body: string;
  if (mark.svg) {
    const text = mark.svg.replace(/<\?xml[\s\S]*?\?>/, "").replace(/<!DOCTYPE[^>]*>/i, "");
    const root = text.match(/<svg\b([^>]*)>/) ?? [];
    const open = root[0] ?? "";
    for (const m of (root[1] ?? "").matchAll(/\s([\w:-]+)="([^"]*)"/g)) {
      if (!ROOT_ONLY.test(m[1])) carried += ` ${m[1]}="${m[2]}"`;
    }
    const start = text.indexOf(open) + open.length;
    body = text
      .slice(start, text.lastIndexOf("</svg>"))
      .replace(/\sid="([^"]*)"/g, ' id="mark-$1"')
      .replace(/url\(#/g, "url(#mark-")
      .replace(/href="#/g, 'href="#mark-');
  } else {
    const m = mark.viewBox;
    body = `<image href="data:image/png;base64,${(mark.png as Buffer).toString("base64")}" x="${num(m.x)}" y="${num(m.y)}" width="${num(m.width)}" height="${num(m.height)}"/>`;
  }

  const clip = `<clipPath id="mark-clip"><rect x="${num(crop.x)}" y="${num(crop.y)}" width="${num(crop.width)}" height="${num(crop.height)}"${rx > 0 ? ` rx="${num(rx)}"` : ""}/></clipPath>`;
  const group = `<g id="mark"${carried} transform="translate(${num(tx)} ${num(ty)}) scale(${num(k)})" clip-path="url(#mark-clip)">${clip}${body}</g>`;
  const end = scene.lastIndexOf("</svg>");
  return scene.slice(0, end) + group + scene.slice(end);
}

/**
 * The page a browser renders the scene from: the SVG inline, sized to the canvas and cover-fitted
 * (`preserveAspectRatio="xMidYMid slice"`), on black, so a screenshot is the frame.
 */
export function sceneDocument(svg: string, width: number, height: number): string {
  const { viewBox } = sceneRules(svg);
  const body = svg
    .replace(/<\?xml[\s\S]*?\?>/, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
      const kept = attrs.replace(/\s(width|height|viewBox|preserveAspectRatio|style)="[^"]*"/g, "");
      return `<svg${kept} width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice">`;
    })
    .trim();
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#000;overflow:hidden}svg{display:block}</style></head><body>${body}</body></html>`;
}
