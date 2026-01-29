import type { RGBAColor } from "../types.js";

export function hexToRGBA(hex: string): RGBAColor {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);

  return {
    red: parseFloat((r / 255).toFixed(3)),
    green: parseFloat((g / 255).toFixed(3)),
    blue: parseFloat((b / 255).toFixed(3)),
    alpha: 1.0,
  };
}

export function rgbaToAppleComponents(color: RGBAColor): {
  red: string;
  green: string;
  blue: string;
  alpha: string;
} {
  return {
    red: color.red.toFixed(3),
    green: color.green.toFixed(3),
    blue: color.blue.toFixed(3),
    alpha: color.alpha.toFixed(3),
  };
}
