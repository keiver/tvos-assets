import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { CONFIG_FILENAME } from "../config.js";
import { resolveSchemaRef, type SchemaRefSource } from "./schema-ref.js";

/**
 * A starter config carrying only the keys most projects touch. Every other key
 * is optional and documented in schema.json, which editors pick up via $schema.
 */
const TEMPLATE = {
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
  /** How `$schema` was satisfied: from an installed copy, a local copy, or not at all. */
  schemaSource: SchemaRefSource;
  /** Absolute path of the schema copy written next to the config, when one was. */
  schemaCopiedTo?: string;
}

/**
 * Write a starter config. Refuses to touch an existing file: overwriting
 * someone's configuration is never the helpful reading of `--init`.
 *
 * `$schema` is resolved against however this package happens to be installed,
 * so editor validation works for local, global, and npx runs alike.
 */
export function initConfigFile(
  target: string | undefined,
  packagedSchema: string,
  cwd: string = process.cwd(),
): InitResult {
  const path = resolve(cwd, target ?? CONFIG_FILENAME);

  if (existsSync(path)) {
    throw new Error(`Refusing to overwrite an existing file: ${path}. Delete or rename it first.`);
  }

  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });

  const schema = resolveSchemaRef(directory, packagedSchema);
  const config = schema.ref ? { $schema: schema.ref, ...TEMPLATE } : TEMPLATE;

  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return { path, schemaSource: schema.source, schemaCopiedTo: schema.copiedTo };
}
