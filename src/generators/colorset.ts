import { join } from "node:path";
import type { SplashScreenBackgroundConfig, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir, writeContentsJson } from "../utils/fs.js";
import { colorSetContentsJson } from "./contents-json.js";

export function generateColorSet(
  parentDir: string,
  bgConfig: SplashScreenBackgroundConfig,
  config: TvOSImageCreatorConfig,
): void {
  if (!bgConfig.enabled) return;

  const colorsetDir = join(parentDir, `${bgConfig.name}.colorset`);
  ensureDir(colorsetDir);

  const contents = colorSetContentsJson(
    bgConfig.universal.light,
    bgConfig.universal.dark,
    bgConfig.tv.light,
    bgConfig.tv.dark,
    config.xcassetsMeta,
  );

  writeContentsJson(join(colorsetDir, "Contents.json"), contents);
}
