jest.setTimeout(120000);

import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import { APP_STORE_ASSETS as ALL_ASSETS, generateAppStoreAssets } from "../../src/generators/app-store";
import type { Rect } from "../../src/utils/image-processing";

// The placements with an art safe area: the ones the icon composition draws.
const APP_STORE_ASSETS = ALL_ASSETS.filter((a): a is typeof a & { safeArea: Rect } => Boolean(a.safeArea));
import { contentBox } from "../../src/utils/image-processing";
import { createTestBackground, createTestPng } from "../fixtures/create-fixtures";
import { ROW_SVG } from "../fixtures/row-artwork";

const TMP = join(__dirname, "../../.test-tmp-app-store");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

/** A white square filling the middle half of a transparent 1280 canvas, so the mark has measurable bounds. */
async function createMarkIcon(): Promise<string> {
  const square = await sharp({
    create: { width: 640, height: 640, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const buffer = await sharp({
    create: { width: 1280, height: 1280, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: square, gravity: "center" }])
    .png()
    .toBuffer();
  const path = join(TMP, "mark.png");
  writeFileSync(path, buffer);
  return path;
}

async function createBlackBackground(name = "black.png"): Promise<string> {
  const path = join(TMP, name);
  const buffer = await sharp({
    create: { width: 4640, height: 1440, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  writeFileSync(path, buffer);
  return path;
}

/** Bounding box of near-white pixels. */
async function brightBounds(path: string): Promise<{ left: number; top: number; right: number; bottom: number }> {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels] < 200) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return { left, top, right, bottom };
}

async function enabledConfig(extra: Record<string, unknown> = {}) {
  const icon = await createMarkIcon();
  const background = await createBlackBackground();
  return resolveConfig({
    icon,
    background,
    color: "#000000",
    output: join(TMP, "out"),
    overrides: { appStore: { enabled: true, ...extra } },
  });
}

describe("generateAppStoreAssets", () => {
  it("writes every creative asset at its exact canvas, opaque", async () => {
    const config = await enabledConfig();
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);

    for (const asset of APP_STORE_ASSETS) {
      const meta = await sharp(join(dir, asset.filename)).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(asset.width);
      expect(meta.height).toBe(asset.height);
      expect(meta.hasAlpha).toBe(false);
    }
  });

  it("centres the mark inside each art safe area at iconScale of its shorter side", async () => {
    const config = await enabledConfig();
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config, undefined, await contentBox(config.inputs.iconImage));

    for (const asset of APP_STORE_ASSETS) {
      const { x, y, width, height } = asset.safeArea;
      const bounds = await brightBounds(join(dir, asset.filename));
      expect(bounds.left).toBeGreaterThanOrEqual(x);
      expect(bounds.top).toBeGreaterThanOrEqual(y);
      expect(bounds.right).toBeLessThan(x + width);
      expect(bounds.bottom).toBeLessThan(y + height);

      const expected = Math.round(Math.min(width, height) * 0.8);
      expect(Math.abs(bounds.right - bounds.left + 1 - expected)).toBeLessThanOrEqual(2);
      expect(Math.abs((bounds.left + bounds.right) / 2 - (x + width / 2))).toBeLessThanOrEqual(2);
      expect(Math.abs((bounds.top + bounds.bottom) / 2 - (y + height / 2))).toBeLessThanOrEqual(2);
    }
  });

  it("draws on appStore.backgroundImage when one is set", async () => {
    const backdrop = join(TMP, "backdrop.png");
    await createTestPng(backdrop, 4000, 4000);
    const config = await enabledConfig({ backgroundImage: backdrop });
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);

    const { data } = await sharp(join(dir, "header.png"))
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data]).toEqual([100, 150, 200]);
  });

  it("contain-fits a non-square centre image inside the scaled safe area", async () => {
    const wordmark = join(TMP, "wordmark.png");
    writeFileSync(
      wordmark,
      await sharp({ create: { width: 2000, height: 400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
        .png()
        .toBuffer(),
    );
    const config = await enabledConfig({ centerImage: wordmark });
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);

    for (const asset of APP_STORE_ASSETS) {
      const { x, y, width, height } = asset.safeArea;
      const bounds = await brightBounds(join(dir, asset.filename));
      const scale = Math.min((width * 0.8) / 2000, (height * 0.8) / 400);
      expect(Math.abs(bounds.right - bounds.left + 1 - 2000 * scale)).toBeLessThanOrEqual(2);
      expect(Math.abs(bounds.bottom - bounds.top + 1 - 400 * scale)).toBeLessThanOrEqual(2);
      expect(Math.abs((bounds.left + bounds.right) / 2 - (x + width / 2))).toBeLessThanOrEqual(2);
      expect(Math.abs((bounds.top + bounds.bottom) / 2 - (y + height / 2))).toBeLessThanOrEqual(2);
    }
  });

  it("writes the backdrop alone for a placement with center: false, and uses its own backdrop", async () => {
    const capture = join(TMP, "capture.png");
    await createTestPng(capture, 3840, 2160);
    const config = await enabledConfig({ searchResults: { center: false, backgroundImage: capture } });
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);

    const { data } = await sharp(join(dir, "search-results.png")).raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 3) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    expect([...colors]).toEqual(["100,150,200"]);
    // The header keeps the icon on the default backdrop.
    expect((await brightBounds(join(dir, "header.png"))).right).toBeGreaterThan(0);
  });

  it("writes nothing when appStore is disabled", async () => {
    const icon = await createMarkIcon();
    const background = await createTestBackground(TMP);
    const config = resolveConfig({ icon, background, color: "#000000", output: join(TMP, "out") });
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
});

describe("generateAppStoreAssets from a source", () => {
  it("renders row artwork to each enabled canvas, skips disabled ones, and leaves unchanged files alone", async () => {
    const art = join(TMP, "wall.svg");
    writeFileSync(art, ROW_SVG);
    const config = await enabledConfig({
      header: { source: art },
      searchResults: { source: art },
      universal: { source: art },
      eventCard: { enabled: false },
    });
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);

    expect(readdirSync(dir).filter((f) => f.endsWith(".png")).sort()).toEqual(["header.png", "search-results.png", "universal.png"]);
    for (const [file, width, height] of [["header.png", 3840, 1646], ["search-results.png", 3840, 2560], ["universal.png", 5244, 2950]] as const) {
      const meta = await sharp(join(dir, file)).metadata();
      expect([meta.width, meta.height, meta.hasAlpha]).toEqual([width, height, false]);
    }
    // The fixed red mark lands on each placement's safe-area centre (universal's sits 334 px above
    // its canvas centre).
    for (const [file, cx, cy] of [["header.png", 1920, 823], ["search-results.png", 1920, 1280], ["universal.png", 2622, 1141]] as const) {
      const { data } = await sharp(join(dir, file)).extract({ left: cx, top: cy, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
      expect(data[0]).toBeGreaterThan(180);
      expect(data[1]).toBeLessThan(80);
    }

    const before = statSync(join(dir, "header.png")).mtimeMs;
    await generateAppStoreAssets(dir, config);
    expect(statSync(join(dir, "header.png")).mtimeMs).toBe(before);

    writeFileSync(art, ROW_SVG.replace("#FFC312", "#FFD54F"));
    await generateAppStoreAssets(dir, config);
    expect(statSync(join(dir, "header.png")).mtimeMs).toBeGreaterThan(before);
  });
});

describe("appStore config", () => {
  it("is off by default with a 0.8 scale", async () => {
    const icon = await createMarkIcon();
    const background = await createBlackBackground();
    const config = resolveConfig({ icon, background, color: "#000000" });
    expect(config.appStore).toEqual({
      enabled: false,
      iconScale: 0.8,
      backgroundImage: undefined,
      centerImage: undefined,
      header: { enabled: true, center: true, backgroundImage: undefined, centerImage: undefined, video: undefined, source: undefined },
      searchResults: { enabled: true, center: true, backgroundImage: undefined, centerImage: undefined, video: undefined, source: undefined },
      universal: { enabled: true, center: true, backgroundImage: undefined, centerImage: undefined, video: undefined, source: undefined },
      eventCard: { enabled: false, center: true, backgroundImage: undefined, centerImage: undefined, video: undefined, source: undefined },
      eventDetails: { enabled: false, center: true, backgroundImage: undefined, centerImage: undefined, video: undefined, source: undefined },
      video: { fps: 30, codec: "h264" },
    });
  });

  it("needs a source for In-App Event media, and 15 to 30 s for their video", async () => {
    await expect(enabledConfig({ eventCard: { enabled: true } })).rejects.toThrow(/appStore\.eventCard needs a source/);
    const art = join(TMP, "wall.svg");
    writeFileSync(art, ROW_SVG);
    await expect(enabledConfig({ eventDetails: { enabled: true, source: art, animate: { rows: 10 } } })).rejects.toThrow(/Use 15 to 30 seconds/);
    await expect(enabledConfig({ eventCard: { enabled: true, source: art, animate: { rows: 15 } } })).resolves.toBeDefined();
  });

  it("draws In-App Event media from row artwork at 16:9 and 9:16", async () => {
    const art = join(TMP, "wall.svg");
    writeFileSync(art, ROW_SVG);
    const config = await enabledConfig({
      header: { enabled: false },
      searchResults: { enabled: false },
      universal: { enabled: false },
      eventCard: { enabled: true, source: art },
      eventDetails: { enabled: true, source: art },
    });
    const dir = join(TMP, "AppStore");
    await generateAppStoreAssets(dir, config);
    const sizes = await Promise.all(
      ["event-card.png", "event-details.png"].map(async (f) => {
        const m = await sharp(join(dir, f)).metadata();
        return [f, m.width, m.height, m.hasAlpha];
      }),
    );
    expect(sizes).toEqual([["event-card.png", 3840, 2160, false], ["event-details.png", 2160, 3840, false]]);
  });

  it("rejects a video fps or codec App Store Connect would not take", async () => {
    await expect(enabledConfig({ video: { fps: 24 } })).rejects.toThrow(/appStore\.video\.fps/);
    await expect(enabledConfig({ video: { codec: "vp9" } })).rejects.toThrow(/appStore\.video\.codec/);
  });

  it("validates per-placement art paths", async () => {
    await expect(enabledConfig({ header: { centerImage: join(TMP, "nope.png") } })).rejects.toThrow(
      /appStore\.header\.centerImage not found/,
    );
  });

  it("rejects an iconScale outside (0, 1]", async () => {
    await expect(enabledConfig({ iconScale: 1.5 })).rejects.toThrow(/appStore\.iconScale/);
  });

  it("rejects a missing backgroundImage", async () => {
    await expect(enabledConfig({ backgroundImage: join(TMP, "nope.png") })).rejects.toThrow(
      /appStore\.backgroundImage not found/,
    );
  });
});
