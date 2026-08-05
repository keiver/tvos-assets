jest.setTimeout(60000);

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestIcon, createTestBackground } from "./fixtures/create-fixtures";

const TMP = join(__dirname, "../.test-tmp-cli");
const CLI = join(__dirname, "../src/index.ts");
const REPO_ROOT = join(__dirname, "..");

const execOpts: ExecFileSyncOptions = {
  encoding: "utf-8",
  timeout: 50000,
};

function runCLIIn(cwd: string, args: string[]): string {
  return execFileSync("npx", ["tsx", CLI, ...args], { ...execOpts, cwd }) as string;
}

function runCLI(args: string[]): string {
  return runCLIIn(REPO_ROOT, args);
}

function runCLIExpectErrorIn(cwd: string, args: string[]): string {
  try {
    execFileSync("npx", ["tsx", CLI, ...args], {
      ...execOpts,
      cwd,
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

function runCLIExpectError(args: string[]): string {
  return runCLIExpectErrorIn(REPO_ROOT, args);
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
    expect(output).toContain("tvos-assets");
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
    expect(zipListing).toContain("preview.html");
  });

  it("omits preview.html with --no-preview", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const outputDir = join(TMP, "no-preview");
    mkdirSync(outputDir, { recursive: true });

    runCLI(["--icon", icon, "--background", bg, "--color", "#F39C12", "--output", outputDir, "--no-preview"]);

    const zipPath = join(outputDir, readdirSync(outputDir).filter((f) => f.endsWith(".zip"))[0]);
    const zipListing = execFileSync("unzip", ["-l", zipPath], { encoding: "utf-8" }) as string;
    expect(zipListing).not.toContain("preview.html");
    expect(zipListing).toContain("icon.png");
  });
});

describe("CLI config file", () => {
  /**
   * Regression: --icon-border-radius used to carry a Commander default of "0",
   * so cliArgs.iconBorderRadius was never undefined and the ?? chain in
   * resolveConfig could never fall through to the config file value.
   */
  it("honors inputs.iconBorderRadius from a config file when the flag is absent", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const configPath = join(TMP, "radius.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#1C1C1E", iconBorderRadius: 137 },
      }),
    );

    const output = runCLI(["--config", configPath, "--dry-run"]);
    expect(output).toContain("137px");
  });

  it("lets an explicit --icon-border-radius override the config file", async () => {
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    const configPath = join(TMP, "radius-override.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#1C1C1E", iconBorderRadius: 137 },
      }),
    );

    const output = runCLI(["--config", configPath, "--icon-border-radius", "42", "--dry-run"]);
    expect(output).toContain("42px");
    expect(output).not.toContain("137px");
  });

  it("auto-detects tvos-assets.config.json in the working directory", async () => {
    const projectDir = join(TMP, "project");
    mkdirSync(projectDir, { recursive: true });
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    writeFileSync(
      join(projectDir, "tvos-assets.config.json"),
      JSON.stringify({ inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#00FF00" } }),
    );

    const output = runCLIIn(projectDir, ["--dry-run"]);
    expect(output).toContain("auto-detected");
    expect(output).toContain("#00FF00");
  });

  it("prefers an explicit --config over the auto-detected one", async () => {
    const projectDir = join(TMP, "project-explicit");
    mkdirSync(projectDir, { recursive: true });
    const icon = await createTestIcon(TMP);
    const bg = await createTestBackground(TMP);
    writeFileSync(
      join(projectDir, "tvos-assets.config.json"),
      JSON.stringify({ inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#00FF00" } }),
    );
    const explicit = join(TMP, "explicit.json");
    writeFileSync(
      explicit,
      JSON.stringify({ inputs: { iconImage: icon, backgroundImage: bg, backgroundColor: "#0000FF" } }),
    );

    const output = runCLIIn(projectDir, ["--config", explicit, "--dry-run"]);
    expect(output).toContain("#0000FF");
    expect(output).not.toContain("auto-detected");
  });
});

describe("CLI overrides", () => {
  let icon: string;
  let bg: string;

  beforeEach(async () => {
    icon = await createTestIcon(TMP);
    bg = await createTestBackground(TMP);
  });

  function dryRun(extra: string[]): string {
    return runCLI(["--icon", icon, "--background", bg, "--color", "#F39C12", "--dry-run", ...extra]);
  }

  it("applies --set to any config path", () => {
    const output = dryRun(["--set", "brandAssets.name=FromSet"]);
    expect(output).toContain("FromSet.brandassets");
  });

  it("rejects an unknown --set path", () => {
    const output = runCLIExpectError([
      "--icon", icon,
      "--background", bg,
      "--color", "#F39C12",
      "--set", "brandAssets.nope=x",
    ]);
    expect(output).toContain('has no key "nope"');
  });

  it("lets a named flag win over --set", () => {
    const output = dryRun(["--set", "brandAssets.name=FromSet", "--brand-name", "FromFlag"]);
    expect(output).toContain("FromFlag.brandassets");
    expect(output).not.toContain("FromSet.brandassets");
  });

  it("drops the iOS appiconset with --no-ios-icon", () => {
    expect(dryRun(["--no-ios-icon"])).not.toContain(".appiconset");
  });

  it("drops the splash assets with --no-splash", () => {
    const output = dryRun(["--no-splash"]);
    expect(output).not.toContain("SplashScreenLogo");
    expect(output).not.toContain("SplashScreenBackground");
  });

  it("keeps only the iOS families with --platforms ios", () => {
    const output = dryRun(["--platforms", "ios"]);
    expect(output).not.toContain(".brandassets");
    expect(output).toContain(".appiconset");
  });

  it("rejects an unknown platform", () => {
    const output = runCLIExpectError([
      "--icon", icon,
      "--background", bg,
      "--color", "#F39C12",
      "--platforms", "watchos",
    ]);
    expect(output).toContain('Unknown platform "watchos"');
  });

  it("writes nothing during a dry run", () => {
    const outputDir = join(TMP, "dry");
    mkdirSync(outputDir, { recursive: true });
    const output = dryRun(["--output", outputDir]);
    expect(output).toContain("nothing was written");
    expect(readdirSync(outputDir)).toHaveLength(0);
  });

  it("--print-config emits the fully merged config as JSON", () => {
    const output = runCLI([
      "--icon", icon,
      "--background", bg,
      "--color", "#F39C12",
      "--set", "splashScreen.logo.baseSize=333",
      "--print-config",
    ]);
    const parsed = JSON.parse(output);
    expect(parsed.splashScreen.logo.baseSize).toBe(333);
    expect(parsed.inputs.backgroundColor).toBe("#F39C12");
  });
});

describe("CLI --init", () => {
  it("writes a starter config and refuses to overwrite it", () => {
    const projectDir = join(TMP, "init-project");
    mkdirSync(projectDir, { recursive: true });

    const output = runCLIIn(projectDir, ["--init"]);
    expect(output).toContain("Created");

    const configPath = join(projectDir, "tvos-assets.config.json");
    const written = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(written.$schema).toContain("schema.json");
    expect(written.inputs.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const second = runCLIExpectErrorIn(projectDir, ["--init"]);
    expect(second).toContain("Refusing to overwrite");
  });
});
