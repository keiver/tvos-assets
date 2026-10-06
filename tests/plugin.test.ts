import { join, resolve } from "node:path";

// The plugin is plain CommonJS; requiring it must work without @expo/config-plugins installed
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require("../plugin/index.cjs");

const PROJECT_ROOT = "/fake/project";

describe("plugin buildResolveArgs", () => {
  it("resolves relative input paths against the project root", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      icon: "./assets/brand/icon.svg",
      background: "assets/brand/background.png",
      color: "#1C1C1E",
    });
    expect(args.icon).toBe(resolve(PROJECT_ROOT, "assets/brand/icon.svg"));
    expect(args.background).toBe(resolve(PROJECT_ROOT, "assets/brand/background.png"));
    expect(args.color).toBe("#1C1C1E");
    expect(args.outDir).toBe(join(PROJECT_ROOT, "ios"));
    expect(args.iconDark).toBeUndefined();
    expect(args.overrides).toEqual({});
  });

  it("maps layers props onto both imagestacks as imagePath overrides", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      icon: "./icon.png",
      background: "./bg.png",
      color: "#000000",
      layers: { front: "./front.svg", middle: "./middle.svg" },
    });
    for (const stackKey of ["appIconSmall", "appIconLarge"]) {
      expect(args.overrides.brandAssets[stackKey].layers.front.imagePath).toBe(
        resolve(PROJECT_ROOT, "front.svg"),
      );
      expect(args.overrides.brandAssets[stackKey].layers.middle.imagePath).toBe(
        resolve(PROJECT_ROOT, "middle.svg"),
      );
      expect(args.overrides.brandAssets[stackKey].layers.back).toBeUndefined();
    }
  });

  it("stringifies iconBorderRadius and passes variant overrides", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      icon: "./icon.png",
      background: "./bg.png",
      color: "#000000",
      iconBorderRadius: 120,
      iconDark: "./dark.svg",
      iconTinted: "./tinted.svg",
    });
    expect(args.iconBorderRadius).toBe("120");
    expect(args.iconDark).toBe(resolve(PROJECT_ROOT, "dark.svg"));
    expect(args.iconTinted).toBe(resolve(PROJECT_ROOT, "tinted.svg"));
  });
});

describe("plugin appStore prop", () => {
  it("enables the creative assets with a project-relative backdrop and scale", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      icon: "./icon.png",
      background: "./bg.png",
      color: "#000000",
      appStore: { outDir: "./applestore/creative", background: "./store-bg.svg", iconScale: 0.7 },
    });
    expect(args.overrides.appStore).toEqual({
      enabled: true,
      backgroundImage: resolve(PROJECT_ROOT, "store-bg.svg"),
      iconScale: 0.7,
    });
    expect(plugin.appStoreOutDir(PROJECT_ROOT, { appStore: { outDir: "./applestore/creative" } })).toBe(
      resolve(PROJECT_ROOT, "applestore/creative"),
    );
  });

  it("maps centre art, per-placement art and video settings", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      icon: "./icon.png",
      background: "./bg.png",
      color: "#000000",
      appStore: {
        centerImage: "./wordmark.svg",
        searchResults: { background: "./shots/library.png", center: false },
        header: { centerImage: "./header-mark.svg" },
        video: { fps: 60, codec: "prores" },
      },
    });
    const recorded = plugin.buildResolveArgs(PROJECT_ROOT, {
      appStore: { searchResults: { video: "./applestore/tour.mov" }, video: { audio: "./applestore/music.mp3", audioStart: 12, audioEnd: 40 } },
    });
    expect(recorded.overrides.appStore.searchResults).toEqual({ video: resolve(PROJECT_ROOT, "applestore/tour.mov") });
    expect(recorded.overrides.appStore.video).toEqual({ audio: resolve(PROJECT_ROOT, "applestore/music.mp3"), audioStart: 12, audioEnd: 40 });
    const sourced = plugin.buildResolveArgs(PROJECT_ROOT, {
      appStore: {
        header: { source: "./store/header.svg", animate: { rows: 20 } },
        universal: { enabled: false },
      },
    });
    expect(sourced.overrides.appStore.header).toEqual({ source: resolve(PROJECT_ROOT, "store/header.svg"), animate: { rows: 20 } });
    expect(sourced.overrides.appStore.universal).toEqual({ enabled: false });
    expect(args.overrides.appStore).toEqual({
      enabled: true,
      centerImage: resolve(PROJECT_ROOT, "wordmark.svg"),
      searchResults: { backgroundImage: resolve(PROJECT_ROOT, "shots/library.png"), center: false },
      header: { centerImage: resolve(PROJECT_ROOT, "header-mark.svg") },
      video: { fps: 60, codec: "prores" },
    });
  });

  it("defaults outDir to ./AppStore and stays off without the prop", () => {
    expect(plugin.appStoreOutDir(PROJECT_ROOT, { appStore: {} })).toBe(resolve(PROJECT_ROOT, "AppStore"));
    expect(plugin.appStoreOutDir(PROJECT_ROOT, {})).toBeUndefined();
    const args = plugin.buildResolveArgs(PROJECT_ROOT, { icon: "./icon.png", background: "./bg.png", color: "#000000" });
    expect(args.overrides.appStore).toBeUndefined();
  });
});

describe("plugin isTvBuild", () => {
  const original = process.env.EXPO_TV;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_TV;
    } else {
      process.env.EXPO_TV = original;
    }
  });

  it("reflects EXPO_TV=1", () => {
    process.env.EXPO_TV = "1";
    expect(plugin.isTvBuild()).toBe(true);
    delete process.env.EXPO_TV;
    expect(plugin.isTvBuild()).toBe(false);
  });
});
