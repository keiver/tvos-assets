import { readFileSync, existsSync, lstatSync, statSync, accessSync, constants } from "node:fs";
import { resolve, join, extname, dirname } from "node:path";
import { homedir } from "node:os";
import sharp from "sharp";
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function defaultOutputDirectory() {
    const desktop = join(homedir(), "Desktop");
    return existsSync(desktop) ? desktop : homedir();
}
function getDefaultConfig(iconImage, backgroundImage, backgroundColor) {
    return {
        inputs: {
            iconImage,
            backgroundImage,
            backgroundColor,
            iconBorderRadius: 0,
        },
        output: {
            directory: defaultOutputDirectory(),
        },
        brandAssets: {
            name: "AppIcon",
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
function deepMerge(target, source, depth = 0) {
    if (depth > 10) {
        throw new Error("Config nesting too deep (max 10 levels). Check for circular or excessively nested objects.");
    }
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (DANGEROUS_KEYS.has(key))
            continue;
        if (source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object" &&
            !Array.isArray(target[key])) {
            result[key] = deepMerge(target[key], source[key], depth + 1);
        }
        else {
            result[key] = source[key];
        }
    }
    return result;
}
function assertNotSymlink(filePath, label) {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink()) {
        throw new Error(`${label} must not be a symbolic link: ${filePath}`);
    }
}
function assertPngExtension(filePath, label) {
    const ext = extname(filePath).toLowerCase();
    if (ext !== ".png") {
        throw new Error(`${label} must be a PNG file (got "${ext}"): ${filePath}`);
    }
}
function validateImagePath(rawPath, label) {
    const resolved = resolve(rawPath);
    if (!existsSync(resolved)) {
        throw new Error(`${label} not found: ${resolved}`);
    }
    assertNotSymlink(resolved, label);
    assertPngExtension(resolved, label);
    return resolved;
}
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SAFE_ASSET_NAME = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;
function validateAssetName(name, label) {
    if (!SAFE_ASSET_NAME.test(name)) {
        throw new Error(`Invalid ${label} name: "${name}". Names must start with a letter or number and contain only letters, numbers, spaces, hyphens, and underscores.`);
    }
}
const MAX_CONFIG_SIZE = 1024 * 1024; // 1 MB
export function resolveConfig(cliArgs) {
    let fileConfig = {};
    // Load config file if specified
    if (cliArgs.config) {
        const configPath = resolve(cliArgs.config);
        if (!existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }
        const configStat = statSync(configPath);
        if (configStat.size > MAX_CONFIG_SIZE) {
            throw new Error(`Config file too large (${(configStat.size / 1024).toFixed(0)}KB). Maximum is 1MB.`);
        }
        const raw = readFileSync(configPath, "utf-8");
        try {
            fileConfig = JSON.parse(raw, (key, value) => {
                if (DANGEROUS_KEYS.has(key))
                    return undefined;
                return value;
            });
        }
        catch {
            throw new Error(`Invalid JSON in config file: ${configPath}. Check for syntax errors (missing commas, trailing commas, unquoted keys).`);
        }
    }
    // Determine input values: CLI args override config file
    const iconImage = (cliArgs.icon ?? fileConfig.inputs?.iconImage ?? "").trim();
    const backgroundImage = (cliArgs.background ?? fileConfig.inputs?.backgroundImage ?? "").trim();
    const backgroundColor = (cliArgs.color ?? fileConfig.inputs?.backgroundColor ?? "").trim();
    if (!iconImage) {
        throw new Error("Icon image is required. Use --icon or set inputs.iconImage in config.");
    }
    if (!backgroundImage) {
        throw new Error("Background image is required. Use --background or set inputs.backgroundImage in config.");
    }
    if (!backgroundColor) {
        throw new Error("Background color is required. Use --color or set inputs.backgroundColor in config.");
    }
    const resolvedIcon = validateImagePath(iconImage, "Icon image");
    const resolvedBg = validateImagePath(backgroundImage, "Background image");
    // Validate color format
    if (!HEX_PATTERN.test(backgroundColor)) {
        throw new Error(`Invalid color format: "${backgroundColor}". Use hex format like "#B43939".`);
    }
    // Parse icon border radius: CLI > config file > default (0)
    const rawBorderRadius = cliArgs.iconBorderRadius ?? fileConfig.inputs?.iconBorderRadius;
    const iconBorderRadius = rawBorderRadius !== undefined ? Number(rawBorderRadius) : 0;
    if (!Number.isInteger(iconBorderRadius) || iconBorderRadius < 0) {
        throw new Error(`Invalid icon border radius: "${rawBorderRadius}". Must be a non-negative integer.`);
    }
    // Build default config with resolved values
    const defaults = getDefaultConfig(resolvedIcon, resolvedBg, backgroundColor);
    // Merge: file config overrides defaults, then apply CLI overrides
    const merged = deepMerge(defaults, fileConfig);
    // Validate user-controlled asset names
    validateAssetName(merged.brandAssets.name, "brandAssets.name");
    validateAssetName(merged.brandAssets.appIconSmall.name, "brandAssets.appIconSmall.name");
    validateAssetName(merged.brandAssets.appIconLarge.name, "brandAssets.appIconLarge.name");
    validateAssetName(merged.brandAssets.topShelfImage.name, "brandAssets.topShelfImage.name");
    validateAssetName(merged.brandAssets.topShelfImageWide.name, "brandAssets.topShelfImageWide.name");
    validateAssetName(merged.splashScreen.logo.name, "splashScreen.logo.name");
    validateAssetName(merged.splashScreen.background.name, "splashScreen.background.name");
    // Validate splash screen color overrides from config file
    if (merged.splashScreen.background.enabled) {
        const colorFields = [
            { value: merged.splashScreen.background.universal.light, label: "splashScreen.background.universal.light" },
            { value: merged.splashScreen.background.universal.dark, label: "splashScreen.background.universal.dark" },
            { value: merged.splashScreen.background.tv.light, label: "splashScreen.background.tv.light" },
            { value: merged.splashScreen.background.tv.dark, label: "splashScreen.background.tv.dark" },
        ];
        for (const { value, label } of colorFields) {
            if (!HEX_PATTERN.test(value)) {
                throw new Error(`Invalid color in ${label}: "${value}". Use hex format like "#B43939".`);
            }
        }
    }
    // Ensure CLI args always win for inputs
    merged.inputs.iconImage = resolvedIcon;
    merged.inputs.backgroundImage = resolvedBg;
    merged.inputs.backgroundColor = backgroundColor;
    merged.inputs.iconBorderRadius = iconBorderRadius;
    // Apply CLI output override
    if (cliArgs.output) {
        merged.output.directory = cliArgs.output;
    }
    // Resolve output directory to absolute path
    merged.output.directory = resolve(merged.output.directory);
    // Validate output directory is writable
    const outputDir = merged.output.directory;
    try {
        if (existsSync(outputDir)) {
            accessSync(outputDir, constants.W_OK);
        }
        else {
            // Walk up to the nearest existing ancestor
            let ancestor = dirname(outputDir);
            while (!existsSync(ancestor) && ancestor !== dirname(ancestor)) {
                ancestor = dirname(ancestor);
            }
            accessSync(ancestor, constants.W_OK);
        }
    }
    catch {
        throw new Error(`Output directory is not writable: ${outputDir}`);
    }
    return merged;
}
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_DIMENSION = 8192;
const ICON_MIN = 1024;
const ICON_RECOMMENDED = 1280;
const BG_MIN_WIDTH = 2320;
const BG_MIN_HEIGHT = 720;
const BG_RECOMMENDED_WIDTH = 4640;
const BG_RECOMMENDED_HEIGHT = 1440;
export async function validateInputImages(config) {
    const warnings = [];
    // Check file sizes
    const iconSize = statSync(config.inputs.iconImage).size;
    const bgSize = statSync(config.inputs.backgroundImage).size;
    if (iconSize > MAX_FILE_SIZE) {
        warnings.push(`Icon file is ${(iconSize / 1024 / 1024).toFixed(1)}MB. Files over 50MB may cause high memory usage.`);
    }
    if (bgSize > MAX_FILE_SIZE) {
        warnings.push(`Background file is ${(bgSize / 1024 / 1024).toFixed(1)}MB. Files over 50MB may cause high memory usage.`);
    }
    // Read image dimensions
    const [iconMeta, bgMeta] = await Promise.all([
        sharp(config.inputs.iconImage).metadata(),
        sharp(config.inputs.backgroundImage).metadata(),
    ]);
    // Verify actual PNG format (not just extension)
    if (iconMeta.format !== "png") {
        throw new Error(`Icon file is not a valid PNG (detected ${iconMeta.format ?? "unknown"} format). Rename is not enough — the file must be actual PNG data.`);
    }
    if (bgMeta.format !== "png") {
        throw new Error(`Background file is not a valid PNG (detected ${bgMeta.format ?? "unknown"} format). Rename is not enough — the file must be actual PNG data.`);
    }
    const iconW = iconMeta.width ?? 0;
    const iconH = iconMeta.height ?? 0;
    const bgW = bgMeta.width ?? 0;
    const bgH = bgMeta.height ?? 0;
    // Icon minimum: 1024×1024
    if (iconW < ICON_MIN || iconH < ICON_MIN) {
        throw new Error(`Icon image is too small (${iconW}x${iconH}). Minimum size is ${ICON_MIN}x${ICON_MIN}px.`);
    }
    // Icon recommended: 1280+
    if (iconW < ICON_RECOMMENDED || iconH < ICON_RECOMMENDED) {
        warnings.push(`Icon image (${iconW}x${iconH}) is below recommended ${ICON_RECOMMENDED}x${ICON_RECOMMENDED}px. Output may show upscaling artifacts.`);
    }
    // Background minimum: 2320×720
    if (bgW < BG_MIN_WIDTH || bgH < BG_MIN_HEIGHT) {
        throw new Error(`Background image is too small (${bgW}x${bgH}). Minimum size is ${BG_MIN_WIDTH}x${BG_MIN_HEIGHT}px.`);
    }
    // Background recommended: 4640×1440
    if (bgW < BG_RECOMMENDED_WIDTH || bgH < BG_RECOMMENDED_HEIGHT) {
        warnings.push(`Background image (${bgW}x${bgH}) is below recommended ${BG_RECOMMENDED_WIDTH}x${BG_RECOMMENDED_HEIGHT}px. Top Shelf @2x output may show upscaling artifacts.`);
    }
    // Warn on very large dimensions
    if (iconW > MAX_DIMENSION || iconH > MAX_DIMENSION) {
        warnings.push(`Icon image is very large (${iconW}x${iconH}). Processing may use significant memory.`);
    }
    if (bgW > MAX_DIMENSION || bgH > MAX_DIMENSION) {
        warnings.push(`Background image is very large (${bgW}x${bgH}). Processing may use significant memory.`);
    }
    // Warn if icon is not square (will be letterboxed)
    if (iconW !== iconH) {
        warnings.push(`Icon image is not square (${iconW}x${iconH}). The icon will be letterboxed to fit a square canvas.`);
    }
    const iconSourceSize = Math.min(iconW, iconH);
    // Warn if iconBorderRadius is larger than half the source size
    if (config.inputs.iconBorderRadius > iconSourceSize / 2) {
        warnings.push(`iconBorderRadius (${config.inputs.iconBorderRadius}) exceeds half the icon size (${iconSourceSize / 2}). Values above iconSourceSize/2 are clamped to produce a circle.`);
    }
    return { warnings, iconSourceSize };
}
//# sourceMappingURL=config.js.map