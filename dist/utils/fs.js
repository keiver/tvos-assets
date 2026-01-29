import { mkdirSync, rmSync, existsSync } from "node:fs";
export function ensureDir(dirPath) {
    mkdirSync(dirPath, { recursive: true });
}
export function cleanDir(dirPath) {
    if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true });
    }
}
//# sourceMappingURL=fs.js.map