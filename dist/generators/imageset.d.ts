import type { ImageSetAssetConfig, SplashScreenLogoConfig, TvOSImageCreatorConfig } from "../types.js";
/** Generate a Top Shelf imageset (background + icon composited) */
export declare function generateTopShelfImageSet(parentDir: string, asset: ImageSetAssetConfig, config: TvOSImageCreatorConfig, iconSourceSize?: number): Promise<void>;
/** Generate the splash screen logo imageset (icon on transparent) */
export declare function generateSplashLogoImageSet(parentDir: string, logoConfig: SplashScreenLogoConfig, config: TvOSImageCreatorConfig, iconSourceSize?: number): Promise<void>;
//# sourceMappingURL=imageset.d.ts.map