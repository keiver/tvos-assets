# tvos-image-creator

CLI tool that generates a complete tvOS `Images.xcassets` bundle from an icon and a background image. Produces all required Brand Assets (app icons, Top Shelf images), splash screen logo, and splash screen background color set — ready to drop into an Xcode or React Native tvOS project.

## Requirements

- Node.js >= 18
- npm or yarn

## Installation

```bash
npm install
```

Build the project:

```bash
npm run build
```

## Quick Start

```bash
npx tsx src/index.ts \
  --icon ./sample-content/icon.png \
  --background ./sample-content/source.png \
  --color "#F39C12"
```

This generates `Images.xcassets` on your Desktop with all tvOS assets.

## CLI Options

| Option | Required | Description |
|---|---|---|
| `--icon <path>` | Yes | Path to icon PNG (transparent background) |
| `--background <path>` | Yes | Path to background PNG |
| `--color <hex>` | Yes | Background color hex (e.g. `"#F39C12"`) |
| `--output <path>` | No | Output directory. Defaults to `~/Desktop/Images.xcassets` |
| `--config <path>` | No | Path to a JSON config file for advanced customization |
| `--version` | No | Print version |
| `--help` | No | Show help |

### Priority

CLI arguments override config file values, which override built-in defaults.

### Output Path

When `--output` is omitted the tool writes to `~/Desktop/Images.xcassets`. If the Desktop folder does not exist (e.g. on a Linux server) it falls back to `~/Images.xcassets`.

The output is **idempotent** — if `Images.xcassets` already exists at the target path it is deleted and regenerated from scratch.

## Examples

### Using the included sample content

Generate into an `Images.xcassets` folder in the current directory:

```bash
npx tsx src/index.ts \
  --icon ./sample-content/icon.png \
  --background ./sample-content/source.png \
  --color "#F39C12" \
  --output ./Images.xcassets
```

Generate to Desktop (default when `--output` is omitted):

```bash
npx tsx src/index.ts \
  --icon ./sample-content/icon.png \
  --background ./sample-content/source.png \
  --color "#F39C12"
```

Generate to a specific project path:

```bash
npx tsx src/index.ts \
  --icon ./sample-content/icon.png \
  --background ./sample-content/source.png \
  --color "#F39C12" \
  --output ./my-tvos-app/Images.xcassets
```

### Using your own assets

```bash
npx tsx src/index.ts \
  --icon /path/to/your/icon.png \
  --background /path/to/your/background.png \
  --color "#B43939" \
  --output ./Images.xcassets
```

### Using a config file

```bash
npx tsx src/index.ts --config ./tvos-image-creator.config.json
```

Config file with CLI overrides (CLI args always win):

```bash
npx tsx src/index.ts \
  --config ./tvos-image-creator.config.json \
  --color "#00FF00" \
  --output ./output/Images.xcassets
```

### Using the compiled build

```bash
npm run build
node dist/index.js \
  --icon ./sample-content/icon.png \
  --background ./sample-content/source.png \
  --color "#F39C12"
```

## Generated Assets

The tool produces the following tvOS asset catalog structure:

### Brand Assets

| Asset | Size (points) | Scales | Output Files |
|---|---|---|---|
| App Icon | 400 x 240 | 1x, 2x | 3-layer imagestack (front, middle, back) |
| App Icon - App Store | 1280 x 768 | 1x | 3-layer imagestack |
| Top Shelf Image | 1920 x 720 | 1x, 2x | `top@1x.png`, `top@2x.png` |
| Top Shelf Image Wide | 2320 x 720 | 1x, 2x | `wide@1x.png`, `wide@2x.png` |

**App Icon layers:**
- **Front** — icon composited on background
- **Middle** — icon composited on background
- **Back** — background only (opaque, no alpha)

**Top Shelf images** are composited (icon centered on background) and written as opaque RGB PNGs (no alpha channel), as required by tvOS.

### Splash Screen

| Asset | Type | Output |
|---|---|---|
| SplashScreenLogo | Imageset | Icon on transparent background at 1x/2x/3x (universal) + 1x/2x (tv) |
| SplashScreenBackground | Colorset | Light/dark color definitions for universal + tv idioms |

### Output Directory Structure

```
Images.xcassets/
├── Contents.json
├── Brand Assets.brandassets/
│   ├── Contents.json
│   ├── App Icon.imagestack/
│   │   ├── Contents.json
│   │   ├── Front.imagestacklayer/
│   │   │   ├── Contents.json
│   │   │   └── Content.imageset/
│   │   │       ├── Contents.json
│   │   │       ├── front@1x.png
│   │   │       └── front@2x.png
│   │   ├── Middle.imagestacklayer/
│   │   │   └── Content.imageset/
│   │   │       ├── Contents.json
│   │   │       ├── middle@1x.png
│   │   │       └── middle@2x.png
│   │   └── Back.imagestacklayer/
│   │       └── Content.imageset/
│   │           ├── Contents.json
│   │           ├── back@1x.png
│   │           └── back@2x.png
│   ├── App Icon - App Store.imagestack/
│   │   └── (same structure, 1x only)
│   ├── Top Shelf Image.imageset/
│   │   ├── Contents.json
│   │   ├── top@1x.png
│   │   └── top@2x.png
│   └── Top Shelf Image Wide.imageset/
│       ├── Contents.json
│       ├── wide@1x.png
│       └── wide@2x.png
├── SplashScreenLogo.imageset/
│   ├── Contents.json
│   ├── 200-icon@1x.png
│   ├── 200-icon@2x.png
│   ├── 200-icon@3x.png
│   ├── 200-icon-tv@1x.png    (tv)
│   └── 200-icon-tv@2x.png    (tv)
└── SplashScreenBackground.colorset/
    └── Contents.json
```

## Configuration File

For full control, create a JSON config file. All sections are optional — omitted values use built-in defaults. The config file has a JSON Schema for editor autocompletion and validation.

Add the `$schema` field to enable it:

```json
{
  "$schema": "./schema.json"
}
```

### Minimal config (inputs only)

Everything else uses built-in defaults:

```json
{
  "$schema": "./schema.json",
  "inputs": {
    "iconImage": "./icon.png",
    "backgroundImage": "./background.png",
    "backgroundColor": "#B43939"
  }
}
```

### Full config

```json
{
  "$schema": "./schema.json",
  "inputs": {
    "iconImage": "./icon.png",
    "backgroundImage": "./background.png",
    "backgroundColor": "#B43939"
  },
  "output": {
    "directory": "./Images.xcassets",
    "cleanBeforeGenerate": true
  },
  "brandAssets": {
    "appIconSmall": {
      "enabled": true,
      "name": "App Icon",
      "size": { "width": 400, "height": 240 },
      "scales": ["1x", "2x"],
      "layers": {
        "front": { "source": "icon" },
        "middle": { "source": "icon" },
        "back": { "source": "background" }
      }
    },
    "appIconLarge": {
      "enabled": true,
      "name": "App Icon - App Store",
      "size": { "width": 1280, "height": 768 },
      "scales": ["1x"],
      "layers": {
        "front": { "source": "icon" },
        "middle": { "source": "icon" },
        "back": { "source": "background" }
      }
    },
    "topShelfImage": {
      "enabled": true,
      "name": "Top Shelf Image",
      "size": { "width": 1920, "height": 720 },
      "scales": ["1x", "2x"],
      "filePrefix": "top"
    },
    "topShelfImageWide": {
      "enabled": true,
      "name": "Top Shelf Image Wide",
      "size": { "width": 2320, "height": 720 },
      "scales": ["1x", "2x"],
      "filePrefix": "wide"
    }
  },
  "splashScreen": {
    "logo": {
      "enabled": true,
      "name": "SplashScreenLogo",
      "baseSize": 200,
      "filePrefix": "200-icon",
      "universal": { "scales": ["1x", "2x", "3x"] },
      "tv": { "scales": ["1x", "2x"] }
    },
    "background": {
      "enabled": true,
      "name": "SplashScreenBackground",
      "universal": { "light": "#B43939", "dark": "#B43939" },
      "tv": { "light": "#B43939", "dark": "#B43939" }
    }
  },
  "xcassetsMeta": {
    "author": "xcode",
    "version": 1
  }
}
```

### Config Reference

---

#### `inputs`

Source images and color used to generate all assets.

| Key | Type | Required | Description |
|---|---|---|---|
| `iconImage` | string | Yes | Path to the app icon PNG. Must have a transparent background. Composited onto the background for app icons and Top Shelf images; rendered standalone for the splash logo. |
| `backgroundImage` | string | Yes | Path to the background PNG. Used as the base layer for app icons and Top Shelf images. Resized with cover-fit and center-cropped to each required dimension. |
| `backgroundColor` | string | Yes | Hex color (`#RRGGBB`). Used for the splash screen background colorset. Applied to both light and dark appearances unless overridden in `splashScreen.background`. |

---

#### `output`

Controls where and how the `Images.xcassets` bundle is written.

| Key | Type | Default | Description |
|---|---|---|---|
| `directory` | string | `~/Desktop/Images.xcassets` | Output directory path. The full xcassets structure is generated here. |
| `cleanBeforeGenerate` | boolean | `true` | When `true`, the output directory is deleted and recreated on every run, ensuring a clean build with no stale files. |

---

#### `brandAssets`

tvOS Brand Assets catalog. Contains app icons (layered imagestacks for the parallax effect) and Top Shelf images (flat composited banners). All four are required by tvOS but can be individually disabled with `"enabled": false`.

##### `brandAssets.appIconSmall` — Home screen app icon

3-layer parallax imagestack shown on the tvOS home screen.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Set to `false` to skip this asset. |
| `name` | string | `"App Icon"` | Folder name in the Brand Assets catalog. |
| `size` | `{width, height}` | `{400, 240}` | Base size in points. Multiplied by each scale factor to get pixel dimensions. |
| `scales` | string[] | `["1x", "2x"]` | Scale factors to generate. Each produces a separate PNG per layer. |
| `layers` | object | see below | Layer configuration for the parallax imagestack. |

##### `brandAssets.appIconLarge` — App Store icon

Same structure as `appIconSmall`, used for the App Store listing.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Set to `false` to skip this asset. |
| `name` | string | `"App Icon - App Store"` | Folder name in the Brand Assets catalog. |
| `size` | `{width, height}` | `{1280, 768}` | Base size in points. |
| `scales` | string[] | `["1x"]` | App Store only needs 1x. |
| `layers` | object | see below | Layer configuration. |

##### Layer configuration (`layers`)

Each imagestack has three layers that tvOS renders with a depth/parallax effect when the user moves the Siri Remote:

```json
"layers": {
  "front":  { "source": "icon" },
  "middle": { "source": "icon" },
  "back":   { "source": "background" }
}
```

| Layer | Position | Description |
|---|---|---|
| `front` | Closest to viewer | Moves the most. Typically the icon composited on background. |
| `middle` | Center | Moderate movement. Typically the icon composited on background. |
| `back` | Farthest from viewer | Least movement. Typically the background only. Always rendered opaque (no alpha). |

`source` values:
- `"icon"` — composites the icon centered on the background image.
- `"background"` — uses the background image only (opaque, no alpha channel).

##### `brandAssets.topShelfImage` — Top Shelf banner

Flat composited image displayed when the app is focused on the home screen top row.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Set to `false` to skip this asset. |
| `name` | string | `"Top Shelf Image"` | Folder name in the Brand Assets catalog. |
| `size` | `{width, height}` | `{1920, 720}` | Base size in points. |
| `scales` | string[] | `["1x", "2x"]` | Scale factors to generate. |
| `filePrefix` | string | `"top"` | Filename prefix. Produces `top@1x.png`, `top@2x.png`. |

##### `brandAssets.topShelfImageWide` — Wide Top Shelf banner

Same as `topShelfImage` but wider.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Set to `false` to skip this asset. |
| `name` | string | `"Top Shelf Image Wide"` | Folder name in the Brand Assets catalog. |
| `size` | `{width, height}` | `{2320, 720}` | Base size in points. |
| `scales` | string[] | `["1x", "2x"]` | Scale factors to generate. |
| `filePrefix` | string | `"wide"` | Filename prefix. Produces `wide@1x.png`, `wide@2x.png`. |

Top Shelf images are always written as **opaque RGB PNGs** (no alpha channel), as required by tvOS.

---

#### `splashScreen`

Launch screen assets. Includes a logo imageset and a background colorset.

##### `splashScreen.logo` — Splash screen icon

The icon rendered on a transparent background at multiple scale factors. Generated for both universal (iOS/iPadOS) and Apple TV idioms.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Set to `false` to skip the splash logo. |
| `name` | string | `"SplashScreenLogo"` | Imageset folder name inside `Images.xcassets`. Must match the name in your LaunchScreen storyboard. |
| `baseSize` | number | `200` | Base icon size in pixels. Multiplied by each scale factor (e.g. 200 x 2x = 400px). |
| `filePrefix` | string | `"200-icon"` | Filename prefix. Produces `200-icon@1x.png`, `200-icon@2x.png`, etc. |
| `universal.scales` | string[] | `["1x", "2x", "3x"]` | Scale factors for non-TV devices. |
| `tv.scales` | string[] | `["1x", "2x"]` | Scale factors for Apple TV. |

##### `splashScreen.background` — Splash screen background color

An Xcode colorset with light/dark appearance variants for both universal and Apple TV idioms. No image files — just color definitions in `Contents.json`.

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Set to `false` to skip the splash background. |
| `name` | string | `"SplashScreenBackground"` | Colorset folder name. Must match the name in your LaunchScreen storyboard. |
| `universal.light` | string | Same as `--color` | Light mode color for non-TV devices (`#RRGGBB`). |
| `universal.dark` | string | Same as `--color` | Dark mode color for non-TV devices (`#RRGGBB`). |
| `tv.light` | string | Same as `--color` | Light mode color for Apple TV (`#RRGGBB`). |
| `tv.dark` | string | Same as `--color` | Dark mode color for Apple TV (`#RRGGBB`). |

---

#### `xcassetsMeta`

Metadata written into every `Contents.json` file in the output. Xcode expects specific values here.

| Key | Type | Default | Description |
|---|---|---|---|
| `author` | string | `"xcode"` | Author field. Xcode uses `"xcode"`. |
| `version` | integer | `1` | Version field. Xcode uses `1`. |

Only change these if you know what you are doing.

---

## Input Requirements

- **Icon**: PNG with transparent background. Gets composited onto the background and scaled to 60% of the shorter output dimension.
- **Background**: Any PNG image. Gets resized with cover-fit and center-cropped to each required dimension.
- **Color**: Hex format `#RRGGBB` (e.g. `#F39C12`). Used for the splash screen background colorset.

## npm Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `tsx src/index.ts` | Run directly from TypeScript source |
| `npm run build` | `tsc` | Compile to JavaScript in `dist/` |
| `npm start` | `node dist/index.js` | Run compiled build |

## License

MIT
