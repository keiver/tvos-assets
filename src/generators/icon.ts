import { dirname, join } from "node:path";
import type { TvOSImageCreatorConfig } from "../types.js";
import { safeWriteFile } from "../utils/fs.js";
import { compositeIconOnBackground } from "../utils/image-processing.js";

export async function generateIcon(config: TvOSImageCreatorConfig): Promise<void> {
  const buffer = await compositeIconOnBackground(
    config.inputs.backgroundImage,
    config.inputs.iconImage,
    1024,
    1024,
    { opaque: true },
  );
  const outputPath = join(dirname(config.output.directory), "icon.png");
  safeWriteFile(outputPath, buffer);
}
