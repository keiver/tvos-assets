import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, validateInputImages } from "../src/config";
import { createTestPng, createTestBackground, createTestIcon } from "./fixtures/create-fixtures";

const TMP = join(__dirname, "../.test-tmp-validation");

beforeAll(async () => {
  mkdirSync(TMP, { recursive: true });
  // Create oversized fixtures — tiny on disk due to solid-color compression
  await createTestPng(join(TMP, "huge-icon.png"), 9000, 9000, { transparent: true });
  await createTestPng(join(TMP, "huge-bg.png"), 9000, 2000);
  // Need a valid-sized background to pair with huge icon, and vice versa
  await createTestBackground(TMP);
  await createTestIcon(TMP);
});

afterAll(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

describe("validateInputImages — oversized dimension warnings", () => {
  it("warns when icon dimensions exceed 8192px", async () => {
    const hugeIcon = join(TMP, "huge-icon.png");
    const bg = join(TMP, "background.png");
    const config = resolveConfig({ icon: hugeIcon, background: bg, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("very large"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("9000"))).toBe(true);
  });

  it("warns when background dimensions exceed 8192px", async () => {
    const icon = join(TMP, "icon.png");
    const hugeBg = join(TMP, "huge-bg.png");
    const config = resolveConfig({ icon, background: hugeBg, color: "#FF0000" });
    const result = await validateInputImages(config);
    expect(result.warnings.some((w) => w.includes("very large"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("9000"))).toBe(true);
  });
});
