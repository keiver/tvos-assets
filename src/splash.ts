import type { Idiom, ScaleFactor, SplashScreenLogoConfig } from "./types.js";

/** Scale factors Apple's HIG lists per platform; `universal` covers every device, so it takes all three. */
export const IDIOM_SCALES: Readonly<Record<Idiom, readonly ScaleFactor[]>> = {
  universal: ["1x", "2x", "3x"],
  iphone: ["2x", "3x"],
  ipad: ["2x"],
  tv: ["1x", "2x"],
  mac: ["1x", "2x"],
};

/** Device types in the order their entries are written to Contents.json. */
export const IDIOMS = Object.keys(IDIOM_SCALES) as Idiom[];

export const IDIOM_KEYS = ["scales", "size", "image", "darkImage"] as const;

/** One device type's logo, every fallback applied. `image` undefined means the icon. */
export interface SplashLogoVariant {
  idiom: Idiom;
  scales: ScaleFactor[];
  width: number;
  image?: string;
  darkImage?: string;
}

export function splashLogoVariants(logo: SplashScreenLogoConfig): SplashLogoVariant[] {
  return IDIOMS.flatMap((idiom) => {
    const entry = logo.idioms[idiom];
    if (!entry) return [];
    return [
      {
        idiom,
        scales: entry.scales,
        width: entry.size ?? logo.baseSize,
        image: entry.image ?? logo.image,
        darkImage: entry.darkImage ?? logo.darkImage,
      },
    ];
  });
}

export function splashLogoFilename(filePrefix: string, idiom: Idiom, scale: ScaleFactor, dark: boolean): string {
  const device = idiom === "universal" ? "" : `-${idiom}`;
  return `${filePrefix}${device}${dark ? "-dark" : ""}@${scale}.png`;
}
