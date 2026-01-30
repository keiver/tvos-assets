import {
  rootContentsJson,
  brandAssetsContentsJson,
  imageStackContentsJson,
  imageStackLayerContentsJson,
  imageSetContentsJson,
  buildImageStackImageEntries,
  buildTopShelfImageEntries,
  buildSplashLogoImageEntries,
  colorSetContentsJson,
} from "../../src/generators/contents-json";
import type { XcassetsMetaConfig, ScaleFactor } from "../../src/types";

const META: XcassetsMetaConfig = { author: "xcode", version: 1 };

describe("rootContentsJson", () => {
  it("returns only an info block", () => {
    const result = rootContentsJson(META);
    expect(result).toEqual({ info: { author: "xcode", version: 1 } });
  });
});

describe("brandAssetsContentsJson", () => {
  it("includes assets array and info", () => {
    const assets = [
      {
        filename: "App Icon.imagestack",
        idiom: "tv",
        role: "primary-app-icon",
        size: "400x240",
      },
    ];
    const result = brandAssetsContentsJson(assets, META);
    expect(result.assets).toEqual(assets);
    expect(result.info).toEqual(META);
  });
});

describe("imageStackContentsJson", () => {
  it("maps layer names to filename objects", () => {
    const result = imageStackContentsJson(
      ["Front.imagestacklayer", "Middle.imagestacklayer", "Back.imagestacklayer"],
      META,
    );
    expect(result.layers).toEqual([
      { filename: "Front.imagestacklayer" },
      { filename: "Middle.imagestacklayer" },
      { filename: "Back.imagestacklayer" },
    ]);
    expect(result.info).toEqual(META);
  });
});

describe("imageStackLayerContentsJson", () => {
  it("returns only an info block", () => {
    expect(imageStackLayerContentsJson(META)).toEqual({
      info: { author: "xcode", version: 1 },
    });
  });
});

describe("imageSetContentsJson", () => {
  it("wraps images array with info", () => {
    const images = [{ filename: "icon@1x.png", idiom: "tv", scale: "1x" }];
    const result = imageSetContentsJson(images, META);
    expect(result.images).toEqual(images);
    expect(result.info).toEqual(META);
  });
});

describe("buildImageStackImageEntries", () => {
  it("generates scaled entries for standard (non-App Store) icon", () => {
    const entries = buildImageStackImageEntries("Front", ["1x", "2x"], false);
    expect(entries).toEqual([
      { filename: "front@1x.png", idiom: "tv", scale: "1x" },
      { filename: "front@2x.png", idiom: "tv", scale: "2x" },
    ]);
  });

  it("generates single entry without scale for App Store back layer", () => {
    const entries = buildImageStackImageEntries("Back", ["1x"], true);
    expect(entries).toEqual([{ filename: "back.png", idiom: "tv" }]);
  });

  it("generates single @1x entry for App Store front/middle layers", () => {
    const front = buildImageStackImageEntries("Front", ["1x"], true);
    expect(front).toEqual([{ filename: "front@1x.png", idiom: "tv" }]);

    const middle = buildImageStackImageEntries("Middle", ["1x"], true);
    expect(middle).toEqual([{ filename: "middle@1x.png", idiom: "tv" }]);
  });
});

describe("buildTopShelfImageEntries", () => {
  it("generates entries with correct prefix and scales", () => {
    const entries = buildTopShelfImageEntries("wide", ["1x", "2x"]);
    expect(entries).toEqual([
      { filename: "wide@1x.png", idiom: "tv", scale: "1x" },
      { filename: "wide@2x.png", idiom: "tv", scale: "2x" },
    ]);
  });
});

describe("buildSplashLogoImageEntries", () => {
  it("generates universal entries then tv entries", () => {
    const entries = buildSplashLogoImageEntries(
      "200-icon",
      ["1x", "2x", "3x"] as ScaleFactor[],
      ["1x", "2x"] as ScaleFactor[],
    );

    expect(entries).toHaveLength(5);

    // Universal entries
    expect(entries[0]).toEqual({ filename: "200-icon@1x.png", idiom: "universal", scale: "1x" });
    expect(entries[1]).toEqual({ filename: "200-icon@2x.png", idiom: "universal", scale: "2x" });
    expect(entries[2]).toEqual({ filename: "200-icon@3x.png", idiom: "universal", scale: "3x" });

    // TV entries use -tv@ convention
    expect(entries[3]).toEqual({ filename: "200-icon-tv@1x.png", idiom: "tv", scale: "1x" });
    expect(entries[4]).toEqual({ filename: "200-icon-tv@2x.png", idiom: "tv", scale: "2x" });
  });
});

describe("colorSetContentsJson", () => {
  it("generates 4 color entries (universal light/dark + tv light/dark)", () => {
    const result = colorSetContentsJson(
      "#FFFFFF",
      "#000000",
      "#FF0000",
      "#00FF00",
      META,
    );

    expect(result.colors).toHaveLength(4);
    expect(result.info).toEqual(META);

    // Universal light (no appearances)
    expect(result.colors[0].idiom).toBe("universal");
    expect(result.colors[0].appearances).toBeUndefined();

    // Universal dark
    expect(result.colors[1].idiom).toBe("universal");
    expect(result.colors[1].appearances).toEqual([
      { appearance: "luminosity", value: "dark" },
    ]);

    // TV light
    expect(result.colors[2].idiom).toBe("tv");
    expect(result.colors[2].appearances).toBeUndefined();

    // TV dark
    expect(result.colors[3].idiom).toBe("tv");
    expect(result.colors[3].appearances).toEqual([
      { appearance: "luminosity", value: "dark" },
    ]);
  });

  it("uses srgb color space", () => {
    const result = colorSetContentsJson("#FF0000", "#FF0000", "#FF0000", "#FF0000", META);
    for (const entry of result.colors) {
      expect(entry.color["color-space"]).toBe("srgb");
    }
  });

  it("converts hex to correct component values", () => {
    const result = colorSetContentsJson("#FF0000", "#000000", "#000000", "#000000", META);
    // First entry is universal light = #FF0000
    expect(result.colors[0].color.components).toEqual({
      red: "1.000",
      green: "0.000",
      blue: "0.000",
      alpha: "1.000",
    });
  });
});
