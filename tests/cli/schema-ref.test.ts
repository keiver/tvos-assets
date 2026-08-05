import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSchemaRef, LOCAL_SCHEMA_COPY } from "../../src/cli/schema-ref";

/** The schema.json this package ships; the CLI passes its real path in at runtime. */
const PACKAGED_SCHEMA = join(__dirname, "..", "..", "schema.json");

/**
 * Isolated under the OS temp dir on purpose: resolveSchemaRef walks up looking
 * for node_modules/tvos-assets, and a fixture inside the repo would find the
 * repo's own tree.
 */
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tvos-schema-ref-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function fakeInstall(at: string): string {
  const dir = join(at, "node_modules", "tvos-assets");
  mkdirSync(dir, { recursive: true });
  const schema = join(dir, "schema.json");
  writeFileSync(schema, JSON.stringify({ title: "fake" }));
  return schema;
}

describe("the packaged schema", () => {
  it("exists where the CLI expects it, next to package.json", () => {
    expect(existsSync(PACKAGED_SCHEMA)).toBe(true);
    const parsed = JSON.parse(readFileSync(PACKAGED_SCHEMA, "utf-8"));
    expect(parsed.title).toBe("tvos-assets configuration");
  });

  it("is listed in the package files, so it reaches consumers", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));
    expect(pkg.files).toContain("schema.json");
  });
});

describe("resolveSchemaRef with a local install", () => {
  it("points at the installed copy and writes nothing", () => {
    fakeInstall(root);
    const result = resolveSchemaRef(root, PACKAGED_SCHEMA);

    expect(result.source).toBe("installed");
    expect(result.ref).toBe("./node_modules/tvos-assets/schema.json");
    expect(result.copiedTo).toBeUndefined();
    expect(existsSync(join(root, LOCAL_SCHEMA_COPY))).toBe(false);
  });

  it("finds a hoisted install from a nested workspace package", () => {
    fakeInstall(root);
    const workspace = join(root, "packages", "app");
    mkdirSync(workspace, { recursive: true });

    const result = resolveSchemaRef(workspace, PACKAGED_SCHEMA);

    expect(result.source).toBe("installed");
    expect(result.ref).toBe("../../node_modules/tvos-assets/schema.json");
    expect(existsSync(join(workspace, LOCAL_SCHEMA_COPY))).toBe(false);
  });

  it("always emits posix separators, whatever the platform", () => {
    fakeInstall(root);
    const result = resolveSchemaRef(root, PACKAGED_SCHEMA);
    expect(result.ref).not.toContain("\\");
  });
});

describe("resolveSchemaRef without a local install (global or npx)", () => {
  it("copies the packaged schema next to the config and references it", () => {
    const result = resolveSchemaRef(root, PACKAGED_SCHEMA);

    expect(result.source).toBe("copied");
    expect(result.ref).toBe(`./${LOCAL_SCHEMA_COPY}`);
    expect(result.copiedTo).toBe(join(root, LOCAL_SCHEMA_COPY));

    const copied = JSON.parse(readFileSync(join(root, LOCAL_SCHEMA_COPY), "utf-8"));
    expect(copied.title).toBe("tvos-assets configuration");
    expect(copied.properties.inputs).toBeDefined();
  });

  it("never emits a URL or an absolute machine path", () => {
    const result = resolveSchemaRef(root, PACKAGED_SCHEMA);
    expect(result.ref).not.toMatch(/^https?:/);
    expect(result.ref).not.toMatch(/^file:/);
    expect(result.ref?.startsWith("./")).toBe(true);
  });

  it("leaves an existing schema copy untouched", () => {
    const existing = join(root, LOCAL_SCHEMA_COPY);
    writeFileSync(existing, '{"title":"do not clobber"}');

    const result = resolveSchemaRef(root, PACKAGED_SCHEMA);

    expect(result.source).toBe("copied");
    expect(JSON.parse(readFileSync(existing, "utf-8")).title).toBe("do not clobber");
  });

  it("reports unavailable rather than throwing when the schema is missing", () => {
    const result = resolveSchemaRef(root, join(root, "does-not-exist.json"));

    expect(result.source).toBe("unavailable");
    expect(result.ref).toBeUndefined();
    expect(existsSync(join(root, LOCAL_SCHEMA_COPY))).toBe(false);
  });
});
