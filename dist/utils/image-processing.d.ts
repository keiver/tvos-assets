export declare function applyBorderRadius(buffer: Buffer, size: number, radius: number): Promise<Buffer>;
export declare function resizeImage(inputPath: string, width: number, height: number): Promise<Buffer>;
export declare function resizeImageOpaque(inputPath: string, width: number, height: number): Promise<Buffer>;
export declare function compositeIconOnBackground(bgPath: string, iconPath: string, width: number, height: number, options?: {
    iconScale?: number;
    opaque?: boolean;
    borderRadius?: number;
    sourceIconSize?: number;
}): Promise<Buffer>;
export declare function renderIconOnTransparent(iconPath: string, size: number, options?: {
    borderRadius?: number;
    sourceIconSize?: number;
}): Promise<Buffer>;
export declare function renderIconOnTransparentCanvas(iconPath: string, width: number, height: number, options?: {
    iconScale?: number;
    borderRadius?: number;
    sourceIconSize?: number;
}): Promise<Buffer>;
export declare function scaleMultiplier(scale: string): number;
export declare function validateOutputDimensions(w: number, h: number, context: string): void;
//# sourceMappingURL=image-processing.d.ts.map