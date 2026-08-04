#!/usr/bin/env node

import "./check-node-version.js";

import { Command } from "commander";

import { join, dirname } from "node:path";
import { mkdtempSync, rmSync, renameSync, copyFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { version: string };
import pc from "picocolors";
import { resolveConfig } from "./config.js";
import { generateAssets } from "./lib.js";
import type { TvOSImageCreatorConfig } from "./types.js";
import { ensureDir } from "./utils/fs.js";
import { createZip, generateZipFilename } from "./utils/zip.js";

const program = new Command();

function computeFileCount(config: TvOSImageCreatorConfig): { contentsJson: number; pngs: number; total: number } {
  let contentsJson = 1; // root Contents.json
  let pngs = 0;

  // Brand Assets folder Contents.json
  contentsJson += 1;

  // Image stacks (app icons)
  for (const stack of [config.brandAssets.appIconSmall, config.brandAssets.appIconLarge]) {
    if (!stack.enabled) continue;
    // imagestack Contents.json + 3 layers * (layer Contents.json + imageset Contents.json)
    contentsJson += 1 + 3 * 2;
    // PNGs: each layer gets one PNG per scale
    pngs += 3 * stack.scales.length;
  }

  // Top Shelf imagesets
  for (const imageset of [config.brandAssets.topShelfImage, config.brandAssets.topShelfImageWide]) {
    if (!imageset.enabled) continue;
    contentsJson += 1;
    pngs += imageset.scales.length;
  }

  // iOS app icon (light + dark + tinted)
  if (config.iosIcon.enabled) {
    contentsJson += 1;
    pngs += 3;
  }

  // Splash screen logo
  if (config.splashScreen.logo.enabled) {
    contentsJson += 1;
    pngs += config.splashScreen.logo.universal.scales.length + config.splashScreen.logo.tv.scales.length;
  }

  // Splash screen background colorset
  if (config.splashScreen.background.enabled) {
    contentsJson += 1;
  }

  // Standalone icon.png
  pngs += 1;

  return { contentsJson, pngs, total: contentsJson + pngs };
}

program
  .name("tvos-assets")
  .description("Generate tvOS and iOS Images.xcassets from icon and background images")
  .version(version)
  .option("--icon <path>", "Path to icon PNG or SVG (transparent background)")
  .option("--background <path>", "Path to background PNG or SVG")
  .option("--color <hex>", 'Background color hex (e.g. "#B43939")')
  .option("--dark-color <hex>", 'Dark mode background color hex (default: auto-darkened from --color)')
  .option("--icon-dark <path>", "iOS dark-appearance icon override (default: derived from --icon)")
  .option("--icon-tinted <path>", "iOS tinted-appearance icon override (default: grayscale of --icon)")
  .option("--config <path>", "Path to config JSON file")
  .option("--output <path>", "Output directory for the zip file (default: ~/Desktop)")
  .option("--out-dir <path>", "Write Images.xcassets directly into this directory instead of a zip")
  .option("--icon-border-radius <pixels>", "Border radius for icon in pixels (0 = square, large value = circle)", "0")
  .action(async (options) => {
    let tempDir: string | undefined;

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
      const config = resolveConfig({
        icon: options.icon,
        background: options.background,
        color: options.color,
        darkColor: options.darkColor,
        iconDark: options.iconDark,
        iconTinted: options.iconTinted,
        config: options.config,
        output: options.output,
        outDir: options.outDir,
        iconBorderRadius: options.iconBorderRadius,
      });

      const isDirMode = config.output.mode === "dir";

      console.log();
      console.log(pc.bold("tvOS Assets"));
      console.log(pc.dim("=================="));
      console.log(`  Icon:       ${pc.cyan(config.inputs.iconImage)}`);
      console.log(`  Background: ${pc.cyan(config.inputs.backgroundImage)}`);
      console.log(`  Color:      ${pc.cyan(config.inputs.backgroundColor)}`);
      const darkColorAuto = !options.darkColor;
      console.log(`  Dark Color: ${pc.cyan(config.inputs.darkBackgroundColor)}${darkColorAuto ? pc.dim(" (auto)") : ""}`);
      console.log(`  Output:     ${pc.cyan(config.output.directory)}${isDirMode ? pc.dim(" (dir mode)") : ""}`);
      if (config.inputs.iconBorderRadius > 0) {
        console.log(`  Radius:     ${pc.cyan(String(config.inputs.iconBorderRadius) + "px")}`);
      }
      console.log();

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

      const totalSteps = 3 // xcassets dir + brand assets + icon.png
        + (config.iosIcon.enabled ? 1 : 0)
        + (config.splashScreen.logo.enabled ? 1 : 0)
        + (config.splashScreen.background.enabled ? 1 : 0)
        + (isDirMode ? 0 : 1);
      let currentStep = 0;

      function step(message: string): void {
        console.log(`  ${pc.dim(`[${++currentStep}/${totalSteps}]`)} ${message}`);
      }

      const { warnings } = await generateAssets(config, xcassetsDir, {
        standaloneIconPath: iconOutputPath,
        onStep: step,
      });

      for (const warning of warnings) {
        console.log(`  ${pc.yellow("Warning:")} ${warning}`);
      }

      let finalOutputPath = xcassetsDir;
      if (!isDirMode) {
        // Create zip archive
        step(`Creating ${pc.bold("zip")} archive...`);
        const zipFilename = generateZipFilename();
        const tempZipPath = join(generationRoot, zipFilename);
        await createZip(
          [
            { sourcePath: xcassetsDir, zipName: "Images.xcassets", type: "directory" },
            { sourcePath: iconOutputPath, zipName: "icon.png", type: "file" },
          ],
          tempZipPath,
        );

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
      const { contentsJson, pngs, total } = computeFileCount(config);
      console.log();
      console.log(pc.green(pc.bold("  Done!")));
      console.log(`  ${pc.dim("Files:")}  ${total} files (${contentsJson} Contents.json + ${pngs - 1} PNGs + icon.png)`);
      console.log(`  ${pc.dim("Output:")} ${pc.cyan(finalOutputPath)}`);
      console.log();
    } catch (error) {
      console.log();
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

await program.parseAsync();
