import { hexToRGBA, rgbaToAppleComponents, darkenHex } from "../../src/utils/color";

describe("hexToRGBA", () => {
  it("converts #000000 to all zeros", () => {
    const result = hexToRGBA("#000000");
    expect(result).toEqual({ red: 0, green: 0, blue: 0, alpha: 1.0 });
  });

  it("converts #FFFFFF to all ones", () => {
    const result = hexToRGBA("#FFFFFF");
    expect(result).toEqual({ red: 1, green: 1, blue: 1, alpha: 1.0 });
  });

  it("converts #F39C12 correctly", () => {
    const result = hexToRGBA("#F39C12");
    expect(result.red).toBeCloseTo(0.953, 3);
    expect(result.green).toBeCloseTo(0.612, 3);
    expect(result.blue).toBeCloseTo(0.071, 3);
    expect(result.alpha).toBe(1.0);
  });

  it("handles hex without # prefix", () => {
    const result = hexToRGBA("B43939");
    expect(result.red).toBeCloseTo(0.706, 3);
    expect(result.green).toBeCloseTo(0.224, 3);
    expect(result.blue).toBeCloseTo(0.224, 3);
  });
});

describe("rgbaToAppleComponents", () => {
  it("converts to 3-decimal-place strings", () => {
    const result = rgbaToAppleComponents({
      red: 0.953,
      green: 0.612,
      blue: 0.071,
      alpha: 1.0,
    });
    expect(result).toEqual({
      red: "0.953",
      green: "0.612",
      blue: "0.071",
      alpha: "1.000",
    });
  });

  it("pads zeros for whole numbers", () => {
    const result = rgbaToAppleComponents({
      red: 1,
      green: 0,
      blue: 0,
      alpha: 1,
    });
    expect(result).toEqual({
      red: "1.000",
      green: "0.000",
      blue: "0.000",
      alpha: "1.000",
    });
  });
});

describe("darkenHex", () => {
  it("darkens pure white to mid gray with default factor", () => {
    const result = darkenHex("#FFFFFF");
    expect(result).toBe("#808080");
  });

  it("keeps pure black unchanged", () => {
    const result = darkenHex("#000000");
    expect(result).toBe("#000000");
  });

  it("darkens a known color correctly", () => {
    // #F39C12 has HSL(36°, 90%, 51%) → darkened 50% → L≈25.5%
    const result = darkenHex("#F39C12");
    // The result should be a darker orange
    const rgba = hexToRGBA(result);
    const originalRgba = hexToRGBA("#F39C12");
    // Overall luminance should be lower
    const originalLum = originalRgba.red * 0.299 + originalRgba.green * 0.587 + originalRgba.blue * 0.114;
    const darkenedLum = rgba.red * 0.299 + rgba.green * 0.587 + rgba.blue * 0.114;
    expect(darkenedLum).toBeLessThan(originalLum);
    // Hue should be preserved (still orange-ish)
    expect(rgba.red).toBeGreaterThan(rgba.blue);
  });

  it("returns same color with factor 0", () => {
    const result = darkenHex("#F39C12", 0);
    expect(result).toBe("#F39C12");
  });

  it("returns black with factor 1", () => {
    const result = darkenHex("#F39C12", 1);
    expect(result).toBe("#000000");
  });

  it("returns valid hex format", () => {
    const result = darkenHex("#ABCDEF");
    expect(result).toMatch(/^#[0-9A-F]{6}$/);
  });
});
