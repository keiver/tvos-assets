import sharp from "sharp";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  resizeImage,
  resizeImageOpaque,
  compositeIconOnBackground,
  renderIconOnTransparent,
  renderIconOnTransparentCanvas,
  scaleMultiplier,
  validateOutputDimensions,
} from "../../src/utils/image-processing";
import { createTestPng } from "../fixtures/create-fixtures";

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
    // Just verify it doesn't throw — the actual scale is visual
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

describe("renderIconOnTransparent", () => {
  it("renders at the correct square size", async () => {
    const icon = await makeIcon();
    const buffer = await renderIconOnTransparent(icon, 200);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });

  it("preserves transparency (4 channels)", async () => {
    const icon = await makeIcon();
    const buffer = await renderIconOnTransparent(icon, 200);
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(4);
  });

  it("throws with context on invalid input", async () => {
    const badPath = join(TMP, "nonexistent.png");
    await expect(renderIconOnTransparent(badPath, 200)).rejects.toThrow(
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
