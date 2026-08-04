import sharp from "sharp";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

const MAX_SVG_DENSITY = 9600;

/**
 * Open an input image for a target output size. SVGs are rasterized at a density
 * high enough that the vector never gets bitmap-upscaled to reach the target.
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

export async function compositeIconOnBackground(
  bgPath: string,
  iconPath: string,
  width: number,
  height: number,
  options?: { iconScale?: number; opaque?: boolean; borderRadius?: number; sourceIconSize?: number },
): Promise<Buffer> {
  const iconScale = options?.iconScale ?? 0.6;
  const opaque = options?.opaque ?? false;
  const borderRadius = options?.borderRadius ?? 0;
  const sourceIconSize = options?.sourceIconSize ?? 0;

  try {
    // Determine icon dimensions — scale relative to the shorter dimension
    const shortSide = Math.min(width, height);
    const iconSize = Math.round(shortSide * iconScale);

    // Resize icon preserving transparency
    let iconBuffer = await (await inputImage(iconPath, iconSize, iconSize))
      .resize(iconSize, iconSize, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();

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
  options?: { iconScale?: number; borderRadius?: number; sourceIconSize?: number },
): Promise<Buffer> {
  const iconScale = options?.iconScale ?? 0.6;
  const borderRadius = options?.borderRadius ?? 0;
  const sourceIconSize = options?.sourceIconSize ?? 0;
  const shortSide = Math.min(width, height);
  const iconSize = Math.round(shortSide * iconScale);

  try {
    let iconBuffer = await (await inputImage(iconPath, iconSize, iconSize))
      .resize(iconSize, iconSize, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();

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
