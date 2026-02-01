function hexToHSL(hex) {
    const cleaned = hex.replace("#", "");
    const r = parseInt(cleaned.substring(0, 2), 16) / 255;
    const g = parseInt(cleaned.substring(2, 4), 16) / 255;
    const b = parseInt(cleaned.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) {
        return { h: 0, s: 0, l };
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    }
    else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    }
    else {
        h = ((r - g) / d + 4) / 6;
    }
    return { h, s, l };
}
function hueToRGB(p, q, t) {
    let tt = t;
    if (tt < 0)
        tt += 1;
    if (tt > 1)
        tt -= 1;
    if (tt < 1 / 6)
        return p + (q - p) * 6 * tt;
    if (tt < 1 / 2)
        return q;
    if (tt < 2 / 3)
        return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
}
function hslToHex(hsl) {
    let r;
    let g;
    let b;
    if (hsl.s === 0) {
        r = g = b = hsl.l;
    }
    else {
        const q = hsl.l < 0.5 ? hsl.l * (1 + hsl.s) : hsl.l + hsl.s - hsl.l * hsl.s;
        const p = 2 * hsl.l - q;
        r = hueToRGB(p, q, hsl.h + 1 / 3);
        g = hueToRGB(p, q, hsl.h);
        b = hueToRGB(p, q, hsl.h - 1 / 3);
    }
    const toHex = (c) => Math.round(c * 255).toString(16).padStart(2, "0").toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
export function darkenHex(hex, factor = 0.5) {
    const hsl = hexToHSL(hex);
    hsl.l = hsl.l * (1 - factor);
    return hslToHex(hsl);
}
export function hexToRGBA(hex) {
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
export function rgbaToAppleComponents(color) {
    return {
        red: color.red.toFixed(3),
        green: color.green.toFixed(3),
        blue: color.blue.toFixed(3),
        alpha: color.alpha.toFixed(3),
    };
}
//# sourceMappingURL=color.js.map