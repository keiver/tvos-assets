#!/usr/bin/env node
import "./check-node-version.js";
import { Command } from "commander";
import { join, dirname } from "node:path";
import { mkdtempSync, rmSync, renameSync, copyFileSync, existsSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
import pc from "picocolors";
import { resolveConfig, validateInputImages } from "./config.js";
import { rootContentsJson } from "./generators/contents-json.js";
import { generateBrandAssets } from "./generators/brand-assets.js";
import { generateSplashLogoImageSet } from "./generators/imageset.js";
import { generateColorSet } from "./generators/colorset.js";
import { generateIcon } from "./generators/icon.js";
import { ensureDir, writeContentsJson } from "./utils/fs.js";
import { createZip, generateZipFilename } from "./utils/zip.js";
const program = new Command();
function step(current, total, message) {
    console.log(`  ${pc.dim(`[${current}/${total}]`)} ${message}`);
}
function computeFileCount(config) {
    let contentsJson = 1; // root Contents.json
    let pngs = 0;
    // Brand Assets folder Contents.json
    contentsJson += 1;
    // Image stacks (app icons)
    for (const stack of [config.brandAssets.appIconSmall, config.brandAssets.appIconLarge]) {
        if (!stack.enabled)
            continue;
        // imagestack Contents.json + 3 layers * (layer Contents.json + imageset Contents.json)
        contentsJson += 1 + 3 * 2;
        // PNGs: each layer gets one PNG per scale
        pngs += 3 * stack.scales.length;
    }
    // Top Shelf imagesets
    for (const imageset of [config.brandAssets.topShelfImage, config.brandAssets.topShelfImageWide]) {
        if (!imageset.enabled)
            continue;
        contentsJson += 1;
        pngs += imageset.scales.length;
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
    .description("Generate tvOS Images.xcassets from icon and background images")
    .version(version)
    .option("--icon <path>", "Path to icon PNG (transparent background)")
    .option("--background <path>", "Path to background PNG")
    .option("--color <hex>", 'Background color hex (e.g. "#B43939")')
    .option("--config <path>", "Path to config JSON file")
    .option("--output <path>", "Output directory for the zip file (default: ~/Desktop)")
    .option("--icon-border-radius <pixels>", "Border radius for icon in pixels (0 = square, large value = circle)", "0")
    .action(async (options) => {
    let tempDir;
    function cleanupTempDir() {
        if (tempDir && existsSync(tempDir)) {
            try {
                rmSync(tempDir, { recursive: true, force: true });
            }
            catch {
                // Best-effort cleanup — ignore failures
            }
        }
    }
    function onSignal(signal) {
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
            config: options.config,
            output: options.output,
            iconBorderRadius: options.iconBorderRadius,
        });
        console.log();
        console.log(pc.bold("tvOS Assets"));
        console.log(pc.dim("=================="));
        console.log(`  Icon:       ${pc.cyan(config.inputs.iconImage)}`);
        console.log(`  Background: ${pc.cyan(config.inputs.backgroundImage)}`);
        console.log(`  Color:      ${pc.cyan(config.inputs.backgroundColor)}`);
        console.log(`  Output:     ${pc.cyan(config.output.directory)}`);
        if (config.inputs.iconBorderRadius > 0) {
            console.log(`  Radius:     ${pc.cyan(String(config.inputs.iconBorderRadius) + "px")}`);
        }
        console.log();
        // Validate output directory is writable before doing expensive work
        try {
            ensureDir(config.output.directory);
            const probe = join(config.output.directory, `.tvos-probe-${process.pid}`);
            writeFileSync(probe, "");
            unlinkSync(probe);
        }
        catch {
            throw new Error(`Output directory is not writable: ${config.output.directory}`);
        }
        // Validate input image dimensions and file sizes
        const { warnings, iconSourceSize } = await validateInputImages(config);
        for (const warning of warnings) {
            console.log(`  ${pc.yellow("Warning:")} ${warning}`);
        }
        if (warnings.length > 0)
            console.log();
        // Create temp directory for generation
        tempDir = mkdtempSync(join(tmpdir(), "tvos-assets-"));
        const xcassetsDir = join(tempDir, "Images.xcassets");
        const iconOutputPath = join(tempDir, "icon.png");
        const totalSteps = 7
            + (config.splashScreen.logo.enabled ? 1 : 0)
            + (config.splashScreen.background.enabled ? 1 : 0);
        let currentStep = 0;
        // Create root xcassets directory
        step(++currentStep, totalSteps, "Creating xcassets directory...");
        ensureDir(xcassetsDir);
        const rootContents = rootContentsJson(config.xcassetsMeta);
        writeContentsJson(join(xcassetsDir, "Contents.json"), rootContents);
        // Generate Brand Assets
        step(++currentStep, totalSteps, `Generating ${pc.bold("App Icon")} (400x240, @1x + @2x)...`);
        step(++currentStep, totalSteps, `Generating ${pc.bold("App Icon - App Store")} (1280x768, @1x)...`);
        step(++currentStep, totalSteps, `Generating ${pc.bold("Top Shelf Image")} (1920x720, @1x + @2x)...`);
        step(++currentStep, totalSteps, `Generating ${pc.bold("Top Shelf Image Wide")} (2320x720, @1x + @2x)...`);
        await generateBrandAssets(xcassetsDir, config, iconSourceSize);
        // Generate Splash Screen Logo
        if (config.splashScreen.logo.enabled) {
            step(++currentStep, totalSteps, `Generating ${pc.bold("Splash Screen Logo")}...`);
            await generateSplashLogoImageSet(xcassetsDir, config.splashScreen.logo, config, iconSourceSize);
        }
        // Generate Splash Screen Background colorset
        if (config.splashScreen.background.enabled) {
            step(++currentStep, totalSteps, `Generating ${pc.bold("Splash Screen Background")} colorset...`);
            generateColorSet(xcassetsDir, config.splashScreen.background, config);
        }
        // Generate standalone icon.png
        step(++currentStep, totalSteps, `Generating ${pc.bold("icon.png")} (1024x1024)...`);
        await generateIcon(config, iconOutputPath, iconSourceSize);
        // Create zip archive
        step(++currentStep, totalSteps, `Creating ${pc.bold("zip")} archive...`);
        const zipFilename = generateZipFilename();
        const tempZipPath = join(tempDir, zipFilename);
        await createZip([
            { sourcePath: xcassetsDir, zipName: "Images.xcassets", type: "directory" },
            { sourcePath: iconOutputPath, zipName: "icon.png", type: "file" },
        ], tempZipPath);
        // Move zip to destination (output dir already validated)
        const finalZipPath = join(config.output.directory, zipFilename);
        try {
            renameSync(tempZipPath, finalZipPath);
        }
        catch (err) {
            if (err.code === "EXDEV") {
                copyFileSync(tempZipPath, finalZipPath);
                unlinkSync(tempZipPath);
            }
            else {
                throw err;
            }
        }
        // Summary banner
        const { contentsJson, pngs, total } = computeFileCount(config);
        console.log();
        console.log(pc.green(pc.bold("  Done!")));
        console.log(`  ${pc.dim("Files:")}  ${total} files (${contentsJson} Contents.json + ${pngs - 1} PNGs + icon.png)`);
        console.log(`  ${pc.dim("Output:")} ${pc.cyan(finalZipPath)}`);
        console.log();
    }
    catch (error) {
        console.log();
        if (error instanceof Error) {
            console.error(pc.red(`Error: ${error.message}`));
        }
        else {
            console.error(pc.red("An unexpected error occurred."));
        }
        process.exitCode = 1;
    }
    finally {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        cleanupTempDir();
    }
});
program.parse();
//# sourceMappingURL=index.js.map