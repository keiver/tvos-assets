/**
 * Expo config plugin: generate tvOS/iOS Images.xcassets at prebuild time.
 *
 * Usage in app.json (list AFTER expo-splash-screen and any TV config plugin so
 * the generated assets overwrite their single-icon output):
 *
 * `icon` is optional when `layers` supplies art for both front and middle: the
 * icon is then assembled from that art.
 *
 *   ["tvos-assets/plugin", {
 *     "icon": "./assets/brand/icon.svg",
 *     "background": "./assets/brand/background.png",
 *     "color": "#1C1C1E",
 *     "darkColor": "#1C1C1E",
 *     "iconBorderRadius": 0,
 *     "iosIconScale": 0.8,
 *     "tvIconScale": 0.75,
 *     "iconDark": "./assets/brand/icon-dark.svg",
 *     "iconTinted": "./assets/brand/icon-tinted.svg",
 *     "layers": { "front": "./assets/brand/layer-front.svg", "middle": "./assets/brand/layer-middle.svg" },
 *     "appStore": {
 *       "outDir": "./AppStore", "background": "./assets/brand/store-bg.svg", "centerImage": "./assets/brand/wordmark.svg",
 *       "searchResults": { "background": "./shots/library.png", "center": false, "video": "./shots/tour.mov" },
 *       "video": { "fps": 30, "codec": "h264" }
 *     },
 *     "config": "./tvos-assets.config.json"
 *   }]
 *
 * With EXPO_TV=1 it generates the parallax brandassets + Top Shelf images and
 * sets the tvOS Info.plist icon keys; otherwise it generates the iOS
 * AppIcon.appiconset (light + dark + tinted). Splash screen logo/colorset are
 * generated for both, and so are the App Store creative assets when `appStore`
 * is set; they go to its `outDir` (default ./AppStore), outside ios/.
 *
 * This file is CommonJS because Expo loads plugins with require(); the ESM
 * library is pulled in with dynamic import inside the async mods.
 */

const path = require("node:path");

// Loaded lazily so this module can be required without Expo present, and so
// standalone installs (file:/link:) that can't see the app's hoisted copy from
// the package's real path still resolve it from the project the CLI runs in.
function loadConfigPlugins() {
  try {
    return require("@expo/config-plugins");
  } catch (err) {
    // Only fall back when the module itself is absent from this package's
    // resolution paths — real errors inside @expo/config-plugins must surface.
    const isModuleMissing =
      err && err.code === "MODULE_NOT_FOUND" && String(err.message).includes("@expo/config-plugins");
    if (!isModuleMissing) throw err;
    return require(require.resolve("@expo/config-plugins", { paths: [process.cwd()] }));
  }
}

function isTvBuild() {
  return process.env.EXPO_TV === "1";
}

function resolveInput(projectRoot, value) {
  return value ? path.resolve(projectRoot, value) : undefined;
}

async function loadLib() {
  return import("../dist/lib.js");
}

/** Plugin `appStore` props to config overrides; `video: { fps, codec, audio }` sets how videos are encoded. */
function appStoreOverrides(projectRoot, props) {
  const art = (source) => {
    const out = {};
    if (source.background) out.backgroundImage = resolveInput(projectRoot, source.background);
    if (source.centerImage) out.centerImage = resolveInput(projectRoot, source.centerImage);
    return out;
  };

  const overrides = { enabled: true, ...art(props) };
  if (props.iconScale != null) overrides.iconScale = props.iconScale;
  for (const placement of ["header", "searchResults", "universal", "eventCard", "eventDetails"]) {
    const source = props[placement];
    if (!source) continue;
    overrides[placement] = art(source);
    if (source.center != null) overrides[placement].center = source.center;
    if (source.enabled != null) overrides[placement].enabled = source.enabled;
    if (source.source) overrides[placement].source = resolveInput(projectRoot, source.source);
    if (source.animate) overrides[placement].animate = source.animate;
    if (source.video) overrides[placement].video = resolveInput(projectRoot, source.video);
  }
  if (props.video) {
    overrides.video = {};
    if (props.video.fps != null) overrides.video.fps = props.video.fps;
    if (props.video.codec != null) overrides.video.codec = props.video.codec;
    if (props.video.audio) overrides.video.audio = resolveInput(projectRoot, props.video.audio);
    if (props.video.audioStart != null) overrides.video.audioStart = props.video.audioStart;
    if (props.video.audioEnd != null) overrides.video.audioEnd = props.video.audioEnd;
  }
  return overrides;
}

function buildResolveArgs(projectRoot, props) {
  const overrides = {};

  if (props.layers) {
    overrides.brandAssets = {};
    for (const stackKey of ["appIconSmall", "appIconLarge"]) {
      const layers = {};
      for (const layerKey of ["front", "middle", "back"]) {
        if (props.layers[layerKey]) {
          layers[layerKey] = { imagePath: resolveInput(projectRoot, props.layers[layerKey]) };
        }
      }
      overrides.brandAssets[stackKey] = { layers };
    }
  }

  if (props.appStore) {
    overrides.appStore = appStoreOverrides(projectRoot, props.appStore);
  }

  return {
    icon: resolveInput(projectRoot, props.icon),
    background: resolveInput(projectRoot, props.background),
    color: props.color,
    darkColor: props.darkColor,
    iconDark: resolveInput(projectRoot, props.iconDark),
    iconTinted: resolveInput(projectRoot, props.iconTinted),
    config: resolveInput(projectRoot, props.config),
    iconBorderRadius: props.iconBorderRadius != null ? String(props.iconBorderRadius) : undefined,
    iosIconScale: props.iosIconScale != null ? String(props.iosIconScale) : undefined,
    tvIconScale: props.tvIconScale != null ? String(props.tvIconScale) : undefined,
    // Not used for output (assets go straight into the xcassets catalog), but
    // keeps resolveConfig's output-dir writability check pointed somewhere real.
    outDir: path.join(projectRoot, "ios"),
    overrides,
  };
}

function appStoreOutDir(projectRoot, props) {
  if (!props.appStore) return undefined;
  return path.resolve(projectRoot, props.appStore.outDir || "AppStore");
}

function withTvosAssets(config, props = {}) {
  const { withDangerousMod, withInfoPlist } = loadConfigPlugins();

  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const projectName = cfg.modRequest.projectName;
      const lib = await loadLib();

      const resolved = lib.resolveConfig(buildResolveArgs(projectRoot, props));
      const xcassetsDir = path.join(projectRoot, "ios", projectName, "Images.xcassets");
      const platforms = isTvBuild() ? ["tvos"] : ["ios"];

      console.log(`[tvos-assets] Generating ${platforms[0]} assets into ${xcassetsDir}`);
      const appStoreDir = appStoreOutDir(projectRoot, props);
      if (appStoreDir) console.log(`[tvos-assets] Writing App Store creative assets into ${appStoreDir}`);
      const { warnings } = await lib.generateAssets(resolved, xcassetsDir, { platforms, appStoreDir });
      for (const warning of warnings) {
        console.warn(`[tvos-assets] Warning: ${warning}`);
      }
      console.log("[tvos-assets] Done.");

      return cfg;
    },
  ]);

  config = withInfoPlist(config, async (cfg) => {
    if (!isTvBuild()) return cfg;

    const projectRoot = cfg.modRequest.projectRoot;
    const lib = await loadLib();
    const resolved = lib.resolveConfig(buildResolveArgs(projectRoot, props));

    cfg.modResults.CFBundleIcons = {
      CFBundlePrimaryIcon: resolved.brandAssets.appIconSmall.name,
    };
    cfg.modResults.TVTopShelfImage = {
      TVTopShelfPrimaryImage: resolved.brandAssets.topShelfImage.name,
      TVTopShelfPrimaryImageWide: resolved.brandAssets.topShelfImageWide.name,
    };
    return cfg;
  });

  return config;
}

module.exports = withTvosAssets;
module.exports.buildResolveArgs = buildResolveArgs;
module.exports.isTvBuild = isTvBuild;
module.exports.appStoreOutDir = appStoreOutDir;
