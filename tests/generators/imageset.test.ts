jest.setTimeout(60000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, validateInputImages } from "../../src/config";
import { generateTopShelfImageSet, generateSplashLogoImageSet } from "../../src/generators/imageset";
import { contentBox, iconMark, measureMark } from "../../src/utils/image-processing";
import type { Mark } from "../../src/utils/image-processing";
import { createTestIcon, createTestBackground, createTestSvgLayer } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-imageset");

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

async function makeConfig(overrides?: Record<string, unknown>): Promise<{ config: TvOSImageCreatorConfig; iconSourceSize: number; mark: Mark }> {
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
  const mark = iconMark(config.inputs.iconImage, config.inputs.iconBorderRadius, iconSourceSize, await contentBox(config.inputs.iconImage));
  return { config, iconSourceSize, mark };
}

describe("generateTopShelfImageSet", () => {
  it("creates .imageset directory with Contents.json", async () => {
    const { config, mark } = await makeConfig();
    const parentDir = join(TMP, "topshelf");
    mkdirSync(parentDir, { recursive: true });

    await generateTopShelfImageSet(parentDir, config.brandAssets.topShelfImage, config, mark);

    const imagesetDir = join(parentDir, "Top Shelf Image.imageset");
    expect(existsSync(imagesetDir)).toBe(true);
    expect(existsSync(join(imagesetDir, "Contents.json"))).toBe(true);
  });

  it("generates opaque PNGs at @1x and @2x", async () => {
    const { config, mark } = await makeConfig();
    const parentDir = join(TMP, "topshelf-pngs");
    mkdirSync(parentDir, { recursive: true });

    await generateTopShelfImageSet(parentDir, config.brandAssets.topShelfImage, config, mark);

    const imagesetDir = join(parentDir, "Top Shelf Image.imageset");

    // @1x: 1920x720, opaque
    const meta1x = await sharp(join(imagesetDir, "top@1x.png")).metadata();
    expect(meta1x.width).toBe(1920);
    expect(meta1x.height).toBe(720);
    expect(meta1x.channels).toBe(3);

    // @2x: 3840x1440, opaque
    const meta2x = await sharp(join(imagesetDir, "top@2x.png")).metadata();
    expect(meta2x.width).toBe(3840);
    expect(meta2x.height).toBe(1440);
    expect(meta2x.channels).toBe(3);
  });

  it("Top Shelf Wide generates at correct wider dimensions", async () => {
    const { config, mark } = await makeConfig();
    const parentDir = join(TMP, "topshelf-wide");
    mkdirSync(parentDir, { recursive: true });

    await generateTopShelfImageSet(parentDir, config.brandAssets.topShelfImageWide, config, mark);

    const imagesetDir = join(parentDir, "Top Shelf Image Wide.imageset");
    const meta1x = await sharp(join(imagesetDir, "wide@1x.png")).metadata();
    expect(meta1x.width).toBe(2320);
    expect(meta1x.height).toBe(720);
  });

  it("Contents.json lists correct image entries", async () => {
    const { config, mark } = await makeConfig();
    const parentDir = join(TMP, "topshelf-json");
    mkdirSync(parentDir, { recursive: true });

    await generateTopShelfImageSet(parentDir, config.brandAssets.topShelfImage, config, mark);

    const imagesetDir = join(parentDir, "Top Shelf Image.imageset");
    const contents = parseContentsJson(join(imagesetDir, "Contents.json")) as {
      images: { filename: string; idiom: string; scale: string }[];
    };

    expect(contents.images).toHaveLength(2);
    expect(contents.images[0].filename).toBe("top@1x.png");
    expect(contents.images[0].idiom).toBe("tv");
    expect(contents.images[0].scale).toBe("1x");
    expect(contents.images[1].filename).toBe("top@2x.png");
  });

  it("does nothing when disabled", async () => {
    const { config, mark } = await makeConfig({
      brandAssets: { topShelfImage: { enabled: false } },
    });
    const parentDir = join(TMP, "topshelf-disabled");
    mkdirSync(parentDir, { recursive: true });

    await generateTopShelfImageSet(parentDir, config.brandAssets.topShelfImage, config, mark);

    expect(existsSync(join(parentDir, "Top Shelf Image.imageset"))).toBe(false);
  });

  it("draws on its own backgroundImage, with the mark at its own iconScale", async () => {
    const green = join(TMP, "shelf-bg.png");
    await sharp({ create: { width: 2320, height: 720, channels: 3, background: { r: 0, g: 200, b: 0 } } })
      .png()
      .toFile(green);
    const { config, mark } = await makeConfig();
    const shelf = { ...config.brandAssets.topShelfImage, backgroundImage: green, iconScale: config.brandAssets.iconScale / 2 };

    // Rows of the centre column that differ from the backdrop: the height the mark covers.
    const markHeight = async (dir: string): Promise<number> => {
      const { data, info } = await sharp(join(dir, "Top Shelf Image.imageset", "top@1x.png"))
        .raw()
        .toBuffer({ resolveWithObject: true });
      const x = Math.floor(info.width / 2);
      const bg = [data[0], data[1], data[2]];
      let rows = 0;
      for (let y = 0; y < info.height; y++) {
        const i = (y * info.width + x) * info.channels;
        if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 30) rows++;
      }
      return rows;
    };

    const fullDir = join(TMP, "topshelf-full");
    const halfDir = join(TMP, "topshelf-half");
    mkdirSync(fullDir, { recursive: true });
    mkdirSync(halfDir, { recursive: true });
    await generateTopShelfImageSet(fullDir, { ...config.brandAssets.topShelfImage, backgroundImage: green }, config, mark);
    await generateTopShelfImageSet(halfDir, shelf, config, mark);

    const { data } = await sharp(join(halfDir, "Top Shelf Image.imageset", "top@1x.png")).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0, 200, 0]);
    const ratio = (await markHeight(halfDir)) / (await markHeight(fullDir));
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });

  /** Rows of the centre column that are blue: the height a blue mark covers. */
  async function blueRows(dir: string): Promise<{ rows: number; height: number; centre: number[] }> {
    const { data, info } = await sharp(join(dir, "Top Shelf Image.imageset", "top@1x.png")).raw().toBuffer({ resolveWithObject: true });
    const x = Math.floor(info.width / 2);
    const at = ((Math.floor(info.height / 2) * info.width) + x) * info.channels;
    let rows = 0;
    for (let y = 0; y < info.height; y++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i + 2] > 200 && data[i] < 50) rows++;
    }
    return { rows, height: info.height, centre: [data[at], data[at + 1], data[at + 2]] };
  }

  it("draws the mark it is given, measured on its own, instead of the icon", async () => {
    const { config } = await makeConfig();
    const blue = createTestSvgLayer(TMP, "mark.svg", "#0000FF", 400);
    const dir = join(TMP, "topshelf-mark");
    mkdirSync(dir, { recursive: true });
    await generateTopShelfImageSet(dir, config.brandAssets.topShelfImage, config, await measureMark(blue));

    const { rows, height, centre } = await blueRows(dir);
    expect(centre).toEqual([0, 0, 255]);
    // The disc fills 800 of 1024 of its own canvas; at the default iconScale that is most of the 720 height.
    expect(rows).toBeGreaterThan(height * 0.5);
    expect(rows).toBeLessThan(height);
  });

  it("draws its own iconImage over the mark it is given", async () => {
    const { config, mark } = await makeConfig();
    const blue = createTestSvgLayer(TMP, "mark.svg", "#0000FF", 400);
    const dir = join(TMP, "topshelf-own-mark");
    mkdirSync(dir, { recursive: true });
    await generateTopShelfImageSet(dir, { ...config.brandAssets.topShelfImage, iconImage: blue }, config, mark);

    const { rows, height, centre } = await blueRows(dir);
    expect(centre).toEqual([0, 0, 255]);
    expect(rows).toBeGreaterThan(height * 0.5);
  });
});

describe("generateSplashLogoImageSet", () => {
  it("generates transparent PNGs for universal scales", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "splash-logo");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const imagesetDir = join(parentDir, "SplashScreenLogo.imageset");
    expect(existsSync(join(imagesetDir, "200-icon@1x.png"))).toBe(true);
    expect(existsSync(join(imagesetDir, "200-icon@2x.png"))).toBe(true);
    expect(existsSync(join(imagesetDir, "200-icon@3x.png"))).toBe(true);

    // @3x should be 600x600 (baseSize 200 * 3)
    const meta3x = await sharp(join(imagesetDir, "200-icon@3x.png")).metadata();
    expect(meta3x.width).toBe(600);
    expect(meta3x.height).toBe(600);
    // Transparent (4 channels)
    expect(meta3x.channels).toBe(4);
  });

  it("generates TV scale variants with -tv@ prefix", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "splash-logo-tv");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const imagesetDir = join(parentDir, "SplashScreenLogo.imageset");
    expect(existsSync(join(imagesetDir, "200-icon-tv@1x.png"))).toBe(true);
    expect(existsSync(join(imagesetDir, "200-icon-tv@2x.png"))).toBe(true);

    // TV @2x should be 400x400
    const metaTv2x = await sharp(join(imagesetDir, "200-icon-tv@2x.png")).metadata();
    expect(metaTv2x.width).toBe(400);
    expect(metaTv2x.height).toBe(400);
  });

  it("Contents.json has both universal and tv entries", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const parentDir = join(TMP, "splash-logo-json");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const imagesetDir = join(parentDir, "SplashScreenLogo.imageset");
    const contents = parseContentsJson(join(imagesetDir, "Contents.json")) as {
      images: { filename: string; idiom: string; scale: string }[];
    };

    // 3 universal + 2 tv = 5
    expect(contents.images).toHaveLength(5);
    const universalEntries = contents.images.filter((i) => i.idiom === "universal");
    const tvEntries = contents.images.filter((i) => i.idiom === "tv");
    expect(universalEntries).toHaveLength(3);
    expect(tvEntries).toHaveLength(2);
  });

  it("applies border radius when configured", async () => {
    const { config, iconSourceSize } = await makeConfig();
    config.inputs.iconBorderRadius = 30;
    const parentDir = join(TMP, "splash-logo-radius");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    // Should still produce valid PNGs
    const imagesetDir = join(parentDir, "SplashScreenLogo.imageset");
    const meta = await sharp(join(imagesetDir, "200-icon@1x.png")).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(200);
  });

  it("draws each device type at its own size, others at baseSize", async () => {
    const { config, iconSourceSize } = await makeConfig({
      splashScreen: { logo: { baseSize: 140, idioms: { tv: { size: 200 }, iphone: {} } } },
    });
    const parentDir = join(TMP, "splash-logo-sizes");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const imagesetDir = join(parentDir, "SplashScreenLogo.imageset");
    expect((await sharp(join(imagesetDir, "200-icon@1x.png")).metadata()).width).toBe(140);
    expect((await sharp(join(imagesetDir, "200-icon@3x.png")).metadata()).width).toBe(420);
    expect((await sharp(join(imagesetDir, "200-icon-tv@1x.png")).metadata()).width).toBe(200);
    expect((await sharp(join(imagesetDir, "200-icon-tv@2x.png")).metadata()).width).toBe(400);
    // iPhone takes Apple's 2x and 3x when it names no scales.
    expect((await sharp(join(imagesetDir, "200-icon-iphone@2x.png")).metadata()).width).toBe(280);
    expect(existsSync(join(imagesetDir, "200-icon-iphone@3x.png"))).toBe(true);
    expect(existsSync(join(imagesetDir, "200-icon-iphone@1x.png"))).toBe(false);
  });

  it("keeps a wide logo's aspect ratio: size is the width", async () => {
    const wide = join(TMP, "wordmark.png");
    await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } })
      .png()
      .toFile(wide);
    const { config, iconSourceSize } = await makeConfig({ splashScreen: { logo: { image: wide, baseSize: 140 } } });
    const parentDir = join(TMP, "splash-logo-wide");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const meta = await sharp(join(parentDir, "SplashScreenLogo.imageset", "200-icon@2x.png")).metadata();
    expect([meta.width, meta.height]).toEqual([280, 70]);
  });

  it("draws the logo from splashScreen.logo.image, without the icon's border radius", async () => {
    const splash = join(TMP, "splash.png");
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } })
      .png()
      .toFile(splash);
    const { config, iconSourceSize } = await makeConfig({ splashScreen: { logo: { image: splash } } });
    config.inputs.iconBorderRadius = 30;
    const parentDir = join(TMP, "splash-logo-image");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const { data } = await sharp(join(parentDir, "SplashScreenLogo.imageset", "200-icon-tv@1x.png"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 255, 255]);
  });

  it("writes dark entries from darkImage, and a device type's own image wins over the logo's", async () => {
    const paint = async (name: string, rgb: { r: number; g: number; b: number }): Promise<string> => {
      const path = join(TMP, name);
      await sharp({ create: { width: 64, height: 64, channels: 4, background: { ...rgb, alpha: 1 } } }).png().toFile(path);
      return path;
    };
    const light = await paint("light.png", { r: 255, g: 0, b: 0 });
    const dark = await paint("dark.png", { r: 0, g: 255, b: 0 });
    const tvArt = await paint("tv.png", { r: 0, g: 0, b: 255 });
    const { config, iconSourceSize } = await makeConfig({
      splashScreen: { logo: { image: light, darkImage: dark, idioms: { tv: { image: tvArt } } } },
    });
    const parentDir = join(TMP, "splash-logo-dark");
    mkdirSync(parentDir, { recursive: true });

    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config, iconSourceSize);

    const imagesetDir = join(parentDir, "SplashScreenLogo.imageset");
    const firstPixel = async (file: string): Promise<number[]> => {
      const { data } = await sharp(join(imagesetDir, file)).raw().toBuffer({ resolveWithObject: true });
      return [data[0], data[1], data[2]];
    };
    expect(await firstPixel("200-icon@1x.png")).toEqual([255, 0, 0]);
    expect(await firstPixel("200-icon-dark@1x.png")).toEqual([0, 255, 0]);
    expect(await firstPixel("200-icon-tv@1x.png")).toEqual([0, 0, 255]);
    expect(await firstPixel("200-icon-tv-dark@1x.png")).toEqual([0, 255, 0]);

    const contents = parseContentsJson(join(imagesetDir, "Contents.json")) as {
      images: { filename: string; appearances?: { appearance: string; value: string }[] }[];
    };
    const darkEntry = contents.images.find((i) => i.filename === "200-icon-tv-dark@2x.png");
    expect(darkEntry?.appearances).toEqual([{ appearance: "luminosity", value: "dark" }]);
    expect(contents.images).toHaveLength(10);
  });
});
