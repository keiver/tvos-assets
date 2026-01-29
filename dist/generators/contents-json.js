import { hexToRGBA, rgbaToAppleComponents } from "../utils/color.js";
function makeInfo(meta) {
    return { author: meta.author, version: meta.version };
}
/** Root xcassets Contents.json */
export function rootContentsJson(meta) {
    return { info: makeInfo(meta) };
}
/** Brand Assets .brandassets/Contents.json */
export function brandAssetsContentsJson(assets, meta) {
    return {
        assets,
        info: makeInfo(meta),
    };
}
/** Imagestack Contents.json with layer references */
export function imageStackContentsJson(layers, meta) {
    return {
        info: makeInfo(meta),
        layers: layers.map((filename) => ({ filename })),
    };
}
/** Imagestacklayer Contents.json (just info) */
export function imageStackLayerContentsJson(meta) {
    return { info: makeInfo(meta) };
}
/** Imageset Contents.json for imagestack layers */
export function imageSetContentsJson(images, meta) {
    return {
        images,
        info: makeInfo(meta),
    };
}
/** Build image entries for a layered icon imageset (within imagestack) */
export function buildImageStackImageEntries(layerName, scales, isAppStore) {
    if (isAppStore) {
        // App Store variant: single scale, no "scale" field
        // Back layer uses plain name (no @1x), front/middle use @1x
        const prefix = layerName.toLowerCase();
        const filename = prefix === "back" ? `${prefix}.png` : `${prefix}@1x.png`;
        return [{ filename, idiom: "tv" }];
    }
    return scales.map((scale) => ({
        filename: `${layerName.toLowerCase()}@${scale}.png`,
        idiom: "tv",
        scale,
    }));
}
/** Build image entries for a top shelf imageset */
export function buildTopShelfImageEntries(filePrefix, scales) {
    return scales.map((scale) => ({
        filename: `${filePrefix}@${scale}.png`,
        idiom: "tv",
        scale,
    }));
}
/** Build image entries for splash screen logo imageset */
export function buildSplashLogoImageEntries(filePrefix, universalScales, tvScales) {
    const entries = [];
    for (const scale of universalScales) {
        entries.push({
            filename: `${filePrefix}@${scale}.png`,
            idiom: "universal",
            scale,
        });
    }
    for (const scale of tvScales) {
        entries.push({
            filename: `${filePrefix}@${scale} 1.png`,
            idiom: "tv",
            scale,
        });
    }
    return entries;
}
/** Build colorset Contents.json for splash screen background */
export function colorSetContentsJson(universalLight, universalDark, tvLight, tvDark, meta) {
    function makeColorValue(hex) {
        const rgba = hexToRGBA(hex);
        const components = rgbaToAppleComponents(rgba);
        return {
            "color-space": "srgb",
            components,
        };
    }
    const colors = [
        {
            color: makeColorValue(universalLight),
            idiom: "universal",
        },
        {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            color: makeColorValue(universalDark),
            idiom: "universal",
        },
        {
            color: makeColorValue(tvLight),
            idiom: "tv",
        },
        {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            color: makeColorValue(tvDark),
            idiom: "tv",
        },
    ];
    return {
        colors,
        info: makeInfo(meta),
    };
}
//# sourceMappingURL=contents-json.js.map