import type { ContentsJson, BrandAssetsContentsJson, BrandAssetEntry, ImageStackContentsJson, ImageSetContentsJson, ImageEntry, ColorSetContentsJson, ScaleFactor, XcassetsMetaConfig } from "../types.js";
/** Root xcassets Contents.json */
export declare function rootContentsJson(meta: XcassetsMetaConfig): ContentsJson;
/** Brand Assets .brandassets/Contents.json */
export declare function brandAssetsContentsJson(assets: BrandAssetEntry[], meta: XcassetsMetaConfig): BrandAssetsContentsJson;
/** Imagestack Contents.json with layer references */
export declare function imageStackContentsJson(layers: string[], meta: XcassetsMetaConfig): ImageStackContentsJson;
/** Imagestacklayer Contents.json (just info) */
export declare function imageStackLayerContentsJson(meta: XcassetsMetaConfig): ContentsJson;
/** Imageset Contents.json for imagestack layers */
export declare function imageSetContentsJson(images: ImageEntry[], meta: XcassetsMetaConfig): ImageSetContentsJson;
/** Build image entries for a layered icon imageset (within imagestack) */
export declare function buildImageStackImageEntries(layerName: string, scales: ScaleFactor[], isAppStore: boolean): ImageEntry[];
/** Build image entries for a top shelf imageset */
export declare function buildTopShelfImageEntries(filePrefix: string, scales: ScaleFactor[]): ImageEntry[];
/** Build image entries for splash screen logo imageset */
export declare function buildSplashLogoImageEntries(filePrefix: string, universalScales: ScaleFactor[], tvScales: ScaleFactor[]): ImageEntry[];
/** Build colorset Contents.json for splash screen background */
export declare function colorSetContentsJson(universalLight: string, universalDark: string, tvLight: string, tvDark: string, meta: XcassetsMetaConfig): ColorSetContentsJson;
//# sourceMappingURL=contents-json.d.ts.map