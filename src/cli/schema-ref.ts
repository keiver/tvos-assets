import { existsSync, copyFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";

/** Filename used when the schema has to be copied next to the config. */
export const LOCAL_SCHEMA_COPY = "tvos-assets.schema.json";

const PACKAGE_NAME = "tvos-assets";

/** Render a path for JSON `$schema`: relative, posix separators, explicitly local. */
function toSchemaRef(fromDir: string, target: string): string {
  const rel = relative(fromDir, target).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * Find an installed copy of this package, walking up from the config directory
 * so hoisted monorepo node_modules are found too.
 */
function findInstalledSchema(fromDir: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, "node_modules", PACKAGE_NAME, "schema.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export type SchemaRefSource = "installed" | "copied" | "unavailable";

export interface SchemaRef {
  /** Value for the config's `$schema` key, or undefined when none could be provided. */
  ref?: string;
  source: SchemaRefSource;
  /** Absolute path of the schema copy written next to the config, when one was. */
  copiedTo?: string;
}

/**
 * Resolve what `$schema` should point at for a config being written into
 * `configDir`.
 *
 * Prefers a locally installed copy, because that reference stays valid for
 * teammates who clone the repo and survives package upgrades. Global and npx
 * installs have no such copy, and their real paths are either machine-specific
 * or a temporary npx cache, so the schema is copied next to the config instead.
 * Neither branch needs the network.
 *
 * `packagedSchema` is the absolute path of the schema.json shipped with this
 * package. It is passed in rather than derived from this module's own location,
 * so nothing here depends on how the file was loaded.
 */
export function resolveSchemaRef(configDir: string, packagedSchema: string): SchemaRef {
  const installed = findInstalledSchema(configDir);
  if (installed) {
    return { ref: toSchemaRef(configDir, installed), source: "installed" };
  }

  if (!existsSync(packagedSchema)) {
    return { source: "unavailable" };
  }

  const destination = join(configDir, LOCAL_SCHEMA_COPY);
  // An existing copy is left alone; overwriting is not this command's job.
  if (!existsSync(destination)) {
    copyFileSync(packagedSchema, destination);
  }
  return { ref: `./${LOCAL_SCHEMA_COPY}`, source: "copied", copiedTo: destination };
}
