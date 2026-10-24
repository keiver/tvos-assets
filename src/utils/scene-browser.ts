import os from "node:os";
import sharp from "sharp";
import type { Browser, BrowserContext, CDPSession, Page } from "playwright-core";
import { sceneDocument } from "./svg-scene.js";

/** Pages a scene is drawn on at once; frames queue for a free one. */
const PAGES = Math.min(4, Math.max(1, os.availableParallelism?.() ?? os.cpus().length));

/**
 * Headless Google Chrome: the one installed on this machine, or the browser at `CHROME_PATH`.
 * Chrome plays the whole of SMIL and seeks it exactly, which is what makes a scene's video the
 * animation Safari and Chrome show for the same file.
 */
export async function openSceneBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const path = process.env.CHROME_PATH;
  try {
    return await chromium.launch(path ? { executablePath: path, headless: true } : { channel: "chrome", headless: true });
  } catch (err) {
    const why = (err as Error).message.split("\n")[0];
    throw new Error(`Google Chrome not found${path ? ` at "${path}"` : ""}. Install it or set CHROME_PATH to render scene artwork. (${why})`);
  }
}

export interface SceneFrames {
  /** The frame at `t` seconds as raw RGB, `width` x `height`. */
  frame(t: number): Promise<Buffer>;
  close(): Promise<void>;
}

interface Slot {
  page: Page;
  cdp: CDPSession;
}

/**
 * Frames of a scene on a `width` x `height` canvas: the SVG inline in a page of that size with its
 * animations paused, seeked to `t` with `setCurrentTime` and screenshotted. `pages` pages share
 * the work; a page seeks and captures one frame at a time.
 */
export async function sceneFrames(browser: Browser, svg: string, width: number, height: number, pages = PAGES): Promise<SceneFrames> {
  const html = sceneDocument(svg, width, height);
  const context: BrowserContext = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const idle: Slot[] = [];
  const waiting: ((slot: Slot) => void)[] = [];
  for (let i = 0; i < pages; i++) {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // Browser-side code goes as text: a function would carry the coverage counters of an instrumented build into the page.
    await page.evaluate("(() => { const s = document.querySelector('svg'); s.pauseAnimations(); s.setCurrentTime(0); })()");
    idle.push({ page, cdp: await context.newCDPSession(page) });
  }
  const take = (): Promise<Slot> => {
    const slot = idle.pop();
    return slot ? Promise.resolve(slot) : new Promise((resolve) => waiting.push(resolve));
  };
  const give = (slot: Slot): void => {
    const next = waiting.shift();
    if (next) next(slot);
    else idle.push(slot);
  };
  return {
    async frame(t) {
      const slot = await take();
      try {
        await slot.page.evaluate(`document.querySelector('svg').setCurrentTime(${Number(t)})`);
        // The clip names the frame's exact size; a bare viewport capture comes back short of the window.
        const { data } = await slot.cdp.send("Page.captureScreenshot", {
          format: "png",
          clip: { x: 0, y: 0, width, height, scale: 1 },
          captureBeyondViewport: true,
        });
        const rgb = await sharp(Buffer.from(data, "base64")).flatten({ background: { r: 0, g: 0, b: 0 } }).removeAlpha().raw().toBuffer();
        if (rgb.length !== width * height * 3) {
          throw new Error(`Scene artwork: the browser drew ${rgb.length / 3} pixels for a ${width}x${height} frame.`);
        }
        return rgb;
      } finally {
        give(slot);
      }
    },
    close: () => context.close(),
  };
}
