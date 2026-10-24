import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright-core";
import sharp, { type Sharp } from "sharp";
import { isSvgPath } from "../config.js";
import type { AppStorePlacementConfig, SceneAnimate, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir, safeWriteFile } from "../utils/fs.js";
import { centerBox, compositeCenterInRect, iconMark } from "../utils/image-processing.js";
import type { CenterItem, Mark, Rect } from "../utils/image-processing.js";
import { rowStill } from "../utils/rise-frames.js";
import { openSceneBrowser, sceneFrames } from "../utils/scene-browser.js";
import { animateAt, filterReach, parseRowArtwork } from "../utils/svg-rows.js";
import type { RowArtwork } from "../utils/svg-rows.js";
import { expandScene, parseViewBox, placeMark, sceneRules } from "../utils/svg-scene.js";
import type { MarkArt } from "../utils/svg-scene.js";
import { StoreCache, inputKey } from "../utils/store-cache.js";

export type AppStorePlacement = "header" | "searchResults" | "universal" | "eventCard" | "eventDetails";

export interface AppStoreAsset {
  placement: AppStorePlacement;
  filename: string;
  title: string;
  width: number;
  height: number;
  /**
   * "Art Safe Area" rectangle from Apple's creative asset templates, in pixels. Apple publishes none
   * for In-App Event media, so those placements are drawn only from a `source`.
   */
  safeArea?: Rect;
  /** Basename of the looping video, for the placements App Store Connect takes video in. */
  video?: string;
  /** Shortest video App Store Connect accepts for this placement, in seconds (the longest is 30). */
  minSeconds?: number;
}

/** Canvases from App Store Connect's creative assets specifications. */
export const APP_STORE_ASSETS: readonly AppStoreAsset[] = [
  {
    placement: "header",
    filename: "header.png",
    title: "Product page header",
    width: 3840,
    height: 1646,
    safeArea: { x: 1097, y: 493, width: 1646, height: 661 },
    video: "header",
    minSeconds: 5,
  },
  {
    placement: "searchResults",
    filename: "search-results.png",
    title: "Search results",
    width: 3840,
    height: 2560,
    safeArea: { x: 836, y: 765, width: 2168, height: 1030 },
    video: "search-results",
    minSeconds: 5,
  },
  {
    placement: "universal",
    filename: "universal.png",
    title: "Universal (header and search results)",
    width: 5244,
    height: 2950,
    safeArea: { x: 1921, y: 660, width: 1402, height: 962 },
  },
  {
    placement: "eventCard",
    filename: "event-card.png",
    title: "In-App Event card",
    width: 3840,
    height: 2160,
    video: "event-card",
    minSeconds: 15,
  },
  {
    placement: "eventDetails",
    filename: "event-details.png",
    title: "In-App Event details page",
    width: 2160,
    height: 3840,
    video: "event-details",
    minSeconds: 15,
  },
];

export interface ResolvedPlacement {
  backgroundImage: string;
  /** Undefined when the placement draws no centre item. */
  center?: CenterItem;
}

/** Placement override, then the appStore default, then the mark and the background input. */
export function resolvePlacement(config: TvOSImageCreatorConfig, placement: AppStorePlacementConfig, mark: Mark): ResolvedPlacement {
  const store = config.appStore;
  const backgroundImage = placement.backgroundImage ?? store.backgroundImage ?? config.inputs.backgroundImage;
  if (!placement.center) return { backgroundImage };

  const centerImage = placement.centerImage ?? store.centerImage;
  const center: CenterItem = centerImage
    ? { path: centerImage, scale: store.iconScale, square: false }
    : {
        path: mark.path,
        scale: store.iconScale,
        square: true,
        content: mark.content,
        borderRadius: mark.borderRadius,
        sourceIconSize: mark.sourceSize,
      };
  return { backgroundImage, center };
}

/** Placements this run writes. */
export function enabledAssets(config: TvOSImageCreatorConfig): AppStoreAsset[] {
  if (!config.appStore.enabled) return [];
  return APP_STORE_ASSETS.filter((asset) => config.appStore[asset.placement].enabled);
}

/**
 * Where row artwork's centre goes: the centre of the placement's art safe area (else of its canvas),
 * moved when the card under the fixed layer would not sit whole in the safe area (half a gap clear):
 * sideways until the next card shows by one gap, vertically until it is half a gap clear.
 */
export function designCentre(asset: AppStoreAsset, art?: RowArtwork): { x: number; y: number } {
  const s = asset.safeArea;
  if (!s) return { x: asset.width / 2, y: asset.height / 2 };
  const centre = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  const card = art?.anchor;
  if (!art || !card) return centre;
  const fit = (lo: number, hi: number, min: number, max: number, clear: number, to: number): number => {
    const room = Math.max(clear, Math.min(to, max - min - (hi - lo) - clear));
    return lo < min + clear ? min + room - lo : hi > max - clear ? max - room - hi : 0;
  };
  const dx = centre.x - art.width / 2, dy = centre.y - art.height / 2;
  const gx = art.pitchX - (card.x1 - card.x0), gy = art.pitchY - (card.y1 - card.y0);
  return {
    x: centre.x + fit(card.x0 + dx, card.x1 + dx, s.x, s.x + s.width, gx / 2, 2 * gx),
    y: centre.y + fit(card.y0 + dy, card.y1 + dy, s.y, s.y + s.height, gy / 2, gy / 2),
  };
}

/** Row artwork read from `source`, or undefined when it is not an SVG that follows the rules. */
export function readRowArtwork(source: string | undefined): RowArtwork | undefined {
  if (!source || !isSvgPath(source)) return undefined;
  try {
    return parseRowArtwork(readFileSync(source, "utf8"));
  } catch {
    return undefined;
  }
}

/** The placement's scene settings, when its `animate` is a scene (`loop`, `elements`) and not row motion. */
export function sceneAnimate(placement: AppStorePlacementConfig): SceneAnimate | undefined {
  const animate = placement.animate as Record<string, unknown> | undefined;
  if (!animate || "rows" in animate || "rise" in animate) return undefined;
  return animate as SceneAnimate;
}

/** The SVG a scene placement plays: its `source`, else its backdrop. */
export function sceneArt(config: TvOSImageCreatorConfig, placement: AppStorePlacementConfig): string | undefined {
  return placement.source ?? resolvePlacement(config, placement, iconMark(config.inputs.iconImage, 0)).backgroundImage;
}

/** Whether a scene placement gets the centre item: a backdrop scene with `center` and a safe area. */
export function sceneDrawsCenter(config: TvOSImageCreatorConfig, asset: AppStoreAsset): boolean {
  const placement = config.appStore[asset.placement];
  return !placement.source && placement.center && Boolean(asset.safeArea);
}

/** Enabled scene placements whose file as played differs from the input (rules or a centre item), so it is written too. */
export function sceneSidecars(config: TvOSImageCreatorConfig): AppStoreAsset[] {
  return enabledAssets(config).filter((asset) => {
    const scene = sceneAnimate(config.appStore[asset.placement]);
    return Boolean(scene) && (Boolean(scene?.elements?.length) || sceneDrawsCenter(config, asset));
  });
}

/** The expanded SVG's filename beside a placement's still: `header.svg` for `header.png`. */
export function sceneSidecarName(asset: AppStoreAsset): string {
  return asset.filename.replace(/\.png$/, ".svg");
}

/** A mark file as art for `placeMark`: an SVG's text and viewBox, or a PNG's bytes and pixel size. */
export async function readMarkArt(mark: Mark): Promise<MarkArt> {
  const { content, sourceSize, borderRadius } = mark;
  if (isSvgPath(mark.path)) {
    const svg = readFileSync(mark.path, "utf8");
    return { svg, viewBox: parseViewBox(sceneRules(svg).viewBox), content, sourceSize, borderRadius };
  }
  const meta = await sharp(mark.path).metadata();
  return { png: readFileSync(mark.path), viewBox: { x: 0, y: 0, width: meta.width ?? 0, height: meta.height ?? 0 }, content, sourceSize, borderRadius };
}

export interface ComposedScene {
  /** The file as played: the art, the centre item drawn in, the `elements` rules written in. */
  svg: string;
  scene: SceneAnimate;
  /** What the output is made from, for the store cache: the files read and the settings used. */
  files: (string | undefined)[];
  settings: unknown[];
}

/**
 * A scene placement's SVG as the browser plays it, checked against the loop. A backdrop scene gets
 * the centre item (the mark, or `centerImage` contain-fit) in the safe area; a `source` plays as it is.
 */
export async function composeScene(config: TvOSImageCreatorConfig, asset: AppStoreAsset, mark: Mark): Promise<ComposedScene> {
  const placement = config.appStore[asset.placement];
  const scene = sceneAnimate(placement) as SceneAnimate;
  const art = sceneArt(config, placement) as string;
  let svg = readFileSync(art, "utf8");
  const files: (string | undefined)[] = [art];
  const settings: unknown[] = [scene];
  if (sceneDrawsCenter(config, asset)) {
    const { center } = resolvePlacement(config, placement, mark);
    const item = center as CenterItem;
    const rect = asset.safeArea as Rect;
    const box = item.square
      ? centerBox(rect, item.scale)
      : { x: rect.x + (rect.width - rect.width * item.scale) / 2, y: rect.y + (rect.height - rect.height * item.scale) / 2, width: rect.width * item.scale, height: rect.height * item.scale };
    const itemMark: Mark = item.square ? mark : { path: item.path, borderRadius: 0 };
    svg = placeMark(svg, await readMarkArt(itemMark), box, asset);
    files.push(item.path);
    settings.push(box, item.square);
  }
  svg = expandScene(svg, scene.elements);
  sceneRules(svg, scene.loop);
  return { svg, scene, files, settings };
}

/** A scene's still: its first frame drawn by the browser. */
export async function renderScene(browser: Browser, svg: string, width: number, height: number): Promise<Buffer> {
  const frames = await sceneFrames(browser, svg, width, height, 1);
  try {
    const raw = await frames.frame(0);
    return await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  } finally {
    await frames.close();
  }
}

/** Finished artwork on the canvas: row artwork re-tiled to it, any other SVG or PNG cover-filled. */
export async function renderSource(
  source: string,
  width: number,
  height: number,
  centre: { x: number; y: number } = { x: width / 2, y: height / 2 },
): Promise<Buffer> {
  let image: Sharp;
  if (isSvgPath(source)) {
    const svg = readFileSync(source, "utf8");
    const art = readRowArtwork(source);
    image = art
      ? rowStill({ ...art, source: animateAt(art.source, 0) }, width, height, centre)
      : sharp(Buffer.from(svg)).resize(width, height, { fit: "cover" });
  } else {
    image = sharp(source).resize(width, height, { fit: "cover" });
  }
  return image.flatten({ background: { r: 0, g: 0, b: 0 } }).removeAlpha().png().toBuffer();
}

/** Write every enabled creative asset into `outDir`, opaque; unchanged ones are left as they are. */
export async function generateAppStoreAssets(
  outDir: string,
  config: TvOSImageCreatorConfig,
  mark: Mark = iconMark(config.inputs.iconImage, config.inputs.iconBorderRadius),
): Promise<void> {
  const assets = enabledAssets(config);
  if (assets.length === 0) return;
  ensureDir(outDir);
  const cache = new StoreCache(outDir);
  let browser: Browser | undefined;

  try {
  for (const asset of assets) {
    const placement = config.appStore[asset.placement];
    if (sceneAnimate(placement) && (placement.source || asset.safeArea)) {
      const { svg, files, settings } = await composeScene(config, asset, mark);
      const sidecar = sceneSidecars(config).includes(asset) ? sceneSidecarName(asset) : undefined;
      const key = inputKey(files, ["scene", asset.width, asset.height, ...settings]);
      if (cache.fresh(asset.filename, key) && (!sidecar || cache.fresh(sidecar, key))) continue;
      browser ??= await openSceneBrowser();
      safeWriteFile(join(outDir, asset.filename), await renderScene(browser, svg, asset.width, asset.height));
      cache.record(asset.filename, key);
      if (sidecar) {
        safeWriteFile(join(outDir, sidecar), Buffer.from(svg));
        cache.record(sidecar, key);
      }
      continue;
    }
    if (placement.source) {
      const art = readRowArtwork(placement.source);
      const centre = designCentre(asset, art);
      // The bleed is part of the key: it decides what filtered art draws at the canvas edges.
      const bleed = art ? filterReach(art.source) : 0;
      const key = inputKey([placement.source], ["still", asset.width, asset.height, centre, ...(bleed ? [bleed] : [])]);
      if (cache.fresh(asset.filename, key)) continue;
      safeWriteFile(join(outDir, asset.filename), await renderSource(placement.source, asset.width, asset.height, centre));
      cache.record(asset.filename, key);
      continue;
    }
    if (!asset.safeArea) continue; // config validation requires a source for these

    const { backgroundImage, center } = resolvePlacement(config, placement, mark);
    const buffer = await compositeCenterInRect(backgroundImage, asset.width, asset.height, asset.safeArea, center);
    safeWriteFile(join(outDir, asset.filename), buffer);
  }
  } finally {
    await browser?.close();
  }
}
