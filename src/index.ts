#!/usr/bin/env node

import "./check-node-version.js";

import { Command } from "commander";

import { join, dirname, relative } from "node:path";
import { mkdtempSync, rmSync, renameSync, copyFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { version: string };
import pc from "picocolors";
import { resolveConfig, discoverConfigPath, CONFIG_FILENAME } from "./config.js";
import type { DeepPartial } from "./config.js";
import { generateAssets, planAssets } from "./lib.js";
import type { TargetPlatform } from "./lib.js";
import type { TvOSImageCreatorConfig } from "./types.js";
import { buildOverridesFromSet, collectSet, setDeep } from "./cli/set-option.js";
import { initConfigFile } from "./cli/init.js";
import { darkenHex } from "./utils/color.js";
import { ensureDir } from "./utils/fs.js";
import { createZip, generateZipFilename } from "./utils/zip.js";

const program = new Command();

const PLATFORMS: TargetPlatform[] = ["tvos", "ios"];

function parsePlatforms(raw: string | undefined): TargetPlatform[] | undefined {
  if (!raw) return undefined;
  const requested = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (requested.length === 0) {
    throw new Error(`Invalid --platforms "${raw}". Use ${PLATFORMS.join(", ")} or a comma-separated subset.`);
  }
  for (const entry of requested) {
    if (!PLATFORMS.includes(entry as TargetPlatform)) {
      throw new Error(`Unknown platform "${entry}". Valid platforms: ${PLATFORMS.join(", ")}.`);
    }
  }
  return [...new Set(requested)] as TargetPlatform[];
}

interface NamedFlagOptions {
  brandName?: string;
  iosIconName?: string;
  splashLogoName?: string;
  splashBackgroundName?: string;
  splashLogoSize?: string;
  layerFront?: string;
  layerMiddle?: string;
  layerBack?: string;
  mode?: string;
  iosIcon?: boolean;
  topShelf?: boolean;
  splash?: boolean;
}

/**
 * Fold `--set` entries and the named convenience flags into one overrides
 * object. Named flags are written last, so they win on a collision.
 */
function buildOverrides(
  setEntries: string[],
  flags: NamedFlagOptions,
): DeepPartial<TvOSImageCreatorConfig> | undefined {
  const overrides = buildOverridesFromSet(setEntries) as Record<string, unknown>;

  const assign = (path: string, value: unknown): void => setDeep(overrides, path.split("."), value);

  if (flags.brandName) assign("brandAssets.name", flags.brandName);
  if (flags.iosIconName) assign("iosIcon.name", flags.iosIconName);
  if (flags.splashLogoName) assign("splashScreen.logo.name", flags.splashLogoName);
  if (flags.splashBackgroundName) assign("splashScreen.background.name", flags.splashBackgroundName);
  if (flags.mode) assign("output.mode", flags.mode);

  if (flags.splashLogoSize !== undefined) {
    const size = Number(flags.splashLogoSize);
    if (!Number.isFinite(size) || size < 1) {
      throw new Error(`Invalid --splash-logo-size "${flags.splashLogoSize}". Must be a number of pixels >= 1.`);
    }
    assign("splashScreen.logo.baseSize", size);
  }

  // Per-layer parallax art applies to both imagestacks, matching the plugin's `layers` prop.
  const layerFlags: [string, string | undefined][] = [
    ["front", flags.layerFront],
    ["middle", flags.layerMiddle],
    ["back", flags.layerBack],
  ];
  for (const [layer, path] of layerFlags) {
    if (!path) continue;
    for (const stack of ["appIconSmall", "appIconLarge"]) {
      assign(`brandAssets.${stack}.layers.${layer}.imagePath`, path);
    }
  }

  // Commander defaults --no-* flags to true, so only an explicit false is a signal.
  if (flags.iosIcon === false) assign("iosIcon.enabled", false);
  if (flags.topShelf === false) {
    assign("brandAssets.topShelfImage.enabled", false);
    assign("brandAssets.topShelfImageWide.enabled", false);
  }
  if (flags.splash === false) {
    assign("splashScreen.logo.enabled", false);
    assign("splashScreen.background.enabled", false);
  }

  return Object.keys(overrides).length > 0 ? (overrides as DeepPartial<TvOSImageCreatorConfig>) : undefined;
}

program
  .name("tvos-assets")
  .description("Generate tvOS and iOS Images.xcassets from icon and background images")
  .version(version)
  // Inputs
  .option("--icon <path>", "Path to icon PNG or SVG (transparent background)")
  .option("--background <path>", "Path to background PNG or SVG")
  .option("--color <hex>", 'Background color hex (e.g. "#B43939")')
  .option("--dark-color <hex>", "Dark mode background color hex (default: auto-darkened from --color)")
  .option("--icon-dark <path>", "iOS dark-appearance icon override (default: derived from --icon)")
  .option("--icon-tinted <path>", "iOS tinted-appearance icon override (default: grayscale of --icon)")
  .option("--icon-border-radius <pixels>", "Border radius for icon in pixels (0 = square, large value = circle)")
  .option("--layer-front <path>", "Custom front parallax layer art (both imagestacks)")
  .option("--layer-middle <path>", "Custom middle parallax layer art (both imagestacks)")
  .option("--layer-back <path>", "Custom back parallax layer art (both imagestacks)")
  // Output
  .option("--config <path>", `Path to config JSON file (default: ./${CONFIG_FILENAME} if present)`)
  .option("--output <path>", "Output directory for the zip file (default: ~/Desktop)")
  .option("--out-dir <path>", "Write Images.xcassets directly into this directory instead of a zip")
  .option("--mode <zip|dir>", "Output mode; --out-dir implies dir")
  .option("--platforms <list>", `Icon families to generate: ${PLATFORMS.join(", ")} (default: both)`)
  .option("--preview", "Write preview.html alongside the output (default)")
  .option("--no-preview", "Skip preview.html")
  // Asset naming and selection
  .option("--brand-name <name>", "Name of the .brandassets bundle (default: AppIcon)")
  .option("--ios-icon-name <name>", "Name of the iOS .appiconset (default: AppIcon)")
  .option("--splash-logo-name <name>", "Name of the splash logo imageset (default: SplashScreenLogo)")
  .option("--splash-background-name <name>", "Name of the splash colorset (default: SplashScreenBackground)")
  .option("--splash-logo-size <pixels>", "Base splash logo size in px (default: 200)")
  .option("--no-ios-icon", "Skip the iOS AppIcon.appiconset")
  .option("--no-top-shelf", "Skip both Top Shelf imagesets")
  .option("--no-splash", "Skip the splash screen logo and colorset")
  // Advanced
  .option(
    "--set <path=value>",
    "Override any config key by dotted path; repeatable (e.g. --set splashScreen.logo.baseSize=300)",
    collectSet,
  )
  .option("--dry-run", "Report what would be written, then exit without writing")
  .option("--print-config", "Print the fully merged config as JSON, then exit")
  .option("--init [path]", `Write a starter ${CONFIG_FILENAME} and exit`)
  .option("--quiet", "Only print errors and the final output path")
  .addHelpText(
    "after",
    `
Precedence (later wins):
  built-in defaults  ->  config file  ->  --set  ->  named flags  ->  --icon/--background/--color

Any key in the config file is reachable with --set, including ones without a
dedicated flag (sizes, scales, filePrefix, per-layer source, xcassetsMeta):
  --set brandAssets.appIconSmall.size.width=500
  --set brandAssets.topShelfImage.scales=1x,2x
  --set brandAssets.appIconLarge.enabled=false
  --set xcassetsMeta.author=mytool
Values are coerced to the type each key expects; unknown paths are rejected.

Examples:
  $ tvos-assets --icon icon.svg --background bg.png --color "#F39C12"
  $ tvos-assets --out-dir ios/MyApp --brand-name AppIconTV --no-splash
  $ tvos-assets --config brand.json --platforms ios --dry-run
`,
  )
  .action(async (options) => {
    let tempDir: string | undefined;

    const quiet = Boolean(options.quiet);
    function log(message = ""): void {
      if (!quiet) console.log(message);
    }

    function cleanupTempDir(): void {
      if (tempDir && existsSync(tempDir)) {
        try {
          rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup — ignore failures
        }
      }
    }

    function onSignal(signal: NodeJS.Signals): void {
      cleanupTempDir();
      process.exit(signal === "SIGINT" ? 130 : 143);
    }

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
      if (options.init) {
        const result = initConfigFile(
          typeof options.init === "string" ? options.init : undefined,
          join(__dirname, "..", "schema.json"),
        );
        log();
        log(`  ${pc.green("Created")} ${pc.cyan(result.path)}`);
        if (result.schemaCopiedTo) {
          log(`  ${pc.green("Created")} ${pc.cyan(result.schemaCopiedTo)} ${pc.dim("(editor validation)")}`);
        }
        if (result.schemaSource === "unavailable") {
          log(`  ${pc.yellow("Note:")} schema.json could not be located, so no $schema was written.`);
        }
        log(`  ${pc.dim("Edit the input paths, then run:")} tvos-assets`);
        log();
        return;
      }

      const platforms = parsePlatforms(options.platforms);
      const overrides = buildOverrides((options.set as string[] | undefined) ?? [], options as NamedFlagOptions);

      const explicitConfig = options.config as string | undefined;
      const discoveredConfig = explicitConfig ? undefined : discoverConfigPath();
      const configPath = explicitConfig ?? discoveredConfig;

      const config = resolveConfig({
        icon: options.icon,
        background: options.background,
        color: options.color,
        darkColor: options.darkColor,
        iconDark: options.iconDark,
        iconTinted: options.iconTinted,
        config: configPath,
        output: options.output,
        outDir: options.outDir,
        iconBorderRadius: options.iconBorderRadius,
        overrides,
      });

      if (options.printConfig) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      const isDirMode = config.output.mode === "dir";
      // Always on unless explicitly refused. preview.html is a sibling of
      // Images.xcassets, never inside it, so it is not compiled into the catalog.
      const wantsPreview = (options.preview as boolean | undefined) !== false;
      const plan = planAssets(config, { platforms, standaloneIcon: true, preview: wantsPreview });

      log();
      log(pc.bold(`tvOS Assets${options.dryRun ? pc.dim(" (dry run)") : ""}`));
      log(pc.dim("=================="));
      if (configPath) {
        const shown = relative(process.cwd(), configPath) || configPath;
        log(`  Config:     ${pc.cyan(shown)}${discoveredConfig ? pc.dim(" (auto-detected)") : ""}`);
      }
      log(`  Icon:       ${pc.cyan(config.inputs.iconImage)}`);
      log(`  Background: ${pc.cyan(config.inputs.backgroundImage)}`);
      log(`  Color:      ${pc.cyan(config.inputs.backgroundColor)}`);
      const darkColorAuto =
        !options.darkColor && config.inputs.darkBackgroundColor === darkenHex(config.inputs.backgroundColor);
      log(`  Dark Color: ${pc.cyan(config.inputs.darkBackgroundColor)}${darkColorAuto ? pc.dim(" (auto)") : ""}`);
      log(`  Output:     ${pc.cyan(config.output.directory)}${isDirMode ? pc.dim(" (dir mode)") : ""}`);
      if (platforms) {
        log(`  Platforms:  ${pc.cyan(platforms.join(", "))}`);
      }
      if (config.inputs.iconBorderRadius > 0) {
        log(`  Radius:     ${pc.cyan(String(config.inputs.iconBorderRadius) + "px")}`);
      }
      log();

      if (options.dryRun) {
        log(`  ${pc.dim("Would write into")} ${pc.cyan(config.output.directory)}${pc.dim(":")}`);
        log(`    Images.xcassets/`);
        for (const directory of plan.directories) {
          log(`    Images.xcassets/${directory}/`);
        }
        log(`    icon.png`);
        if (wantsPreview) log(`    preview.html`);
        if (!isDirMode) log(`    ${pc.dim("(packed into")} tvos-assets-<timestamp>.zip${pc.dim(")")}`);
        log();
        log(`  ${pc.dim("Files:")}  ${describePlan(plan)}`);
        log(`  ${pc.yellow("Dry run: nothing was written.")}`);
        log();
        return;
      }

      // Create output directory (writability already validated in resolveConfig)
      ensureDir(config.output.directory);

      let generationRoot: string;
      if (isDirMode) {
        generationRoot = config.output.directory;
      } else {
        tempDir = mkdtempSync(join(tmpdir(), "tvos-assets-"));
        generationRoot = tempDir;
      }
      const xcassetsDir = join(generationRoot, "Images.xcassets");
      const iconOutputPath = join(generationRoot, "icon.png");
      const previewOutputPath = join(generationRoot, "preview.html");

      // Mirrors the step() calls in generateAssets, plus the zip step below.
      const active = platforms ?? PLATFORMS;
      const totalSteps = 2 // xcassets dir + icon.png
        + (active.includes("tvos") ? 1 : 0)
        + (active.includes("ios") && config.iosIcon.enabled ? 1 : 0)
        + (config.splashScreen.logo.enabled ? 1 : 0)
        + (config.splashScreen.background.enabled ? 1 : 0)
        + (wantsPreview ? 1 : 0)
        + (isDirMode ? 0 : 1);
      let currentStep = 0;

      function step(message: string): void {
        log(`  ${pc.dim(`[${++currentStep}/${totalSteps}]`)} ${message}`);
      }

      const { warnings } = await generateAssets(config, xcassetsDir, {
        platforms,
        standaloneIconPath: iconOutputPath,
        previewPath: wantsPreview ? previewOutputPath : undefined,
        toolVersion: version,
        onStep: step,
      });

      for (const warning of warnings) {
        log(`  ${pc.yellow("Warning:")} ${warning}`);
      }

      let finalOutputPath = xcassetsDir;
      if (!isDirMode) {
        // Create zip archive
        step(`Creating ${pc.bold("zip")} archive...`);
        const zipFilename = generateZipFilename();
        const tempZipPath = join(generationRoot, zipFilename);
        const zipEntries = [
          { sourcePath: xcassetsDir, zipName: "Images.xcassets", type: "directory" as const },
          { sourcePath: iconOutputPath, zipName: "icon.png", type: "file" as const },
        ];
        if (wantsPreview) {
          zipEntries.push({ sourcePath: previewOutputPath, zipName: "preview.html", type: "file" as const });
        }
        await createZip(zipEntries, tempZipPath);

        // Move zip to destination (output dir already validated)
        finalOutputPath = join(config.output.directory, zipFilename);
        try {
          renameSync(tempZipPath, finalOutputPath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EXDEV") {
            copyFileSync(tempZipPath, finalOutputPath);
            unlinkSync(tempZipPath);
          } else {
            throw err;
          }
        }
      }

      // Summary banner
      log();
      log(pc.green(pc.bold("  Done!")));
      log(`  ${pc.dim("Files:")}  ${describePlan(plan)}`);
      if (quiet) {
        console.log(finalOutputPath);
      } else {
        console.log(`  ${pc.dim("Output:")} ${pc.cyan(finalOutputPath)}`);
        console.log();
      }
    } catch (error) {
      if (!quiet) console.log();
      if (error instanceof Error) {
        console.error(pc.red(`Error: ${error.message}`));
      } else {
        console.error(pc.red("An unexpected error occurred."));
      }
      process.exitCode = 1;
    } finally {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      cleanupTempDir();
    }
  });

function describePlan(plan: ReturnType<typeof planAssets>): string {
  const parts = [`${plan.contentsJson} Contents.json`, `${plan.pngs} PNGs`];
  if (plan.standaloneIcon) parts.push("icon.png");
  if (plan.preview) parts.push("preview.html");
  return `${plan.total} files (${parts.join(" + ")})`;
}

await program.parseAsync();
