import sharp from "sharp";

export async function resizeImage(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(inputPath)
    .resize(width, height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
}

export async function resizeImageOpaque(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(inputPath)
    .resize(width, height, { fit: "cover", position: "center" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .png()
    .toBuffer();
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

  return pipeline.png().toBuffer();
}

export async function renderIconOnTransparent(
  iconPath: string,
  size: number,
): Promise<Buffer> {
  return sharp(iconPath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
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

  const iconBuffer = await sharp(iconPath)
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: iconBuffer, gravity: "center" }])
    .png()
    .toBuffer();
}
