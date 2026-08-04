jest.setTimeout(120000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../src/config";
import { generateAssets } from "../src/lib";
import { createTestIcon, createTestBackground, createTestSvgIcon } from "./fixtures/create-fixtures";
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
