export interface Size {
  width: number;
  height: number;
}

export type ScaleFactor = "1x" | "2x" | "3x";

export type ImageSource = "icon" | "background";

/** Asset catalog device types an image set can target. */
export type Idiom = "universal" | "iphone" | "ipad" | "tv" | "mac";

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
  /** Backdrop for this image only; inputs.backgroundImage when unset. */
  backgroundImage?: string;
  /** The mark on this image only; inputs.markImage, else the icon, when unset. */
  iconImage?: string;
  /** How much of the shorter side the mark covers on this image only; brandAssets.iconScale when unset. */
  iconScale?: number;
}

export interface BrandAssetsConfig {
  name: string;
  /**
   * How much of the shorter output side the mark covers on tvOS, after the
   * icon is normalised to its own artwork. Apple asks for a 10-15% safe margin
   * on every layer, because a focused icon scales ~1.05-1.1x and the layers
   * shift against each other, so content near an edge clips.
   */
  iconScale: number;
  appIconSmall: ImageStackAssetConfig;
  appIconLarge: ImageStackAssetConfig;
  topShelfImage: ImageSetAssetConfig;
  topShelfImageWide: ImageSetAssetConfig;
}

/** One device type's splash logo; unset fields fall back to the logo's own. */
export interface SplashScreenLogoIdiomConfig {
  scales: ScaleFactor[];
  /** Logo width in points; the height follows the art's aspect ratio. */
  size?: number;
  image?: string;
  /** Art for the dark appearance; no dark entries are written without one. */
  darkImage?: string;
}

export interface SplashScreenLogoConfig {
  enabled: boolean;
  name: string;
  /** Logo width in points for every device type without its own `size`. */
  baseSize: number;
  filePrefix: string;
  /** Art for every device type without its own `image`; the icon when unset. */
  image?: string;
  darkImage?: string;
  /** `universal` is the fallback for every device and is always written. */
  idioms: Partial<Record<Idiom, SplashScreenLogoIdiomConfig>> & { universal: SplashScreenLogoIdiomConfig };
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
  /** The brand on transparency drawn over backdrops (Top Shelf images, the App Store centre); the icon when unset. */
  markImage?: string;
  backgroundImage: string;
  backgroundColor: string;
  darkBackgroundColor: string;
  iconBorderRadius: number;
  /** Optional dark-appearance iOS icon override; auto-derived from iconImage when omitted. */
  iconDarkImage?: string;
  /** Optional tinted-appearance iOS icon override; auto-derived (grayscale) when omitted. */
  iconTintedImage?: string;
  /**
   * Derived, never authored: when no icon input is supplied, the parallax layer
   * art the flat icon is assembled from, in back-to-front stacking order.
   * `resolveConfig` sets it and `generateAssets` turns it into `iconImage`.
   */
  iconAssembledFrom?: string[];
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
  /**
   * How much of the 1024 canvas the mark covers, after the icon is normalised
   * to its own artwork. Apple's icon grid centres the primary shape at roughly
   * 80% of the canvas, leaving about a 10% margin.
   */
  iconScale: number;
}

export interface AppStorePlacementConfig {
  /** Write this placement at all. */
  enabled: boolean;
  /** Draw the centre item; false leaves the backdrop alone (a UI capture, say). */
  center: boolean;
  backgroundImage?: string;
  centerImage?: string;
  /**
   * Finished artwork (SVG or PNG) for this placement, replacing the backdrop and centre item.
   * Row artwork (an SVG whose <mask> holds rows of one repeated shape) re-tiles to the canvas.
   */
  source?: string;
  /**
   * Loop length in seconds (5-30) of a video of row-artwork `source`: `rows` slides its rows,
   * `rise` lifts its cards out of the surface and back, a few at a time. A scene (`loop`,
   * `elements`) is an SVG played by a browser, its own SMIL plus the `elements` rules: the
   * backdrop with the mark drawn in the safe area, or a `source` as it is.
   */
  animate?: { rows: number } | { rise: number } | SceneAnimate;
  /** A recording (.mov, .mp4, .m4v) to cut into this placement's looping video. */
  video?: string;
}

/** Scene artwork: `loop` seconds of video (none for universal, which is a still), `elements` the motion. */
export interface SceneAnimate {
  loop?: number;
  elements?: SceneAnimation[];
}

/**
 * One rule written into the SVG as an `<animate>` on every element `select` matches. The keys
 * other than `select` and `stagger` are SMIL's own and mean what they mean there.
 */
export interface SceneAnimation {
  /** `#id`, `tag`, or `#id tag` (every `tag` inside the element with that id). */
  select: string;
  attributeName: string;
  /** Semicolon-separated SMIL `values`. */
  values: string;
  /** Seconds; must divide the loop. */
  dur: number;
  /** Seconds into the animation the loop starts at. */
  begin?: number;
  keyTimes?: string;
  calcMode?: "linear" | "discrete" | "spline";
  keySplines?: string;
  additive?: "replace" | "sum";
  /** Spread the matches' `begin` across `dur`, so no two neighbours move in step. */
  stagger?: boolean;
}

export type AppStoreVideoCodec = "h264" | "prores";

/** How placement videos are encoded. */
export interface AppStoreVideoConfig {
  fps: 30 | 60;
  codec: AppStoreVideoCodec;
  /** Music for every video (.mp3, .m4a, .aac, .wav, .aiff), looped with a crossfade. */
  audio?: string;
  /** Seconds into `audio` where the loop may start; the first sound by default. */
  audioStart?: number;
  /** Seconds into `audio` where the loop must have ended; the track's end by default. */
  audioEnd?: number;
}

export interface AppStoreConfig {
  enabled: boolean;
  /** How much of each art safe area the centre item covers (contain-fit). */
  iconScale: number;
  /** Optional backdrop for the creative assets; falls back to inputs.backgroundImage. */
  backgroundImage?: string;
  /** Optional centre item (a wordmark, say); falls back to the icon. */
  centerImage?: string;
  header: AppStorePlacementConfig;
  searchResults: AppStorePlacementConfig;
  universal: AppStorePlacementConfig;
  /** In-App Event card (16:9) and details page (9:16): off by default, drawn only from a `source`. */
  eventCard: AppStorePlacementConfig;
  eventDetails: AppStorePlacementConfig;
  video: AppStoreVideoConfig;
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
  appStore: AppStoreConfig;
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
  appearances?: AppearanceEntry[];
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
