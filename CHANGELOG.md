# Changelog

## [Unreleased]

## [1.3.0] - 2026-08-04
- iOS AppIcon.appiconset generation: 1024x1024 light, dark, and tinted (iOS 18+) variants; dark/tinted auto-derived or overridable via --icon-dark/--icon-tinted
- Expo config plugin (tvos-assets/plugin): regenerates assets on every prebuild, tvOS brandassets + Info.plist icon keys under EXPO_TV=1, iOS appiconset otherwise
- Programmatic API: generateAssets(config, xcassetsDir, options) exported from package root
- Direct-directory output mode: --out-dir writes Images.xcassets without zipping; owned asset dirs are cleaned, other catalog entries untouched
- SVG input support for icon, background, variant, and layer images; rasterized at per-output density
- Per-layer imagestack imagePath for true parallax art

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
