import type {
  ContentsJson,
  BrandAssetsContentsJson,
  BrandAssetEntry,
  ImageStackContentsJson,
  ImageSetContentsJson,
  ImageEntry,
  ColorSetContentsJson,
  ColorSetEntry,
  ScaleFactor,
  XcassetsMetaConfig,
} from "../types.js";
import { hexToRGBA, rgbaToAppleComponents } from "../utils/color.js";

function makeInfo(meta: XcassetsMetaConfig) {
  return { author: meta.author, version: meta.version };
}

/** Root xcassets Contents.json */
export function rootContentsJson(meta: XcassetsMetaConfig): ContentsJson {
  return { info: makeInfo(meta) };
}

/** Brand Assets .brandassets/Contents.json */
export function brandAssetsContentsJson(
  assets: BrandAssetEntry[],
  meta: XcassetsMetaConfig,
): BrandAssetsContentsJson {
  return {
    assets,
    info: makeInfo(meta),
  };
}

/** Imagestack Contents.json with layer references */
export function imageStackContentsJson(
  layers: string[],
  meta: XcassetsMetaConfig,
): ImageStackContentsJson {
  return {
    info: makeInfo(meta),
    layers: layers.map((filename) => ({ filename })),
  };
}

/** Imagestacklayer Contents.json (just info) */
export function imageStackLayerContentsJson(meta: XcassetsMetaConfig): ContentsJson {
  return { info: makeInfo(meta) };
}

/** Imageset Contents.json for imagestack layers */
export function imageSetContentsJson(
  images: ImageEntry[],
  meta: XcassetsMetaConfig,
): ImageSetContentsJson {
  return {
    images,
    info: makeInfo(meta),
  };
}

/** Build image entries for a layered icon imageset (within imagestack) */
export function buildImageStackImageEntries(
  layerName: string,
  scales: ScaleFactor[],
  isAppStore: boolean,
): ImageEntry[] {
  if (isAppStore) {
    // App Store variant: single scale, no "scale" field
    // Back layer uses plain name (no @1x), front/middle use @1x
    const prefix = layerName.toLowerCase();
    const filename = prefix === "back" ? `${prefix}.png` : `${prefix}@1x.png`;
    return [{ filename, idiom: "tv" }];
  }

  return scales.map((scale) => ({
    filename: `${layerName.toLowerCase()}@${scale}.png`,
    idiom: "tv",
    scale,
  }));
}

/** Build image entries for a top shelf imageset */
export function buildTopShelfImageEntries(
  filePrefix: string,
  scales: ScaleFactor[],
): ImageEntry[] {
  return scales.map((scale) => ({
    filename: `${filePrefix}@${scale}.png`,
    idiom: "tv",
    scale,
  }));
}

/** Build image entries for splash screen logo imageset */
export function buildSplashLogoImageEntries(
  filePrefix: string,
  universalScales: ScaleFactor[],
  tvScales: ScaleFactor[],
): ImageEntry[] {
  const entries: ImageEntry[] = [];

  for (const scale of universalScales) {
    entries.push({
      filename: `${filePrefix}@${scale}.png`,
      idiom: "universal",
      scale,
    });
  }

  for (const scale of tvScales) {
    entries.push({
      filename: `${filePrefix}@${scale} 1.png`,
      idiom: "tv",
      scale,
    });
  }

  return entries;
}

/** Build colorset Contents.json for splash screen background */
export function colorSetContentsJson(
  universalLight: string,
  universalDark: string,
  tvLight: string,
  tvDark: string,
  meta: XcassetsMetaConfig,
): ColorSetContentsJson {
  function makeColorValue(hex: string) {
    const rgba = hexToRGBA(hex);
    const components = rgbaToAppleComponents(rgba);
    return {
      "color-space": "srgb" as const,
      components,
    };
  }

  const colors: ColorSetEntry[] = [
    {
      color: makeColorValue(universalLight),
      idiom: "universal",
    },
    {
      appearances: [{ appearance: "luminosity", value: "dark" }],
      color: makeColorValue(universalDark),
      idiom: "universal",
    },
    {
      color: makeColorValue(tvLight),
      idiom: "tv",
    },
    {
      appearances: [{ appearance: "luminosity", value: "dark" }],
      color: makeColorValue(tvDark),
      idiom: "tv",
    },
  ];

  return {
    colors,
    info: makeInfo(meta),
  };
}
