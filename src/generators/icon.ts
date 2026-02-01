import type { TvOSImageCreatorConfig } from "../types.js";
import { safeWriteFile } from "../utils/fs.js";
import { compositeIconOnBackground } from "../utils/image-processing.js";

export async function generateIcon(config: TvOSImageCreatorConfig, iconOutputPath: string, iconSourceSize?: number): Promise<void> {
  const buffer = await compositeIconOnBackground(
    config.inputs.backgroundImage,
    config.inputs.iconImage,
    1024,
    1024,
    {
      opaque: true,
      borderRadius: config.inputs.iconBorderRadius,
      sourceIconSize: iconSourceSize,
    },
  );
  safeWriteFile(iconOutputPath, buffer);
}
