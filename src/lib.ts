import { join } from "node:path";
import { resolveConfig, validateInputImages } from "./config.js";
import type { CLIArgs, ImageValidationResult } from "./config.js";
import { rootContentsJson } from "./generators/contents-json.js";
import { generateBrandAssets } from "./generators/brand-assets.js";
import { generateAppIconSet } from "./generators/appiconset.js";
import { generateSplashLogoImageSet } from "./generators/imageset.js";
import { generateColorSet } from "./generators/colorset.js";
import { generateIcon } from "./generators/icon.js";
import type { TvOSImageCreatorConfig } from "./types.js";
import { ensureDir, cleanDir, writeContentsJson } from "./utils/fs.js";

export type TargetPlatform = "tvos" | "ios";

export interface GenerateOptions {
  /** Which app-icon families to generate: "tvos" = brandassets, "ios" = appiconset. Default: both. */
  platforms?: TargetPlatform[];
  /** Also write the flattened 1024x1024 icon.png to this absolute path. */
  standaloneIconPath?: string;
  /** Called before each generation phase with a human-readable message. */
  onStep?: (message: string) => void;
}

export interface GenerateResult {
  warnings: string[];
  xcassetsDir: string;
}

/**
 * Generate an Images.xcassets catalog directly into xcassetsDir.
 *
 * The catalog may already exist (e.g. an Expo-generated ios/<app>/Images.xcassets);
 * asset directories owned by this tool are cleaned and rewritten, everything else
 * in the catalog is left untouched.
 */
export async function generateAssets(
  config: TvOSImageCreatorConfig,
  xcassetsDir: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const platforms = options.platforms ?? ["tvos", "ios"];
  const step = options.onStep ?? (() => {});

  const { warnings, iconSourceSize } = await validateInputImages(config);

  step("Creating xcassets directory...");
  ensureDir(xcassetsDir);
  writeContentsJson(join(xcassetsDir, "Contents.json"), rootContentsJson(config.xcassetsMeta));

  if (platforms.includes("tvos")) {
    step("Generating tvOS brand assets (app icons + top shelf)...");
    cleanDir(join(xcassetsDir, `${config.brandAssets.name}.brandassets`));
    await generateBrandAssets(xcassetsDir, config, iconSourceSize);
  }

  if (platforms.includes("ios") && config.iosIcon.enabled) {
    step("Generating iOS app icon (light + dark + tinted)...");
    cleanDir(join(xcassetsDir, `${config.iosIcon.name}.appiconset`));
    await generateAppIconSet(xcassetsDir, config, iconSourceSize);
  }

  if (config.splashScreen.logo.enabled) {
    step("Generating splash screen logo...");
    cleanDir(join(xcassetsDir, `${config.splashScreen.logo.name}.imageset`));
    await generateSplashLogoImageSet(xcassetsDir, config.splashScreen.logo, config, iconSourceSize);
  }

  if (config.splashScreen.background.enabled) {
    step("Generating splash screen background colorset...");
    cleanDir(join(xcassetsDir, `${config.splashScreen.background.name}.colorset`));
    generateColorSet(xcassetsDir, config.splashScreen.background, config);
  }

  if (options.standaloneIconPath) {
    step("Generating icon.png (1024x1024)...");
    await generateIcon(config, options.standaloneIconPath, iconSourceSize);
  }

  return { warnings, xcassetsDir };
}

export { resolveConfig, validateInputImages };
export type { CLIArgs, ImageValidationResult };
export type * from "./types.js";
