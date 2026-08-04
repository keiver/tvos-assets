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
