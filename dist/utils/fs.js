import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
const SAFETY_MARKERS = ["package.json", "src", ".git", "node_modules"];
export function ensureDir(dirPath) {
    mkdirSync(dirPath, { recursive: true });
}
export function cleanDir(dirPath) {
    if (!existsSync(dirPath))
        return;
    // Refuse to delete a directory that looks like a project root
    const hasMarker = SAFETY_MARKERS.some((m) => existsSync(join(dirPath, m)));
    if (hasMarker) {
        throw new Error(`Refusing to clean "${dirPath}" — it contains project files (${SAFETY_MARKERS.join(", ")}). ` +
            `Use a dedicated output directory like "./Images.xcassets" instead.`);
    }
    rmSync(dirPath, { recursive: true, force: true });
}
//# sourceMappingURL=fs.js.map