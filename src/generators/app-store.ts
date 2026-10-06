import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { isSvgPath } from "../config.js";
import type { AppStorePlacementConfig, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir, safeWriteFile } from "../utils/fs.js";
import { compositeCenterInRect } from "../utils/image-processing.js";
import type { CenterItem, ContentBox, Rect } from "../utils/image-processing.js";
import { parseRowArtwork, renderRows } from "../utils/svg-rows.js";
import type { RowArtwork } from "../utils/svg-rows.js";
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

/** Placement override, then the appStore default, then the icon and background inputs. */
export function resolvePlacement(
  config: TvOSImageCreatorConfig,
  placement: AppStorePlacementConfig,
  iconSourceSize?: number,
  content?: ContentBox,
): ResolvedPlacement {
  const store = config.appStore;
  const backgroundImage = placement.backgroundImage ?? store.backgroundImage ?? config.inputs.backgroundImage;
  if (!placement.center) return { backgroundImage };

  const centerImage = placement.centerImage ?? store.centerImage;
  const center: CenterItem = centerImage
    ? { path: centerImage, scale: store.iconScale, square: false }
    : {
        path: config.inputs.iconImage,
        scale: store.iconScale,
        square: true,
        content,
        borderRadius: config.inputs.iconBorderRadius,
        sourceIconSize: iconSourceSize,
      };
  return { backgroundImage, center };
}

/** Placements this run writes. */
export function enabledAssets(config: TvOSImageCreatorConfig): AppStoreAsset[] {
  if (!config.appStore.enabled) return [];
  return APP_STORE_ASSETS.filter((asset) => config.appStore[asset.placement].enabled);
}

/** Where row artwork's centre goes: the centre of the placement's art safe area, else of its canvas. */
export function designCentre(asset: AppStoreAsset): { x: number; y: number } {
  const s = asset.safeArea;
  return s ? { x: s.x + s.width / 2, y: s.y + s.height / 2 } : { x: asset.width / 2, y: asset.height / 2 };
}

/** Finished artwork on the canvas: row artwork re-tiled to it, any other SVG or PNG cover-filled. */
export async function renderSource(
  source: string,
  width: number,
  height: number,
  centre: { x: number; y: number } = { x: width / 2, y: height / 2 },
): Promise<Buffer> {
  let image: sharp.Sharp;
  if (isSvgPath(source)) {
    const svg = readFileSync(source, "utf8");
    let art: RowArtwork | undefined;
    try {
      art = parseRowArtwork(svg);
    } catch {
      art = undefined;
    }
    image = art
      ? sharp(Buffer.from(renderRows(art, width, height, undefined, centre)))
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
  iconSourceSize?: number,
  content?: ContentBox,
): Promise<void> {
  const assets = enabledAssets(config);
  if (assets.length === 0) return;
  ensureDir(outDir);
  const cache = new StoreCache(outDir);

  for (const asset of assets) {
    const placement = config.appStore[asset.placement];
    if (placement.source) {
      const centre = designCentre(asset);
      const key = inputKey([placement.source], ["still", asset.width, asset.height, centre]);
      if (cache.fresh(asset.filename, key)) continue;
      safeWriteFile(join(outDir, asset.filename), await renderSource(placement.source, asset.width, asset.height, centre));
      cache.record(asset.filename, key);
      continue;
    }
    if (!asset.safeArea) continue; // config validation requires a source for these

    const { backgroundImage, center } = resolvePlacement(config, placement, iconSourceSize, content);
    const buffer = await compositeCenterInRect(backgroundImage, asset.width, asset.height, asset.safeArea, center);
    safeWriteFile(join(outDir, asset.filename), buffer);
  }
}
