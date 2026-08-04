jest.setTimeout(60000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, validateInputImages } from "../../src/config";
import { generateAppIconSet } from "../../src/generators/appiconset";
import { createTestIcon, createTestBackground, createTestPng } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-appiconset");

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

async function makeConfig(extraArgs?: { iconDark?: string; iconTinted?: string }): Promise<{
  config: TvOSImageCreatorConfig;
  iconSourceSize: number;
}> {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  const outputDir = join(TMP, "output");
  const config = resolveConfig({
    icon,
    background: bg,
    color: "#FF0000",
    output: outputDir,
    ...extraArgs,
  });
  const { iconSourceSize } = await validateInputImages(config);
  return { config, iconSourceSize };
}

async function centerPixel(pngPath: string): Promise<{ r: number; g: number; b: number; a: number }> {
  const { data, info } = await sharp(pngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
  return { r: data[center], g: data[center + 1], b: data[center + 2], a: data[center + 3] };
}

describe("generateAppIconSet — structure", () => {
  it("creates AppIcon.appiconset with three 1024x1024 variants", async () => {
    const { config, iconSourceSize } = await makeConfig();
    await generateAppIconSet(TMP, config, iconSourceSize);

    const setDir = join(TMP, "AppIcon.appiconset");
    for (const name of ["icon-1024.png", "icon-1024-dark.png", "icon-1024-tinted.png"]) {
      const meta = await sharp(join(setDir, name)).metadata();
      expect(meta.width).toBe(1024);
      expect(meta.height).toBe(1024);
    }
  });

  it("writes Contents.json with ios platform and appearance entries", async () => {
    const { config, iconSourceSize } = await makeConfig();
    await generateAppIconSet(TMP, config, iconSourceSize);

    const contents = parseContentsJson(join(TMP, "AppIcon.appiconset", "Contents.json")) as {
      images: Array<{
        filename: string;
        idiom: string;
        platform: string;
        size: string;
        appearances?: Array<{ appearance: string; value: string }>;
      }>;
    };

    expect(contents.images).toHaveLength(3);
    for (const image of contents.images) {
      expect(image.idiom).toBe("universal");
      expect(image.platform).toBe("ios");
      expect(image.size).toBe("1024x1024");
    }

    const light = contents.images.find((i) => !i.appearances);
    const dark = contents.images.find((i) => i.appearances?.[0]?.value === "dark");
    const tinted = contents.images.find((i) => i.appearances?.[0]?.value === "tinted");
    expect(light?.filename).toBe("icon-1024.png");
    expect(dark?.filename).toBe("icon-1024-dark.png");
    expect(dark?.appearances?.[0]?.appearance).toBe("luminosity");
    expect(tinted?.filename).toBe("icon-1024-tinted.png");
  });

  it("does nothing when iosIcon is disabled", async () => {
    const { config, iconSourceSize } = await makeConfig();
    config.iosIcon.enabled = false;
    await generateAppIconSet(TMP, config, iconSourceSize);
    expect(existsSync(join(TMP, "AppIcon.appiconset"))).toBe(false);
  });
});

describe("generateAppIconSet — variants", () => {
  it("light variant is opaque, dark variant keeps transparency", async () => {
    const { config, iconSourceSize } = await makeConfig();
    await generateAppIconSet(TMP, config, iconSourceSize);

    const setDir = join(TMP, "AppIcon.appiconset");
    const lightMeta = await sharp(join(setDir, "icon-1024.png")).metadata();
    expect(lightMeta.channels).toBe(3);

    const darkMeta = await sharp(join(setDir, "icon-1024-dark.png")).metadata();
    expect(darkMeta.channels).toBe(4);
    // Corner is outside the centered icon — must be fully transparent
    const { data } = await sharp(join(setDir, "icon-1024-dark.png"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
  });

  it("auto-derived tinted variant is grayscale", async () => {
    const { config, iconSourceSize } = await makeConfig();
    await generateAppIconSet(TMP, config, iconSourceSize);

    // Fixture icon is red — grayscale collapses channels to equal values
    const px = await centerPixel(join(TMP, "AppIcon.appiconset", "icon-1024-tinted.png"));
    expect(px.r).toBe(px.g);
    expect(px.g).toBe(px.b);
  });

  it("uses explicit dark/tinted overrides verbatim (no grayscale on override)", async () => {
    const darkPath = join(TMP, "custom-dark.png");
    const tintedPath = join(TMP, "custom-tinted.png");
    await createTestPng(darkPath, 1024, 1024, { transparent: true });
    await createTestPng(tintedPath, 1024, 1024, { transparent: true });

    const { config, iconSourceSize } = await makeConfig({ iconDark: darkPath, iconTinted: tintedPath });
    expect(config.inputs.iconDarkImage).toBe(darkPath);
    expect(config.inputs.iconTintedImage).toBe(tintedPath);

    await generateAppIconSet(TMP, config, iconSourceSize);

    // Override fixture is red at half alpha — must NOT be grayscaled
    const px = await centerPixel(join(TMP, "AppIcon.appiconset", "icon-1024-tinted.png"));
    expect(px.r).toBeGreaterThan(px.g);
  });
});
