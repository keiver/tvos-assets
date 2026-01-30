#!/usr/bin/env node

import { Command } from "commander";
import { join } from "node:path";
import { resolveConfig } from "./config.js";
import { rootContentsJson } from "./generators/contents-json.js";
import { generateBrandAssets } from "./generators/brand-assets.js";
import { generateSplashLogoImageSet } from "./generators/imageset.js";
import { generateColorSet } from "./generators/colorset.js";
import { generateIcon } from "./generators/icon.js";
import { ensureDir, cleanDir, writeContentsJson } from "./utils/fs.js";

const program = new Command();

program
  .name("tvos-image-creator")
  .description("Generate tvOS Images.xcassets from icon and background images")
  .version("1.0.0")
  .option("--icon <path>", "Path to icon PNG (transparent background)")
  .option("--background <path>", "Path to background PNG")
  .option("--color <hex>", 'Background color hex (e.g. "#B43939")')
  .option("--config <path>", "Path to config JSON file")
  .option("--output <path>", "Output directory (default: ~/Desktop/Images.xcassets)")
  .action(async (options) => {
    try {
      const config = resolveConfig({
        icon: options.icon,
        background: options.background,
        color: options.color,
        config: options.config,
        output: options.output,
      });

      console.log("tvOS Image Creator");
      console.log("==================");
      console.log(`Icon:       ${config.inputs.iconImage}`);
      console.log(`Background: ${config.inputs.backgroundImage}`);
      console.log(`Color:      ${config.inputs.backgroundColor}`);
      console.log(`Output:     ${config.output.directory}`);
      console.log();

      // Clean output directory if configured
      if (config.output.cleanBeforeGenerate) {
        console.log("Cleaning output directory...");
        cleanDir(config.output.directory);
      }

      // Create root xcassets directory
      ensureDir(config.output.directory);

      // Write root Contents.json
      const rootContents = rootContentsJson(config.xcassetsMeta);
      writeContentsJson(join(config.output.directory, "Contents.json"), rootContents);

      // Generate Brand Assets (app icons + top shelf images)
      console.log("Generating Brand Assets...");
      console.log("  App Icon (400x240, @1x + @2x)...");
      console.log("  App Icon - App Store (1280x768, @1x)...");
      console.log("  Top Shelf Image (1920x720, @1x + @2x)...");
      console.log("  Top Shelf Image Wide (2320x720, @1x + @2x)...");
      await generateBrandAssets(config);

      // Generate Splash Screen Logo
      if (config.splashScreen.logo.enabled) {
        console.log("Generating Splash Screen Logo...");
        await generateSplashLogoImageSet(
          config.output.directory,
          config.splashScreen.logo,
          config,
        );
      }

      // Generate Splash Screen Background colorset
      if (config.splashScreen.background.enabled) {
        console.log("Generating Splash Screen Background colorset...");
        generateColorSet(
          config.output.directory,
          config.splashScreen.background,
          config,
        );
      }

      // Generate standalone icon.png
      console.log("Generating icon.png (1024x1024)...");
      await generateIcon(config);

      console.log();
      console.log("Done! Generated Images.xcassets at:");
      console.log(`  ${config.output.directory}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("An unexpected error occurred.");
      }
      process.exit(1);
    }
  });

program.parse();
