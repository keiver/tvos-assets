import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import sharp from "sharp";
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
    // Default is ~/Desktop (or ~ if Desktop doesn't exist)
    const home = homedir();
    const desktop = join(home, "Desktop");
    const expectedDir = existsSync(desktop) ? desktop : home;
    expect(config.output.directory).toBe(expectedDir);
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
    expect(config.brandAssets.name).toBe("AppIcon");
    expect(config.brandAssets.appIconSmall.enabled).toBe(true);
    expect(config.brandAssets.appIconSmall.size).toEqual({ width: 400, height: 240 });
    expect(config.brandAssets.appIconLarge.name).toBe("App Icon - App Store");
    expect(config.splashScreen.logo.enabled).toBe(true);
  });

  // --- Icon border radius ---

  it("defaults iconBorderRadius to 0", async () => {
    const { icon, bg } = await createStandardInputs();
    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
    });
    expect(config.inputs.iconBorderRadius).toBe(0);
  });

  it("accepts iconBorderRadius from CLI", async () => {
    const { icon, bg } = await createStandardInputs();
    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
      iconBorderRadius: "50",
    });
    expect(config.inputs.iconBorderRadius).toBe(50);
  });

  it("accepts iconBorderRadius from config file", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "border-radius.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: {
          iconImage: icon,
          backgroundImage: bg,
          backgroundColor: "#FF0000",
          iconBorderRadius: 100,
        },
      }),
    );
    const config = resolveConfig({ config: configPath });
    expect(config.inputs.iconBorderRadius).toBe(100);
  });

  it("CLI iconBorderRadius overrides config file value", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "border-radius-override.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: {
          iconImage: icon,
          backgroundImage: bg,
          backgroundColor: "#FF0000",
          iconBorderRadius: 100,
        },
      }),
    );
    const config = resolveConfig({ config: configPath, iconBorderRadius: "200" });
    expect(config.inputs.iconBorderRadius).toBe(200);
  });

  it("rejects negative iconBorderRadius", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({
        icon,
        background: bg,
        color: "#FF0000",
        iconBorderRadius: "-10",
      }),
    ).toThrow(/Invalid icon border radius/);
  });

  it("rejects non-integer iconBorderRadius", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({
        icon,
        background: bg,
        color: "#FF0000",
        iconBorderRadius: "12.5",
      }),
    ).toThrow(/Invalid icon border radius/);
  });

  it("rejects non-numeric iconBorderRadius", async () => {
    const { icon, bg } = await createStandardInputs();
    expect(() =>
      resolveConfig({
        icon,
        background: bg,
        color: "#FF0000",
        iconBorderRadius: "abc",
      }),
    ).toThrow(/Invalid icon border radius/);
  });

  it("allows overriding brandAssets.name via config file", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "custom-name.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        brandAssets: { name: "CustomIcon" },
      }),
    );
    const config = resolveConfig({ config: configPath });
    expect(config.brandAssets.name).toBe("CustomIcon");
  });

  it("preserves brandAssets.name through deep merge when other fields are overridden", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "merge-name.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        brandAssets: {
          name: "MyAppIcon",
          appIconSmall: { enabled: false },
        },
      }),
    );
    const config = resolveConfig({ config: configPath });
    expect(config.brandAssets.name).toBe("MyAppIcon");
    expect(config.brandAssets.appIconSmall.enabled).toBe(false);
    // Other defaults should still be intact
    expect(config.brandAssets.appIconLarge.enabled).toBe(true);
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

  // --- Asset name validation ---

  it("rejects asset names with path traversal", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "traversal-name.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        brandAssets: { name: "../../etc" },
      }),
    );
    expect(() => resolveConfig({ config: configPath })).toThrow(/Invalid.*name/);
  });

  it("rejects asset names with slashes", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "slash-name.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        brandAssets: { name: "foo/bar" },
      }),
    );
    expect(() => resolveConfig({ config: configPath })).toThrow(/Invalid.*name/);
  });

  it("accepts valid asset names", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "good-name.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        brandAssets: { name: "My Custom Icon-2" },
      }),
    );
    const config = resolveConfig({ config: configPath });
    expect(config.brandAssets.name).toBe("My Custom Icon-2");
  });

  // --- Config file size limit ---

  it("rejects oversized config file", async () => {
    const configPath = join(TMP, "big-config.json");
    // Write a >1MB JSON file
    const bigContent = JSON.stringify({ data: "x".repeat(1024 * 1024 + 100) });
    writeFileSync(configPath, bigContent);
    expect(() => resolveConfig({ config: configPath })).toThrow(/too large/);
  });

  // --- Deep merge depth limit ---

  it("handles deep config nesting that matches defaults structure", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "deep-config.json");
    // Deep nesting that matches the default structure (depth ~4)
    // The depth guard protects against pathological cases where both
    // source and target have matching nested objects beyond 10 levels
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        brandAssets: {
          appIconSmall: {
            layers: {
              front: { source: "icon" },
            },
          },
        },
      }),
    );
    const config = resolveConfig({ config: configPath });
    expect(config.brandAssets.appIconSmall.layers.front.source).toBe("icon");
  });

  // --- Splash screen color validation ---

  it("rejects invalid splash background color in config file", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "bad-splash-color.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        splashScreen: {
          background: {
            enabled: true,
            universal: { light: "not-a-color", dark: "#FF0000" },
            tv: { light: "#FF0000", dark: "#FF0000" },
          },
        },
      }),
    );
    expect(() => resolveConfig({ config: configPath })).toThrow(/Invalid color in splashScreen\.background\.universal\.light/);
  });

  it("rejects invalid splash tv dark color in config file", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "bad-tv-dark.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        splashScreen: {
          background: {
            enabled: true,
            universal: { light: "#FF0000", dark: "#FF0000" },
            tv: { light: "#FF0000", dark: "invalid" },
          },
        },
      }),
    );
    expect(() => resolveConfig({ config: configPath })).toThrow(/Invalid color in splashScreen\.background\.tv\.dark/);
  });

  it("skips splash color validation when splash background is disabled", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "disabled-splash.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#FF0000" },
        splashScreen: {
          background: {
            enabled: false,
          },
        },
      }),
    );
    // Should not throw even though the default colors were overridden
    const config = resolveConfig({ config: configPath });
    expect(config.splashScreen.background.enabled).toBe(false);
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

  it("filters constructor keys during JSON.parse", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "constructor-config.json");
    // Manually write JSON with "constructor" key
    writeFileSync(
      configPath,
      `{"constructor":{"polluted":true},"inputs":{"iconImage":"${icon.replace(/\\/g, "\\\\")}","backgroundImage":"${bg.replace(/\\/g, "\\\\")}","backgroundColor":"#FF0000"}}`,
    );
    const config = resolveConfig({ config: configPath });
    expect((config as any).constructor?.polluted).toBeUndefined();
  });

  it("filters prototype keys during JSON.parse", async () => {
    const { icon, bg } = await createStandardInputs();
    const configPath = join(TMP, "prototype-config.json");
    writeFileSync(
      configPath,
      `{"prototype":{"polluted":true},"inputs":{"iconImage":"${icon.replace(/\\/g, "\\\\")}","backgroundImage":"${bg.replace(/\\/g, "\\\\")}","backgroundColor":"#FF0000"}}`,
    );
    const config = resolveConfig({ config: configPath });
    expect((config as any).prototype?.polluted).toBeUndefined();
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

  it("returns iconSourceSize as shortest icon dimension", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon, background: bg, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.iconSourceSize).toBeGreaterThanOrEqual(1280);
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

  it("warns when icon is not square", async () => {
    // Create a non-square icon (1280x1400)
    const iconPath = join(TMP, "nonsquare-icon.png");
    await createTestPng(iconPath, 1280, 1400, { transparent: true });
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon: iconPath, background: bg, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("not square"))).toBe(true);
  });

  it("warns when iconBorderRadius exceeds half the icon size", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon, background: bg, color: "#FF0000", iconBorderRadius: "700" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("iconBorderRadius"))).toBe(true);
  });

  it("does not warn when iconBorderRadius is within bounds", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon, background: bg, color: "#FF0000", iconBorderRadius: "100" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("iconBorderRadius"))).toBe(false);
  });

  it("rejects non-PNG icon (JPEG renamed to .png)", async () => {
    const bg = await createTestBackground(TMP);
    // Create a JPEG buffer and write it with .png extension
    const jpegBuffer = await sharp({
      create: { width: 1280, height: 1280, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    const fakeIconPath = join(TMP, "fake-icon.png");
    writeFileSync(fakeIconPath, jpegBuffer);
    const config = resolveConfig({ icon: fakeIconPath, background: bg, color: "#FF0000" });
    await expect(validateInputImages(config)).rejects.toThrow(/not a valid PNG/);
  });

  it("rejects non-PNG background (JPEG renamed to .png)", async () => {
    const icon = await createTestIcon(TMP);
    // Create a JPEG buffer and write it with .png extension
    const jpegBuffer = await sharp({
      create: { width: 4640, height: 1440, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    const fakeBgPath = join(TMP, "fake-bg.png");
    writeFileSync(fakeBgPath, jpegBuffer);
    const config = resolveConfig({ icon, background: fakeBgPath, color: "#FF0000" });
    await expect(validateInputImages(config)).rejects.toThrow(/not a valid PNG/);
  });
});
