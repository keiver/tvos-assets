# Changelog

## [Unreleased]

## [1.5.0] - 2026-09-07
- feat(icons): size the mark to Apple's proportions, assemble it from layer art (#9)

- feat(icons): the mark is sized to Apple's proportions instead of a hardcoded
  0.6 of the shorter side. The icon is normalized to the square its visible
  artwork occupies before scaling, so the number means "the mark covers N% of
  the canvas" no matter how much transparent margin the source carries. New
  `--ios-icon-scale` (default 0.8, Apple's icon grid) and `--tv-icon-scale`
  (default 0.75, inside Apple's 10-15% parallax safe margin). One content box is
  measured per run and shared by every surface and every parallax layer, which
  keeps the layers registered.
- feat(config): `--icon` is optional when every icon layer carries its own art.
  The flat icon is assembled from that art back to front and used for the iOS
  appiconset, Top Shelf images, splash logo, and `icon.png`, so a project with
  parallax layers no longer maintains a hand-flattened third copy of them.

## [1.4.1] - 2026-08-05
- fix(preview): keep the home directory out of preview.html paths (#8)


## [1.4.0] - 2026-08-05
- feat(cli): full config parity, preview.html, and DX pass (#7)


## [1.3.1] - 2026-08-05
- chore: 1.3.1 - republish with expanded 1.3.0 docs (#6)


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
