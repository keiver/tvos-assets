import { readFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { writeContentsJson, ensureDir, cleanDir } from "../../src/utils/fs";

const TMP_DIR = join(__dirname, "../../.test-tmp");

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe("writeContentsJson", () => {
  it("adds a space before colons in keys (Xcode style)", () => {
    const filePath = join(TMP_DIR, "Contents.json");
    writeContentsJson(filePath, { info: { author: "xcode", version: 1 } });

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"info" :');
    expect(content).toContain('"author" :');
    expect(content).toContain('"version" :');
    expect(content).not.toMatch(/"info":/);
  });

  it("ends with a trailing newline", () => {
    const filePath = join(TMP_DIR, "Contents.json");
    writeContentsJson(filePath, { info: { author: "xcode", version: 1 } });

    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(/\n$/);
  });

  it("uses 2-space indentation", () => {
    const filePath = join(TMP_DIR, "Contents.json");
    writeContentsJson(filePath, { info: { author: "xcode", version: 1 } });

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('  "info"');
  });

  it("does not add space before colons in string values", () => {
    const filePath = join(TMP_DIR, "Contents.json");
    writeContentsJson(filePath, { color: { "color-space": "srgb" } });

    const content = readFileSync(filePath, "utf-8");
    // "color-space" has a hyphen so the regex should still match it
    expect(content).toContain('"color-space" :');
    // The value "srgb" must not get an extra space
    expect(content).toContain(': "srgb"');
  });

  it("writes valid JSON (ignoring Xcode formatting)", () => {
    const filePath = join(TMP_DIR, "Contents.json");
    const data = {
      images: [
        { filename: "icon@1x.png", idiom: "tv", scale: "1x" },
        { filename: "icon@2x.png", idiom: "tv", scale: "2x" },
      ],
      info: { author: "xcode", version: 1 },
    };
    writeContentsJson(filePath, data);

    const content = readFileSync(filePath, "utf-8");
    // Replace Xcode-style " :" back to standard ":" for JSON.parse
    const normalized = content.replace(/" :/g, '":');
    expect(() => JSON.parse(normalized)).not.toThrow();
    expect(JSON.parse(normalized)).toEqual(data);
  });

  it("matches Xcode sample format for a simple info-only file", () => {
    const filePath = join(TMP_DIR, "Contents.json");
    writeContentsJson(filePath, { info: { author: "xcode", version: 1 } });

    const expected =
      '{\n  "info" : {\n    "author" : "xcode",\n    "version" : 1\n  }\n}\n';
    expect(readFileSync(filePath, "utf-8")).toBe(expected);
  });
});

describe("ensureDir", () => {
  it("creates a nested directory", () => {
    const dir = join(TMP_DIR, "a", "b", "c");
    ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
  });
});

describe("cleanDir", () => {
  it("removes an existing directory", () => {
    const dir = join(TMP_DIR, "to-clean");
    mkdirSync(dir, { recursive: true });
    expect(existsSync(dir)).toBe(true);

    cleanDir(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it("does nothing if the directory does not exist", () => {
    expect(() => cleanDir(join(TMP_DIR, "nonexistent"))).not.toThrow();
  });

  it("refuses to clean a directory with project markers", () => {
    const dir = join(TMP_DIR, "fake-root");
    mkdirSync(join(dir, "src"), { recursive: true });

    expect(() => cleanDir(dir)).toThrow(/Refusing to clean/);
  });

  it("refuses to clean a symbolic link", () => {
    const realDir = join(TMP_DIR, "real");
    mkdirSync(realDir, { recursive: true });
    const linkDir = join(TMP_DIR, "link-to-dir");
    symlinkSync(realDir, linkDir);
    expect(() => cleanDir(linkDir)).toThrow(/symbolic link/);
  });
});
