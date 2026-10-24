jest.setTimeout(120000);

import type { Browser } from "playwright-core";
import { openSceneBrowser, sceneFrames } from "../../src/utils/scene-browser";

// A white disc on black whose opacity runs 0, 1, 0 over 4 s.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#000"/><circle cx="100" cy="50" r="30" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="4s" repeatCount="indefinite"/></circle></svg>`;

let browser: Browser;

beforeAll(async () => {
  browser = await openSceneBrowser();
});

afterAll(async () => {
  await browser?.close();
});

const px = (rgb: Buffer, width: number, x: number, y: number): number => rgb[(y * width + x) * 3];

describe("sceneFrames", () => {
  it("seeks the SMIL to each frame's time and gives the same pixels for the same time", async () => {
    const frames = await sceneFrames(browser, SVG, 200, 100, 2);
    try {
      const [t0, t1, t2, again] = await Promise.all([frames.frame(0), frames.frame(1), frames.frame(2), frames.frame(2)]);
      expect(t0).toHaveLength(200 * 100 * 3);
      expect(px(t0, 200, 100, 50)).toBeLessThan(8);
      expect(px(t1, 200, 100, 50)).toBeGreaterThan(100);
      expect(px(t1, 200, 100, 50)).toBeLessThan(160);
      expect(px(t2, 200, 100, 50)).toBeGreaterThan(247);
      expect(again.equals(t2)).toBe(true);
      expect(px(t2, 200, 10, 10)).toBe(0);
    } finally {
      await frames.close();
    }
  });

  it("cover-fits the scene to a canvas of another shape", async () => {
    const frames = await sceneFrames(browser, SVG, 100, 100, 1);
    try {
      const t2 = await frames.frame(2);
      expect(t2).toHaveLength(100 * 100 * 3);
      expect(px(t2, 100, 50, 50)).toBeGreaterThan(247);
      expect(px(t2, 100, 5, 5)).toBe(0);
      expect(px(t2, 100, 95, 95)).toBe(0);
    } finally {
      await frames.close();
    }
  });
});

describe("openSceneBrowser", () => {
  it("names CHROME_PATH when the browser there cannot start", async () => {
    const before = process.env.CHROME_PATH;
    process.env.CHROME_PATH = "/nonexistent/chrome";
    try {
      await expect(openSceneBrowser()).rejects.toThrow(/Google Chrome not found at "\/nonexistent\/chrome".*CHROME_PATH/);
    } finally {
      if (before === undefined) delete process.env.CHROME_PATH;
      else process.env.CHROME_PATH = before;
    }
  });
});
