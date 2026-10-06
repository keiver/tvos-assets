import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { AppStoreVideoCodec, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir } from "../utils/fs.js";
import { parseRowArtwork, renderRows } from "../utils/svg-rows.js";
import { StoreCache, inputKey } from "../utils/store-cache.js";
import { designCentre, enabledAssets } from "./app-store.js";
import type { AppStoreAsset } from "./app-store.js";

const run = promisify(execFile);

function encoderArgs(codec: AppStoreVideoCodec, encoder: string): string[] {
  const args = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
  if (codec === "prores") {
    args.push("-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-c:a", "pcm_s16le");
  } else {
    args.push("-c:v", encoder, "-profile:v", "high", "-b:v", "20M", "-maxrate", "24M", "-bufsize", "40M");
    if (encoder === "libx264") args.push("-preset", "slow");
    args.push("-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart");
  }
  return args;
}

/** Seconds of the recording's end blended into its start, so the loop has no visible cut. */
export const LOOP_CROSSFADE = 0.5;
/** App Store Connect's longest creative asset video; the shortest is per placement. */
const MAX_SECONDS = 30;

/**
 * Filter graph that fits a recording to a canvas (cover, centre crop) at a
 * constant `fps`, and makes it loop: the last `crossfade` seconds dissolve into
 * the first, and the result plays from there. Output length: end - crossfade.
 */
export function recordingFilter(options: {
  width: number;
  height: number;
  fps: number;
  end: number;
  crossfade: number;
  codec: AppStoreVideoCodec;
}): string {
  const { width, height, fps, end, crossfade: c } = options;
  const pixelFormat = options.codec === "prores" ? "yuv422p10le" : "yuv420p";
  const fit = `[0]fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  const convert = `scale=out_color_matrix=bt709:out_range=tv,format=${pixelFormat}[v]`;
  if (c <= 0) return `${fit},trim=end=${end},setpts=PTS-STARTPTS,${convert}`;
  return [
    `${fit},split=3[a][b][h]`,
    `[h]trim=end=${c},setpts=PTS-STARTPTS[head]`,
    `[a]trim=start=${c}:end=${end - c},setpts=PTS-STARTPTS[body]`,
    `[b]trim=start=${end - c}:end=${end},setpts=PTS-STARTPTS[tail]`,
    `[tail][head]xfade=transition=fade:duration=${c}:offset=0[seam]`,
    `[body][seam]concat=n=2:v=1:a=0,${convert}`,
  ].join(";");
}

export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function ffprobePath(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

/** The encoder this ffmpeg build offers for `codec`, libx264 first for H.264. */
export async function pickEncoder(ffmpeg: string, codec: AppStoreVideoCodec): Promise<string> {
  let listing: string;
  try {
    listing = (await run(ffmpeg, ["-hide_banner", "-encoders"], { maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`ffmpeg not found ("${ffmpeg}"). Install it or set FFMPEG_PATH to cut App Store videos.`);
    }
    throw err;
  }
  const wanted = codec === "prores" ? ["prores_ks"] : ["libx264", "h264_videotoolbox"];
  const found = wanted.find((name) => new RegExp(`\\s${name}\\s`).test(listing));
  if (!found) throw new Error(`ffmpeg at "${ffmpeg}" has none of: ${wanted.join(", ")}.`);
  return found;
}

/** Timestamp of the recording's last video frame; simulator captures write frames only on change. */
async function recordingEnd(file: string): Promise<number> {
  const { stdout } = await run(
    ffprobePath(),
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", file],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const times = stdout.split("\n").map(Number).filter(Number.isFinite);
  if (times.length === 0) throw new Error(`No video frames in ${file}.`);
  return Math.max(...times);
}

/** Cut a recording into a placement's looping video, capped at App Store Connect's 30 s. */
export async function encodeRecording(options: {
  ffmpeg: string;
  encoder: string;
  source: string;
  output: string;
  width: number;
  height: number;
  fps: number;
  codec: AppStoreVideoCodec;
  /** Shortest video App Store Connect takes for the placement. */
  minSeconds: number;
}): Promise<void> {
  const last = await recordingEnd(options.source);
  const crossfade = LOOP_CROSSFADE;
  const end = Math.min(last, MAX_SECONDS + crossfade);
  if (end - crossfade < options.minSeconds) {
    throw new Error(`${options.source} is ${last.toFixed(1)} s; this placement's looping video needs at least ${options.minSeconds + crossfade} s.`);
  }
  const filter = recordingFilter({ ...options, end, crossfade });
  await run(
    options.ffmpeg,
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", options.source,
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex", filter, "-map", "[v]", "-map", "1:a",
      "-t", String(end - crossfade), "-r", String(options.fps),
      ...encoderArgs(options.codec, options.encoder),
      options.output,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}

/** Row `k` slides right-to-left when even (the top source row is 0), left-to-right when odd. */
export function rowOffset(k: number, t: number, period: number, pitch: number): number {
  const direction = ((k % 2) + 2) % 2 === 0 ? -1 : 1;
  return (direction * pitch * t) / period;
}

/**
 * Slide the rows of row artwork one pitch per loop, so the last frame runs into the first;
 * everything outside the mask stays put. Frames are rendered with sharp and piped to ffmpeg.
 */
export async function encodeRows(options: {
  ffmpeg: string;
  encoder: string;
  source: string;
  output: string;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  codec: AppStoreVideoCodec;
  /** Where the artwork's centre goes; the canvas centre by default. */
  centre?: { x: number; y: number };
}): Promise<void> {
  const { width, height, fps, seconds, centre } = options;
  const art = parseRowArtwork(readFileSync(options.source, "utf8"));
  const frames = Math.round(seconds * fps);
  const pixelFormat = options.codec === "prores" ? "yuv422p10le" : "yuv420p";
  const ff = spawn(
    options.ffmpeg,
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-framerate", String(fps), "-i", "-",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-vf", `scale=out_color_matrix=bt709:out_range=tv:sws_dither=ed,format=${pixelFormat}`,
      "-map", "0:v", "-map", "1:a", "-t", String(frames / fps), "-r", String(fps),
      ...encoderArgs(options.codec, options.encoder),
      options.output,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  ff.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const done = new Promise<void>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${stderr.trim()}`))));
  });

  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    const svg = renderRows(art, width, height, (k) => rowOffset(k, t, seconds, art.pitchX), centre);
    const raw = await sharp(Buffer.from(svg)).flatten({ background: { r: 0, g: 0, b: 0 } }).removeAlpha().raw().toBuffer();
    if (!ff.stdin.write(raw)) await new Promise((resolve) => ff.stdin.once("drain", resolve));
  }
  ff.stdin.end();
  await done;
}

/** Placements that get a video: a recording, or row motion over row-artwork `source`. */
export function videoAssets(config: TvOSImageCreatorConfig): AppStoreAsset[] {
  return enabledAssets(config).filter((asset) => {
    const placement = config.appStore[asset.placement];
    return asset.video && (placement.video || placement.animate);
  });
}

/** Write each placement's looping video into `outDir`; unchanged ones are left as they are. */
export async function generateAppStoreVideos(outDir: string, config: TvOSImageCreatorConfig): Promise<string[]> {
  const assets = videoAssets(config);
  if (assets.length === 0) return [];

  const { fps, codec } = config.appStore.video;
  const ffmpeg = ffmpegPath();
  const encoder = await pickEncoder(ffmpeg, codec);
  const extension = codec === "prores" ? ".mov" : ".mp4";
  ensureDir(outDir);
  const cache = new StoreCache(outDir);

  const written: string[] = [];
  for (const asset of assets) {
    const filename = `${asset.video}${extension}`;
    const output = join(outDir, filename);
    const placement = config.appStore[asset.placement];
    const common = { ffmpeg, encoder, output, width: asset.width, height: asset.height, fps, codec };
    const centre = designCentre(asset);
    const key = placement.video
      ? inputKey([placement.video], ["recording", common.width, common.height, fps, codec, encoder])
      : inputKey([placement.source], ["rows", common.width, common.height, fps, codec, encoder, placement.animate, centre]);
    if (cache.fresh(filename, key)) continue;
    if (placement.video) {
      await encodeRecording({ ...common, source: placement.video, minSeconds: asset.minSeconds ?? 5 });
    } else {
      const seconds = (placement.animate as { rows: number }).rows;
      await encodeRows({ ...common, source: placement.source as string, seconds, centre });
    }
    cache.record(filename, key);
    written.push(output);
  }
  return written;
}
