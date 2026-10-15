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

describe("plugin splash prop", () => {
  it("maps the art, sizes, device types and colors onto splashScreen overrides", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      splash: {
        image: "./assets/brand/splash-icon.png",
        darkImage: "./assets/brand/splash-dark.png",
        size: 140,
        idioms: { tv: { size: 200, image: "./assets/brand/splash-tv.png" }, iphone: { scales: ["3x"] } },
        backgroundColor: "#1C1C1E",
      },
    });
    const colors = { light: "#1C1C1E", dark: "#1C1C1E" };
    expect(args.overrides.splashScreen).toEqual({
      logo: {
        image: resolve(PROJECT_ROOT, "assets/brand/splash-icon.png"),
        darkImage: resolve(PROJECT_ROOT, "assets/brand/splash-dark.png"),
        baseSize: 140,
        idioms: {
          tv: { size: 200, image: resolve(PROJECT_ROOT, "assets/brand/splash-tv.png") },
          iphone: { scales: ["3x"] },
        },
      },
      background: { universal: colors, tv: colors },
    });
  });

  it("rejects an unknown splash prop", () => {
    expect(() => plugin.buildResolveArgs(PROJECT_ROOT, { splash: { tvSize: 200 } })).toThrow(
      /Unknown splash prop "tvSize"/,
    );
  });

  it("passes unknown device-type keys through so config validation names them", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, { splash: { idioms: { tv: { width: 200 } } } });
    expect(args.overrides.splashScreen.logo.idioms.tv).toEqual({ width: 200 });
  });

  it("uses darkBackgroundColor for the dark appearance when given", () => {
    const args = plugin.buildResolveArgs(PROJECT_ROOT, {
      splash: { backgroundColor: "#FFFFFF", darkBackgroundColor: "#000000" },
    });
    const colors = { light: "#FFFFFF", dark: "#000000" };
    expect(args.overrides.splashScreen).toEqual({ logo: {}, background: { universal: colors, tv: colors } });
  });

  it("leaves splashScreen alone without the prop", () => {
    expect(plugin.buildResolveArgs(PROJECT_ROOT, {}).overrides.splashScreen).toBeUndefined();
  });

  it("turns the splash off for the catalog pass and leaves the rest of the config as is", () => {
    const config = {
      iosIcon: { enabled: true },
      splashScreen: { logo: { enabled: true, baseSize: 200 }, background: { enabled: true, name: "Bg" } },
    };
    expect(plugin.withoutSplash(config)).toEqual({
      iosIcon: { enabled: true },
      splashScreen: { logo: { enabled: false, baseSize: 200 }, background: { enabled: false, name: "Bg" } },
    });
    expect(config.splashScreen.logo.enabled).toBe(true);
  });
});

describe("plugin mods", () => {
  afterEach(() => {
    jest.resetModules();
  });

  it("writes the catalog in a dangerous mod and the splash in a finalized mod", () => {
    const registered: string[] = [];
    jest.doMock(
      "@expo/config-plugins",
      () => ({
        withDangerousMod: (config: object, [platform]: [string]) => {
          registered.push(`dangerous:${platform}`);
          return config;
        },
        withFinalizedMod: (config: object, [platform]: [string]) => {
          registered.push(`finalized:${platform}`);
          return config;
        },
        withInfoPlist: (config: object) => config,
      }),
      { virtual: true },
    );
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../plugin/index.cjs")({}, {});
    });
    expect(registered).toEqual(["dangerous:ios", "finalized:ios"]);
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
