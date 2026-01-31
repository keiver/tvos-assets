import { mkdirSync, rmSync, existsSync, writeFileSync, lstatSync } from "node:fs";
import { join } from "node:path";

const SAFETY_MARKERS = ["package.json", "src", ".git", "node_modules"];

export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

export function cleanDir(dirPath: string): void {
  if (!existsSync(dirPath)) return;

  // Refuse to clean a symlink target
  const stat = lstatSync(dirPath);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Refusing to clean "${dirPath}" — it is a symbolic link. Use a real directory path instead.`,
    );
  }

  // Refuse to delete a directory that looks like a project root
  const hasMarker = SAFETY_MARKERS.some((m) => existsSync(join(dirPath, m)));
  if (hasMarker) {
    throw new Error(
      `Refusing to clean "${dirPath}" — it contains project files (${SAFETY_MARKERS.join(", ")}). ` +
      `Use a dedicated output directory like "./Images.xcassets" instead.`,
    );
  }

  rmSync(dirPath, { recursive: true, force: true });
}

function wrapWriteError(err: unknown, filePath: string): never {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOSPC") {
    throw new Error(`Disk full — could not write: ${filePath}`);
  }
  if (code === "EACCES" || code === "EPERM") {
    throw new Error(`Permission denied — could not write: ${filePath}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`Failed to write ${filePath}: ${message}`);
}

/** Write a Contents.json with Xcode-style formatting (space before colon, trailing newline) */
export function writeContentsJson(filePath: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2).replace(/"(\w[^"]*)":/g, '"$1" :');
  try {
    writeFileSync(filePath, json + "\n");
  } catch (err) {
    wrapWriteError(err, filePath);
  }
}

/** Write a buffer to a file with contextual error handling */
export function safeWriteFile(filePath: string, data: Buffer): void {
  try {
    writeFileSync(filePath, data);
  } catch (err) {
    wrapWriteError(err, filePath);
  }
}
