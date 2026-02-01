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
npx tsx src/index.ts --config ./tvos-assets.config.json
```

## Architecture

**Entry point**: `src/index.ts` — CLI parsing (Commander), config resolution, temp-dir generation, zip creation.

**Config resolution** (`src/config.ts`): Three-layer merge — built-in defaults → JSON config file → CLI args (highest priority). Validates inputs exist, color is valid hex. Resolves `darkBackgroundColor`: explicit CLI/config value wins, otherwise auto-darkened from `backgroundColor` via `darkenHex()`.

**Generators** (`src/generators/`):
- `brand-assets.ts` — Orchestrates Brand Assets folder: calls imagestack + imageset generators
- `imagestack.ts` — 3-layer parallax app icons (Front/Middle: icon on transparent canvas; Back: opaque background). Handles both small icon and App Store icon variants
- `imageset.ts` — Top Shelf images (icon composited on background, opaque) and splash screen logo (icon on transparent, multiple scales/idioms)
- `colorset.ts` — Splash screen background colorset with light/dark + universal/tv variants
- `icon.ts` — Standalone 1024×1024 opaque icon.png
- `contents-json.ts` — All Contents.json builders. Uses Xcode's format: space before colons, 2-space indent, trailing newline

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
- **Generated output**: Timestamped zip (e.g. `tvos-assets-20260131-141523.zip`) containing `Images.xcassets/` + `icon.png`. Generated in a temp dir, then moved atomically to the output directory
- **Icon scaling**: Icons are rendered at 60% of the shortest canvas dimension, centered — this ratio is hardcoded in the image processing utils

## Testing

Tests use Jest with ts-jest. Test files mirror source structure under `tests/`. Current coverage focuses on utilities (fs, color) and Contents.json builders. Image processing functions are not unit tested (they depend on Sharp and file I/O).
