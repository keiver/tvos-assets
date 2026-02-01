import { createWriteStream, unlinkSync } from "node:fs";
import archiver from "archiver";

export interface ZipEntry {
  /** Absolute path to file or directory on disk */
  sourcePath: string;
  /** Name inside the zip (e.g. "Images.xcassets" or "icon.png") */
  zipName: string;
  type: "directory" | "file";
}

/** Format a Date as YYYYMMDD-HHmmss in local time */
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Generate a timestamped zip filename */
export function generateZipFilename(date?: Date): string {
  return `tvos-assets-${formatTimestamp(date ?? new Date())}.zip`;
}

/** Create a zip archive from a list of entries */
export async function createZip(entries: ZipEntry[], outputZipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputZipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });
    let settled = false;

    function cleanup(err: Error): void {
      if (settled) return;
      settled = true;
      archive.abort();
      output.destroy();
      try {
        unlinkSync(outputZipPath);
      } catch {
        // Best-effort removal of partial file
      }
      reject(err);
    }

    output.on("close", () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    output.on("error", (err: Error) => cleanup(err));
    archive.on("error", (err: Error) => cleanup(err));

    archive.pipe(output);

    for (const entry of entries) {
      if (entry.type === "directory") {
        archive.directory(entry.sourcePath, entry.zipName);
      } else {
        archive.file(entry.sourcePath, { name: entry.zipName });
      }
    }

    archive.finalize();
  });
}
