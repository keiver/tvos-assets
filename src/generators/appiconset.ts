import { join } from "node:path";
import type { TvOSImageCreatorConfig } from "../types.js";
import { ensureDir, writeContentsJson, safeWriteFile } from "../utils/fs.js";
import {
  compositeIconOnBackground,
  renderIconOnTransparentCanvas,
  toGrayscale,
} from "../utils/image-processing.js";
import { appIconSetContentsJson } from "./contents-json.js";

const ICON_SIZE = 1024;

const FILENAMES = {
  light: "icon-1024.png",
  dark: "icon-1024-dark.png",
  tinted: "icon-1024-tinted.png",
} as const;

/**
 * Generate the iOS AppIcon.appiconset with light, dark, and tinted (iOS 18+)
 * appearance variants. Light composites the icon on the background image;
 * dark and tinted sit on transparency (Apple supplies the backdrop) and are
 * auto-derived from the main icon unless explicit overrides are configured.
 */
export async function generateAppIconSet(
  parentDir: string,
  config: TvOSImageCreatorConfig,
  iconSourceSize?: number,
): Promise<void> {
  if (!config.iosIcon.enabled) return;

  const setDir = join(parentDir, `${config.iosIcon.name}.appiconset`);
  ensureDir(setDir);

  const contents = appIconSetContentsJson(FILENAMES, config.xcassetsMeta);
  writeContentsJson(join(setDir, "Contents.json"), contents);

  const borderOpts = {
    borderRadius: config.inputs.iconBorderRadius,
    sourceIconSize: iconSourceSize,
  };

  const lightBuffer = await compositeIconOnBackground(
    config.inputs.backgroundImage,
    config.inputs.iconImage,
    ICON_SIZE,
    ICON_SIZE,
    { opaque: true, ...borderOpts },
  );
  safeWriteFile(join(setDir, FILENAMES.light), lightBuffer);

  const darkSource = config.inputs.iconDarkImage ?? config.inputs.iconImage;
  const darkBuffer = await renderIconOnTransparentCanvas(
    darkSource,
    ICON_SIZE,
    ICON_SIZE,
    darkSource === config.inputs.iconImage ? borderOpts : undefined,
  );
  safeWriteFile(join(setDir, FILENAMES.dark), darkBuffer);

  const tintedSource = config.inputs.iconTintedImage ?? config.inputs.iconImage;
  let tintedBuffer = await renderIconOnTransparentCanvas(
    tintedSource,
    ICON_SIZE,
    ICON_SIZE,
    tintedSource === config.inputs.iconImage ? borderOpts : undefined,
  );
  if (!config.inputs.iconTintedImage) {
    tintedBuffer = await toGrayscale(tintedBuffer);
  }
  safeWriteFile(join(setDir, FILENAMES.tinted), tintedBuffer);
}
