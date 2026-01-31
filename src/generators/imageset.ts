import { join } from "node:path";
import type {
  ImageSetAssetConfig,
  SplashScreenLogoConfig,
  TvOSImageCreatorConfig,
} from "../types.js";
import { ensureDir, writeContentsJson, safeWriteFile } from "../utils/fs.js";
import {
  compositeIconOnBackground,
  renderIconOnTransparent,
  scaleMultiplier,
  validateOutputDimensions,
} from "../utils/image-processing.js";
import {
  imageSetContentsJson,
  buildTopShelfImageEntries,
  buildSplashLogoImageEntries,
} from "./contents-json.js";

/** Generate a Top Shelf imageset (background + icon composited) */
export async function generateTopShelfImageSet(
  parentDir: string,
  asset: ImageSetAssetConfig,
  config: TvOSImageCreatorConfig,
  iconSourceSize?: number,
): Promise<void> {
  if (!asset.enabled) return;

  const imagesetDir = join(parentDir, `${asset.name}.imageset`);
  ensureDir(imagesetDir);

  // Write Contents.json
  const imageEntries = buildTopShelfImageEntries(asset.filePrefix, asset.scales);
  const contents = imageSetContentsJson(imageEntries, config.xcassetsMeta);
  writeContentsJson(join(imagesetDir, "Contents.json"), contents);

  // Generate PNGs at each scale
  for (const scale of asset.scales) {
    const multiplier = scaleMultiplier(scale);
    const w = asset.size.width * multiplier;
    const h = asset.size.height * multiplier;
    validateOutputDimensions(w, h, `${asset.name} @${scale}`);
    const filename = `${asset.filePrefix}@${scale}.png`;

    const buffer = await compositeIconOnBackground(
      config.inputs.backgroundImage,
      config.inputs.iconImage,
      w,
      h,
      {
        opaque: true,
        borderRadius: config.inputs.iconBorderRadius,
        sourceIconSize: iconSourceSize,
      },
    );

    safeWriteFile(join(imagesetDir, filename), buffer);
  }
}

/** Generate the splash screen logo imageset (icon on transparent) */
export async function generateSplashLogoImageSet(
  parentDir: string,
  logoConfig: SplashScreenLogoConfig,
  config: TvOSImageCreatorConfig,
  iconSourceSize?: number,
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
  writeContentsJson(join(imagesetDir, "Contents.json"), contents);

  const borderOpts = config.inputs.iconBorderRadius > 0 && iconSourceSize
    ? { borderRadius: config.inputs.iconBorderRadius, sourceIconSize: iconSourceSize }
    : undefined;

  // Generate universal scale variants
  for (const scale of logoConfig.universal.scales) {
    const multiplier = scaleMultiplier(scale);
    const size = logoConfig.baseSize * multiplier;
    validateOutputDimensions(size, size, `${logoConfig.name} universal @${scale}`);
    const filename = `${logoConfig.filePrefix}@${scale}.png`;

    const buffer = await renderIconOnTransparent(config.inputs.iconImage, size, borderOpts);
    safeWriteFile(join(imagesetDir, filename), buffer);
  }

  // Generate tv scale variants
  for (const scale of logoConfig.tv.scales) {
    const multiplier = scaleMultiplier(scale);
    const size = logoConfig.baseSize * multiplier;
    validateOutputDimensions(size, size, `${logoConfig.name} tv @${scale}`);
    const filename = `${logoConfig.filePrefix}-tv@${scale}.png`;

    const buffer = await renderIconOnTransparent(config.inputs.iconImage, size, borderOpts);
    safeWriteFile(join(imagesetDir, filename), buffer);
  }
}
