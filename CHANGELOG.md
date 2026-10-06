# Changelog

## [Unreleased]
- docs(readme): rewritten in plainer language for iOS and the App Store art as well as Apple TV;
  the options table now covers `appStore.video` (fps, codec, audio, audioStart, audioEnd).
- chore(deps): `package-lock.json` records the optional `@expo/config-plugins` peer dependency
  `package.json` already declares, so installs no longer rewrite it.

## [1.6.1] - 2026-10-06
- fix(preview): keep appStore.video.audio relative in preview.html (#12)

- fix(preview): `appStore.video.audio` shows in preview.html's resolved config relative to the
  page, like every other path, instead of as an absolute path under the home directory.

## [1.6.0] - 2026-10-06
- feat(app-store): App Store creative assets: header, search results, universal and In-App Event media, from the icon or row artwork, with looping videos (#10)

- feat(app-store): App Store creative assets for iOS 27 and iPadOS 27 (`--app-store`, config
  `appStore`, plugin prop `appStore`): `header.png` (3840x1646), `search-results.png`
  (3840x2560) and `universal.png` (5244x2950), opaque, art in Apple's template safe areas, plus
  opt-in In-App Event media (`event-card.png` 3840x2160, `event-details.png` 2160x3840).
  Per placement: finished artwork (`source`), row artwork re-tiled to each canvas, a row-motion
  loop video (`animate`), or a recording cut into a seamless loop (`video`); `enabled` skips a
  placement. Videos are H.264 High with a silent stereo track via libx264 (or ProRes 422 HQ, on
  VideoToolbox on a Mac). Row-motion frames are blended from layers drawn once, several at a
  time: a 20 s 4K header loop takes about 30 s on an M1 Max. Shapes drawn on top of a card ride
  its row, handing over to the next card at the loop seam. `video.audio` adds music to every video,
  looped with a crossfade from a stretch picked between `video.audioStart` and `video.audioEnd`.
  Unchanged outputs are skipped. `preview.html` outlines the safe areas and plays the videos.
  Six example row artwork files in `examples/row-artwork/`. Row artwork videos play SVG
  `<animate>` on its shapes frame by frame.

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
