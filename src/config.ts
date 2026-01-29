import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import type { TvOSImageCreatorConfig } from "./types.js";

interface CLIArgs {
  icon?: string;
  background?: string;
  color?: string;
  config?: string;
  output?: string;
}

function defaultOutputDirectory(): string {
  const desktop = join(homedir(), "Desktop");
  const base = existsSync(desktop) ? desktop : homedir();
  return join(base, "Images.xcassets");
}

function getDefaultConfig(
  iconImage: string,
  backgroundImage: string,
  backgroundColor: string,
): TvOSImageCreatorConfig {
  return {
    inputs: {
      iconImage,
      backgroundImage,
      backgroundColor,
    },
    output: {
      directory: defaultOutputDirectory(),
      cleanBeforeGenerate: true,
    },
    brandAssets: {
      appIconSmall: {
        enabled: true,
        name: "App Icon",
        size: { width: 400, height: 240 },
        scales: ["1x", "2x"],
        layers: {
          front: { source: "icon" },
          middle: { source: "icon" },
          back: { source: "background" },
        },
      },
      appIconLarge: {
        enabled: true,
        name: "App Icon - App Store",
        size: { width: 1280, height: 768 },
        scales: ["1x"],
        layers: {
          front: { source: "icon" },
          middle: { source: "icon" },
          back: { source: "background" },
        },
      },
      topShelfImage: {
        enabled: true,
        name: "Top Shelf Image",
        size: { width: 1920, height: 720 },
        scales: ["1x", "2x"],
        filePrefix: "top",
      },
      topShelfImageWide: {
        enabled: true,
        name: "Top Shelf Image Wide",
        size: { width: 2320, height: 720 },
        scales: ["1x", "2x"],
        filePrefix: "wide",
      },
    },
    splashScreen: {
      logo: {
        enabled: true,
        name: "SplashScreenLogo",
        baseSize: 200,
        filePrefix: "200-icon",
        universal: { scales: ["1x", "2x", "3x"] },
        tv: { scales: ["1x", "2x"] },
      },
      background: {
        enabled: true,
        name: "SplashScreenBackground",
        universal: {
          light: backgroundColor,
          dark: backgroundColor,
        },
        tv: {
          light: backgroundColor,
          dark: backgroundColor,
        },
      },
    },
    xcassetsMeta: {
      author: "xcode",
      version: 1,
    },
  };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function resolveConfig(cliArgs: CLIArgs): TvOSImageCreatorConfig {
  let fileConfig: Partial<TvOSImageCreatorConfig> = {};

  // Load config file if specified
  if (cliArgs.config) {
    const configPath = resolve(cliArgs.config);
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    const raw = readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(raw) as Partial<TvOSImageCreatorConfig>;
  }

  // Determine input values: CLI args override config file
  const iconImage = cliArgs.icon ?? fileConfig.inputs?.iconImage ?? "";
  const backgroundImage = cliArgs.background ?? fileConfig.inputs?.backgroundImage ?? "";
  const backgroundColor = cliArgs.color ?? fileConfig.inputs?.backgroundColor ?? "";

  if (!iconImage) {
    throw new Error("Icon image is required. Use --icon or set inputs.iconImage in config.");
  }
  if (!backgroundImage) {
    throw new Error("Background image is required. Use --background or set inputs.backgroundImage in config.");
  }
  if (!backgroundColor) {
    throw new Error("Background color is required. Use --color or set inputs.backgroundColor in config.");
  }

  // Validate icon path exists
  const resolvedIcon = resolve(iconImage);
  if (!existsSync(resolvedIcon)) {
    throw new Error(`Icon image not found: ${resolvedIcon}`);
  }

  // Validate background path exists
  const resolvedBg = resolve(backgroundImage);
  if (!existsSync(resolvedBg)) {
    throw new Error(`Background image not found: ${resolvedBg}`);
  }

  // Validate color format
  if (!/^#[0-9a-fA-F]{6}$/.test(backgroundColor)) {
    throw new Error(`Invalid color format: "${backgroundColor}". Use hex format like "#B43939".`);
  }

  // Build default config with resolved values
  const defaults = getDefaultConfig(resolvedIcon, resolvedBg, backgroundColor);

  // Merge: file config overrides defaults, then apply CLI overrides
  const merged = deepMerge(
    defaults as unknown as Record<string, unknown>,
    fileConfig as unknown as Record<string, unknown>,
  ) as unknown as TvOSImageCreatorConfig;

  // Ensure CLI args always win for inputs
  merged.inputs.iconImage = resolvedIcon;
  merged.inputs.backgroundImage = resolvedBg;
  merged.inputs.backgroundColor = backgroundColor;

  // Apply CLI output override
  if (cliArgs.output) {
    merged.output.directory = cliArgs.output;
  }

  // Resolve output directory to absolute path
  merged.output.directory = resolve(merged.output.directory);

  return merged;
}
