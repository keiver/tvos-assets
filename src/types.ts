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
}

export interface OutputConfig {
  directory: string;
  cleanBeforeGenerate: boolean;
}

export interface XcassetsMetaConfig {
  author: string;
  version: number;
}

export interface TvOSImageCreatorConfig {
  inputs: InputConfig;
  output: OutputConfig;
  brandAssets: BrandAssetsConfig;
  splashScreen: SplashScreenConfig;
  xcassetsMeta: XcassetsMetaConfig;
}

// Contents.json types matching Xcode format
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
