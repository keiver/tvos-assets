import { join } from "node:path";
import { ensureDir, writeContentsJson } from "../utils/fs.js";
import { brandAssetsContentsJson } from "./contents-json.js";
import { generateImageStack } from "./imagestack.js";
import { generateTopShelfImageSet } from "./imageset.js";
export async function generateBrandAssets(outputDir, config, iconSourceSize) {
    const brandDir = join(outputDir, `${config.brandAssets.name}.brandassets`);
    ensureDir(brandDir);
    // Build asset manifest entries
    const assets = [];
    const { brandAssets } = config;
    if (brandAssets.appIconLarge.enabled) {
        assets.push({
            filename: `${brandAssets.appIconLarge.name}.imagestack`,
            idiom: "tv",
            role: "primary-app-icon",
            size: `${brandAssets.appIconLarge.size.width}x${brandAssets.appIconLarge.size.height}`,
        });
    }
    if (brandAssets.appIconSmall.enabled) {
        assets.push({
            filename: `${brandAssets.appIconSmall.name}.imagestack`,
            idiom: "tv",
            role: "primary-app-icon",
            size: `${brandAssets.appIconSmall.size.width}x${brandAssets.appIconSmall.size.height}`,
        });
    }
    if (brandAssets.topShelfImageWide.enabled) {
        assets.push({
            filename: `${brandAssets.topShelfImageWide.name}.imageset`,
            idiom: "tv",
            role: "top-shelf-image-wide",
            size: `${brandAssets.topShelfImageWide.size.width}x${brandAssets.topShelfImageWide.size.height}`,
        });
    }
    if (brandAssets.topShelfImage.enabled) {
        assets.push({
            filename: `${brandAssets.topShelfImage.name}.imageset`,
            idiom: "tv",
            role: "top-shelf-image",
            size: `${brandAssets.topShelfImage.size.width}x${brandAssets.topShelfImage.size.height}`,
        });
    }
    // Write Brand Assets Contents.json
    const contents = brandAssetsContentsJson(assets, config.xcassetsMeta);
    writeContentsJson(join(brandDir, "Contents.json"), contents);
    function withContext(name, promise) {
        return promise.catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed generating "${name}": ${message}`);
        });
    }
    await Promise.all([
        withContext(brandAssets.appIconSmall.name, generateImageStack(brandDir, brandAssets.appIconSmall, config, iconSourceSize)),
        withContext(brandAssets.appIconLarge.name, generateImageStack(brandDir, brandAssets.appIconLarge, config, iconSourceSize)),
        withContext(brandAssets.topShelfImage.name, generateTopShelfImageSet(brandDir, brandAssets.topShelfImage, config, iconSourceSize)),
        withContext(brandAssets.topShelfImageWide.name, generateTopShelfImageSet(brandDir, brandAssets.topShelfImageWide, config, iconSourceSize)),
    ]);
}
//# sourceMappingURL=brand-assets.js.map