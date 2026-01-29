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

Generate to the current directory:

```bash
npx tsx src/index.ts \
  --icon ./sample-content/icon.png \
  --background ./sample-content/source.png \
  --color "#F39C12" \
  --output ./
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
│   ├── 200-icon@1x 1.png    (tv)
│   └── 200-icon@2x 1.png    (tv)
└── SplashScreenBackground.colorset/
    └── Contents.json
```

## Configuration File

For full control, create a JSON config file. All sections are optional — omitted values use built-in defaults.

```json
{
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
  }
}
```

### Config Reference

#### `inputs`

| Key | Type | Description |
|---|---|---|
| `iconImage` | string | Path to icon PNG with transparent background |
| `backgroundImage` | string | Path to background image PNG |
| `backgroundColor` | string | Hex color (`#RRGGBB`) for splash screen background |

#### `output`

| Key | Type | Default | Description |
|---|---|---|---|
| `directory` | string | `~/Desktop/Images.xcassets` | Output directory path |
| `cleanBeforeGenerate` | boolean | `true` | Delete output directory before regenerating |

#### `brandAssets`

Each brand asset (`appIconSmall`, `appIconLarge`, `topShelfImage`, `topShelfImageWide`) supports:

| Key | Type | Description |
|---|---|---|
| `enabled` | boolean | Toggle generation of this asset |
| `name` | string | Folder name in the asset catalog |
| `size` | `{width, height}` | Base size in points |
| `scales` | string[] | Scale factors (`"1x"`, `"2x"`, `"3x"`) |
| `layers` | object | (Imagestacks only) Front/middle/back layer sources |
| `filePrefix` | string | (Imagesets only) Filename prefix for generated PNGs |

Layer `source` values: `"icon"` or `"background"`.

#### `splashScreen.logo`

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Toggle splash logo generation |
| `name` | string | `SplashScreenLogo` | Imageset folder name |
| `baseSize` | number | `200` | Base icon size in pixels |
| `filePrefix` | string | `200-icon` | Filename prefix |
| `universal.scales` | string[] | `["1x","2x","3x"]` | Universal device scales |
| `tv.scales` | string[] | `["1x","2x"]` | Apple TV scales |

#### `splashScreen.background`

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Toggle splash background generation |
| `name` | string | `SplashScreenBackground` | Colorset folder name |
| `universal.light` | string | Same as `--color` | Light mode color (universal) |
| `universal.dark` | string | Same as `--color` | Dark mode color (universal) |
| `tv.light` | string | Same as `--color` | Light mode color (tv) |
| `tv.dark` | string | Same as `--color` | Dark mode color (tv) |

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
