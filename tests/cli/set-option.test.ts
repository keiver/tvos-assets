import { parseSetEntry, buildOverridesFromSet, setDeep, collectSet } from "../../src/cli/set-option";

describe("parseSetEntry", () => {
  it("coerces strings", () => {
    expect(parseSetEntry("brandAssets.name=AppIconTV")).toEqual({
      path: ["brandAssets", "name"],
      value: "AppIconTV",
    });
  });

  it("coerces numbers off the type at that path", () => {
    expect(parseSetEntry("splashScreen.logo.baseSize=300").value).toBe(300);
    expect(parseSetEntry("brandAssets.appIconSmall.size.width=500").value).toBe(500);
    expect(parseSetEntry("xcassetsMeta.version=2").value).toBe(2);
  });

  it("takes the splash art, device types and sizes, which have no default", () => {
    expect(parseSetEntry("splashScreen.logo.image=./splash.png").value).toBe("./splash.png");
    expect(parseSetEntry("splashScreen.logo.darkImage=./dark.png").value).toBe("./dark.png");
    expect(parseSetEntry("splashScreen.logo.idioms.universal.size=140").value).toBe(140);
    expect(parseSetEntry("splashScreen.logo.idioms.tv.image=./tv.png").value).toBe("./tv.png");
    expect(parseSetEntry("splashScreen.logo.idioms.iphone.scales=2x,3x").value).toEqual(["2x", "3x"]);
    expect(parseSetEntry("splashScreen.logo.idioms.mac.size=120").value).toBe(120);
    expect(() => parseSetEntry("splashScreen.logo.idioms.watch.size=120")).toThrow(/Unknown --set path/);
  });

  it("takes a Top Shelf image's own background and iconScale, which have no default", () => {
    expect(parseSetEntry("brandAssets.topShelfImage.backgroundImage=./shelf.svg").value).toBe("./shelf.svg");
    expect(parseSetEntry("brandAssets.topShelfImageWide.iconImage=./mark.svg").value).toBe("./mark.svg");
    expect(parseSetEntry("brandAssets.topShelfImageWide.iconScale=0.375").value).toBe(0.375);
  });

  it("takes the 1.8 splash scale paths", () => {
    expect(parseSetEntry("splashScreen.logo.tv.scales=1x").value).toEqual(["1x"]);
  });

  it("takes the App Store music and its loop window, which have no default", () => {
    expect(parseSetEntry("appStore.video.audio=./music.mp3").value).toBe("./music.mp3");
    expect(parseSetEntry("appStore.video.audioStart=12.5").value).toBe(12.5);
    expect(() => parseSetEntry("appStore.video.audioEnd=soon")).toThrow(/expected a number/);
  });

  it("takes a placement's animate length, rows, rise or a scene's loop", () => {
    expect(parseSetEntry("appStore.header.animate.rows=20")).toEqual({ path: ["appStore", "header", "animate", "rows"], value: 20 });
    expect(parseSetEntry("appStore.searchResults.animate.rise=12.5").value).toBe(12.5);
    expect(parseSetEntry("appStore.header.animate.loop=20").value).toBe(20);
    expect(() => parseSetEntry("appStore.header.animate.rise=long")).toThrow(/expected a number/);
    expect(() => parseSetEntry("appStore.header.animate.spin=20")).toThrow(/Unknown --set path/);
  });

  it("coerces booleans", () => {
    expect(parseSetEntry("iosIcon.enabled=false").value).toBe(false);
    expect(parseSetEntry("iosIcon.enabled=true").value).toBe(true);
  });

  it("coerces comma-separated lists into arrays", () => {
    expect(parseSetEntry("brandAssets.topShelfImage.scales=1x,2x").value).toEqual(["1x", "2x"]);
    expect(parseSetEntry("splashScreen.logo.universal.scales= 1x , 3x ").value).toEqual(["1x", "3x"]);
  });

  it("accepts optional paths that are absent from a default config", () => {
    expect(parseSetEntry("inputs.markImage=./mark.svg").value).toBe("./mark.svg");
    expect(parseSetEntry("inputs.iconDarkImage=./dark.svg").value).toBe("./dark.svg");
    expect(parseSetEntry("brandAssets.appIconLarge.layers.front.imagePath=./f.svg")).toEqual({
      path: ["brandAssets", "appIconLarge", "layers", "front", "imagePath"],
      value: "./f.svg",
    });
  });

  it("rejects an unknown path and names the available keys", () => {
    expect(() => parseSetEntry("iosIcon.enabledd=false")).toThrow(/has no key "enabledd"/);
    expect(() => parseSetEntry("iosIcon.enabledd=false")).toThrow(/enabled, name/);
  });

  it("rejects a path that lands on a section rather than a value", () => {
    expect(() => parseSetEntry("brandAssets=x")).toThrow(/section, not a value/);
  });

  it("rejects a path that walks through a leaf value", () => {
    expect(() => parseSetEntry("iosIcon.name.deeper=x")).toThrow(/is a value, not a section/);
  });

  it("rejects malformed entries", () => {
    expect(() => parseSetEntry("noequals")).toThrow(/Expected key.path=value/);
    expect(() => parseSetEntry("=value")).toThrow(/Missing the key path/);
    expect(() => parseSetEntry("iosIcon.enabled=")).toThrow(/Missing a value/);
    expect(() => parseSetEntry("iosIcon..enabled=true")).toThrow(/Empty path segment/);
  });

  it("rejects values that do not match the expected type", () => {
    expect(() => parseSetEntry("iosIcon.enabled=maybe")).toThrow(/expected "true" or "false"/);
    expect(() => parseSetEntry("splashScreen.logo.baseSize=abc")).toThrow(/expected a number/);
  });

  it("rejects prototype-polluting segments", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(() => parseSetEntry(`${key}.x=1`)).toThrow(/is not allowed/);
    }
  });

  it("keeps everything after the first = as the value", () => {
    expect(parseSetEntry("inputs.iconDarkImage=./a=b.svg").value).toBe("./a=b.svg");
  });
});

describe("buildOverridesFromSet", () => {
  it("merges several entries into one nested object", () => {
    expect(
      buildOverridesFromSet([
        "brandAssets.name=AppIconTV",
        "brandAssets.appIconSmall.size.width=500",
        "iosIcon.enabled=false",
      ]),
    ).toEqual({
      brandAssets: { name: "AppIconTV", appIconSmall: { size: { width: 500 } } },
      iosIcon: { enabled: false },
    });
  });

  it("returns an empty object for no entries", () => {
    expect(buildOverridesFromSet([])).toEqual({});
  });

  it("lets a later entry win over an earlier one", () => {
    expect(buildOverridesFromSet(["iosIcon.name=A", "iosIcon.name=B"])).toEqual({ iosIcon: { name: "B" } });
  });
});

describe("setDeep", () => {
  it("creates intermediate objects", () => {
    const target: Record<string, unknown> = {};
    setDeep(target, ["a", "b", "c"], 1);
    expect(target).toEqual({ a: { b: { c: 1 } } });
  });

  it("replaces a non-object intermediate rather than throwing", () => {
    const target: Record<string, unknown> = { a: 5 };
    setDeep(target, ["a", "b"], 1);
    expect(target).toEqual({ a: { b: 1 } });
  });
});

describe("collectSet", () => {
  it("appends without mutating the previous array", () => {
    const first = collectSet("a=1", []);
    const second = collectSet("b=2", first);
    expect(first).toEqual(["a=1"]);
    expect(second).toEqual(["a=1", "b=2"]);
  });
});
