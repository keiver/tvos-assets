import { existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { CONFIG_FILENAME } from "../config.js";

const SCHEMA_URL = "https://raw.githubusercontent.com/keiver/tvos-assets/main/schema.json";

/**
 * A starter config carrying only the keys most projects touch. Every other key
 * is optional and documented in schema.json, which editors pick up via $schema.
 */
const TEMPLATE = {
  $schema: SCHEMA_URL,
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
  const path = resolve(cwd, target && target !== "true" ? target : join(cwd, CONFIG_FILENAME));

  if (existsSync(path)) {
    throw new Error(`Refusing to overwrite an existing file: ${path}. Delete or rename it first.`);
  }

  writeFileSync(path, `${JSON.stringify(TEMPLATE, null, 2)}\n`, "utf-8");
  return { path };
}
