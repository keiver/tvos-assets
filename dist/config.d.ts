import type { TvOSImageCreatorConfig } from "./types.js";
interface CLIArgs {
    icon?: string;
    background?: string;
    color?: string;
    config?: string;
    output?: string;
}
export declare function resolveConfig(cliArgs: CLIArgs): TvOSImageCreatorConfig;
export {};
//# sourceMappingURL=config.d.ts.map