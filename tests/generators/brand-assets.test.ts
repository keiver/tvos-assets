jest.setTimeout(60000);

import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import { generateBrandAssets } from "../../src/generators/brand-assets";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-brand-assets");

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

async function makeConfig(overrides?: Record<string, unknown>): Promise<TvOSImageCreatorConfig> {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  const outputDir = join(TMP, "output");

  if (overrides) {
    const configPath = join(TMP, "test-config.json");
    const configData = {
      inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
      output: { directory: outputDir },
      ...overrides,
    };
    mkdirSync(outputDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(configPath, JSON.stringify(configData));
    return resolveConfig({ config: configPath });
  }

  return resolveConfig({ icon, background: bg, color: "#FF0000", output: outputDir });
}

describe("generateBrandAssets", () => {
  it("creates the .brandassets directory and Contents.json", async () => {
    const config = await makeConfig();
    mkdirSync(config.output.directory, { recursive: true });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, "AppIcon.brandassets");
    expect(existsSync(brandDir)).toBe(true);
    expect(existsSync(join(brandDir, "Contents.json"))).toBe(true);
  });

  it("Contents.json lists all enabled assets", async () => {
    const config = await makeConfig();
    mkdirSync(config.output.directory, { recursive: true });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, "AppIcon.brandassets");
    const contents = parseContentsJson(join(brandDir, "Contents.json")) as {
      assets: { filename: string; role: string }[];
    };

    const filenames = contents.assets.map((a) => a.filename);
    expect(filenames).toContain("App Icon.imagestack");
    expect(filenames).toContain("App Icon - App Store.imagestack");
    expect(filenames).toContain("Top Shelf Image.imageset");
    expect(filenames).toContain("Top Shelf Image Wide.imageset");
  });

  it("creates imagestack directories for app icons", async () => {
    const config = await makeConfig();
    mkdirSync(config.output.directory, { recursive: true });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, "AppIcon.brandassets");
    expect(existsSync(join(brandDir, "App Icon.imagestack"))).toBe(true);
    expect(existsSync(join(brandDir, "App Icon - App Store.imagestack"))).toBe(true);
  });

  it("creates imageset directories for top shelf images", async () => {
    const config = await makeConfig();
    mkdirSync(config.output.directory, { recursive: true });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, "AppIcon.brandassets");
    expect(existsSync(join(brandDir, "Top Shelf Image.imageset"))).toBe(true);
    expect(existsSync(join(brandDir, "Top Shelf Image Wide.imageset"))).toBe(true);
  });

  it("omits disabled assets from directory and Contents.json", async () => {
    const config = await makeConfig({
      brandAssets: {
        appIconSmall: { enabled: false },
        topShelfImage: { enabled: false },
      },
    });
    mkdirSync(config.output.directory, { recursive: true });

    await generateBrandAssets(config.output.directory, config);

    const brandDir = join(config.output.directory, "AppIcon.brandassets");
    expect(existsSync(join(brandDir, "App Icon.imagestack"))).toBe(false);
    expect(existsSync(join(brandDir, "Top Shelf Image.imageset"))).toBe(false);

    const contents = parseContentsJson(join(brandDir, "Contents.json")) as {
      assets: { filename: string }[];
    };
    const filenames = contents.assets.map((a) => a.filename);
    expect(filenames).not.toContain("App Icon.imagestack");
    expect(filenames).not.toContain("Top Shelf Image.imageset");
    // Remaining enabled assets still present
    expect(filenames).toContain("App Icon - App Store.imagestack");
    expect(filenames).toContain("Top Shelf Image Wide.imageset");
  });

  it("wraps generator errors with asset context", async () => {
    const config = await makeConfig();
    mkdirSync(config.output.directory, { recursive: true });

    // Corrupt the icon path to force a generator error
    config.inputs.iconImage = "/nonexistent/icon.png";

    await expect(
      generateBrandAssets(config.output.directory, config),
    ).rejects.toThrow(/Failed generating/);
  });
});
