import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatTimestamp, generateZipFilename, createZip } from "../../src/utils/zip";

const TMP = join(__dirname, "../../.test-tmp-zip");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

describe("formatTimestamp", () => {
  it("formats a date as YYYYMMDD-HHmmss", () => {
    // Use a specific date to avoid timezone issues — just check format
    const date = new Date(2026, 0, 15, 14, 30, 45); // Jan 15 2026, 14:30:45 local
    const result = formatTimestamp(date);
    expect(result).toMatch(/^\d{8}-\d{6}$/);
    expect(result).toBe("20260115-143045");
  });

  it("pads single-digit months and days", () => {
    const date = new Date(2026, 2, 5, 9, 5, 3); // Mar 5 2026, 09:05:03 local
    const result = formatTimestamp(date);
    expect(result).toBe("20260305-090503");
  });
});

describe("generateZipFilename", () => {
  it("returns a filename with tvos-assets prefix and .zip extension", () => {
    const filename = generateZipFilename();
    expect(filename).toMatch(/^tvos-assets-\d{8}-\d{6}\.zip$/);
  });

  it("uses provided date", () => {
    const date = new Date(2026, 5, 20, 12, 0, 0);
    const filename = generateZipFilename(date);
    expect(filename).toBe("tvos-assets-20260620-120000.zip");
  });
});

describe("createZip", () => {
  it("creates a zip file from a directory and a file", async () => {
    // Create a temp directory with content
    const contentDir = join(TMP, "TestDir");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, "file1.txt"), "hello");
    writeFileSync(join(contentDir, "file2.txt"), "world");

    // Create a standalone file
    const standaloneFile = join(TMP, "standalone.txt");
    writeFileSync(standaloneFile, "standalone content");

    const zipPath = join(TMP, "test-output.zip");
    await createZip(
      [
        { sourcePath: contentDir, zipName: "TestDir", type: "directory" },
        { sourcePath: standaloneFile, zipName: "standalone.txt", type: "file" },
      ],
      zipPath,
    );

    expect(existsSync(zipPath)).toBe(true);

    // Verify it's a valid zip (starts with PK magic bytes)
    const buffer = readFileSync(zipPath);
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("creates a zip from a single file entry", async () => {
    const filePath = join(TMP, "single.txt");
    writeFileSync(filePath, "single file content");

    const zipPath = join(TMP, "single-output.zip");
    await createZip(
      [{ sourcePath: filePath, zipName: "single.txt", type: "file" }],
      zipPath,
    );

    expect(existsSync(zipPath)).toBe(true);
    const buffer = readFileSync(zipPath);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
