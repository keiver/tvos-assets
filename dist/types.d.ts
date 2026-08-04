export interface Size {
    width: number;
    height: number;
}
export type ScaleFactor = "1x" | "2x" | "3x";
export type ImageSource = "icon" | "background";
export type Idiom = "universal" | "tv";
export interface RGBAColor {
    red: number;
    green: number;
    blue: number;
    alpha: number;
}
export interface ImageStackLayerConfig {
    source: ImageSource;
    /** Optional image file overriding the default source for this layer (true parallax art). */
    imagePath?: string;
}
export interface ImageStackLayers {
    front: ImageStackLayerConfig;
    middle: ImageStackLayerConfig;
    back: ImageStackLayerConfig;
}
export interface ImageStackAssetConfig {
    enabled: boolean;
    name: string;
    size: Size;
    scales: ScaleFactor[];
    layers: ImageStackLayers;
}
export interface ImageSetAssetConfig {
    enabled: boolean;
    name: string;
    size: Size;
    scales: ScaleFactor[];
    filePrefix: string;
}
export interface BrandAssetsConfig {
    name: string;
    appIconSmall: ImageStackAssetConfig;
    appIconLarge: ImageStackAssetConfig;
    topShelfImage: ImageSetAssetConfig;
    topShelfImageWide: ImageSetAssetConfig;
}
export interface SplashScreenLogoConfig {
    enabled: boolean;
    name: string;
    baseSize: number;
    filePrefix: string;
    universal: {
        scales: ScaleFactor[];
    };
    tv: {
        scales: ScaleFactor[];
    };
}
export interface ColorEntry {
    light: string;
    dark: string;
}
export interface SplashScreenBackgroundConfig {
    enabled: boolean;
    name: string;
    universal: ColorEntry;
    tv: ColorEntry;
}
export interface SplashScreenConfig {
    logo: SplashScreenLogoConfig;
    background: SplashScreenBackgroundConfig;
}
export interface InputConfig {
    iconImage: string;
    backgroundImage: string;
    backgroundColor: string;
    darkBackgroundColor: string;
    iconBorderRadius: number;
    /** Optional dark-appearance iOS icon override; auto-derived from iconImage when omitted. */
    iconDarkImage?: string;
    /** Optional tinted-appearance iOS icon override; auto-derived (grayscale) when omitted. */
    iconTintedImage?: string;
}
export type OutputMode = "zip" | "dir";
export interface OutputConfig {
    directory: string;
    /** "zip" (default) writes a timestamped archive; "dir" writes Images.xcassets directly. */
    mode: OutputMode;
}
export interface IosIconConfig {
    enabled: boolean;
    name: string;
}
export interface XcassetsMetaConfig {
    author: string;
    version: number;
}
export interface TvOSImageCreatorConfig {
    inputs: InputConfig;
    output: OutputConfig;
    brandAssets: BrandAssetsConfig;
    iosIcon: IosIconConfig;
    splashScreen: SplashScreenConfig;
    xcassetsMeta: XcassetsMetaConfig;
}
export interface ContentsJsonInfo {
    author: string;
    version: number;
}
export interface ContentsJson {
    info: ContentsJsonInfo;
}
export interface BrandAssetEntry {
    filename: string;
    idiom: string;
    role: string;
    size: string;
}
export interface BrandAssetsContentsJson extends ContentsJson {
    assets: BrandAssetEntry[];
}
export interface ImageStackLayerEntry {
    filename: string;
}
export interface ImageStackContentsJson extends ContentsJson {
    layers: ImageStackLayerEntry[];
}
export interface ImageEntry {
    filename: string;
    idiom: string;
    scale?: string;
}
export interface AppIconImageEntry {
    appearances?: AppearanceEntry[];
    filename: string;
    idiom: string;
    platform: string;
    size: string;
}
export interface AppIconSetContentsJson extends ContentsJson {
    images: AppIconImageEntry[];
}
export interface ImageSetContentsJson extends ContentsJson {
    images: ImageEntry[];
}
export interface ColorComponent {
    alpha: string;
    blue: string;
    green: string;
    red: string;
}
export interface ColorValue {
    "color-space": string;
    components: ColorComponent;
}
export interface AppearanceEntry {
    appearance: string;
    value: string;
}
export interface ColorSetEntry {
    color: ColorValue;
    idiom: string;
    appearances?: AppearanceEntry[];
}
export interface ColorSetContentsJson extends ContentsJson {
    colors: ColorSetEntry[];
}
//# sourceMappingURL=types.d.ts.map