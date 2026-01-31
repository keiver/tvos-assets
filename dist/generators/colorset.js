import { join } from "node:path";
import { ensureDir, writeContentsJson } from "../utils/fs.js";
import { colorSetContentsJson } from "./contents-json.js";
export function generateColorSet(parentDir, bgConfig, config) {
    if (!bgConfig.enabled)
        return;
    const colorsetDir = join(parentDir, `${bgConfig.name}.colorset`);
    ensureDir(colorsetDir);
    const contents = colorSetContentsJson(bgConfig.universal.light, bgConfig.universal.dark, bgConfig.tv.light, bgConfig.tv.dark, config.xcassetsMeta);
    writeContentsJson(join(colorsetDir, "Contents.json"), contents);
}
//# sourceMappingURL=colorset.js.map