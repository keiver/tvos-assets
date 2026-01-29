import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ImageSetAssetConfig,
  SplashScreenLogoConfig,
  TvOSImageCreatorConfig,
  ScaleFactor,
} from "../types.js";
import { ensureDir } from "../utils/fs.js";
import { compositeIconOnBackground, renderIconOnTransparent } from "../utils/image-processing.js";
import {
  imageSetContentsJson,
  buildTopShelfImageEntries,
  buildSplashLogoImageEntries,
} from "./contents-json.js";

function scaleMultiplier(scale: ScaleFactor): number {
  return parseInt(scale.replace("x", ""), 10);
}

/** Generate a Top Shelf imageset (background + icon composited) */
export async function generateTopShelfImageSet(
  parentDir: string,
  asset: ImageSetAssetConfig,
  config: TvOSImageCreatorConfig,
): Promise<void> {
  if (!asset.enabled) return;

  const imagesetDir = join(parentDir, `${asset.name}.imageset`);
  ensureDir(imagesetDir);

  // Write Contents.json
  const imageEntries = buildTopShelfImageEntries(asset.filePrefix, asset.scales);
  const contents = imageSetContentsJson(imageEntries, config.xcassetsMeta);
  writeFileSync(join(imagesetDir, "Contents.json"), JSON.stringify(contents, null, 2));

  // Generate PNGs at each scale
  for (const scale of asset.scales) {
    const multiplier = scaleMultiplier(scale);
    const w = asset.size.width * multiplier;
    const h = asset.size.height * multiplier;
    const filename = `${asset.filePrefix}@${scale}.png`;

    const buffer = await compositeIconOnBackground(
      config.inputs.backgroundImage,
      config.inputs.iconImage,
      w,
      h,
      { opaque: true },
    );

    writeFileSync(join(imagesetDir, filename), buffer);
  }
}

/** Generate the splash screen logo imageset (icon on transparent) */
export async function generateSplashLogoImageSet(
  parentDir: string,
  logoConfig: SplashScreenLogoConfig,
  config: TvOSImageCreatorConfig,
): Promise<void> {
  if (!logoConfig.enabled) return;

  const imagesetDir = join(parentDir, `${logoConfig.name}.imageset`);
  ensureDir(imagesetDir);

  // Write Contents.json
  const imageEntries = buildSplashLogoImageEntries(
    logoConfig.filePrefix,
    logoConfig.universal.scales,
    logoConfig.tv.scales,
  );
  const contents = imageSetContentsJson(imageEntries, config.xcassetsMeta);
  writeFileSync(join(imagesetDir, "Contents.json"), JSON.stringify(contents, null, 2));

  // Generate universal scale variants
  for (const scale of logoConfig.universal.scales) {
    const multiplier = scaleMultiplier(scale);
    const size = logoConfig.baseSize * multiplier;
    const filename = `${logoConfig.filePrefix}@${scale}.png`;

    const buffer = await renderIconOnTransparent(config.inputs.iconImage, size);
    writeFileSync(join(imagesetDir, filename), buffer);
  }

  // Generate tv scale variants (filename has " 1" suffix)
  for (const scale of logoConfig.tv.scales) {
    const multiplier = scaleMultiplier(scale);
    const size = logoConfig.baseSize * multiplier;
    const filename = `${logoConfig.filePrefix}@${scale} 1.png`;

    const buffer = await renderIconOnTransparent(config.inputs.iconImage, size);
    writeFileSync(join(imagesetDir, filename), buffer);
  }
}
