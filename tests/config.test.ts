import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveConfig, validateInputImages } from "../src/config";
import {
  createTestIcon,
  createTestBackground,
  createTestPng,
  createSmallIcon,
  createSmallBackground,
  createSymlink,
  createTextFile,
  createBadJsonConfig,
  createValidConfig,
} from "./fixtures/create-fixtures";

const TMP = join(__dirname, "../.test-tmp-config");

beforeEach(async () => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

// Helper to create the standard icon + bg pair
async function createStandardInputs() {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  return { icon, bg };
}

describe("resolveConfig", () => {
  // --- Happy paths ---

  it("resolves config with valid CLI args", async () => {
    const { icon, bg } = await createStandardInputs();
    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
    });
    expect(config.inputs.iconImage).toBe(resolve(icon));
    expect(config.inputs.backgroundImage).toBe(resolve(bg));
    expect(config.inputs.backgroundColor).toBe("#FF0000");
  });

  it("resolves output to absolute path", async () => {
    const { icon, bg } = await createStandardInputs();
    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
      output: "./test-output/Images.xcassets",
    });
    expect(config.output.directory).toBe(resolve("./test-output/Images.xcassets"));
  });

  it("uses default output directory when --output not specified", async () => {
    const { icon, bg } = await createStandardInputs();
    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
    });
    expect(config.output.directory).toMatch(/Images\.xcassets$/);
  });

  it("loads config from JSON file", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = createValidConfig(TMP, icon, bg);
    const config = resolveConfig({ config: configPath });
    expect(config.inputs.backgroundColor).toBe("#FF0000");
  });

  it("CLI args override config file values", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = createValidConfig(TMP, icon, bg);
    const config = resolveConfig({
      config: configPath,
      color: "#00FF00",
    });
    expect(config.inputs.backgroundColor).toBe("#00FF00");
  });

  it("sets default brand assets config", async () => {
    const { icon, bg } = await createStandardInputs();
    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
    });
    expect(config.brandAssets.appIconSmall.enabled).toBe(true);
    expect(config.brandAssets.appIconSmall.size).toEqual({ width: 400, height: 240 });
    expect(config.brandAssets.appIconLarge.name).toBe("App Icon - App Store");
    expect(config.splashScreen.logo.enabled).toBe(true);
  });

  // --- Missing required inputs ---

  it("throws when icon is missing", () => {
    expect(() =>
      resolveConfig({ background: "/tmp/fake.png", color: "#FF0000" }),
    ).toThrow(/Icon image is required/);
  });

  it("throws when background is missing", async () => {
    const icon = await createTestIcon(TMP);
    expect(() =>
      resolveConfig({ icon, color: "#FF0000" }),
    ).toThrow(/Background image is required/);
  });

  it("throws when color is missing", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({ icon, background: bg }),
    ).toThrow(/Background color is required/);
  });

  // --- Whitespace-only inputs (Phase 3 fix) ---

  it("rejects whitespace-only icon path", () => {
    expect(() =>
      resolveConfig({ icon: "   ", background: "/tmp/bg.png", color: "#FF0000" }),
    ).toThrow(/Icon image is required/);
  });

  it("rejects whitespace-only background path", async () => {
    const icon = await createTestIcon(TMP);
    expect(() =>
      resolveConfig({ icon, background: "   ", color: "#FF0000" }),
    ).toThrow(/Background image is required/);
  });

  it("rejects whitespace-only color", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({ icon, background: bg, color: "   " }),
    ).toThrow(/Background color is required/);
  });

  // --- Invalid color format ---

  it("rejects color without hash prefix", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({ icon, background: bg, color: "FF0000" }),
    ).toThrow(/Invalid color format/);
  });

  it("rejects 3-digit hex color", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({ icon, background: bg, color: "#F00" }),
    ).toThrow(/Invalid color format/);
  });

  // --- File not found ---

  it("throws when icon file does not exist", () => {
    expect(() =>
      resolveConfig({
        icon: "/tmp/nonexistent-icon.png",
        background: "/tmp/nonexistent-bg.png",
        color: "#FF0000",
      }),
    ).toThrow(/Icon image not found/);
  });

  it("throws when background file does not exist", async () => {
    const icon = await createTestIcon(TMP);
    expect(() =>
      resolveConfig({
        icon,
        background: "/tmp/nonexistent-bg.png",
        color: "#FF0000",
      }),
    ).toThrow(/Background image not found/);
  });

  // --- Config file errors ---

  it("throws when config file does not exist", () => {
    expect(() =>
      resolveConfig({ config: "/tmp/nonexistent-config.json" }),
    ).toThrow(/Config file not found/);
  });

  it("throws on malformed JSON config file", () => {
    const configPath = createBadJsonConfig(TMP);
    expect(() => resolveConfig({ config: configPath })).toThrow(/Invalid JSON/);
  });

  // --- Symlink detection (Phase 3 fix) ---

  it("rejects symlinked icon file", async () => {
    const { icon, bg } = await createStandardInputs();
    const symlinkPath = join(TMP, "icon-link.png");
    createSymlink(icon, symlinkPath);
    expect(() =>
      resolveConfig({ icon: symlinkPath, background: bg, color: "#FF0000" }),
    ).toThrow(/must not be a symbolic link/);
  });

  it("rejects symlinked background file", async () => {
    const { icon, bg } = await createStandardInputs();
    const symlinkPath = join(TMP, "bg-link.png");
    createSymlink(bg, symlinkPath);
    expect(() =>
      resolveConfig({ icon, background: symlinkPath, color: "#FF0000" }),
    ).toThrow(/must not be a symbolic link/);
  });

  // --- PNG extension validation (Phase 3 fix) ---

  it("rejects non-PNG icon file", async () => {
    const bg = await createTestBackground(TMP);
    const txtFile = createTextFile(TMP);
    expect(() =>
      resolveConfig({ icon: txtFile, background: bg, color: "#FF0000" }),
    ).toThrow(/must be a PNG file/);
  });

  it("rejects non-PNG background file", async () => {
    const icon = await createTestIcon(TMP);
    const txtFile = createTextFile(TMP);
    expect(() =>
      resolveConfig({ icon, background: txtFile, color: "#FF0000" }),
    ).toThrow(/must be a PNG file/);
  });

  // --- Prototype pollution guard (Phase 3 fix) ---

  it("ignores __proto__ keys in config file", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "proto-config.json");
    const malicious = {
      __proto__: { polluted: true },
      inputs: {
        iconImage: icon,
        backgroundImage: bg,
        backgroundColor: "#FF0000",
      },
    };
    writeFileSync(configPath, JSON.stringify(malicious));
    const config = resolveConfig({ config: configPath });
    // Should not have the polluted key on any object
    expect((config as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe("validateInputImages", () => {
  it("accepts valid-sized images with no warnings", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon, background: bg, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.warnings).toHaveLength(0);
  });

  it("throws on undersized icon", async () => {
    const icon = await createSmallIcon(TMP);
    // Need a valid background to get past resolveConfig
    const bg = await createTestBackground(TMP);
    // resolveConfig will pass since the file exists and is PNG
    const config = resolveConfig({ icon, background: bg, color: "#FF0000" });
    await expect(validateInputImages(config)).rejects.toThrow(/too small/);
  });

  it("throws on undersized background", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createSmallBackground(TMP);
    const config = resolveConfig({ icon, background: bg, color: "#FF0000" });
    await expect(validateInputImages(config)).rejects.toThrow(/too small/);
  });

  it("warns when icon is below recommended size", async () => {
    // Create 1024x1024 icon (minimum but below 1280 recommended)
    const iconPath = join(TMP, "ok-icon.png");
    await createTestPng(iconPath, 1024, 1024, { transparent: true });
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon: iconPath, background: bg, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("below recommended"))).toBe(true);
  });

  it("warns when background is below recommended size", async () => {
    const icon = await createTestIcon(TMP);
    // 2320x720 is minimum, but below 4640x1440 recommended
    const bgPath = join(TMP, "min-bg.png");
    await createTestPng(bgPath, 2320, 720);
    const config = resolveConfig({ icon, background: bgPath, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("below recommended"))).toBe(true);
  });
});
