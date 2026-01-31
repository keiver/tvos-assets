import sharp from "sharp";

function wrapSharpError(err: unknown, context: string): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`Image processing failed (${context}): ${message}`);
}

export async function resizeImage(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  try {
    return await sharp(inputPath)
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
    return await sharp(inputPath)
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
  options?: { iconScale?: number; opaque?: boolean },
): Promise<Buffer> {
  const iconScale = options?.iconScale ?? 0.6;
  const opaque = options?.opaque ?? false;

  try {
    // Determine icon dimensions — scale relative to the shorter dimension
    const shortSide = Math.min(width, height);
    const iconSize = Math.round(shortSide * iconScale);

    // Resize icon preserving transparency
    const iconBuffer = await sharp(iconPath)
      .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Resize background and composite icon centered
    let pipeline = sharp(bgPath)
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
): Promise<Buffer> {
  try {
    return await sharp(iconPath)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch (err) {
    wrapSharpError(err, `rendering icon on transparent at ${size}x${size}`);
  }
}

export async function renderIconOnTransparentCanvas(
  iconPath: string,
  width: number,
  height: number,
  options?: { iconScale?: number },
): Promise<Buffer> {
  const iconScale = options?.iconScale ?? 0.6;
  const shortSide = Math.min(width, height);
  const iconSize = Math.round(shortSide * iconScale);

  try {
    const iconBuffer = await sharp(iconPath)
      .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    return await sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: iconBuffer, gravity: "center" }])
      .png()
      .toBuffer();
  } catch (err) {
    wrapSharpError(err, `rendering icon on transparent canvas at ${width}x${height}`);
  }
}
