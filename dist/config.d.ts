import type { TvOSImageCreatorConfig } from "./types.js";
export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export interface CLIArgs {
    icon?: string;
    background?: string;
    color?: string;
    darkColor?: string;
    config?: string;
    output?: string;
    /** Write Images.xcassets directly into this directory instead of a zip. */
    outDir?: string;
    iconBorderRadius?: string;
    iconDark?: string;
    iconTinted?: string;
    /** Programmatic config overrides; higher precedence than a config file, lower than explicit args. */
    overrides?: DeepPartial<TvOSImageCreatorConfig>;
}
export declare function isSvgPath(filePath: string): boolean;
export declare function resolveConfig(cliArgs: CLIArgs): TvOSImageCreatorConfig;
export interface ImageValidationResult {
    warnings: string[];
    iconSourceSize: number;
}
export declare function validateInputImages(config: TvOSImageCreatorConfig): Promise<ImageValidationResult>;
//# sourceMappingURL=config.d.ts.map