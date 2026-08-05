import { configShapeTemplate } from "../config.js";
import type { DeepPartial } from "../config.js";
import type { TvOSImageCreatorConfig } from "../types.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Config paths that are legal but absent from a default config instance, so
 * they cannot be discovered by walking the template. All are optional strings.
 */
const OPTIONAL_STRING_PATHS: ReadonlySet<string> = new Set([
  "inputs.iconDarkImage",
  "inputs.iconTintedImage",
  ...["appIconSmall", "appIconLarge"].flatMap((stack) =>
    ["front", "middle", "back"].map((layer) => `brandAssets.${stack}.layers.${layer}.imagePath`),
  ),
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce a raw string to match the type of the value already living at that path. */
function coerceToTemplateType(raw: string, template: unknown, path: string): unknown {
  if (Array.isArray(template)) {
    const items = raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (items.length === 0) {
      throw new Error(`--set ${path}: expected a comma-separated list, got an empty value.`);
    }
    return items;
  }

  if (typeof template === "number") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(`--set ${path}: expected a number, got "${raw}".`);
    }
    return parsed;
  }

  if (typeof template === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`--set ${path}: expected "true" or "false", got "${raw}".`);
  }

  return raw;
}

export interface ParsedSetEntry {
  path: string[];
  value: unknown;
}

/**
 * Parse one `--set key.path=value` entry, validating the path against the shape
 * of a real config and coercing the value to the type that path expects.
 */
export function parseSetEntry(entry: string): ParsedSetEntry {
  const separator = entry.indexOf("=");
  if (separator === -1) {
    throw new Error(`Invalid --set "${entry}". Expected key.path=value (e.g. --set iosIcon.enabled=false).`);
  }

  const rawPath = entry.slice(0, separator).trim();
  const rawValue = entry.slice(separator + 1);

  if (!rawPath) {
    throw new Error(`Invalid --set "${entry}". Missing the key path before "=".`);
  }
  if (!rawValue) {
    throw new Error(`Invalid --set "${entry}". Missing a value after "=".`);
  }

  const path = rawPath.split(".");
  for (const segment of path) {
    if (!segment) {
      throw new Error(`Invalid --set path "${rawPath}". Empty path segment.`);
    }
    if (DANGEROUS_KEYS.has(segment)) {
      throw new Error(`Invalid --set path "${rawPath}". The "${segment}" key is not allowed.`);
    }
  }

  // Walk a real config instance to validate the path and learn the leaf's type.
  let cursor: unknown = configShapeTemplate();
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const walked = path.slice(0, i).join(".");

    if (!isPlainObject(cursor)) {
      throw new Error(`Invalid --set path "${rawPath}". "${walked}" is a value, not a section.`);
    }
    if (!(segment in cursor)) {
      if (OPTIONAL_STRING_PATHS.has(rawPath)) {
        return { path, value: rawValue };
      }
      const known = Object.keys(cursor).join(", ");
      const at = walked ? `"${walked}"` : "the config root";
      throw new Error(`Unknown --set path "${rawPath}". ${at} has no key "${segment}". Available: ${known}.`);
    }
    cursor = cursor[segment];
  }

  if (isPlainObject(cursor)) {
    throw new Error(
      `Invalid --set path "${rawPath}". That is a section, not a value. Set one of: ${Object.keys(cursor).join(", ")}.`,
    );
  }

  return { path, value: coerceToTemplateType(rawValue, cursor, rawPath) };
}

/** Commander collector for the repeatable --set option. */
export function collectSet(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

/** Write a value into a nested object, creating intermediate objects as needed. */
export function setDeep(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target;
  for (const segment of path.slice(0, -1)) {
    if (!isPlainObject(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

/** Turn every `--set` entry into a single deep-partial override object. */
export function buildOverridesFromSet(entries: string[]): DeepPartial<TvOSImageCreatorConfig> {
  const overrides: Record<string, unknown> = {};
  for (const entry of entries) {
    const { path, value } = parseSetEntry(entry);
    setDeep(overrides, path, value);
  }
  return overrides as DeepPartial<TvOSImageCreatorConfig>;
}
