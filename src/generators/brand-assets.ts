import { join } from "node:path";
import type { TvOSImageCreatorConfig, BrandAssetEntry } from "../types.js";
import { ensureDir, writeContentsJson } from "../utils/fs.js";
import { brandAssetsContentsJson } from "./contents-json.js";
import { generateImageStack } from "./imagestack.js";
import { generateTopShelfImageSet } from "./imageset.js";

export async function generateBrandAssets(config: TvOSImageCreatorConfig): Promise<void> {
  const brandDir = join(config.output.directory, "Brand Assets.brandassets");
  ensureDir(brandDir);

  // Build asset manifest entries
  const assets: BrandAssetEntry[] = [];
  const { brandAssets } = config;

  if (brandAssets.appIconLarge.enabled) {
    assets.push({
      filename: `${brandAssets.appIconLarge.name}.imagestack`,
      idiom: "tv",
      role: "primary-app-icon",
      size: `${brandAssets.appIconLarge.size.width}x${brandAssets.appIconLarge.size.height}`,
    });
  }

  if (brandAssets.appIconSmall.enabled) {
    assets.push({
      filename: `${brandAssets.appIconSmall.name}.imagestack`,
      idiom: "tv",
      role: "primary-app-icon",
      size: `${brandAssets.appIconSmall.size.width}x${brandAssets.appIconSmall.size.height}`,
    });
  }

  if (brandAssets.topShelfImageWide.enabled) {
    assets.push({
      filename: `${brandAssets.topShelfImageWide.name}.imageset`,
      idiom: "tv",
      role: "top-shelf-image-wide",
      size: `${brandAssets.topShelfImageWide.size.width}x${brandAssets.topShelfImageWide.size.height}`,
    });
  }

  if (brandAssets.topShelfImage.enabled) {
    assets.push({
      filename: `${brandAssets.topShelfImage.name}.imageset`,
      idiom: "tv",
      role: "top-shelf-image",
      size: `${brandAssets.topShelfImage.size.width}x${brandAssets.topShelfImage.size.height}`,
    });
  }

  // Write Brand Assets Contents.json
  const contents = brandAssetsContentsJson(assets, config.xcassetsMeta);
  writeContentsJson(join(brandDir, "Contents.json"), contents);

  // Generate imagestacks (app icons)
  await generateImageStack(brandDir, brandAssets.appIconSmall, config);
  await generateImageStack(brandDir, brandAssets.appIconLarge, config);

  // Generate top shelf imagesets
  await generateTopShelfImageSet(brandDir, brandAssets.topShelfImage, config);
  await generateTopShelfImageSet(brandDir, brandAssets.topShelfImageWide, config);
}
