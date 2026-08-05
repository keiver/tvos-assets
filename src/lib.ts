import { join } from "node:path";
import {
  resolveConfig,
  validateInputImages,
  discoverConfigPath,
  configShapeTemplate,
  CONFIG_FILENAME,
} from "./config.js";
import type { CLIArgs, ImageValidationResult } from "./config.js";
import { rootContentsJson } from "./generators/contents-json.js";
import { generateBrandAssets } from "./generators/brand-assets.js";
import { generateAppIconSet } from "./generators/appiconset.js";
import { generateSplashLogoImageSet } from "./generators/imageset.js";
import { generateColorSet } from "./generators/colorset.js";
import { generateIcon } from "./generators/icon.js";
import { generatePreview } from "./generators/preview.js";
import type { OutsideLinkStyle } from "./generators/preview.js";
import type { TvOSImageCreatorConfig } from "./types.js";
import { ensureDir, cleanDir, writeContentsJson } from "./utils/fs.js";

export type TargetPlatform = "tvos" | "ios";

export interface GenerateOptions {
  /** Which app-icon families to generate: "tvos" = brandassets, "ios" = appiconset. Default: both. */
  platforms?: TargetPlatform[];
  /** Also write the flattened 1024x1024 icon.png to this absolute path. */
  standaloneIconPath?: string;
  /** Also write a self-contained preview.html contact sheet to this absolute path. */
  previewPath?: string;
  /** Tool version stamped into the preview page header. */
  toolVersion?: string;
  /** Command line that produced this run, shown verbatim on the preview page. */
  command?: string;
  /** Config file this run read, if any, noted on the preview page. */
  configPath?: string;
  /** How to link source files that sit outside the output directory. */
  outsideLinks?: OutsideLinkStyle;
  /** Called before each generation phase with a human-readable message. */
  onStep?: (message: string) => void;
}

export interface GenerateResult {
  warnings: string[];
  xcassetsDir: string;
}

export interface PlanOptions {
  platforms?: TargetPlatform[];
  /** Whether the run also writes the standalone icon.png. */
  standaloneIcon?: boolean;
  /** Whether the run also writes preview.html. */
  preview?: boolean;
}

export interface AssetPlan {
  /**
   * Top-level asset bundles written directly under Images.xcassets, in
   * generation order: the ones cleaned and rewritten by a run, such as
   * `AppIcon.brandassets` and `SplashScreenLogo.imageset`.
   *
   * Not a complete directory listing. Bundles nest further (a `.brandassets`
   * contains `.imagestack` and `.imageset` directories, each imagestack
   * contains three `.imagestacklayer` directories, and so on) and those are
   * deliberately not enumerated here, since their names come from the
   * generators. Use this for cleanup targets and summaries, not for walking
   * the output; read the written catalog for that.
   */
  directories: string[];
  contentsJson: number;
  /** PNGs written inside the catalog; excludes the standalone icon.png. */
  pngs: number;
  standaloneIcon: boolean;
  preview: boolean;
  /** Every file written: Contents.json + catalog PNGs + icon.png + preview.html. */
  total: number;
}

/**
 * Count what a run would write, without writing anything. Shared by --dry-run
 * and the completion summary so the two can never disagree.
 */
export function planAssets(config: TvOSImageCreatorConfig, options: PlanOptions = {}): AssetPlan {
  const platforms = options.platforms ?? ["tvos", "ios"];
  const directories: string[] = [];
  let contentsJson = 1; // root Contents.json
  let pngs = 0;

  if (platforms.includes("tvos")) {
    directories.push(`${config.brandAssets.name}.brandassets`);
    contentsJson += 1;

    for (const stack of [config.brandAssets.appIconSmall, config.brandAssets.appIconLarge]) {
      if (!stack.enabled) continue;
      // imagestack Contents.json + 3 layers * (layer Contents.json + imageset Contents.json)
      contentsJson += 1 + 3 * 2;
      pngs += 3 * stack.scales.length;
    }

    for (const imageset of [config.brandAssets.topShelfImage, config.brandAssets.topShelfImageWide]) {
      if (!imageset.enabled) continue;
      contentsJson += 1;
      pngs += imageset.scales.length;
    }
  }

  if (platforms.includes("ios") && config.iosIcon.enabled) {
    directories.push(`${config.iosIcon.name}.appiconset`);
    contentsJson += 1;
    pngs += 3; // light + dark + tinted
  }

  if (config.splashScreen.logo.enabled) {
    directories.push(`${config.splashScreen.logo.name}.imageset`);
    contentsJson += 1;
    pngs += config.splashScreen.logo.universal.scales.length + config.splashScreen.logo.tv.scales.length;
  }

  if (config.splashScreen.background.enabled) {
    directories.push(`${config.splashScreen.background.name}.colorset`);
    contentsJson += 1;
  }

  const standaloneIcon = options.standaloneIcon ?? false;
  const preview = options.preview ?? false;

  return {
    directories,
    contentsJson,
    pngs,
    standaloneIcon,
    preview,
    total: contentsJson + pngs + (standaloneIcon ? 1 : 0) + (preview ? 1 : 0),
  };
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

  if (options.previewPath) {
    step("Generating preview.html...");
    await generatePreview({
      xcassetsDir,
      outputPath: options.previewPath,
      config,
      platforms,
      standaloneIconPath: options.standaloneIconPath,
      toolVersion: options.toolVersion,
      command: options.command,
      configPath: options.configPath,
      outsideLinks: options.outsideLinks,
    });
  }

  return { warnings, xcassetsDir };
}

export { resolveConfig, validateInputImages, discoverConfigPath, configShapeTemplate, CONFIG_FILENAME };
export type { CLIArgs, ImageValidationResult };
export type * from "./types.js";
