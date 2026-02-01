import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import { generateColorSet } from "../../src/generators/colorset";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-colorset");

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
    const { writeFileSync } = await import("node:fs");
    const configPath = join(TMP, "test-config.json");
    const configData = {
      inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
      output: { directory: outputDir },
      ...overrides,
    };
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(configData));
    return resolveConfig({ config: configPath });
  }

  return resolveConfig({ icon, background: bg, color: "#FF0000", output: outputDir });
}

describe("generateColorSet", () => {
  it("creates .colorset directory with Contents.json", async () => {
    const config = await makeConfig();
    const parentDir = join(TMP, "colorset-out");
    mkdirSync(parentDir, { recursive: true });

    generateColorSet(parentDir, config.splashScreen.background, config);

    const colorsetDir = join(parentDir, "SplashScreenBackground.colorset");
    expect(existsSync(colorsetDir)).toBe(true);
    expect(existsSync(join(colorsetDir, "Contents.json"))).toBe(true);
  });

  it("Contents.json has 4 color entries", async () => {
    const config = await makeConfig();
    const parentDir = join(TMP, "colorset-entries");
    mkdirSync(parentDir, { recursive: true });

    generateColorSet(parentDir, config.splashScreen.background, config);

    const colorsetDir = join(parentDir, "SplashScreenBackground.colorset");
    const contents = parseContentsJson(join(colorsetDir, "Contents.json")) as {
      colors: { idiom: string; appearances?: unknown[] }[];
    };

    expect(contents.colors).toHaveLength(4);
    // universal light (no appearances), universal dark, tv light, tv dark
    const universalEntries = contents.colors.filter((c) => c.idiom === "universal");
    const tvEntries = contents.colors.filter((c) => c.idiom === "tv");
    expect(universalEntries).toHaveLength(2);
    expect(tvEntries).toHaveLength(2);
  });

  it("uses correct color-space and component format", async () => {
    const config = await makeConfig();
    const parentDir = join(TMP, "colorset-format");
    mkdirSync(parentDir, { recursive: true });

    generateColorSet(parentDir, config.splashScreen.background, config);

    const colorsetDir = join(parentDir, "SplashScreenBackground.colorset");
    const contents = parseContentsJson(join(colorsetDir, "Contents.json")) as {
      colors: { color: { "color-space": string; components: Record<string, string> } }[];
    };

    const firstColor = contents.colors[0].color;
    expect(firstColor["color-space"]).toBe("srgb");
    // Components should be decimal strings (e.g. "1.000")
    expect(firstColor.components.red).toMatch(/^\d+\.\d{3}$/);
    expect(firstColor.components.alpha).toBe("1.000");
  });

  it("uses per-variant color overrides from config", async () => {
    const config = await makeConfig({
      splashScreen: {
        background: {
          enabled: true,
          universal: { light: "#00FF00", dark: "#008000" },
          tv: { light: "#0000FF", dark: "#000080" },
        },
      },
    });
    const parentDir = join(TMP, "colorset-overrides");
    mkdirSync(parentDir, { recursive: true });

    generateColorSet(parentDir, config.splashScreen.background, config);

    const colorsetDir = join(parentDir, "SplashScreenBackground.colorset");
    const contents = parseContentsJson(join(colorsetDir, "Contents.json")) as {
      colors: { color: { components: Record<string, string> }; idiom: string; appearances?: { value: string }[] }[];
    };

    // Universal light should be green (#00FF00): red=0, green=1
    const universalLight = contents.colors.find(
      (c) => c.idiom === "universal" && !c.appearances,
    );
    expect(universalLight?.color.components.red).toBe("0.000");
    expect(universalLight?.color.components.green).toBe("1.000");

    // TV light should be blue (#0000FF)
    const tvLight = contents.colors.find(
      (c) => c.idiom === "tv" && !c.appearances,
    );
    expect(tvLight?.color.components.blue).toBe("1.000");
    expect(tvLight?.color.components.red).toBe("0.000");
  });

  it("does nothing when disabled", async () => {
    const config = await makeConfig({
      splashScreen: { background: { enabled: false } },
    });
    const parentDir = join(TMP, "colorset-disabled");
    mkdirSync(parentDir, { recursive: true });

    generateColorSet(parentDir, config.splashScreen.background, config);

    expect(existsSync(join(parentDir, "SplashScreenBackground.colorset"))).toBe(false);
  });
});
