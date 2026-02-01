import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import { generateBrandAssets } from "../../src/generators/brand-assets";
import { generateSplashLogoImageSet } from "../../src/generators/imageset";
import { generateColorSet } from "../../src/generators/colorset";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-generators");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

async function makeConfig(overrides?: Record<string, unknown>): Promise<TvOSImageCreatorConfig> {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  const outputDir = join(TMP, "output", "Images.xcassets");

  if (overrides) {
    const configPath = join(TMP, "test-config.json");
    const configData = {
      inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
      output: { directory: outputDir },
      ...overrides,
    };
    mkdirSync(join(TMP, "output"), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(configPath, JSON.stringify(configData));
    return resolveConfig({ config: configPath });
  }

  return resolveConfig({ icon, background: bg, color: "#FF0000", output: outputDir });
}

describe("generateBrandAssets — disabled Top Shelf assets", () => {
  it("omits Top Shelf directories when disabled", async () => {
    const config = await makeConfig({
      brandAssets: {
        topShelfImage: { enabled: false },
        topShelfImageWide: { enabled: false },
      },
    });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, `${config.brandAssets.name}.brandassets`);

    // Top Shelf directories should NOT exist
    expect(existsSync(join(brandDir, "Top Shelf Image.imageset"))).toBe(false);
    expect(existsSync(join(brandDir, "Top Shelf Image Wide.imageset"))).toBe(false);

    // App Icon imagestacks should still be generated
    expect(existsSync(join(brandDir, "App Icon.imagestack"))).toBe(true);
    expect(existsSync(join(brandDir, "App Icon - App Store.imagestack"))).toBe(true);

    // Brand Assets Contents.json should not reference Top Shelf
    const contentsRaw = readFileSync(join(brandDir, "Contents.json"), "utf-8");
    const normalized = contentsRaw.replace(/" :/g, '":');
    const contents = JSON.parse(normalized);
    const filenames = contents.assets.map((a: { filename: string }) => a.filename);
    expect(filenames).not.toContain("Top Shelf Image.imageset");
    expect(filenames).not.toContain("Top Shelf Image Wide.imageset");
  });
});

describe("generateBrandAssets — disabled App Icon Small", () => {
  it("omits App Icon.imagestack when appIconSmall disabled", async () => {
    const config = await makeConfig({
      brandAssets: {
        appIconSmall: { enabled: false },
      },
    });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, `${config.brandAssets.name}.brandassets`);

    // Small icon should NOT exist
    expect(existsSync(join(brandDir, "App Icon.imagestack"))).toBe(false);

    // Large icon should still be generated
    expect(existsSync(join(brandDir, "App Icon - App Store.imagestack"))).toBe(true);
  });
});

describe("generateSplashLogoImageSet — disabled", () => {
  it("creates no directory when logo disabled", async () => {
    const config = await makeConfig({
      splashScreen: { logo: { enabled: false } },
    });

    const parentDir = config.output.directory;
    mkdirSync(parentDir, { recursive: true });
    await generateSplashLogoImageSet(parentDir, config.splashScreen.logo, config);

    expect(existsSync(join(parentDir, `${config.splashScreen.logo.name}.imageset`))).toBe(false);
  });
});

describe("generateColorSet — disabled", () => {
  it("creates no directory when background disabled", async () => {
    const config = await makeConfig({
      splashScreen: { background: { enabled: false } },
    });

    const parentDir = config.output.directory;
    mkdirSync(parentDir, { recursive: true });
    generateColorSet(parentDir, config.splashScreen.background, config);

    expect(
      existsSync(join(parentDir, `${config.splashScreen.background.name}.colorset`)),
    ).toBe(false);
  });
});
