# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLI tool that generates a complete tvOS `Images.xcassets` bundle from an icon PNG, a background PNG, and a hex color. Produces all required Brand Assets (3-layer parallax app icons), Top Shelf images, splash screen assets, and a standalone `icon.png` — packaged as a timestamped zip file for Xcode/React Native tvOS projects.

## Commands

```bash
npm run build        # Compile TypeScript → dist/
npm run dev          # Run from source (tsx src/index.ts)
npm start            # Run compiled version (node dist/index.js)
npm test             # Run Jest tests
```

Run with arguments during development:
```bash
npx tsx src/index.ts --icon ./input/icon.png --background ./input/bg.png --color "#F39C12"
npx tsx src/index.ts --config ./examples/tvos-assets.config.json
```

Note: the CLI auto-discovers `tvos-assets.config.json` in the working directory. Do not put one at the repo root — it would hijack `npm run dev` and every spawned-CLI test in `tests/cli.test.ts` (which runs with `cwd` set to the repo root). The example config lives in `examples/` for exactly this reason.

## Architecture

**Entry point**: `src/index.ts` — CLI parsing (Commander), config resolution, temp-dir generation, zip creation.

**CLI helpers** (`src/cli/`):
- `set-option.ts` — `--set key.path=value` parsing. Validates each path by walking a real config instance from `configShapeTemplate()` and coerces the value to that leaf's type. Optional keys absent from defaults (variant icons, per-layer `imagePath`) come from an explicit allowlist
- `init.ts` — `--init` starter config template and writer; refuses to overwrite

**Config resolution** (`src/config.ts`): Four-layer merge — built-in defaults → JSON config file → `overrides` (`--set` and named flags, also the plugin's channel) → explicit CLI input args (highest priority). Validates inputs exist, color is valid hex. Resolves `darkBackgroundColor`: explicit CLI/overrides/config value wins, otherwise auto-darkened from `backgroundColor` via `darkenHex()`. Also exports `discoverConfigPath()` and `configShapeTemplate()`.

Gotcha: never give a Commander `.option()` a default value for anything that also lives in the config file. A default makes `cliArgs.X` always defined, so the `cliArgs.X ?? overrides ?? fileConfig.X` chain can never fall through and the config value is silently discarded. This was a real bug with `--icon-border-radius`; `tests/cli.test.ts` locks it down.

**Generators** (`src/generators/`):
- `brand-assets.ts` — Orchestrates Brand Assets folder: calls imagestack + imageset generators
- `imagestack.ts` — 3-layer parallax app icons (Front/Middle: icon on transparent canvas; Back: opaque background). Handles both small icon and App Store icon variants
- `imageset.ts` — Top Shelf images (icon composited on background, opaque) and splash screen logo (icon on transparent, multiple scales/idioms)
- `colorset.ts` — Splash screen background colorset with light/dark + universal/tv variants
- `icon.ts` — Standalone 1024×1024 opaque icon.png
- `contents-json.ts` — All Contents.json builders. Uses Xcode's format: space before colons, 2-space indent, trailing newline
- `preview.ts` / `preview-html.ts` — Self-contained `preview.html` contact sheet. Walks the catalog that was actually written rather than re-deriving filenames from config, so renamed bundles and disabled assets are reflected for free. Thumbnails are WebP data URIs declared once each as `--iN` CSS custom properties and referenced by both the thumbnail grid and the parallax stack

**Utils** (`src/utils/`):
- `image-processing.ts` — Sharp pipelines: resize, composite icon on background (60% of shortest dimension, centered), render on transparent canvas
- `fs.ts` — `ensureDir`, `cleanDir` (refuses to delete directories containing project markers like `package.json`, `.git`, `src`), `writeContentsJson`
- `zip.ts` — `formatTimestamp`, `generateZipFilename`, `createZip` — archiver-based zip creation for timestamped output
- `color.ts` — Hex→RGBA conversion, RGBA→Apple component strings (3 decimal places), `darkenHex()` for HSL-based lightness reduction

**Types** (`src/types.ts`): Config types, asset definitions, Contents.json structures. Key types: `TvOSImageCreatorConfig` (master config), `ImageStackAssetConfig`, `ImageSetAssetConfig`.

## Key Conventions

- **ESM module** with Node16 module resolution, ES2022 target, strict TypeScript
- **Sharp** is the sole image processing library — all PNG operations go through it
- **Contents.json format** must match Xcode exactly: `writeContentsJson()` in `src/utils/fs.ts` adds a space before every colon via regex replacement
- **Directory safety**: `cleanDir()` checks for safety markers before deleting — never bypass this (used in tests only; main flow uses temp dirs)
- **Generated output**: Timestamped zip (e.g. `tvos-assets-20260131-141523.zip`) containing `Images.xcassets/` + `icon.png` + `preview.html`. Generated in a temp dir, then moved atomically to the output directory. A default run is 44 files: 21 Contents.json + 21 PNGs + icon.png + preview.html
- **File counting**: `planAssets()` in `src/lib.ts` is the single source of truth for what a run writes, shared by `--dry-run` and the completion summary. Update it whenever a generator changes what it emits
- **Icon scaling**: Icons are rendered at 60% of the shortest canvas dimension, centered — this ratio is hardcoded in the image processing utils
- **`dist/` is never committed**: it is gitignored, and `prepare: "npm run build"` builds it on install, before publish, and for git dependencies. Do not `git add -f` build output. A partial `dist/` was tracked until this was fixed, and it was missing `lib.js`, so git installs were broken while `git status` looked clean. The `test-pr.yml` "Check for uncommitted changes" gate only works while `dist/` stays untracked

## Testing

Tests use Jest with ts-jest. Test files mirror source structure under `tests/`. Coverage spans utilities (fs, color), Contents.json builders, generators, the config resolver, the `--set` parser, the preview renderer, and the CLI.

`tests/cli.test.ts` spawns the real binary via `npx tsx`, so it is the slow suite (50s per-call timeout). Anything that can be tested against a pure function should be, `tests/cli/set-option.test.ts` being the model. Reserve spawned-CLI cases for behavior that only appears through Commander, such as flag defaults and config auto-discovery.
