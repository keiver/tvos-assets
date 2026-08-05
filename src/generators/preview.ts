import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname, relative, dirname, sep } from "node:path";
import sharp from "sharp";
import type { TvOSImageCreatorConfig } from "../types.js";
import { safeWriteFile } from "../utils/fs.js";
import { displayPath, isUpward, tildify } from "../utils/paths.js";
import { renderPreviewHtml } from "./preview-html.js";

/** Long edge of the embedded thumbnails, in CSS pixels before device scaling. */
const THUMB_MAX_EDGE = 640;
const THUMB_QUALITY = 82;

export interface PreviewAsset {
  /** Filename as written into the catalog. */
  filename: string;
  /** True pixel dimensions of the written file, not the thumbnail. */
  width: number;
  height: number;
  /** Key into the image table; several assets may share one entry. */
  imageKey: string;
  hasAlpha: boolean;
  /** Short qualifier shown next to the filename (scale, idiom, appearance). */
  note?: string;
  /** Link to the real file on disk, so a thumbnail can open the full-size original. */
  href?: string;
}

export interface PreviewParallax {
  label: string;
  width: number;
  height: number;
  /** Back to front, so DOM order matches stacking order. */
  layers: { name: string; imageKey: string }[];
}

export interface PreviewSwatch {
  hex: string;
  idiom: string;
  appearance: string;
}

export interface PreviewGroup {
  title: string;
  /** Path of the asset directory relative to Images.xcassets. */
  location: string;
  assets: PreviewAsset[];
  parallax?: PreviewParallax;
  swatches?: PreviewSwatch[];
}

export interface PreviewData {
  groups: PreviewGroup[];
  /** imageKey to data URI. Emitted once each, referenced by every user. */
  images: Map<string, string>;
  totals: { files: number; images: number };
}

interface ContentsImageEntry {
  filename?: string;
  idiom?: string;
  scale?: string;
  appearances?: { appearance: string; value: string }[];
}

function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    // Sort on the name without its suffix, so "App Icon" precedes "App Icon - App
    // Store" instead of the "." vs " " byte order putting the App Store icon first.
    .sort((a, b) => basename(a, extname(a)).localeCompare(basename(b, extname(b))));
}

/** Where an asset directory lives, phrased the way it reads in Finder. */
function locationOf(dir: string, catalogRoot: string): string {
  const parent = relative(catalogRoot, dirname(dir));
  return parent ? `Images.xcassets/${parent}` : "Images.xcassets";
}

/** How to link files that sit outside the preview's own directory. */
export type OutsideLinkStyle = "relative" | "absolute";

/**
 * A copy of the config with every path rewritten for display.
 *
 * The page is a committed, shareable artifact, so it must not carry the
 * generating machine's home directory. Only the rendered copy is rewritten;
 * resolution itself still runs on real absolute paths.
 */
function displayConfig(
  config: TvOSImageCreatorConfig,
  previewDir: string,
  outside: OutsideLinkStyle,
): TvOSImageCreatorConfig {
  const show = (path: string): string => displayPath(path, previewDir, outside === "relative");
  const copy = JSON.parse(JSON.stringify(config)) as TvOSImageCreatorConfig;

  copy.inputs.iconImage = show(copy.inputs.iconImage);
  copy.inputs.backgroundImage = show(copy.inputs.backgroundImage);
  if (copy.inputs.iconDarkImage) copy.inputs.iconDarkImage = show(copy.inputs.iconDarkImage);
  if (copy.inputs.iconTintedImage) copy.inputs.iconTintedImage = show(copy.inputs.iconTintedImage);
  copy.output.directory = show(copy.output.directory);

  for (const stack of [copy.brandAssets.appIconSmall, copy.brandAssets.appIconLarge]) {
    for (const layer of ["front", "middle", "back"] as const) {
      const art = stack.layers[layer];
      if (art.imagePath) art.imagePath = show(art.imagePath);
    }
  }

  return copy;
}

/**
 * A link from preview.html to a real file on disk. Segments are encoded because
 * asset names contain spaces.
 *
 * Anything under the preview's own directory (the whole catalog, icon.png) is
 * always relative, so it survives the zip being extracted anywhere.
 *
 * Sources sit outside that directory, and the right link depends on where the
 * page ends up. Written straight into a directory, the page keeps its
 * neighbours, so a relative `../brand/icon.svg` stays correct for anyone who
 * clones the project and never leaks a local path. Packed into a zip, the page
 * is generated in a temp directory and the sources are not shipped with it, so
 * only an absolute path resolves, and only on the machine that generated it.
 *
 * Either way, a link that would spell out the home directory (an absolute path
 * under it, or a relative path that climbs out of a foreign output directory
 * and back down through it) is a username leak in a shareable artifact — those
 * render as plain text instead of a link (empty href; `linked()` degrades).
 */
function fileHref(target: string, previewDir: string, outside: OutsideLinkStyle): string {
  const rel = relative(previewDir, target);
  const inside = Boolean(rel) && !isUpward(rel);
  if (inside) return encodeHref(rel.split(sep).join("/"));

  const targetInHome = tildify(target) !== target;
  const previewInHome = tildify(previewDir) !== previewDir;
  const leaksHome = outside === "relative" ? targetInHome && !previewInHome : targetInHome;
  if (leaksHome) return "";

  const raw = outside === "relative" && rel ? rel : target;
  return encodeHref(raw.split(sep).join("/"));
}

/**
 * Encode each path segment separately.
 *
 * encodeURI leaves `#` and `?` alone, and both are legal in a filename: `#`
 * would start a fragment and `?` a query, truncating the link at that point.
 * Segment-wise encoding closes that, and keeps the separators intact. Asset
 * names are validated, but `filePrefix` is not, and input paths are whatever
 * directory the user keeps their art in.
 */
function encodeHref(posixPath: string): string {
  return posixPath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function componentsToHex(components: Record<string, string>): string {
  const channel = (raw: string | undefined): string =>
    Math.round(Math.min(1, Math.max(0, Number(raw ?? 0))) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(components.red)}${channel(components.green)}${channel(components.blue)}`;
}

/** Describe an appiconset/imageset entry in a few characters: "2x", "tv 1x", "dark". */
function describeEntry(entry: ContentsImageEntry): string | undefined {
  const appearance = entry.appearances?.find((a) => a.appearance === "luminosity")?.value;
  const parts = [
    entry.idiom && entry.idiom !== "universal" ? entry.idiom : undefined,
    entry.scale,
    appearance,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : undefined;
}

class ImageTable {
  readonly entries = new Map<string, string>();
  private keys = new Map<string, string>();

  /** Encode a PNG once and return its stable key, plus its true dimensions. */
  async add(absolutePath: string): Promise<{ key: string; width: number; height: number; hasAlpha: boolean }> {
    const meta = await sharp(absolutePath).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const hasAlpha = meta.hasAlpha ?? false;

    const existing = this.keys.get(absolutePath);
    if (existing) return { key: existing, width, height, hasAlpha };

    const thumbnail = await sharp(absolutePath)
      .resize({ width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY, alphaQuality: 100 })
      .toBuffer();

    const key = `i${this.entries.size}`;
    this.entries.set(key, `data:image/webp;base64,${thumbnail.toString("base64")}`);
    this.keys.set(absolutePath, key);
    return { key, width, height, hasAlpha };
  }
}

/** Read one .imageset / .appiconset directory into preview assets, in Contents.json order. */
async function readImageSet(dir: string, table: ImageTable, previewDir: string, outside: OutsideLinkStyle): Promise<PreviewAsset[]> {
  const contents = readJson(join(dir, "Contents.json"));
  const entries = Array.isArray(contents?.images) ? (contents.images as ContentsImageEntry[]) : [];
  const assets: PreviewAsset[] = [];

  for (const entry of entries) {
    if (!entry.filename) continue;
    const filePath = join(dir, entry.filename);
    if (!existsSync(filePath)) continue;
    const { key, width, height, hasAlpha } = await table.add(filePath);
    assets.push({
      filename: entry.filename,
      width,
      height,
      imageKey: key,
      hasAlpha,
      note: describeEntry(entry),
      href: fileHref(filePath, previewDir, outside),
    });
  }

  return assets;
}

/** Stacking order: first painted is furthest back, matching the parallax DOM. */
const LAYER_STACK_ORDER = ["Back", "Middle", "Front"] as const;
/** Reading order for the contact sheet, matching how the docs describe the layers. */
const LAYER_READ_ORDER = ["Front", "Middle", "Back"] as const;

/**
 * Read a .imagestack: every layer PNG as a thumbnail, plus the largest matching
 * set of layers assembled into an interactive parallax stack.
 */
async function readImageStack(
  dir: string,
  table: ImageTable,
  catalogRoot: string,
  previewDir: string,
  outside: OutsideLinkStyle,
): Promise<PreviewGroup> {
  const assets: PreviewAsset[] = [];
  const byLayer = new Map<string, PreviewAsset[]>();

  for (const layerName of LAYER_READ_ORDER) {
    const imagesetDir = join(dir, `${layerName}.imagestacklayer`, "Content.imageset");
    if (!existsSync(imagesetDir)) continue;
    const layerAssets = await readImageSet(imagesetDir, table, previewDir, outside);
    for (const asset of layerAssets) {
      asset.note = [layerName, asset.note].filter(Boolean).join(" ");
    }
    byLayer.set(layerName, layerAssets);
    assets.push(...layerAssets);
  }

  // Assemble the parallax from the largest layer set every layer can supply.
  let parallax: PreviewParallax | undefined;
  const largest = [...(byLayer.get("Front") ?? [])].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (largest) {
    const layers: { name: string; imageKey: string }[] = [];
    for (const layerName of LAYER_STACK_ORDER) {
      const match = (byLayer.get(layerName) ?? []).find(
        (asset) => asset.width === largest.width && asset.height === largest.height,
      );
      if (match) layers.push({ name: layerName, imageKey: match.imageKey });
    }
    if (layers.length > 1) {
      parallax = {
        label: `${largest.width} x ${largest.height}`,
        width: largest.width,
        height: largest.height,
        layers,
      };
    }
  }

  return {
    title: basename(dir),
    location: locationOf(dir, catalogRoot),
    assets,
    parallax,
  };
}

function readColorSet(dir: string, catalogRoot: string): PreviewGroup {
  const contents = readJson(join(dir, "Contents.json"));
  const colors = Array.isArray(contents?.colors) ? (contents.colors as Record<string, never>[]) : [];
  const swatches: PreviewSwatch[] = [];

  for (const entry of colors) {
    const color = entry.color as { components?: Record<string, string> } | undefined;
    if (!color?.components) continue;
    const appearances = entry.appearances as { appearance: string; value: string }[] | undefined;
    swatches.push({
      hex: componentsToHex(color.components),
      idiom: (entry.idiom as string | undefined) ?? "universal",
      appearance: appearances?.find((a) => a.appearance === "luminosity")?.value ?? "light",
    });
  }

  return {
    title: basename(dir),
    location: locationOf(dir, catalogRoot),
    assets: [],
    swatches,
  };
}

/**
 * Walk the catalog that was actually written, rather than re-deriving filenames
 * from config. Disabled assets, renamed bundles, and custom scales are all
 * reflected automatically.
 */
async function collectCatalog(
  xcassetsDir: string,
  table: ImageTable,
  previewDir: string,
  outside: OutsideLinkStyle,
): Promise<PreviewGroup[]> {
  const stacks: PreviewGroup[] = [];
  const brandImageSets: PreviewGroup[] = [];
  const appIconSets: PreviewGroup[] = [];
  const imageSets: PreviewGroup[] = [];
  const colorSets: PreviewGroup[] = [];

  for (const name of listDirs(xcassetsDir)) {
    const dir = join(xcassetsDir, name);
    const suffix = extname(name);

    if (suffix === ".brandassets") {
      for (const child of listDirs(dir)) {
        const childDir = join(dir, child);
        const childSuffix = extname(child);
        if (childSuffix === ".imagestack") {
          stacks.push(await readImageStack(childDir, table, xcassetsDir, previewDir, outside));
        } else if (childSuffix === ".imageset") {
          brandImageSets.push({
            title: child,
            location: locationOf(childDir, xcassetsDir),
            assets: await readImageSet(childDir, table, previewDir, outside),
          });
        }
      }
    } else if (suffix === ".appiconset") {
      appIconSets.push({
        title: name,
        location: locationOf(dir, xcassetsDir),
        assets: await readImageSet(dir, table, previewDir, outside),
      });
    } else if (suffix === ".imageset") {
      imageSets.push({
        title: name,
        location: locationOf(dir, xcassetsDir),
        assets: await readImageSet(dir, table, previewDir, outside),
      });
    } else if (suffix === ".colorset") {
      colorSets.push(readColorSet(dir, xcassetsDir));
    }
  }

  return [...stacks, ...brandImageSets, ...appIconSets, ...imageSets, ...colorSets];
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const child = join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(child) : 1;
  }
  return total;
}

export interface PreviewInput {
  /** What this file is used for, e.g. "icon" or "layer front". */
  role: string;
  filename: string;
  width: number;
  height: number;
  imageKey: string;
  hasAlpha: boolean;
  /** True for SVG sources, which rasterize per output size rather than upscaling. */
  vector: boolean;
  /** Link to the source file on disk. */
  href?: string;
}

/**
 * Every source file the run reads, in the order they matter. Layer art is
 * deduplicated: the same file applied to both imagestacks is one input.
 */
async function collectInputs(
  config: TvOSImageCreatorConfig,
  table: ImageTable,
  previewDir: string,
  outside: OutsideLinkStyle,
): Promise<PreviewInput[]> {
  const candidates: { role: string; path?: string }[] = [
    { role: "icon", path: config.inputs.iconImage },
    { role: "background", path: config.inputs.backgroundImage },
    { role: "icon dark", path: config.inputs.iconDarkImage },
    { role: "icon tinted", path: config.inputs.iconTintedImage },
  ];

  for (const stack of [config.brandAssets.appIconSmall, config.brandAssets.appIconLarge]) {
    for (const layer of ["front", "middle", "back"] as const) {
      candidates.push({ role: `layer ${layer}`, path: stack.layers[layer].imagePath });
    }
  }

  const inputs: PreviewInput[] = [];
  const seen = new Set<string>();
  for (const { role, path } of candidates) {
    if (!path || seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    const { key, width, height, hasAlpha } = await table.add(path);
    inputs.push({
      role,
      filename: basename(path),
      width,
      height,
      imageKey: key,
      hasAlpha,
      vector: extname(path).toLowerCase() === ".svg",
      href: fileHref(path, previewDir, outside),
    });
  }
  return inputs;
}

export interface GeneratePreviewOptions {
  xcassetsDir: string;
  outputPath: string;
  config: TvOSImageCreatorConfig;
  platforms: string[];
  standaloneIconPath?: string;
  toolVersion?: string;
  /** The command line that produced this run, shown verbatim on the page. */
  command?: string;
  /** Config file the run read, if any. */
  configPath?: string;
  /**
   * How to link source files, which sit outside the preview's directory.
   * "relative" suits directory output, where the page keeps its neighbours.
   * Defaults to "absolute", correct for zip output built in a temp directory.
   */
  outsideLinks?: OutsideLinkStyle;
  /** Injected in tests to keep output deterministic. */
  generatedAt?: string;
}

/**
 * Write a single self-contained preview.html contact sheet of everything the
 * run produced. Every image is embedded as a data URI, so the page works from
 * inside the zip with no network access and no sibling files.
 */
export async function generatePreview(options: GeneratePreviewOptions): Promise<void> {
  const table = new ImageTable();
  const previewDir = dirname(options.outputPath);
  const outside = options.outsideLinks ?? "absolute";
  // Inputs first, so a source that is also an output is embedded once and shared.
  const inputs = await collectInputs(options.config, table, previewDir, outside);
  const groups = await collectCatalog(options.xcassetsDir, table, previewDir, outside);

  if (options.standaloneIconPath && existsSync(options.standaloneIconPath)) {
    const { key, width, height, hasAlpha } = await table.add(options.standaloneIconPath);
    groups.push({
      title: basename(options.standaloneIconPath),
      location: "alongside Images.xcassets",
      assets: [
        {
          filename: basename(options.standaloneIconPath),
          width,
          height,
          imageKey: key,
          hasAlpha,
          href: fileHref(options.standaloneIconPath, previewDir, outside),
        },
      ],
    });
  }

  const catalogFiles = countFiles(options.xcassetsDir);
  const extras = (options.standaloneIconPath && existsSync(options.standaloneIconPath) ? 1 : 0) + 1; // + preview.html

  const html = renderPreviewHtml({
    groups,
    inputs,
    images: table.entries,
    config: displayConfig(options.config, previewDir, outside),
    platforms: options.platforms,
    toolVersion: options.toolVersion,
    command: options.command,
    configPath: options.configPath
      ? displayPath(options.configPath, previewDir, outside === "relative")
      : undefined,
    generatedAt: options.generatedAt ?? new Date().toISOString().replace("T", " ").slice(0, 19),
    totals: {
      files: catalogFiles + extras,
      images: table.entries.size,
    },
  });

  safeWriteFile(options.outputPath, Buffer.from(html, "utf-8"));
}
