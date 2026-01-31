import { join } from "node:path";
import type { ImageStackAssetConfig, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir, writeContentsJson, safeWriteFile } from "../utils/fs.js";
import {
  resizeImageOpaque,
  renderIconOnTransparentCanvas,
  scaleMultiplier,
  validateOutputDimensions,
} from "../utils/image-processing.js";
import {
  imageStackContentsJson,
  imageStackLayerContentsJson,
  imageSetContentsJson,
  buildImageStackImageEntries,
} from "./contents-json.js";

const LAYER_NAMES = ["Front", "Middle", "Back"] as const;
type LayerName = (typeof LAYER_NAMES)[number];

async function generateLayerImages(
  layerName: LayerName,
  asset: ImageStackAssetConfig,
  config: TvOSImageCreatorConfig,
  imagesetDir: string,
  isAppStore: boolean,
  iconSourceSize?: number,
): Promise<void> {
  const layerKey = layerName.toLowerCase() as "front" | "middle" | "back";
  const layerConfig = asset.layers[layerKey];
  const borderRadius = config.inputs.iconBorderRadius;
  const borderOpts = layerConfig.source !== "background" && borderRadius > 0 && iconSourceSize
    ? { borderRadius, sourceIconSize: iconSourceSize }
    : undefined;

  if (isAppStore) {
    const w = asset.size.width;
    const h = asset.size.height;
    validateOutputDimensions(w, h, `${asset.name} ${layerName}`);
    const prefix = layerName.toLowerCase();
    const filename = layerConfig.source === "background" ? `${prefix}.png` : `${prefix}@1x.png`;

    const buffer = layerConfig.source === "background"
      ? await resizeImageOpaque(config.inputs.backgroundImage, w, h)
      : await renderIconOnTransparentCanvas(config.inputs.iconImage, w, h, borderOpts);

    safeWriteFile(join(imagesetDir, filename), buffer);
    return;
  }

  for (const scale of asset.scales) {
    const multiplier = scaleMultiplier(scale);
    const w = asset.size.width * multiplier;
    const h = asset.size.height * multiplier;
    validateOutputDimensions(w, h, `${asset.name} ${layerName} @${scale}`);
    const filename = `${layerName.toLowerCase()}@${scale}.png`;

    const buffer = layerConfig.source === "background"
      ? await resizeImageOpaque(config.inputs.backgroundImage, w, h)
      : await renderIconOnTransparentCanvas(config.inputs.iconImage, w, h, borderOpts);

    safeWriteFile(join(imagesetDir, filename), buffer);
  }
}

export async function generateImageStack(
  parentDir: string,
  asset: ImageStackAssetConfig,
  config: TvOSImageCreatorConfig,
  iconSourceSize?: number,
): Promise<void> {
  if (!asset.enabled) return;

  const isAppStore = asset.scales.length === 1 && asset.name.includes("App Store");
  const stackDir = join(parentDir, `${asset.name}.imagestack`);
  ensureDir(stackDir);

  // Write imagestack Contents.json with layer references
  const stackContents = imageStackContentsJson(
    LAYER_NAMES.map((n) => `${n}.imagestacklayer`),
    config.xcassetsMeta,
  );
  writeContentsJson(join(stackDir, "Contents.json"), stackContents);

  // Generate each layer
  for (const layerName of LAYER_NAMES) {
    const layerDir = join(stackDir, `${layerName}.imagestacklayer`);
    ensureDir(layerDir);

    // Write layer Contents.json
    const layerContents = imageStackLayerContentsJson(config.xcassetsMeta);
    writeContentsJson(join(layerDir, "Contents.json"), layerContents);

    // Create Content.imageset inside the layer
    const imagesetDir = join(layerDir, "Content.imageset");
    ensureDir(imagesetDir);

    // Build image entries for Contents.json
    const imageEntries = buildImageStackImageEntries(layerName, asset.scales, isAppStore);
    const imagesetContents = imageSetContentsJson(imageEntries, config.xcassetsMeta);
    writeContentsJson(join(imagesetDir, "Contents.json"), imagesetContents);

    // Generate actual PNG files
    await generateLayerImages(layerName, asset, config, imagesetDir, isAppStore, iconSourceSize);
  }
}
