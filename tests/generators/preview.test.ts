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
    command: 'tvos-assets --color "#F39C12"',
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
    // 21 catalog PNGs + the standalone icon.png + the 2 source inputs shown
    // under Inputs (the fixture icon and background are distinct files from
    // anything the run writes).
    expect(declarations).toHaveLength(24);
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

  it("previews the input files with their roles", () => {
    const roles = [...html.matchAll(/class="role">([^<]+)</g)].map((match) => match[1]);
    expect(roles).toEqual(["icon", "background"]);
    expect(html).toContain(">icon.png<");
    expect(html).toContain(">background.png<");
  });

  it("records the command that produced the page", () => {
    expect(html).toContain('<pre class="cmd">');
    expect(html).toContain("tvos-assets --color &quot;#F39C12&quot;");
  });

  it("embeds the resolved config as valid JSON", () => {
    expect(html).toContain('<details class="config">');
    const raw = html.match(/<summary>Show resolved config<\/summary>\s*<pre>([\s\S]*?)<\/pre>/)?.[1];
    expect(raw).toBeDefined();
    const decoded = raw!
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const parsed = JSON.parse(decoded);
    expect(parsed.inputs.backgroundColor).toBe("#F39C12");
    expect(parsed.brandAssets.name).toBe("AppIcon");
  });

  it("links every thumbnail to the real file on disk", () => {
    const hrefs = [...html.matchAll(/class="open" href="([^"]+)"/g)].map((match) => match[1]);
    // 21 catalog PNGs + icon.png + 2 inputs. Swatches have no file, so no link.
    expect(hrefs).toHaveLength(24);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');

    for (const href of hrefs) {
      const target = href.split("/").map(decodeURIComponent).join("/");
      const absolute = target.startsWith("/") ? target : join(OUT, target);
      expect(existsSync(absolute)).toBe(true);
    }
  });

  it("encodes spaces in catalog paths so the links are valid URLs", () => {
    expect(html).toContain("App%20Icon.imagestack");
    expect(html).not.toMatch(/href="[^"]*App Icon/);
  });

  it("encodes characters that would truncate a URL, not just spaces", async () => {
    // "#" and "?" are legal in filenames but encodeURI leaves both alone, so an
    // unencoded one would cut the link short at a fragment or query. Asset names
    // are validated, but filePrefix is not, which is how one reaches an href.
    const dir = join(TMP, "hash");
    mkdirSync(dir, { recursive: true });
    const config = resolveConfig({
      icon,
      background,
      color: "#101010",
      outDir: dir,
      overrides: {
        brandAssets: { topShelfImage: { filePrefix: "top#1?x" } },
        iosIcon: { enabled: false },
      },
    });
    const xcassetsDir = join(dir, "Images.xcassets");
    await generateAssets(config, xcassetsDir, { platforms: ["tvos"] });

    const previewPath = join(dir, "preview.html");
    await generatePreview({ xcassetsDir, outputPath: previewPath, config, platforms: ["tvos"] });
    const page = readFileSync(previewPath, "utf-8");

    const hrefs = [...page.matchAll(/class="open" href="([^"]+)"/g)].map((match) => match[1]);
    const topShelf = hrefs.filter((href) => href.includes("Top%20Shelf%20Image."));
    expect(topShelf.length).toBeGreaterThan(0);

    for (const href of topShelf) {
      expect(href).not.toContain("#");
      expect(href).not.toContain("?");
      // and it still points at a file that exists
      const target = href.split("/").map(decodeURIComponent).join("/");
      expect(existsSync(join(dir, target))).toBe(true);
    }
  });

  it("links catalog files relatively so they survive the zip being extracted anywhere", () => {
    const catalog = [...html.matchAll(/class="open" href="(Images\.xcassets[^"]+)"/g)];
    expect(catalog.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/class="open" href="\/[^"]*Images\.xcassets/);
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

  it("links sources absolutely by default, relatively when asked", async () => {
    const dir = join(TMP, "links");
    mkdirSync(dir, { recursive: true });
    const config = resolveConfig({ icon, background, color: "#101010", outDir: dir });
    const xcassetsDir = join(dir, "Images.xcassets");
    await generateAssets(config, xcassetsDir, { platforms: ["ios"] });

    const inputHref = (page: string): string =>
      page.match(/class="open" href="([^"]*icon\.png)"/)?.[1] ?? "";

    // Default suits zip output: the page is built in a temp dir and the sources
    // are not shipped with it, so only an absolute path can resolve.
    const absPath = join(dir, "abs.html");
    await generatePreview({ xcassetsDir, outputPath: absPath, config, platforms: ["ios"] });
    expect(inputHref(readFileSync(absPath, "utf-8")).startsWith("/")).toBe(true);

    // Directory output keeps the page beside its sources, so relative stays
    // valid for anyone who clones the project and leaks no local path.
    const relPath = join(dir, "rel.html");
    await generatePreview({
      xcassetsDir,
      outputPath: relPath,
      config,
      platforms: ["ios"],
      outsideLinks: "relative",
    });
    const relHtml = readFileSync(relPath, "utf-8");
    expect(inputHref(relHtml).startsWith("/")).toBe(false);
    expect(inputHref(relHtml)).toContain("..");
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
