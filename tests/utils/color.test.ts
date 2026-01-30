import { hexToRGBA, rgbaToAppleComponents } from "../../src/utils/color";

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
