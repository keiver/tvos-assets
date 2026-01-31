export declare function resizeImage(inputPath: string, width: number, height: number): Promise<Buffer>;
export declare function resizeImageOpaque(inputPath: string, width: number, height: number): Promise<Buffer>;
export declare function compositeIconOnBackground(bgPath: string, iconPath: string, width: number, height: number, options?: {
    iconScale?: number;
    opaque?: boolean;
}): Promise<Buffer>;
export declare function renderIconOnTransparent(iconPath: string, size: number): Promise<Buffer>;
export declare function renderIconOnTransparentCanvas(iconPath: string, width: number, height: number, options?: {
    iconScale?: number;
}): Promise<Buffer>;
//# sourceMappingURL=image-processing.d.ts.map