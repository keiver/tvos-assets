import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG_FILENAME } from "../config.js";

/**
 * schema.json ships inside the package, so point at the installed copy rather
 * than a URL. It needs no network, and it always describes the version that is
 * actually installed instead of whatever happens to be on the default branch.
 */
const SCHEMA_PATH = "./node_modules/tvos-assets/schema.json";

/**
 * A starter config carrying only the keys most projects touch. Every other key
 * is optional and documented in schema.json, which editors pick up via $schema.
 */
const TEMPLATE = {
  $schema: SCHEMA_PATH,
  inputs: {
    iconImage: "./assets/icon.png",
    backgroundImage: "./assets/background.png",
    backgroundColor: "#B43939",
    iconBorderRadius: 0,
  },
  output: {
    directory: "./tvos-assets-output",
    mode: "zip",
  },
  brandAssets: {
    name: "AppIcon",
  },
  iosIcon: {
    enabled: true,
    name: "AppIcon",
  },
  splashScreen: {
    logo: { enabled: true, name: "SplashScreenLogo" },
    background: { enabled: true, name: "SplashScreenBackground" },
  },
};

export interface InitResult {
  path: string;
}

/**
 * Write a starter config. Refuses to touch an existing file: overwriting
 * someone's configuration is never the helpful reading of `--init`.
 */
export function initConfigFile(target?: string, cwd: string = process.cwd()): InitResult {
  const path = resolve(cwd, target ?? CONFIG_FILENAME);

  if (existsSync(path)) {
    throw new Error(`Refusing to overwrite an existing file: ${path}. Delete or rename it first.`);
  }

  writeFileSync(path, `${JSON.stringify(TEMPLATE, null, 2)}\n`, "utf-8");
  return { path };
}
