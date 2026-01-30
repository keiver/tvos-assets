import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ImageStackAssetConfig, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir, writeContentsJson } from "../utils/fs.js";
import {
  resizeImageOpaque,
  renderIconOnTransparentCanvas,
} from "../utils/image-processing.js";
import {
  imageStackContentsJson,
  imageStackLayerContentsJson,
  imageSetContentsJson,
  buildImageStackImageEntries,
} from "./contents-json.js";

const LAYER_NAMES = ["Front", "Middle", "Back"] as const;
type LayerName = (typeof LAYER_NAMES)[number];

function scaleMultiplier(scale: string): number {
  return parseInt(scale.replace("x", ""), 10);
}

async function generateLayerImages(
  layerName: LayerName,
  asset: ImageStackAssetConfig,
  config: TvOSImageCreatorConfig,
  imagesetDir: string,
  isAppStore: boolean,
): Promise<void> {
  const layerKey = layerName.toLowerCase() as "front" | "middle" | "back";
  const layerConfig = asset.layers[layerKey];
  const isBackLayer = layerName === "Back";

  if (isAppStore) {
    // App Store: single image, no scale suffix for back
    const w = asset.size.width;
    const h = asset.size.height;
    const prefix = layerName.toLowerCase();
    const filename = isBackLayer ? `${prefix}.png` : `${prefix}@1x.png`;

    let buffer: Buffer;
    if (layerConfig.source === "background" || isBackLayer) {
      buffer = await resizeImageOpaque(config.inputs.backgroundImage, w, h);
    } else {
      buffer = await renderIconOnTransparentCanvas(config.inputs.iconImage, w, h);
    }

    writeFileSync(join(imagesetDir, filename), buffer);
    return;
  }

  // Standard: generate each scale
  for (const scale of asset.scales) {
    const multiplier = scaleMultiplier(scale);
    const w = asset.size.width * multiplier;
    const h = asset.size.height * multiplier;
    const filename = `${layerName.toLowerCase()}@${scale}.png`;

    let buffer: Buffer;
    if (layerConfig.source === "background" || isBackLayer) {
      // Back layer: opaque (no alpha)
      buffer = await resizeImageOpaque(config.inputs.backgroundImage, w, h);
    } else {
      // Front/Middle: icon on transparent canvas
      buffer = await renderIconOnTransparentCanvas(config.inputs.iconImage, w, h);
    }

    writeFileSync(join(imagesetDir, filename), buffer);
  }
}

export async function generateImageStack(
  parentDir: string,
  asset: ImageStackAssetConfig,
  config: TvOSImageCreatorConfig,
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
    await generateLayerImages(layerName, asset, config, imagesetDir, isAppStore);
  }
}
