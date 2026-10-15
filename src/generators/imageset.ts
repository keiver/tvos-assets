import { join } from "node:path";
import type {
  ImageSetAssetConfig,
  SplashScreenLogoConfig,
  TvOSImageCreatorConfig,
} from "../types.js";
import { ensureDir, writeContentsJson, safeWriteFile } from "../utils/fs.js";
import {
  compositeIconOnBackground,
  heightAtWidth,
  renderAtSize,
  scaleMultiplier,
  validateOutputDimensions,
} from "../utils/image-processing.js";
import { splashLogoFilename, splashLogoVariants } from "../splash.js";
import type { ContentBox } from "../utils/image-processing.js";
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
  content?: ContentBox,
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
      asset.backgroundImage ?? config.inputs.backgroundImage,
      config.inputs.iconImage,
      w,
      h,
      {
        opaque: true,
        borderRadius: config.inputs.iconBorderRadius,
        sourceIconSize: iconSourceSize,
        iconScale: asset.iconScale ?? config.brandAssets.iconScale,
        content,
      },
    );

    safeWriteFile(join(imagesetDir, filename), buffer);
  }
}

/** Generate the splash screen logo imageset: per device type, its art on transparency, `width` points wide */
export async function generateSplashLogoImageSet(
  parentDir: string,
  logoConfig: SplashScreenLogoConfig,
  config: TvOSImageCreatorConfig,
  iconSourceSize?: number,
): Promise<void> {
  if (!logoConfig.enabled) return;

  const imagesetDir = join(parentDir, `${logoConfig.name}.imageset`);
  ensureDir(imagesetDir);

  const variants = splashLogoVariants(logoConfig);
  const contents = imageSetContentsJson(buildSplashLogoImageEntries(logoConfig.filePrefix, variants), config.xcassetsMeta);
  writeContentsJson(join(imagesetDir, "Contents.json"), contents);

  // The icon's border radius belongs to the icon, so separate splash art is drawn as is.
  const iconBorder = config.inputs.iconBorderRadius > 0 && iconSourceSize
    ? { borderRadius: config.inputs.iconBorderRadius, sourceIconSize: iconSourceSize }
    : undefined;

  for (const variant of variants) {
    const appearances: [string | undefined, boolean][] = [[variant.image, false]];
    if (variant.darkImage) appearances.push([variant.darkImage, true]);

    for (const [art, dark] of appearances) {
      const path = art ?? config.inputs.iconImage;
      const height = await heightAtWidth(path, variant.width);
      for (const scale of variant.scales) {
        const multiplier = scaleMultiplier(scale);
        const w = variant.width * multiplier;
        const h = height * multiplier;
        const filename = splashLogoFilename(logoConfig.filePrefix, variant.idiom, scale, dark);
        validateOutputDimensions(w, h, `${logoConfig.name} ${filename}`);

        const buffer = await renderAtSize(path, w, h, art ? undefined : iconBorder);
        safeWriteFile(join(imagesetDir, filename), buffer);
      }
    }
  }
}
