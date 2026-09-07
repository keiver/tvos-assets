import sharp from "sharp";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

const MAX_SVG_DENSITY = 9600;

/** Only a fallback: every generator passes an explicit, configured scale. */
const DEFAULT_ICON_SCALE = 0.8;

/**
 * Open an input image for a target output size. SVGs are rasterized at a density
 * scaled to the target, capped at MAX_SVG_DENSITY — so bitmap upscaling in the
 * subsequent resize only occurs for extreme viewBox-to-target ratios (beyond
 * ~133x at the default 72dpi base).
 */
async function inputImage(inputPath: string, targetW: number, targetH: number): Promise<sharp.Sharp> {
  if (!inputPath.toLowerCase().endsWith(".svg")) {
    return sharp(inputPath);
  }
  const meta = await sharp(inputPath).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    return sharp(inputPath);
  }
  const scale = Math.max(targetW / w, targetH / h, 1);
  const density = Math.min((meta.density ?? 72) * scale, MAX_SVG_DENSITY);
  return sharp(inputPath, { density });
}

function wrapSharpError(err: unknown, context: string): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`Image processing failed (${context}): ${message}`);
}

export async function applyBorderRadius(
  buffer: Buffer,
  size: number,
  radius: number,
): Promise<Buffer> {
  if (radius <= 0) return buffer;
  const r = Math.min(radius, size / 2);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/>
    </svg>`,
  );
  return sharp(buffer)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

export async function resizeImage(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  try {
    return await (await inputImage(inputPath, width, height))
      .resize(width, height, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
  } catch (err) {
    wrapSharpError(err, `resizing ${inputPath} to ${width}x${height}`);
  }
}

export async function resizeImageOpaque(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  try {
    return await (await inputImage(inputPath, width, height))
      .resize(width, height, { fit: "cover", position: "center" })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .removeAlpha()
      .png()
      .toBuffer();
  } catch (err) {
    wrapSharpError(err, `resizing opaque ${inputPath} to ${width}x${height}`);
  }
}

/**
 * The square of source pixels an icon's visible artwork occupies, centred on
 * that artwork.
 *
 * Scale alone is not enough to place a mark: it sizes the *artboard*, and a
 * designer's own transparent margin then shrinks the mark inside it. Tomo TV's
 * art fills 67.6% of its 1024 artboard, so a 0.8 scale drew it at 54% of the
 * icon rather than the 80% Apple's grid calls for. Normalising to this box
 * first makes the scale mean "the mark covers N% of the canvas".
 *
 * One box is computed per run and applied to the flat icon *and* to every
 * parallax layer. Layers are authored on the icon's own artboard, so sharing a
 * single transform is what keeps them registered — trimming each layer to its
 * own bounds would slide the front layer off the middle one.
 */
export interface ContentBox {
  left: number;
  top: number;
  size: number;
}

const ALPHA_FLOOR = 8;

/** The square the content box is measured against; every use scales from it. */
const BOX_SPACE = 1024;
const MAX_WORK_SIZE = 8192;

/** Undefined when the image is fully transparent or fully opaque edge to edge. */
export async function contentBox(iconPath: string): Promise<ContentBox | undefined> {
  try {
    const { data, info } = await (await inputImage(iconPath, BOX_SPACE, BOX_SPACE))
      .resize(BOX_SPACE, BOX_SPACE, { fit: "contain", background: TRANSPARENT })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] <= ALPHA_FLOOR) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }

    if (right < 0) return undefined;

    const boxWidth = right - left + 1;
    const boxHeight = bottom - top + 1;
    // Square it around the artwork's centre so a wide or tall mark keeps its
    // aspect ratio and stays centred once it is scaled onto the canvas.
    const size = Math.min(Math.max(boxWidth, boxHeight), info.width, info.height);
    if (size >= info.width && size >= info.height) return undefined;

    const clamp = (value: number, max: number): number =>
      Math.max(0, Math.min(Math.round(value), max - size));

    return {
      left: clamp(left + boxWidth / 2 - size / 2, info.width),
      top: clamp(top + boxHeight / 2 - size / 2, info.height),
      size,
    };
  } catch (err) {
    wrapSharpError(err, `measuring icon content bounds of ${iconPath}`);
  }
}

/**
 * Render the icon at `iconSize`, cropped to its content box when one is given.
 *
 * Two passes, not one chain: sharp keeps a single resize per pipeline, so a
 * `resize().extract().resize()` chain silently drops the first resize and the
 * crop lands outside the source. The first pass also renders at whatever
 * resolution makes the *cropped* square come out at least `iconSize`, so an
 * SVG is rasterised big enough instead of being upscaled after the crop.
 */
async function iconAtSize(
  iconPath: string,
  iconSize: number,
  content: ContentBox | undefined,
): Promise<Buffer> {
  if (!content) {
    return (await inputImage(iconPath, iconSize, iconSize))
      .resize(iconSize, iconSize, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
  }

  const work = Math.min(
    Math.max(Math.ceil((iconSize * BOX_SPACE) / content.size), BOX_SPACE),
    MAX_WORK_SIZE,
  );
  const k = work / BOX_SPACE;
  const size = Math.max(1, Math.round(content.size * k));
  const left = Math.max(0, Math.min(Math.round(content.left * k), work - size));
  const top = Math.max(0, Math.min(Math.round(content.top * k), work - size));

  const cropped = await (await inputImage(iconPath, work, work))
    .resize(work, work, { fit: "contain", background: TRANSPARENT })
    .extract({ left, top, width: size, height: size })
    .png()
    .toBuffer();

  return sharp(cropped)
    .resize(iconSize, iconSize, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
}

export async function compositeIconOnBackground(
  bgPath: string,
  iconPath: string,
  width: number,
  height: number,
  options?: {
    iconScale?: number;
    opaque?: boolean;
    borderRadius?: number;
    sourceIconSize?: number;
    content?: ContentBox;
  },
): Promise<Buffer> {
  const iconScale = options?.iconScale ?? DEFAULT_ICON_SCALE;
  const opaque = options?.opaque ?? false;
  const borderRadius = options?.borderRadius ?? 0;
  const sourceIconSize = options?.sourceIconSize ?? 0;

  try {
    // Determine icon dimensions — scale relative to the shorter dimension
    const shortSide = Math.min(width, height);
    const iconSize = Math.round(shortSide * iconScale);

    let iconBuffer = await iconAtSize(iconPath, iconSize, options?.content);

    if (borderRadius > 0 && sourceIconSize > 0) {
      const scaledRadius = Math.round((borderRadius / sourceIconSize) * iconSize);
      iconBuffer = await applyBorderRadius(iconBuffer, iconSize, scaledRadius);
    }

    // Resize background and composite icon centered
    let pipeline = (await inputImage(bgPath, width, height))
      .resize(width, height, { fit: "cover", position: "center" })
      .composite([
        {
          input: iconBuffer,
          gravity: "center",
        },
      ]);

    if (opaque) {
      pipeline = pipeline.removeAlpha();
    }

    return await pipeline.png().toBuffer();
  } catch (err) {
    wrapSharpError(err, `compositing icon on background at ${width}x${height}`);
  }
}

export async function renderIconOnTransparent(
  iconPath: string,
  size: number,
  options?: { borderRadius?: number; sourceIconSize?: number },
): Promise<Buffer> {
  const borderRadius = options?.borderRadius ?? 0;
  const sourceIconSize = options?.sourceIconSize ?? 0;

  try {
    let buffer = await (await inputImage(iconPath, size, size))
      .resize(size, size, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();

    if (borderRadius > 0 && sourceIconSize > 0) {
      const scaledRadius = Math.round((borderRadius / sourceIconSize) * size);
      buffer = await applyBorderRadius(buffer, size, scaledRadius);
    }

    return buffer;
  } catch (err) {
    wrapSharpError(err, `rendering icon on transparent at ${size}x${size}`);
  }
}

export async function renderIconOnTransparentCanvas(
  iconPath: string,
  width: number,
  height: number,
  options?: {
    iconScale?: number;
    borderRadius?: number;
    sourceIconSize?: number;
    content?: ContentBox;
  },
): Promise<Buffer> {
  const iconScale = options?.iconScale ?? DEFAULT_ICON_SCALE;
  const borderRadius = options?.borderRadius ?? 0;
  const sourceIconSize = options?.sourceIconSize ?? 0;
  const shortSide = Math.min(width, height);
  const iconSize = Math.round(shortSide * iconScale);

  try {
    let iconBuffer = await iconAtSize(iconPath, iconSize, options?.content);

    if (borderRadius > 0 && sourceIconSize > 0) {
      const scaledRadius = Math.round((borderRadius / sourceIconSize) * iconSize);
      iconBuffer = await applyBorderRadius(iconBuffer, iconSize, scaledRadius);
    }

    return await sharp({
      create: { width, height, channels: 4, background: TRANSPARENT },
    })
      .composite([{ input: iconBuffer, gravity: "center" }])
      .png()
      .toBuffer();
  } catch (err) {
    wrapSharpError(err, `rendering icon on transparent canvas at ${width}x${height}`);
  }
}

/**
 * Assembled icons render at the largest layer's own resolution, floored at the
 * 1024px icon minimum every consumer needs and capped so an oversized input
 * cannot blow up memory. Nothing downstream asks for more than 1024px: the
 * iOS appiconset is 1024 square and Top Shelf @2x scales the icon to 864.
 */
const ASSEMBLED_ICON_MIN = 1024;
const ASSEMBLED_ICON_MAX = 4096;

/**
 * Flatten parallax layer art into one square icon, drawn back to front.
 *
 * Each layer is contained and centered exactly as `renderIconOnTransparentCanvas`
 * places it inside an imagestack, so the result is that stack seen head-on with
 * its background layer left out — the same artwork the icon input would carry,
 * without asking for a hand-maintained third copy of it.
 */
export async function assembleIconFromLayers(paths: string[]): Promise<Buffer> {
  if (paths.length === 0) {
    throw new Error("Cannot assemble an icon from zero layers.");
  }

  try {
    const metas = await Promise.all(paths.map((p) => sharp(p).metadata()));
    const largest = Math.max(...metas.map((m) => Math.max(m.width ?? 0, m.height ?? 0)));
    const size = Math.min(Math.max(largest, ASSEMBLED_ICON_MIN), ASSEMBLED_ICON_MAX);

    const layers = await Promise.all(
      paths.map(async (path) =>
        (await inputImage(path, size, size))
          .resize(size, size, { fit: "contain", background: TRANSPARENT })
          .png()
          .toBuffer(),
      ),
    );

    return await sharp({
      create: { width: size, height: size, channels: 4, background: TRANSPARENT },
    })
      .composite(layers.map((input) => ({ input, gravity: "center" as const })))
      .png()
      .toBuffer();
  } catch (err) {
    wrapSharpError(err, `assembling icon from ${paths.length} layer${paths.length === 1 ? "" : "s"}`);
  }
}

/** Convert an image buffer to grayscale, preserving alpha (iOS tinted icon variant). */
export async function toGrayscale(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).grayscale().png().toBuffer();
  } catch (err) {
    wrapSharpError(err, "converting to grayscale");
  }
}

export function scaleMultiplier(scale: string): number {
  return parseInt(scale.replace("x", ""), 10);
}

const MAX_OUTPUT_DIMENSION = 32768;

export function validateOutputDimensions(w: number, h: number, context: string): void {
  if (w > MAX_OUTPUT_DIMENSION || h > MAX_OUTPUT_DIMENSION || w < 1 || h < 1) {
    throw new Error(
      `Output dimensions ${w}x${h} are out of range for ${context}. Maximum is ${MAX_OUTPUT_DIMENSION}px per side.`,
    );
  }
}
