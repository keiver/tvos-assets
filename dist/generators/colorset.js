import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir } from "../utils/fs.js";
import { colorSetContentsJson } from "./contents-json.js";
export function generateColorSet(parentDir, bgConfig, config) {
    if (!bgConfig.enabled)
        return;
    const colorsetDir = join(parentDir, `${bgConfig.name}.colorset`);
    ensureDir(colorsetDir);
    const contents = colorSetContentsJson(bgConfig.universal.light, bgConfig.universal.dark, bgConfig.tv.light, bgConfig.tv.dark, config.xcassetsMeta);
    writeFileSync(join(colorsetDir, "Contents.json"), JSON.stringify(contents, null, 2));
}
//# sourceMappingURL=colorset.js.map