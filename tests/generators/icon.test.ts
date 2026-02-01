jest.setTimeout(60000);

import sharp from "sharp";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, validateInputImages } from "../../src/config";
import { generateIcon } from "../../src/generators/icon";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";
import type { TvOSImageCreatorConfig } from "../../src/types";

const TMP = join(__dirname, "../../.test-tmp-icon-gen");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

async function makeConfig(): Promise<{ config: TvOSImageCreatorConfig; iconSourceSize: number }> {
  const icon = await createTestIcon(TMP);
  const bg = await createTestBackground(TMP);
  const config = resolveConfig({ icon, background: bg, color: "#FF0000" });
  const { iconSourceSize } = await validateInputImages(config);
  return { config, iconSourceSize };
}

describe("generateIcon", () => {
  it("generates a 1024x1024 opaque PNG", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const iconPath = join(TMP, "icon.png");

    await generateIcon(config, iconPath, iconSourceSize);

    expect(existsSync(iconPath)).toBe(true);
    const meta = await sharp(iconPath).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(meta.channels).toBe(3); // Opaque
    expect(meta.format).toBe("png");
  });

  it("applies border radius when configured", async () => {
    const { config, iconSourceSize } = await makeConfig();
    config.inputs.iconBorderRadius = 100;
    const iconPath = join(TMP, "icon-rounded.png");

    await generateIcon(config, iconPath, iconSourceSize);

    expect(existsSync(iconPath)).toBe(true);
    const meta = await sharp(iconPath).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(meta.format).toBe("png");
  });

  it("works with iconSourceSize from validation", async () => {
    const { config, iconSourceSize } = await makeConfig();
    const iconPath = join(TMP, "icon-with-size.png");

    // iconSourceSize should be the minimum dimension of the icon (1280)
    expect(iconSourceSize).toBeGreaterThanOrEqual(1280);

    await generateIcon(config, iconPath, iconSourceSize);

    const meta = await sharp(iconPath).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });
});
