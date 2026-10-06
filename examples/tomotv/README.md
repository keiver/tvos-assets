# Worked example: TomoTV

A real brand run end to end, not a synthetic fixture. The source art is the set
[TomoTV](https://github.com/keiver/tomotv) ships, and the config mirrors its
`app.json` plugin block, so `output/` is byte for byte what the app's prebuild
writes.

```
brand/                       source art (inputs)
  layer-front.svg            1024x1024, front parallax layer
  layer-middle.svg           1024x1024, middle parallax layer
  background.png             4640x1440, opaque
  background-appstore.png    back layer of the App Store imagestack
  artwork.svg                row artwork for the App Store creative assets
tvos-assets.config.json      the config below
output/                      generated, committed so you can inspect it without running anything
  Images.xcassets/
  AppStore/                  header, search results and universal images, header and search-results videos
  icon.png
  preview.html               open this first
```

Open [`output/preview.html`](output/preview.html) in a browser. Images are
embedded, so it works straight from a clone with no server and no network; the
two videos play from `output/AppStore/` beside it. Point at either app icon to
see the three parallax layers separate the way tvOS moves them on focus.

## The command

`tvos-assets.config.json` sits in this directory, so the CLI auto-discovers it
and the command takes no arguments:

```bash
cd examples/tomotv
tvos-assets
```

From a clone of this repo, run the CLI from source instead:

```bash
cd examples/tomotv
npx tsx ../../src/index.ts
```

Both write `output/` exactly as committed here: **49 files**, 21 `Contents.json`
+ 21 PNGs + `icon.png` + `preview.html` + 5 App Store assets. The two videos
take a few minutes to render the first time; `output/AppStore/.tvos-assets-store.json`
records what each file was made from, so later runs skip anything unchanged.

### Per-platform variants

The committed `output/` covers both platforms. To generate one family only:

```bash
# tvOS brand assets only (no AppIcon.appiconset) -> 45 files
npx tsx ../../src/index.ts --platforms tvos --out-dir ./out-tvos

# iOS app icon only (no AppIcon.brandassets) -> 19 files
npx tsx ../../src/index.ts --platforms ios --out-dir ./out-ios
```

Splash and App Store assets are generated either way. Check what a run would
write without writing it:

```bash
npx tsx ../../src/index.ts --dry-run
```

## The config

TomoTV's `app.json` plugin block, which this config reproduces:

```json
["tvos-assets/plugin", {
  "background": "./assets/brand/background.png",
  "color": "#F39C12",
  "darkColor": "#1C1C1E",
  "iosIconScale": 0.68,
  "layers": {
    "front": "./assets/brand/layer-front.svg",
    "middle": "./assets/brand/layer-middle.svg"
  },
  "appStore": {
    "outDir": "./applestore/generated/listing",
    "header": { "source": "./applestore/listing/artwork.svg", "animate": { "rows": 20 } },
    "searchResults": { "source": "./applestore/listing/artwork.svg", "animate": { "rows": 20 } },
    "universal": { "source": "./applestore/listing/artwork.svg" }
  },
  "config": "./tvos-assets.config.json"
}]
```

The full config is in [`tvos-assets.config.json`](tvos-assets.config.json). The
parts that matter:

| Setting | Value | Why |
|---|---|---|
| `inputs.iconImage` | not set | Both icon layers carry their own art, so the flat icon is assembled from them. |
| `inputs.backgroundImage` | `./brand/background.png` | 4640x1440, the recommended size. Anything smaller makes Top Shelf @2x look upscaled. |
| `inputs.backgroundColor` | `#F39C12` | Splash background, light appearance. |
| `inputs.darkBackgroundColor` | `#1C1C1E` | Set explicitly. Omit it and a 50% darkened variant is derived from `backgroundColor`. |
| `brandAssets.*.layers.front.imagePath` | `./brand/layer-front.svg` | Real parallax art. Without it, Front and Middle both render the whole icon and the depth effect is flat. |
| `brandAssets.*.layers.middle.imagePath` | `./brand/layer-middle.svg` | Applied to both imagestacks, matching what the plugin's `layers` prop does. |
| `brandAssets.appIconLarge.layers.back.imagePath` | `./brand/background-appstore.png` | The App Store imagestack gets its own back layer. |
| `iosIcon.iconScale` | `0.68` | The plugin's `iosIconScale`: the mark covers 68% of the iOS icon. |
| `appStore.{header,searchResults}` | `source` + `animate: { rows: 20 }` | Row artwork re-tiled to each canvas, plus a 20 s loop where the rows slide and TOMO TV stays put. |
| `appStore.universal` | `source` | Same artwork; universal takes no video. |
| `output.mode` | `"dir"` | Writes the catalog straight into `output/` instead of a timestamped zip. |

## Why the layers line up

Both layer SVGs are exported from the **same 1024x1024 artboard**. Icon-sourced
layers are placed identically (one content box measured per run, one scale for
every layer), so shared artboard geometry is what keeps them registered in the
stack. Export a layer from a cropped or differently sized artboard and it will
drift against the others.

`iconBorderRadius` is deliberately not applied to custom layer art.

## Why universal sits off centre

The TOMO TV card in `artwork.svg` sits right of the artwork's centre. The header
and search-results safe areas fit it whole, but universal's is narrower, so the
artwork shifts left until the card fits and the next card shows a sliver. The
outlines in `preview.html` show each safe area.

## Equivalent without a config file

The catalog is reachable from flags, which is useful for one-off runs (the App
Store back layer and the creative assets need the config file or `--set`):

```bash
npx tsx ../../src/index.ts \
  --background ./brand/background.png \
  --color "#F39C12" \
  --dark-color "#1C1C1E" \
  --ios-icon-scale 0.68 \
  --layer-front ./brand/layer-front.svg \
  --layer-middle ./brand/layer-middle.svg \
  --out-dir ./output
```

`--layer-front` and `--layer-middle` apply to both imagestacks, exactly as the
config's per-stack `imagePath` entries do here.
