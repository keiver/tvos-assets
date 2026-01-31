#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { resolveConfig, validateInputImages } from "./config.js";
import { rootContentsJson } from "./generators/contents-json.js";
import { generateBrandAssets } from "./generators/brand-assets.js";
import { generateSplashLogoImageSet } from "./generators/imageset.js";
import { generateColorSet } from "./generators/colorset.js";
import { generateIcon } from "./generators/icon.js";
import { ensureDir, cleanDir, writeContentsJson } from "./utils/fs.js";
const program = new Command();
function step(current, total, message) {
    console.log(`  ${pc.dim(`[${current}/${total}]`)} ${message}`);
}
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
    let outputDir;
    try {
        const config = resolveConfig({
            icon: options.icon,
            background: options.background,
            color: options.color,
            config: options.config,
            output: options.output,
        });
        console.log();
        console.log(pc.bold("tvOS Image Creator"));
        console.log(pc.dim("=================="));
        console.log(`  Icon:       ${pc.cyan(config.inputs.iconImage)}`);
        console.log(`  Background: ${pc.cyan(config.inputs.backgroundImage)}`);
        console.log(`  Color:      ${pc.cyan(config.inputs.backgroundColor)}`);
        console.log(`  Output:     ${pc.cyan(config.output.directory)}`);
        console.log();
        outputDir = config.output.directory;
        // Validate input image dimensions and file sizes
        const { warnings } = await validateInputImages(config);
        for (const warning of warnings) {
            console.log(`  ${pc.yellow("Warning:")} ${warning}`);
        }
        if (warnings.length > 0)
            console.log();
        const totalSteps = 8;
        let currentStep = 0;
        // Clean output directory if configured
        if (config.output.cleanBeforeGenerate) {
            step(++currentStep, totalSteps, "Cleaning output directory...");
            cleanDir(config.output.directory);
        }
        else {
            currentStep++;
        }
        // Create root xcassets directory
        step(++currentStep, totalSteps, "Creating xcassets directory...");
        ensureDir(config.output.directory);
        const rootContents = rootContentsJson(config.xcassetsMeta);
        writeContentsJson(join(config.output.directory, "Contents.json"), rootContents);
        // Generate Brand Assets
        step(++currentStep, totalSteps, `Generating ${pc.bold("App Icon")} (400x240, @1x + @2x)...`);
        step(++currentStep, totalSteps, `Generating ${pc.bold("App Icon - App Store")} (1280x768, @1x)...`);
        step(++currentStep, totalSteps, `Generating ${pc.bold("Top Shelf Image")} (1920x720, @1x + @2x)...`);
        step(++currentStep, totalSteps, `Generating ${pc.bold("Top Shelf Image Wide")} (2320x720, @1x + @2x)...`);
        await generateBrandAssets(config);
        // Generate Splash Screen Logo
        if (config.splashScreen.logo.enabled) {
            step(++currentStep, totalSteps, `Generating ${pc.bold("Splash Screen Logo")}...`);
            await generateSplashLogoImageSet(config.output.directory, config.splashScreen.logo, config);
        }
        else {
            currentStep++;
        }
        // Generate Splash Screen Background colorset
        if (config.splashScreen.background.enabled) {
            step(++currentStep, totalSteps, `Generating ${pc.bold("Splash Screen Background")} colorset...`);
            generateColorSet(config.output.directory, config.splashScreen.background, config);
        }
        else {
            currentStep++;
        }
        // Generate standalone icon.png
        step(++currentStep, totalSteps, `Generating ${pc.bold("icon.png")} (1024x1024)...`);
        await generateIcon(config);
        // Summary banner
        console.log();
        console.log(pc.green(pc.bold("  Done!")));
        console.log(`  ${pc.dim("Files:")}  38 assets (20 Contents.json + 18 PNGs) + icon.png`);
        console.log(`  ${pc.dim("Output:")} ${pc.cyan(config.output.directory)}`);
        console.log();
    }
    catch (error) {
        // Clean up partial output on failure
        try {
            if (outputDir && existsSync(outputDir)) {
                rmSync(outputDir, { recursive: true, force: true });
            }
        }
        catch {
            // Best-effort cleanup — ignore failures
        }
        console.log();
        if (error instanceof Error) {
            console.error(pc.red(`Error: ${error.message}`));
        }
        else {
            console.error(pc.red("An unexpected error occurred."));
        }
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map