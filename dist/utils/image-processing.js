import sharp from "sharp";
export async function resizeImage(inputPath, width, height) {
    return sharp(inputPath)
        .resize(width, height, { fit: "cover", position: "center" })
        .png()
        .toBuffer();
}
export async function resizeImageOpaque(inputPath, width, height) {
    return sharp(inputPath)
        .resize(width, height, { fit: "cover", position: "center" })
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .removeAlpha()
        .png()
        .toBuffer();
}
export async function compositeIconOnBackground(bgPath, iconPath, width, height, options) {
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
export async function renderIconOnTransparent(iconPath, size) {
    return sharp(iconPath)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
}
//# sourceMappingURL=image-processing.js.map