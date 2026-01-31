import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";

/** Create a solid-color PNG at a given size */
export async function createTestPng(
  filePath: string,
  width: number,
  height: number,
  options?: { transparent?: boolean },
): Promise<void> {
  const transparent = options?.transparent ?? false;
  const channels = transparent ? 4 : 3;
  const background = transparent
    ? { r: 255, g: 0, b: 0, alpha: 0.5 }
    : { r: 100, g: 150, b: 200 };

  const buffer = await sharp({
    create: {
      width,
      height,
      channels: channels as 3 | 4,
      background,
    },
  })
    .png()
    .toBuffer();

  const dir = join(filePath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, buffer);
}

/** Create a valid 1280x1280 icon PNG (above recommended minimum) */
export async function createTestIcon(dir: string): Promise<string> {
  const filePath = join(dir, "icon.png");
  await createTestPng(filePath, 1280, 1280, { transparent: true });
  return filePath;
}

/** Create a valid 4640x1440 background PNG */
export async function createTestBackground(dir: string): Promise<string> {
  const filePath = join(dir, "background.png");
  await createTestPng(filePath, 4640, 1440);
  return filePath;
}

/** Create a small icon PNG that's below minimum */
export async function createSmallIcon(dir: string): Promise<string> {
  const filePath = join(dir, "small-icon.png");
  await createTestPng(filePath, 100, 100, { transparent: true });
  return filePath;
}

/** Create a small background PNG that's below minimum */
export async function createSmallBackground(dir: string): Promise<string> {
  const filePath = join(dir, "small-bg.png");
  await createTestPng(filePath, 200, 200);
  return filePath;
}

/** Create a symlink to a PNG */
export function createSymlink(target: string, linkPath: string): void {
  symlinkSync(target, linkPath);
}

/** Create a non-PNG text file with .txt extension */
export function createTextFile(dir: string): string {
  const filePath = join(dir, "notimage.txt");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, "this is not a PNG");
  return filePath;
}

/** Create an invalid JSON config file */
export function createBadJsonConfig(dir: string): string {
  const filePath = join(dir, "bad-config.json");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, '{ "inputs": { broken json }');
  return filePath;
}

/** Create a valid JSON config file */
export function createValidConfig(
  dir: string,
  iconPath: string,
  bgPath: string,
): string {
  const filePath = join(dir, "test-config.json");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const config = {
    inputs: {
      iconImage: iconPath,
      backgroundImage: bgPath,
      backgroundColor: "#FF0000",
    },
  };
  writeFileSync(filePath, JSON.stringify(config));
  return filePath;
}
