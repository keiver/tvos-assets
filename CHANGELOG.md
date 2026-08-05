# Changelog

## [Unreleased]

### Behavior changes

No API or flag was removed or renamed, so this is a minor release. Three changes can alter output on upgrade without you changing anything:

- **Config auto-discovery.** A `tvos-assets.config.json` in the working directory is now loaded when `--config` is omitted. If you have one sitting next to a script that previously ran on flags alone, its non-input keys (asset names, sizes, scales) now apply. Explicit `--icon`, `--background`, and `--color` still win. Point `--config` elsewhere to opt out.
- **`inputs.iconBorderRadius` is finally honored through the CLI.** It was silently forced to `0` (see Fixed). If your config file sets a radius, your icons will now actually be rounded.
- **`preview.html` is written into the zip by default**, so a default run is 44 files instead of 43. Use `--no-preview` if a script consumes the zip contents positionally. Directory output (`--out-dir`) does not write it unless you pass `--preview`.

### Fixed
- `--icon-border-radius` carried a Commander default of `"0"`, so `inputs.iconBorderRadius` from a config file was silently ignored whenever the tool ran through the CLI. The flag now has no default and the config value is honored.
- The banner labelled the dark color `(auto)` even when a config file supplied `darkBackgroundColor` explicitly.
- `dist/` was gitignored yet 44 build artifacts were tracked, and the set was incomplete: `dist/lib.js` (imported by `plugin/index.cjs`), `dist/check-node-version.js`, `dist/utils/zip.js`, `dist/generators/appiconset.js`, and `dist/generators/icon.js` were never committed, so installing the package from git produced a CLI that failed on its first import. `dist/` is now untracked, and a `prepare` script builds it on install, including for git dependencies. This also unbreaks the "Check for uncommitted changes" CI gate, which failed whenever a rebuild touched one of the tracked artifacts.

### Added
- Full config-to-CLI parity. `--set <path=value>` overrides any key the config file accepts, validated against the real config shape and coerced to the type each key expects. Repeatable.
- Named flags for the common cases: `--brand-name`, `--ios-icon-name`, `--splash-logo-name`, `--splash-background-name`, `--splash-logo-size`, `--layer-front/middle/back`, `--mode`, `--no-ios-icon`, `--no-top-shelf`, `--no-splash`.
- Config file auto-discovery: `tvos-assets.config.json` in the working directory is used when `--config` is omitted.
- `preview.html`, a self-contained contact sheet of every generated image, written into the zip. Includes true pixel dimensions, an interactive parallax view of both imagestacks, alpha checkerboards, colorset swatches, and light/dark theming. On by default for zip output, off for `--out-dir`. Toggle with `--preview` / `--no-preview`.
- `--platforms <tvos,ios>` exposes the platform filter that was previously library and plugin only.
- `--dry-run` reports the asset directories and file counts without writing.
- `--print-config` prints the fully merged config as JSON, for debugging precedence.
- `--init [path]` scaffolds a starter config. Refuses to overwrite an existing file.
- `--quiet` prints only errors and the final output path.
- `planAssets(config, options)` exported from the library, shared by `--dry-run` and the completion summary.
- `generateAssets` accepts `previewPath` and `toolVersion`.

### Changed
- `--set inputs.*` values are now consulted when resolving the required inputs, so `--set` can supply the icon, background, or color on its own.
- README restructured: table of contents, grouped CLI reference, a CLI/config/plugin parity table, `--set` reference, Xcode wiring guide, CI recipes, and a troubleshooting section. Corrected the generated file count, which had been stale since the iOS appiconset landed in 1.3.0.
- The example config moved to `examples/tvos-assets.config.json`, refreshed for 1.3.0 keys and no longer setting the ignored `output.cleanBeforeGenerate`.
- `prepare: "npm run build"` replaces the build half of `prepublishOnly`, which is now just `npm test`. Publishing still ships a fresh `dist/`, and git installs now build themselves.

## [1.3.0] - 2026-08-04
- v1.3.0: iOS app icons, Expo config plugin, programmatic API, SVG input (#4)


## [1.2.1] - 2026-02-01
- fix: remove incorrect warn about icon 1024x1024 size (#3)


## [1.2.0] - 2026-02-01
- Dark color support (#2)


## [1.1.0] - 2026-02-01
- 1.0.1 release trigger and doc cleanup (#1)


## [1.0.0] - 2026-01-31

- Generate complete tvOS Images.xcassets from icon and background images
- Brand Assets with 3-layer parallax app icons (Front/Middle/Back)
- Top Shelf images (standard and wide)
- Splash screen logo imageset and background colorset
- Standalone 1024x1024 icon.png
- JSON config file support with schema validation
- CLI with config file, output directory, and color options
- Configurable brandAssets.name (defaults to "AppIcon")
- Input validation: symlink detection, PNG format verification, dimension checks
