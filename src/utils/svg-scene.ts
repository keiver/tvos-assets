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
