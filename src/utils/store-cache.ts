import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { safeWriteFile } from "./fs.js";

/** Bump when the App Store renderers change what they draw, so older outputs are redrawn. */
const RENDERER = "1";

/** Hash of everything an output is made from: file contents for paths, values for the rest. */
export function inputKey(files: (string | undefined)[], settings: unknown): string {
  const hash = createHash("sha256").update(RENDERER).update(JSON.stringify(settings));
  for (const file of files) hash.update(file && existsSync(file) ? readFileSync(file) : String(file));
  return hash.digest("hex");
}

/**
 * `.tvos-assets-store.json` in the output directory: the input key each App Store file was last
 * written from, so a run (an Expo prebuild, say) skips files whose inputs have not changed.
 */
export class StoreCache {
  private readonly path: string;
  private readonly entries: Record<string, string>;

  constructor(private readonly dir: string) {
    this.path = join(dir, ".tvos-assets-store.json");
    try {
      this.entries = JSON.parse(readFileSync(this.path, "utf8")) as Record<string, string>;
    } catch {
      this.entries = {};
    }
  }

  fresh(filename: string, key: string): boolean {
    return this.entries[filename] === key && existsSync(join(this.dir, filename));
  }

  record(filename: string, key: string): void {
    this.entries[filename] = key;
    safeWriteFile(this.path, Buffer.from(JSON.stringify(this.entries, null, 2) + "\n"));
  }
}
