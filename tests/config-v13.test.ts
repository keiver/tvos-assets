jest.setTimeout(60000);

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, validateInputImages } from "../src/config";
import {
  createTestIcon,
  createTestBackground,
  createTestSvgIcon,
  createTestPng,
} from "./fixtures/create-fixtures";

const TMP = join(__dirname, "../.test-tmp-config-v13");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

describe("resolveConfig — v1.3 additions", () => {
  it("defaults to zip output mode with iosIcon enabled", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon, background: bg, color: "#FF0000" });
    expect(config.output.mode).toBe("zip");
    expect(config.iosIcon).toEqual({ enabled: true, name: "AppIcon" });
  });

  it("--out-dir switches to dir mode and sets the directory", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const outDir = join(TMP, "direct-out");
    const config = resolveConfig({ icon, background: bg, color: "#FF0000", outDir });
    expect(config.output.mode).toBe("dir");
    expect(config.output.directory).toBe(outDir);
  });

  it("rejects an invalid output.mode from a config file", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const configPath = join(TMP, "bad-mode.json");
    writeFileSync(configPath, JSON.stringify({ output: { mode: "tarball", directory: TMP } }));
    expect(() =>
      resolveConfig({ icon, background: bg, color: "#FF0000", config: configPath }),
    ).toThrow(/Invalid output.mode/);
  });

  it("accepts an SVG icon and skips raster minimum-size checks for it", async () => {
    const svgIcon = createTestSvgIcon(TMP);
    const bg = await createTestBackground(TMP);
    const config = resolveConfig({ icon: svgIcon, background: bg, color: "#FF0000" });
    const { iconSourceSize } = await validateInputImages(config);
    // 100x100 SVG would fail the 1024px raster minimum — vectors are exempt
    expect(iconSourceSize).toBe(100);
  });

  it("rejects a missing dark icon override", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    expect(() =>
      resolveConfig({ icon, background: bg, color: "#FF0000", iconDark: join(TMP, "nope.png") }),
    ).toThrow(/Dark icon image not found/);
  });

  it("resolves and validates per-layer imagePath entries", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const layerArt = join(TMP, "layer-front.png");
    await createTestPng(layerArt, 1024, 1024, { transparent: true });

    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
      overrides: {
        brandAssets: {
          appIconSmall: { layers: { front: { imagePath: layerArt } } },
        },
      },
    });
    expect(config.brandAssets.appIconSmall.layers.front.imagePath).toBe(layerArt);

    expect(() =>
      resolveConfig({
        icon,
        background: bg,
        color: "#FF0000",
        overrides: {
          brandAssets: {
            appIconSmall: { layers: { front: { imagePath: join(TMP, "missing.png") } } },
          },
        },
      }),
    ).toThrow(/appIconSmall.layers.front.imagePath not found/);
  });

  it("programmatic overrides beat a config file", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const configPath = join(TMP, "file-config.json");
    writeFileSync(configPath, JSON.stringify({ iosIcon: { enabled: true, name: "FileIcon" } }));

    const config = resolveConfig({
      icon,
      background: bg,
      color: "#FF0000",
      config: configPath,
      overrides: { iosIcon: { enabled: false, name: "OverrideIcon" } },
    });
    expect(config.iosIcon.name).toBe("OverrideIcon");
    expect(config.iosIcon.enabled).toBe(false);
  });
});
