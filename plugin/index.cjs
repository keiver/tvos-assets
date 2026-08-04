/**
 * Expo config plugin: generate tvOS/iOS Images.xcassets at prebuild time.
 *
 * Usage in app.json (list AFTER expo-splash-screen and any TV config plugin so
 * the generated assets overwrite their single-icon output):
 *
 *   ["tvos-assets/plugin", {
 *     "icon": "./assets/brand/icon.svg",
 *     "background": "./assets/brand/background.png",
 *     "color": "#1C1C1E",
 *     "darkColor": "#1C1C1E",
 *     "iconBorderRadius": 0,
 *     "iconDark": "./assets/brand/icon-dark.svg",
 *     "iconTinted": "./assets/brand/icon-tinted.svg",
 *     "layers": { "front": "./assets/brand/layer-front.svg", "middle": "./assets/brand/layer-middle.svg" },
 *     "config": "./tvos-assets.config.json"
 *   }]
 *
 * With EXPO_TV=1 it generates the parallax brandassets + Top Shelf images and
 * sets the tvOS Info.plist icon keys; otherwise it generates the iOS
 * AppIcon.appiconset (light + dark + tinted). Splash screen logo/colorset are
 * generated for both.
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

  return {
    icon: resolveInput(projectRoot, props.icon),
    background: resolveInput(projectRoot, props.background),
    color: props.color,
    darkColor: props.darkColor,
    iconDark: resolveInput(projectRoot, props.iconDark),
    iconTinted: resolveInput(projectRoot, props.iconTinted),
    config: resolveInput(projectRoot, props.config),
    iconBorderRadius: props.iconBorderRadius != null ? String(props.iconBorderRadius) : undefined,
    // Not used for output (assets go straight into the xcassets catalog), but
    // keeps resolveConfig's output-dir writability check pointed somewhere real.
    outDir: path.join(projectRoot, "ios"),
    overrides,
  };
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
      const { warnings } = await lib.generateAssets(resolved, xcassetsDir, { platforms });
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
