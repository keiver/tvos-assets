import sharp from "sharp";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  resizeImage,
  resizeImageOpaque,
  compositeIconOnBackground,
  heightAtWidth,
  renderAtSize,
  renderIconOnTransparentCanvas,
  scaleMultiplier,
  validateOutputDimensions,
  applyBorderRadius,
  centerBox,
  measureMark,
} from "../../src/utils/image-processing";
import { createTestPng, createTestSvgLayer } from "../fixtures/create-fixtures";

const TMP = join(__dirname, "../../.test-tmp-imgproc");

beforeEach(async () => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

async function makeIcon(): Promise<string> {
  const p = join(TMP, "icon.png");
  await createTestPng(p, 1024, 1024, { transparent: true });
  return p;
}

async function makeBg(): Promise<string> {
  const p = join(TMP, "bg.png");
  await createTestPng(p, 2000, 1000);
  return p;
}

describe("resizeImage", () => {
  it("resizes to exact dimensions", async () => {
    const bg = await makeBg();
    const buffer = await resizeImage(bg, 400, 240);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(240);
  });

  it("returns a PNG buffer", async () => {
    const bg = await makeBg();
    const buffer = await resizeImage(bg, 100, 100);
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe("png");
  });

  it("throws with context on invalid input", async () => {
    const badPath = join(TMP, "nonexistent.png");
    await expect(resizeImage(badPath, 100, 100)).rejects.toThrow(
      /Image processing failed/,
    );
  });
});

describe("resizeImageOpaque", () => {
  it("produces opaque output (no alpha channel)", async () => {
    const bg = await makeBg();
    const buffer = await resizeImageOpaque(bg, 400, 240);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(240);
    expect(meta.channels).toBe(3);
  });

  it("throws with context on invalid input", async () => {
    const badPath = join(TMP, "nonexistent.png");
    await expect(resizeImageOpaque(badPath, 100, 100)).rejects.toThrow(
      /Image processing failed/,
    );
  });
});

describe("compositeIconOnBackground", () => {
  it("composites at the correct dimensions", async () => {
    const icon = await makeIcon();
    const bg = await makeBg();
    const buffer = await compositeIconOnBackground(bg, icon, 1920, 720);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(720);
  });

  it("produces opaque output when opaque: true", async () => {
    const icon = await makeIcon();
    const bg = await makeBg();
    const buffer = await compositeIconOnBackground(bg, icon, 400, 400, { opaque: true });
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(3);
  });

  it("preserves alpha when opaque: false", async () => {
    const icon = await makeIcon();
    const bg = await makeBg();
    const buffer = await compositeIconOnBackground(bg, icon, 400, 400, { opaque: false });
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(4);
  });

  it("respects custom iconScale", async () => {
    const icon = await makeIcon();
    const bg = await makeBg();
    // Just verify it doesn't throw; the actual scale is visual
    const buffer = await compositeIconOnBackground(bg, icon, 400, 400, { iconScale: 0.3 });
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("throws with context on invalid input", async () => {
    const badPath = join(TMP, "nope.png");
    const bg = await makeBg();
    await expect(
      compositeIconOnBackground(bg, badPath, 100, 100),
    ).rejects.toThrow(/Image processing failed/);
  });
});

describe("heightAtWidth", () => {
  it("keeps the image's aspect ratio", async () => {
    const wide = join(TMP, "wide.png");
    await createTestPng(wide, 400, 100, { transparent: true });
    expect(await heightAtWidth(wide, 140)).toBe(35);
    expect(await heightAtWidth(await makeIcon(), 140)).toBe(140);
  });

  it("throws with context on invalid input", async () => {
    await expect(heightAtWidth(join(TMP, "nonexistent.png"), 200)).rejects.toThrow(/Image processing failed/);
  });
});

describe("renderAtSize", () => {
  it("renders at the size it is given", async () => {
    const icon = await makeIcon();
    const buffer = await renderAtSize(icon, 200, 200);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("preserves transparency (4 channels)", async () => {
    const icon = await makeIcon();
    const buffer = await renderAtSize(icon, 200, 200);
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(4);
  });

  it("throws with context on invalid input", async () => {
    const badPath = join(TMP, "nonexistent.png");
    await expect(renderAtSize(badPath, 200, 200)).rejects.toThrow(
      /Image processing failed/,
    );
  });
});

describe("renderIconOnTransparentCanvas", () => {
  it("renders at non-square dimensions", async () => {
    const icon = await makeIcon();
    const buffer = await renderIconOnTransparentCanvas(icon, 400, 240);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(240);
  });

  it("has 4 channels (alpha)", async () => {
    const icon = await makeIcon();
    const buffer = await renderIconOnTransparentCanvas(icon, 400, 240);
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(4);
  });

  it("respects custom iconScale", async () => {
    const icon = await makeIcon();
    const buffer = await renderIconOnTransparentCanvas(icon, 400, 400, { iconScale: 0.8 });
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("throws with context on invalid input", async () => {
    const badPath = join(TMP, "nonexistent.png");
    await expect(renderIconOnTransparentCanvas(badPath, 400, 240)).rejects.toThrow(
      /Image processing failed/,
    );
  });
});

describe("scaleMultiplier", () => {
  it("returns 1 for '1x'", () => {
    expect(scaleMultiplier("1x")).toBe(1);
  });

  it("returns 2 for '2x'", () => {
    expect(scaleMultiplier("2x")).toBe(2);
  });

  it("returns 3 for '3x'", () => {
    expect(scaleMultiplier("3x")).toBe(3);
  });
});

describe("applyBorderRadius", () => {
  it("returns unchanged buffer when radius <= 0", async () => {
    const input = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } },
    })
      .png()
      .toBuffer();
    const result = await applyBorderRadius(input, 100, 0);
    expect(result).toBe(input);
  });

  it("returns a buffer with rounded corners when radius > 0", async () => {
    const input = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } },
    })
      .png()
      .toBuffer();
    const result = await applyBorderRadius(input, 100, 20);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
    expect(meta.channels).toBe(4);
    // Corner pixel should be transparent after rounding
    const { data } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    const topLeftAlpha = data[3]; // alpha of pixel (0,0)
    expect(topLeftAlpha).toBe(0);
  });

  it("clamps radius to produce circular output", async () => {
    const input = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 255 } },
    })
      .png()
      .toBuffer();
    const result = await applyBorderRadius(input, 100, 9999);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });
});

describe("compositeIconOnBackground with borderRadius", () => {
  it("applies border radius when options provided", async () => {
    const icon = await makeIcon();
    const bg = await makeBg();
    const buffer = await compositeIconOnBackground(bg, icon, 400, 400, {
      borderRadius: 100,
      sourceIconSize: 1024,
    });
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe("renderAtSize with borderRadius", () => {
  it("applies border radius when options provided", async () => {
    const icon = await makeIcon();
    const buffer = await renderAtSize(icon, 200, 200, {
      borderRadius: 100,
      sourceIconSize: 1024,
    });
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
    expect(meta.channels).toBe(4);
  });
});

describe("renderIconOnTransparentCanvas with borderRadius", () => {
  it("applies border radius when options provided", async () => {
    const icon = await makeIcon();
    const buffer = await renderIconOnTransparentCanvas(icon, 400, 240, {
      borderRadius: 100,
      sourceIconSize: 1024,
    });
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(240);
    expect(meta.channels).toBe(4);
  });
});

describe("centerBox", () => {
  it("is the square at scale of the shorter side, centred in the area", () => {
    expect(centerBox({ x: 1097, y: 493, width: 1646, height: 661 }, 0.8)).toEqual({ x: 1656, y: 559, width: 529, height: 529 });
    expect(centerBox({ x: 0, y: 0, width: 1, height: 1 }, 0.1)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("measureMark", () => {
  it("takes the shorter side and the content box from the file, with no radius", async () => {
    const disc = createTestSvgLayer(TMP, "disc.svg", "#0000FF", 400);
    const mark = await measureMark(disc);
    expect(mark.path).toBe(disc);
    expect(mark.sourceSize).toBe(1024);
    expect(mark.borderRadius).toBe(0);
    expect(mark.content?.size).toBeGreaterThanOrEqual(798);
    expect(mark.content?.size).toBeLessThanOrEqual(802);
    expect(Math.abs((mark.content?.left ?? 0) - 112)).toBeLessThanOrEqual(2);
  });
});

describe("validateOutputDimensions", () => {
  it("accepts valid dimensions", () => {
    expect(() => validateOutputDimensions(1920, 1080, "test")).not.toThrow();
  });

  it("rejects dimensions exceeding max", () => {
    expect(() => validateOutputDimensions(40000, 100, "test")).toThrow(/out of range/);
  });

  it("rejects zero dimensions", () => {
    expect(() => validateOutputDimensions(0, 100, "test")).toThrow(/out of range/);
  });

  it("rejects negative dimensions", () => {
    expect(() => validateOutputDimensions(-1, 100, "test")).toThrow(/out of range/);
  });
});
