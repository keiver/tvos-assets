jest.setTimeout(60000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, validateInputImages } from "../../src/config";
import { generateImageStack } from "../../src/generators/imagestack";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-imagestack");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

function parseContentsJson(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw.replace(/" :/g, '":'));
}

async function makeConfig(overrides?: Record<string, unknown>): Promise<{ config: TvOSImageCreatorConfig; iconSourceSize: number }> {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  const outputDir = join(TMP, "output");

  let config: TvOSImageCreatorConfig;
  if (overrides) {
    const { writeFileSync } = await import("node:fs");
    const configPath = join(TMP, "test-config.json");
    const configData = {
      inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
      output: { directory: outputDir },
      ...overrides,
    };
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(configData));
    config = resolveConfig({ config: configPath });
  } else {
    config = resolveConfig({ icon, background: bg, color: "#FF0000", output: outputDir });
  }

  const { iconSourceSize } = await validateInputImages(config);
  return { config, iconSourceSize };
}

describe("generateImageStack — App Icon (small)", () => {
  it("creates Front, Middle, Back layer directories", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "stacks");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconSmall, config, iconSourceSize);

    const stackDir = join(parentDir, "App Icon.imagestack");
    expect(existsSync(join(stackDir, "Front.imagestacklayer"))).toBe(true);
    expect(existsSync(join(stackDir, "Middle.imagestacklayer"))).toBe(true);
    expect(existsSync(join(stackDir, "Back.imagestacklayer"))).toBe(true);
  });

  it("generates PNGs at correct dimensions for each scale", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "stacks");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconSmall, config, iconSourceSize);

    // Front @1x: 400x240
    const front1x = join(parentDir, "App Icon.imagestack", "Front.imagestacklayer", "Content.imageset", "front@1x.png");
    const meta1x = await sharp(front1x).metadata();
    expect(meta1x.width).toBe(400);
    expect(meta1x.height).toBe(240);

    // Front @2x: 800x480
    const front2x = join(parentDir, "App Icon.imagestack", "Front.imagestacklayer", "Content.imageset", "front@2x.png");
    const meta2x = await sharp(front2x).metadata();
    expect(meta2x.width).toBe(800);
    expect(meta2x.height).toBe(480);
  });

  it("Contents.json references all three layer directories", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "stacks");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconSmall, config, iconSourceSize);

    const stackDir = join(parentDir, "App Icon.imagestack");
    const contents = parseContentsJson(join(stackDir, "Contents.json")) as {
      layers: { filename: string }[];
    };
    const layerNames = contents.layers.map((l) => l.filename);
    expect(layerNames).toEqual([
      "Front.imagestacklayer",
      "Middle.imagestacklayer",
      "Back.imagestacklayer",
    ]);
  });
});

describe("generateImageStack — App Store variant", () => {
  it("generates single-scale PNGs without @scale suffix for back layer", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "stacks-store");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconLarge, config, iconSourceSize);

    const backImageset = join(parentDir, "App Icon - App Store.imagestack", "Back.imagestacklayer", "Content.imageset");
    // Back layer uses plain name (no @1x)
    expect(existsSync(join(backImageset, "back.png"))).toBe(true);
    // Front/Middle use @1x
    const frontImageset = join(parentDir, "App Icon - App Store.imagestack", "Front.imagestacklayer", "Content.imageset");
    expect(existsSync(join(frontImageset, "front@1x.png"))).toBe(true);
  });

  it("generates App Store PNGs at 1280x768", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "stacks-store-dims");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconLarge, config, iconSourceSize);

    const backPng = join(parentDir, "App Icon - App Store.imagestack", "Back.imagestacklayer", "Content.imageset", "back.png");
    const meta = await sharp(backPng).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(768);
  });
});

describe("generateImageStack — border radius", () => {
  it("applies border radius to front/middle layers (not back)", async () => {
    const { config, iconSourceSize } = await makeConfig();
    config.inputs.iconBorderRadius = 50;
    const parentDir = join(TMP, "stacks-radius");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconSmall, config, iconSourceSize);

    // Front layer should have alpha channel (transparent canvas with rounded icon)
    const frontPng = join(parentDir, "App Icon.imagestack", "Front.imagestacklayer", "Content.imageset", "front@1x.png");
    const frontMeta = await sharp(frontPng).metadata();
    expect(frontMeta.channels).toBe(4); // RGBA (transparent)

    // Back layer should be opaque (no border radius applied)
    const backPng = join(parentDir, "App Icon.imagestack", "Back.imagestacklayer", "Content.imageset", "back@1x.png");
    const backMeta = await sharp(backPng).metadata();
    expect(backMeta.channels).toBe(3); // RGB (opaque)
  });
});

describe("generateImageStack — disabled", () => {
  it("does nothing when asset is disabled", async () => {
    const { config, iconSourceSize } = await makeConfig({
      brandAssets: { appIconSmall: { enabled: false } },
    });
    const parentDir = join(TMP, "stacks-disabled");
    mkdirSync(parentDir, { recursive: true });

    await generateImageStack(parentDir, config.brandAssets.appIconSmall, config, iconSourceSize);

    expect(existsSync(join(parentDir, "App Icon.imagestack"))).toBe(false);
  });
});
