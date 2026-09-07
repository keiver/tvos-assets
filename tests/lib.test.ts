jest.setTimeout(120000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../src/config";
import { generateAssets } from "../src/lib";
import {
  createTestIcon,
  createTestBackground,
  createTestSvgIcon,
  createTestSvgLayer,
} from "./fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../src/types";

const TMP = join(__dirname, "../.test-tmp-lib");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

async function makeConfig(): Promise<TvOSImageCreatorConfig> {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  return resolveConfig({ icon, background: bg, color: "#FF0000", output: join(TMP, "out") });
}

describe("generateAssets with an assembled icon", () => {
  /** Middle is a wide blue disc, front a narrow red one, so the paint order shows. */
  async function makeAssembledConfig(): Promise<TvOSImageCreatorConfig> {
    const bg = await createTestBackground(TMP);
    const front = createTestSvgLayer(TMP, "front.svg", "#FF0000", 200);
    const middle = createTestSvgLayer(TMP, "middle.svg", "#0000FF", 400);
    const layers = { front: { imagePath: front }, middle: { imagePath: middle } };

    return resolveConfig({
      background: bg,
      color: "#FF0000",
      output: join(TMP, "out"),
      overrides: { brandAssets: { appIconSmall: { layers }, appIconLarge: { layers } } },
    });
  }

  /** RGB of one pixel, as a #rrggbb string. */
  async function pixelAt(file: string, x: number, y: number): Promise<string> {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * 4;
    return "#" + [data[i], data[i + 1], data[i + 2]].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  it("generates every icon-derived asset without an icon input", async () => {
    const config = await makeAssembledConfig();
    const xcassetsDir = join(TMP, "Images.xcassets");

    await generateAssets(config, xcassetsDir);

    expect(existsSync(join(xcassetsDir, "AppIcon.appiconset", "icon-1024.png"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "AppIcon.appiconset", "icon-1024-dark.png"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "AppIcon.brandassets", "Top Shelf Image.imageset"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "SplashScreenLogo.imageset", "200-icon@3x.png"))).toBe(true);
  });

  it("paints the layers back to front: the front layer wins the overlap", async () => {
    const config = await makeAssembledConfig();
    const xcassetsDir = join(TMP, "Images.xcassets");

    await generateAssets(config, xcassetsDir);

    // The dark variant is the bare icon on transparency at 1024. The content box
    // is the middle disc (the larger one), so it renders at the full iOS scale
    // and the front disc at half of it. A point past the front disc's edge but
    // inside the middle one must be blue; reversed order would paint it red.
    const middleRadius = (1024 * config.iosIcon.iconScale) / 2;
    const frontRadius = middleRadius / 2;
    const probe = Math.round((frontRadius + middleRadius) / 2);
    expect(probe).toBeGreaterThan(frontRadius);
    expect(probe).toBeLessThan(middleRadius);

    const dark = join(xcassetsDir, "AppIcon.appiconset", "icon-1024-dark.png");
    expect(await pixelAt(dark, 512, 512)).toBe("#ff0000");
    expect(await pixelAt(dark, 512, 512 - probe)).toBe("#0000ff");
  });

  it("sizes the mark to the configured share of the canvas, not the artboard", async () => {
    const config = await makeAssembledConfig();
    const xcassetsDir = join(TMP, "Images.xcassets");

    await generateAssets(config, xcassetsDir);

    // The layer art is a disc on a mostly empty 1024 artboard. Without content
    // normalisation that padding would shrink the mark; with it, the mark lands
    // at exactly the configured share of the canvas.
    const dark = join(xcassetsDir, "AppIcon.appiconset", "icon-1024-dark.png");
    const { data, info } = await sharp(dark).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width;
    let right = -1;
    for (let x = 0; x < info.width; x++) {
      if (data[(512 * info.width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    const covered = (right - left + 1) / info.width;
    expect(covered).toBeCloseTo(config.iosIcon.iconScale, 1);
  });

  it("leaves the caller's config untouched", async () => {
    const config = await makeAssembledConfig();

    await generateAssets(config, join(TMP, "Images.xcassets"));

    expect(config.inputs.iconImage).toBe("");
    expect(config.inputs.iconAssembledFrom).toHaveLength(2);
  });

  it("refuses a config with neither an icon nor layer art", async () => {
    const config = await makeAssembledConfig();
    const broken = { ...config, inputs: { ...config.inputs, iconAssembledFrom: undefined } };

    await expect(generateAssets(broken, join(TMP, "Images.xcassets"))).rejects.toThrow(
      /no icon image and no layer art/,
    );
  });
});

describe("generateAssets", () => {
  it("generates tvOS + iOS + splash assets by default", async () => {
    const config = await makeConfig();
    const xcassetsDir = join(TMP, "Images.xcassets");

    const { warnings } = await generateAssets(config, xcassetsDir);

    expect(existsSync(join(xcassetsDir, "Contents.json"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "AppIcon.brandassets", "App Icon.imagestack"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "AppIcon.brandassets", "Top Shelf Image Wide.imageset"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "AppIcon.appiconset", "icon-1024-tinted.png"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "SplashScreenLogo.imageset", "Contents.json"))).toBe(true);
    expect(existsSync(join(xcassetsDir, "SplashScreenBackground.colorset", "Contents.json"))).toBe(true);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("platforms: ['tvos'] skips the appiconset, ['ios'] skips brandassets", async () => {
    const config = await makeConfig();

    const tvDir = join(TMP, "tv.xcassets");
    await generateAssets(config, tvDir, { platforms: ["tvos"] });
    expect(existsSync(join(tvDir, "AppIcon.brandassets"))).toBe(true);
    expect(existsSync(join(tvDir, "AppIcon.appiconset"))).toBe(false);

    const iosDir = join(TMP, "ios.xcassets");
    await generateAssets(config, iosDir, { platforms: ["ios"] });
    expect(existsSync(join(iosDir, "AppIcon.brandassets"))).toBe(false);
    expect(existsSync(join(iosDir, "AppIcon.appiconset"))).toBe(true);
  });

  it("cleans stale files from owned asset directories, leaves other catalog entries alone", async () => {
    const config = await makeConfig();
    const xcassetsDir = join(TMP, "Images.xcassets");

    // Simulate an Expo-generated catalog with a stale single-size icon and an unrelated imageset
    const staleDir = join(xcassetsDir, "AppIcon.appiconset");
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(staleDir, "App-Icon-1024x1024@1x.png"), "stale");
    const foreignDir = join(xcassetsDir, "SomethingElse.imageset");
    mkdirSync(foreignDir, { recursive: true });
    writeFileSync(join(foreignDir, "keep.png"), "keep");

    await generateAssets(config, xcassetsDir, { platforms: ["ios"] });

    expect(existsSync(join(staleDir, "App-Icon-1024x1024@1x.png"))).toBe(false);
    expect(existsSync(join(staleDir, "icon-1024.png"))).toBe(true);
    expect(existsSync(join(foreignDir, "keep.png"))).toBe(true);
  });

  it("writes standalone icon.png when requested and reports steps", async () => {
    const config = await makeConfig();
    const xcassetsDir = join(TMP, "Images.xcassets");
    const iconPath = join(TMP, "icon.png");
    const steps: string[] = [];

    await generateAssets(config, xcassetsDir, {
      standaloneIconPath: iconPath,
      onStep: (message) => steps.push(message),
    });

    const meta = await sharp(iconPath).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(steps.length).toBeGreaterThanOrEqual(5);
  });

  it("accepts an SVG icon and rasterizes it crisply at all sizes", async () => {
    const svgIcon = createTestSvgIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({
      icon: svgIcon,
      background: bg,
      color: "#FF0000",
      output: join(TMP, "out"),
    });
    const xcassetsDir = join(TMP, "Images.xcassets");

    await generateAssets(config, xcassetsDir);

    // 100x100 SVG must still produce full-size raster outputs
    const appStoreFront = join(
      xcassetsDir,
      "AppIcon.brandassets",
      "App Icon - App Store.imagestack",
      "Front.imagestacklayer",
      "Content.imageset",
      "front@1x.png",
    );
    const meta = await sharp(appStoreFront).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(768);

    const iosIcon = await sharp(join(xcassetsDir, "AppIcon.appiconset", "icon-1024.png")).metadata();
    expect(iosIcon.width).toBe(1024);
  });
});
