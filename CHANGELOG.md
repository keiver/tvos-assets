# Changelog

## [Unreleased]

- feat(app-store): scene artwork. Any SVG `source` becomes a placement's video with
  `animate: { loop, elements }`: each rule in `elements` selects elements of the file (`#id`, `tag`,
  `#id tag`) and writes an `<animate>` on every one in SMIL's own words, `stagger` spreading their
  starts, and the file as played is written beside the still (`header.svg`). Frames come from the
  Google Chrome on the machine (or `CHROME_PATH`), seeked per frame, so the video is what a browser
  plays for the same file. `universal` takes `elements` without `loop`, for its still. Row artwork's
  `rows` and `rise` are unchanged.

## [1.9.0] - 2026-10-15
- feat(splash): splash logo per device type, written after expo-splash-screen (#17)


- fix(plugin): the splash logo and color reach the build. `expo-splash-screen` deletes and rewrites
  `SplashScreenLogo.imageset` and `SplashScreenBackground.colorset` in its dangerous mod, and Expo
  runs the dangerous mod of a plugin listed later first, so its splash replaced this plugin's in
  every build. The plugin writes the splash in a finalized mod, after every dangerous mod, wherever
  it sits in the list.
- feat(splash): `splashScreen.logo.idioms` takes one entry per device type (`universal`, `iphone`,
  `ipad`, `tv`, `mac`), each with `size`, `scales`, `image` and `darkImage`. An entry without
  `scales` gets the ones Apple's HIG lists for the device. `universal` is always written. 1.8's
  `splashScreen.logo.universal` and `splashScreen.logo.tv` are read as those entries.
- feat(splash): `splashScreen.logo.image` and `darkImage` draw the logo from its own art; a dark image
  adds dark appearance entries. The plugin's `splash` prop sets all of it with `image`, `darkImage`,
  `size`, `idioms`, `backgroundColor` and `darkBackgroundColor`, and rejects a prop it doesn't know.
- feat(splash): the logo size is its width and the height follows the art, so a wordmark is no
  longer padded into a square. Square art comes out the same.
- feat(top-shelf): `brandAssets.topShelfImage.backgroundImage` and `.iconScale` (and the same on
  `topShelfImageWide`) give a Top Shelf image its own backdrop and mark size; the app icons keep
  `inputs.backgroundImage` and `brandAssets.iconScale`.
- fix(config): Top Shelf backgrounds and splash art are checked to hold PNG or SVG data, like the
  other optional inputs.
- fix(config): an unknown splash device type or key, a scale the device doesn't use, a repeated
  scale or a size that isn't a whole number fails with a message naming it.
- fix(preview): splash art paths in the resolved config are shown relative, like every other path,
  and the art is listed under Inputs.
- feat(preview): the splash logo section shows the logo each device loads, at its size in points,
  centred on the splash color on an iPhone 17 Pro Max (440x956pt), iPad Pro 13-inch (1032x1376pt)
  and Apple TV (1920x1080pt) screen, plus dark screens when the dark splash looks different.
- fix(preview): a relative `--config` path no longer shows as `../../Users/<name>/...` when the page
  is written outside the home directory, and `--print-config` no longer wraps between its hyphens.

## [1.8.0] - 2026-10-13
- chore(deps): sharp 0.35.5 and the Node 20.9 floor (#16)


- chore(deps): sharp 0.35.5, the first release with the advisories in its bundled libvips, libheif
  and librsvg fixed (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w). sharp 0.35
  requires Node.js 20.9, so that is the floor here too: `engines.node` is `>=20.9.0` and the CLI
  exits with an error on anything older.

## [1.7.0] - 2026-10-10
- feat(app-store): animate.rise, row artwork whose cards rise out of the surface and sink back (#14)


- feat(app-store): `animate: { rise: seconds }` beside `animate: { rows: seconds }`. Row artwork's
  cards come up out of an empty surface and sink back a few at a time, in a loop that closes. The
  look is the SVG's own: what is drawn through the mask fades in with its card, and the file's
  filters (`feOffset`, `feDropShadow`, `feGaussianBlur`) grow with the card's height, so a drop
  shadow lengthens as the card lifts. Cards that draw the same share their frames: a 20 s 4K
  header takes about 40 s on an M1 Max. `animate.rows` is unchanged.
- fix(app-store): stills of row artwork with filters are drawn past the canvas and cropped, so
  the shadow of a card cut by the canvas edge matches every other card's. Stills of art without
  filters are byte for byte what they were, and are not redrawn.
- fix(cli): `--set appStore.<placement>.animate.rows=20`, as the README shows it, is accepted; it
  failed with `Unknown --set path`.

## [1.6.2] - 2026-10-06
- docs(readme): rewrite in plainer language, App Store video options; lockfile peer dependency (#13)

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
