# Worked example: TomoTV

A real brand run end to end, not a synthetic fixture. The source art is the same
set [TomoTV](https://github.com/keiver/tomotv) ships, so `output/` is what an
actual app gets.

```
brand/                     source art (inputs)
  icon.svg                 1024x1024, transparent
  background.png           4640x1440, opaque
  layer-front.svg          1024x1024, front parallax layer
  layer-middle.svg         1024x1024, middle parallax layer
tvos-assets.config.json    the config below
output/                    generated, committed so you can inspect it without running anything
  Images.xcassets/
  icon.png
  preview.html             open this first
```

Open [`output/preview.html`](output/preview.html) in a browser. It is
self-contained, so it works straight from a clone with no server and no network.
Point at either app icon to see the three parallax layers separate the way tvOS
moves them on focus.

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

Both write `output/` exactly as committed here: **44 files**, 21 `Contents.json`
+ 21 PNGs + `icon.png` + `preview.html`.

### Per-platform variants

The committed `output/` covers both platforms. To generate one family only:

```bash
# tvOS brand assets only (no AppIcon.appiconset) -> 40 files
npx tsx ../../src/index.ts --platforms tvos --out-dir ./out-tvos

# iOS app icon only (no AppIcon.brandassets) -> 14 files
npx tsx ../../src/index.ts --platforms ios --out-dir ./out-ios
```

Splash assets are generated either way. Check what a run would write without
writing it:

```bash
npx tsx ../../src/index.ts --dry-run
```

## The config

The values mirror TomoTV's real `app.json` plugin block, so the CLI output and
the Expo prebuild output match:

```json
["tvos-assets/plugin", {
  "icon": "./assets/brand/icon.svg",
  "background": "./assets/brand/background.png",
  "color": "#F39C12",
  "darkColor": "#1C1C1E",
  "layers": {
    "front": "./assets/brand/layer-front.svg",
    "middle": "./assets/brand/layer-middle.svg"
  }
}]
```

The full config is in [`tvos-assets.config.json`](tvos-assets.config.json). The
parts that matter:

| Setting | Value | Why |
|---|---|---|
| `inputs.iconImage` | `./brand/icon.svg` | SVG, so every output size rasterizes at its own density instead of upscaling one PNG. |
| `inputs.backgroundImage` | `./brand/background.png` | 4640x1440, the recommended size. Anything smaller makes Top Shelf @2x look upscaled. |
| `inputs.backgroundColor` | `#F39C12` | Splash background, light appearance. |
| `inputs.darkBackgroundColor` | `#1C1C1E` | Set explicitly. Omit it and a 50% darkened variant is derived from `backgroundColor`. |
| `brandAssets.*.layers.front.imagePath` | `./brand/layer-front.svg` | Real parallax art. Without it, Front and Middle both render the whole icon and the depth effect is flat. |
| `brandAssets.*.layers.middle.imagePath` | `./brand/layer-middle.svg` | Applied to both imagestacks, matching what the plugin's `layers` prop does. |
| `output.mode` | `"dir"` | Writes the catalog straight into `output/` instead of a timestamped zip. |

## Why the layers line up

All four SVGs are exported from the **same 1024x1024 artboard**. Icon-sourced
layers are placed identically (centered, scaled to 60% of the shorter output
side), so shared artboard geometry is what keeps them registered in the stack.
Export a layer from a cropped or differently sized artboard and it will drift
against the others.

`iconBorderRadius` is deliberately not applied to custom layer art, only to the
shared icon input.

## Equivalent without a config file

Everything here is reachable from flags, which is useful for one-off runs:

```bash
npx tsx ../../src/index.ts \
  --icon ./brand/icon.svg \
  --background ./brand/background.png \
  --color "#F39C12" \
  --dark-color "#1C1C1E" \
  --layer-front ./brand/layer-front.svg \
  --layer-middle ./brand/layer-middle.svg \
  --out-dir ./output
```

`--layer-front` and `--layer-middle` apply to both imagestacks, exactly as the
config's per-stack `imagePath` entries do here.
