jest.setTimeout(60000);

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTestIcon, createTestBackground } from "./fixtures/create-fixtures";

const TMP = join(__dirname, "../.test-tmp-cli");
const CLI = join(__dirname, "../src/index.ts");

const execOpts: ExecFileSyncOptions = {
  encoding: "utf-8",
  timeout: 50000,
};

function runCLI(args: string[]): string {
  return execFileSync("npx", ["tsx", CLI, ...args], {
    ...execOpts,
    cwd: join(__dirname, ".."),
  }) as string;
}

function runCLIExpectError(args: string[]): string {
  try {
    execFileSync("npx", ["tsx", CLI, ...args], {
      ...execOpts,
      cwd: join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"],
    });
    throw new Error("Expected CLI to exit with error but it succeeded");
  } catch (err: unknown) {
    const execErr = err as { status: number; stderr?: Buffer | string; stdout?: Buffer | string };
    if (execErr.status === undefined) throw err; // Re-throw unexpected errors
    const stderr = execErr.stderr?.toString() ?? "";
    const stdout = execErr.stdout?.toString() ?? "";
    return stderr + stdout;
  }
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
});

describe("CLI", () => {
  it("--help shows usage info", () => {
    const output = runCLI(["--help"]);
    expect(output).toContain("tvos-image-creator");
    expect(output).toContain("--icon");
    expect(output).toContain("--background");
    expect(output).toContain("--color");
  });

  it("--version shows version number", () => {
    const output = runCLI(["--version"]);
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("exits with error when missing required args", () => {
    const output = runCLIExpectError([]);
    expect(output).toContain("Icon image is required");
  });

  it("exits with error for invalid color format", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const output = runCLIExpectError([
      "--icon", icon,
      "--background", bg,
      "--color", "not-a-color",
    ]);
    expect(output).toContain("Invalid color format");
  });

  it("exits with error when icon file not found", () => {
    const output = runCLIExpectError([
      "--icon", "/nonexistent/icon.png",
      "--background", "/nonexistent/bg.png",
      "--color", "#FF0000",
    ]);
    expect(output).toContain("not found");
  });

  it("exits with error when output directory is not writable", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const output = runCLIExpectError([
      "--icon", icon,
      "--background", bg,
      "--color", "#FF0000",
      "--output", "/proc/not-writable",
    ]);
    expect(output).toContain("not writable");
  });

  it("successfully generates a zip file with valid inputs", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const outputDir = join(TMP, "cli-output");
    mkdirSync(outputDir, { recursive: true });

    const output = runCLI([
      "--icon", icon,
      "--background", bg,
      "--color", "#F39C12",
      "--output", outputDir,
    ]);

    expect(output).toContain("Done!");
    // Check zip file was created
    const zipFiles = readdirSync(outputDir).filter((f) => f.endsWith(".zip"));
    expect(zipFiles).toHaveLength(1);
    expect(zipFiles[0]).toMatch(/^tvos-assets-\d{8}-\d{6}\.zip$/);

    // Validate zip contents
    const zipPath = join(outputDir, zipFiles[0]);
    const zipListing = execFileSync("unzip", ["-l", zipPath], {
      encoding: "utf-8",
    }) as string;

    expect(zipListing).toContain("Images.xcassets/");
    expect(zipListing).toContain("icon.png");
  });
});
