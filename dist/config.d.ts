import type { TvOSImageCreatorConfig } from "./types.js";
interface CLIArgs {
    icon?: string;
    background?: string;
    color?: string;
    darkColor?: string;
    config?: string;
    output?: string;
    iconBorderRadius?: string;
}
export declare function resolveConfig(cliArgs: CLIArgs): TvOSImageCreatorConfig;
export interface ImageValidationResult {
    warnings: string[];
    iconSourceSize: number;
}
export declare function validateInputImages(config: TvOSImageCreatorConfig): Promise<ImageValidationResult>;
export {};
//# sourceMappingURL=config.d.ts.map