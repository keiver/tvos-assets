jest.setTimeout(60000);

import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import { generateAssets } from "../../src/lib";
import { generatePreview } from "../../src/generators/preview";
import { createTestIcon, createTestBackground } from "../fixtures/create-fixtures";

const TMP = join(__dirname, "../../.test-tmp-preview");
const SRC = join(TMP, "src");
const OUT = join(TMP, "out");

let html: string;
let icon: string;
let background: string;

beforeAll(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(SRC, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  icon = await createTestIcon(SRC);
  background = await createTestBackground(SRC);
  const config = resolveConfig({ icon, background, color: "#F39C12", outDir: OUT });

  const iconPath = join(OUT, "icon.png");
  const previewPath = join(OUT, "preview.html");

  await generateAssets(config, join(OUT, "Images.xcassets"), { standaloneIconPath: iconPath });
  await generatePreview({
    xcassetsDir: join(OUT, "Images.xcassets"),
    outputPath: previewPath,
    config,
    platforms: ["tvos", "ios"],
    standaloneIconPath: iconPath,
    toolVersion: "9.9.9",
    generatedAt: "2026-01-01 00:00:00",
  });

  html = readFileSync(previewPath, "utf-8");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("preview.html", () => {
  it("is written as a complete HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain("<title>tvos-assets preview</title>");
  });

  it("is fully self-contained with no external requests", () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/<link\b/);
    // The only URLs on the page are inline data URIs.
    const urls = [...html.matchAll(/url\("([^"]*)"\)/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("data:image/webp;base64,")).toBe(true);
    }
  });

  it("declares every image it references, and references every one it declares", () => {
    const declared = new Set([...html.matchAll(/^\s*--(i\d+):/gm)].map((match) => match[1]));
    const referenced = new Set([...html.matchAll(/var\(--(i\d+)\)/g)].map((match) => match[1]));
    expect(declared.size).toBeGreaterThan(0);
    expect([...referenced].filter((key) => !declared.has(key))).toEqual([]);
    expect([...declared].filter((key) => !referenced.has(key))).toEqual([]);
  });

  it("declares each embedded image exactly once", () => {
    const declarations = [...html.matchAll(/^\s*--(i\d+):/gm)].map((match) => match[1]);
    expect(new Set(declarations).size).toBe(declarations.length);
    // 21 catalog PNGs + the standalone icon.png.
    expect(declarations).toHaveLength(22);
  });

  it("reuses a thumbnail's embedded image for the parallax instead of embedding it twice", () => {
    const layerKeys = [...html.matchAll(/class="layer" style="background-image:var\(--(i\d+)\)"/g)].map(
      (match) => match[1],
    );
    const frameKeys = new Set(
      [...html.matchAll(/class="frame[^"]*"[\s\S]{0,240}?background-image:var\(--(i\d+)\)/g)].map(
        (match) => match[1],
      ),
    );
    expect(layerKeys).toHaveLength(6);
    for (const key of layerKeys) {
      expect(frameKeys.has(key)).toBe(true);
    }
  });

  it("names every generated asset directory it found", () => {
    for (const title of [
      "App Icon.imagestack",
      "App Icon - App Store.imagestack",
      "Top Shelf Image.imageset",
      "Top Shelf Image Wide.imageset",
      "AppIcon.appiconset",
      "SplashScreenLogo.imageset",
      "SplashScreenBackground.colorset",
      "icon.png",
    ]) {
      expect(html).toContain(`>${title}<`);
    }
  });

  it("lists the home screen icon before the App Store icon", () => {
    expect(html.indexOf(">App Icon.imagestack<")).toBeLessThan(html.indexOf(">App Icon - App Store.imagestack<"));
    expect(html.indexOf(">Top Shelf Image.imageset<")).toBeLessThan(html.indexOf(">Top Shelf Image Wide.imageset<"));
  });

  it("reports true pixel dimensions, not thumbnail dimensions", () => {
    expect(html).toContain("1920 x 720");
    expect(html).toContain("3840 x 1440");
    expect(html).toContain("1024 x 1024");
  });

  it("builds one parallax stack per imagestack, three layers each", () => {
    expect(html.match(/class="parallax"/g) ?? []).toHaveLength(2);
    expect(html.match(/class="layer"/g) ?? []).toHaveLength(6);
  });

  it("renders the colorset as swatches with hex values", () => {
    expect(html).toContain("#F39C12");
    expect((html.match(/class="swatch-chip"/g) ?? []).length).toBe(4);
  });

  it("lays the contact sheet out as a uniform grid, not intrinsically sized figures", () => {
    // Intrinsic sizing gave ragged rows, orphaned tiles, and captions at a dozen
    // different heights. Equal cells keep captions on a shared line.
    expect(html).toMatch(/\.row \{[^}]*display: grid/);
    expect(html).toMatch(/\.row \{[^}]*grid-template-columns: repeat\(auto-fill/);
    expect(html).toMatch(/\.swatches \{[^}]*display: grid/);
  });

  it("sizes tiles with CSS rather than baking pixel dimensions into each figure", () => {
    // Inline width/height on every frame is what broke narrow viewports.
    expect(html).not.toMatch(/class="frame[^"]*"[^>]*style="[^"]*width:\d+px/);
    expect(html).toMatch(/class="parallax" style="aspect-ratio:\d+ \/ \d+"/);
  });

  it("collapses to one full-width column on narrow screens, still left aligned", () => {
    expect(html).toMatch(/@media \(max-width: 640px\)/);
    const mobile = html.slice(html.indexOf("@media (max-width: 640px)"));
    expect(mobile).toMatch(/\.row, \.swatches, \.parallax-block \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    // Centring was tried and rejected: ragged right edges in monospace scan
    // badly and break the sheet's flush left margin.
    expect(mobile).not.toMatch(/text-align: center/);
    expect(mobile).not.toMatch(/justify-content: center/);
    expect(mobile).not.toMatch(/justify-items: center/);
  });

  it("carries the run metadata in the header", () => {
    expect(html).toContain("2026-01-01 00:00:00");
    expect(html).toContain("v9.9.9");
    expect(html).toContain("--accent: #F39C12");
  });

  it("reflects the catalog on disk rather than the config", async () => {
    const partialOut = join(TMP, "partial");
    mkdirSync(partialOut, { recursive: true });
    const config = resolveConfig({ icon, background, color: "#101010", outDir: partialOut });
    const xcassetsDir = join(partialOut, "Images.xcassets");

    await generateAssets(config, xcassetsDir, { platforms: ["ios"] });
    const previewPath = join(partialOut, "preview.html");
    await generatePreview({ xcassetsDir, outputPath: previewPath, config, platforms: ["ios"] });

    expect(existsSync(previewPath)).toBe(true);
    const partialHtml = readFileSync(previewPath, "utf-8");
    // The brandassets were never generated, so nothing about them appears.
    expect(partialHtml).not.toContain("App Icon.imagestack");
    expect(partialHtml).not.toContain('class="parallax"');
    expect(partialHtml).toContain("AppIcon.appiconset");
  });

  it("honors renamed asset bundles", async () => {
    const renamedOut = join(TMP, "renamed");
    mkdirSync(renamedOut, { recursive: true });
    const config = resolveConfig({
      icon,
      background,
      color: "#101010",
      outDir: renamedOut,
      overrides: { brandAssets: { name: "AppIconTV" }, iosIcon: { enabled: false } },
    });
    const xcassetsDir = join(renamedOut, "Images.xcassets");

    await generateAssets(config, xcassetsDir);
    const previewPath = join(renamedOut, "preview.html");
    await generatePreview({ xcassetsDir, outputPath: previewPath, config, platforms: ["tvos"] });

    const renamedHtml = readFileSync(previewPath, "utf-8");
    expect(renamedHtml).toContain("Images.xcassets/AppIconTV.brandassets");
    expect(renamedHtml).not.toContain("AppIcon.appiconset");
  });
});
