jest.setTimeout(60000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { resolveConfig, validateInputImages } from "../../src/config";
import { rootContentsJson } from "../../src/generators/contents-json";
import { generateBrandAssets } from "../../src/generators/brand-assets";
import { generateSplashLogoImageSet } from "../../src/generators/imageset";
import { generateColorSet } from "../../src/generators/colorset";
import { generateIcon } from "../../src/generators/icon";
import { ensureDir, writeContentsJson } from "../../src/utils/fs";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";

const TMP = join(__dirname, "../../.test-tmp-integration");
const OUTPUT = join(TMP, "Images.xcassets");

beforeEach(async () => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

async function generateAll() {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  const config = resolveConfig({
    icon,
    background: bg,
    color: "#F39C12",
    output: OUTPUT,
  });

  // Validate inputs first
  await validateInputImages(config);

  ensureDir(config.output.directory);
  const rootContents = rootContentsJson(config.xcassetsMeta);
  writeContentsJson(join(config.output.directory, "Contents.json"), rootContents);

  await generateBrandAssets(config);
  await generateSplashLogoImageSet(
    config.output.directory,
    config.splashScreen.logo,
    config,
  );
  generateColorSet(
    config.output.directory,
    config.splashScreen.background,
    config,
  );
  await generateIcon(config);

  return config;
}

describe("Full xcassets generation", () => {
  it("creates the root Contents.json", async () => {
    await generateAll();
    const rootJson = join(OUTPUT, "Contents.json");
    expect(existsSync(rootJson)).toBe(true);
    const content = readFileSync(rootJson, "utf-8");
    // Xcode-style space-before-colon
    expect(content).toContain('"info" :');
  });

  it("creates the Brand Assets directory structure", async () => {
    await generateAll();
    const brandDir = join(OUTPUT, "AppIcon.brandassets");
    expect(existsSync(brandDir)).toBe(true);
    expect(existsSync(join(brandDir, "Contents.json"))).toBe(true);

    // App Icon imagestack
    const appIcon = join(brandDir, "App Icon.imagestack");
    expect(existsSync(appIcon)).toBe(true);
    expect(existsSync(join(appIcon, "Front.imagestacklayer"))).toBe(true);
    expect(existsSync(join(appIcon, "Middle.imagestacklayer"))).toBe(true);
    expect(existsSync(join(appIcon, "Back.imagestacklayer"))).toBe(true);

    // App Store imagestack
    const appStore = join(brandDir, "App Icon - App Store.imagestack");
    expect(existsSync(appStore)).toBe(true);
  });

  it("generates App Icon PNGs at correct dimensions", async () => {
    await generateAll();
    const frontImageset = join(
      OUTPUT,
      "AppIcon.brandassets",
      "App Icon.imagestack",
      "Front.imagestacklayer",
      "Content.imageset",
    );

    // @1x: 400x240
    const front1x = join(frontImageset, "front@1x.png");
    expect(existsSync(front1x)).toBe(true);
    const meta1x = await sharp(front1x).metadata();
    expect(meta1x.width).toBe(400);
    expect(meta1x.height).toBe(240);

    // @2x: 800x480
    const front2x = join(frontImageset, "front@2x.png");
    expect(existsSync(front2x)).toBe(true);
    const meta2x = await sharp(front2x).metadata();
    expect(meta2x.width).toBe(800);
    expect(meta2x.height).toBe(480);
  });

  it("generates App Store icon at 1280x768", async () => {
    await generateAll();
    const frontImageset = join(
      OUTPUT,
      "AppIcon.brandassets",
      "App Icon - App Store.imagestack",
      "Front.imagestacklayer",
      "Content.imageset",
    );
    const front1x = join(frontImageset, "front@1x.png");
    expect(existsSync(front1x)).toBe(true);
    const meta = await sharp(front1x).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(768);
  });

  it("generates Top Shelf images", async () => {
    await generateAll();
    const topShelf = join(OUTPUT, "AppIcon.brandassets", "Top Shelf Image.imageset");
    expect(existsSync(join(topShelf, "top@1x.png"))).toBe(true);
    expect(existsSync(join(topShelf, "top@2x.png"))).toBe(true);

    const meta1x = await sharp(join(topShelf, "top@1x.png")).metadata();
    expect(meta1x.width).toBe(1920);
    expect(meta1x.height).toBe(720);

    const meta2x = await sharp(join(topShelf, "top@2x.png")).metadata();
    expect(meta2x.width).toBe(3840);
    expect(meta2x.height).toBe(1440);
  });

  it("generates Top Shelf Wide images", async () => {
    await generateAll();
    const wide = join(OUTPUT, "AppIcon.brandassets", "Top Shelf Image Wide.imageset");
    expect(existsSync(join(wide, "wide@1x.png"))).toBe(true);
    expect(existsSync(join(wide, "wide@2x.png"))).toBe(true);

    const meta1x = await sharp(join(wide, "wide@1x.png")).metadata();
    expect(meta1x.width).toBe(2320);
    expect(meta1x.height).toBe(720);
  });

  it("generates Splash Screen Logo imageset", async () => {
    await generateAll();
    const logoDir = join(OUTPUT, "SplashScreenLogo.imageset");
    expect(existsSync(logoDir)).toBe(true);
    expect(existsSync(join(logoDir, "Contents.json"))).toBe(true);
    expect(existsSync(join(logoDir, "200-icon@1x.png"))).toBe(true);
    expect(existsSync(join(logoDir, "200-icon@2x.png"))).toBe(true);
    expect(existsSync(join(logoDir, "200-icon@3x.png"))).toBe(true);
    expect(existsSync(join(logoDir, "200-icon-tv@1x.png"))).toBe(true);
    expect(existsSync(join(logoDir, "200-icon-tv@2x.png"))).toBe(true);

    // Check dimensions of @3x (200*3=600)
    const meta3x = await sharp(join(logoDir, "200-icon@3x.png")).metadata();
    expect(meta3x.width).toBe(600);
    expect(meta3x.height).toBe(600);
  });

  it("generates Splash Screen Background colorset", async () => {
    await generateAll();
    const colorsetDir = join(OUTPUT, "SplashScreenBackground.colorset");
    expect(existsSync(colorsetDir)).toBe(true);

    const contents = JSON.parse(
      readFileSync(join(colorsetDir, "Contents.json"), "utf-8").replace(/" :/g, '":'),
    );
    expect(contents.colors).toHaveLength(4);
  });

  it("generates standalone icon.png at 1024x1024", async () => {
    await generateAll();
    // The generated icon.png is in the parent of the output directory.
    const generatedIcon = join(dirname(OUTPUT), "icon.png");
    expect(existsSync(generatedIcon)).toBe(true);
    const meta = await sharp(generatedIcon).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    // Opaque (3 channels)
    expect(meta.channels).toBe(3);
  });

  it("produces the expected total number of files", async () => {
    await generateAll();

    // Count all files recursively
    const { readdirSync, statSync } = await import("node:fs");
    function countFiles(dir: string): number {
      let count = 0;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          count += countFiles(full);
        } else {
          count++;
        }
      }
      return count;
    }

    // 38 files inside Images.xcassets (20 Contents.json + 18 PNGs)
    const xcassetsCount = countFiles(OUTPUT);
    expect(xcassetsCount).toBe(38);
  });
});
