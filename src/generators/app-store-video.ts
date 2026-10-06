import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AppStoreVideoCodec, TvOSImageCreatorConfig } from "../types.js";
import { ensureDir } from "../utils/fs.js";
import { rowFrames } from "../utils/row-frames.js";
import type { RowMotion } from "../utils/row-frames.js";
import { animationPeriods, parseRowArtwork } from "../utils/svg-rows.js";
import { StoreCache, inputKey } from "../utils/store-cache.js";
import { designCentre, enabledAssets, readRowArtwork } from "./app-store.js";
import type { AppStoreAsset } from "./app-store.js";

const run = promisify(execFile);

function encoderArgs(codec: AppStoreVideoCodec, encoder: string): string[] {
  const args = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
  if (codec === "prores") {
    args.push("-c:v", encoder, "-profile:v", encoder === "prores_ks" ? "3" : "hq");
    if (encoder === "prores_ks") args.push("-vendor", "apl0");
    args.push("-c:a", "pcm_s16le");
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
/** Seconds of the music's end blended into its start, so the soundtrack loops with the picture. */
export const AUDIO_CROSSFADE = 1;

/** Level below which the music's lead-in counts as silence and is skipped. */
const SILENCE = "-30dB";

/**
 * Filter graph looping `seconds` of input `input`'s audio from `start`: it takes `seconds + c` s,
 * plays from `c`, and crossfades its last `c` s into its first, so the end runs into the start. `[aout]`.
 */
export function audioLoopFilter(input: number, seconds: number, start = 0): string {
  const c = Math.min(AUDIO_CROSSFADE, seconds / 4);
  return [
    `[${input}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${start}:end=${start + seconds + c},asetpts=PTS-STARTPTS,asplit=3[ah][ab][at]`,
    `[ah]atrim=end=${c},asetpts=PTS-STARTPTS[head]`,
    `[ab]atrim=start=${c}:end=${seconds},asetpts=PTS-STARTPTS[body]`,
    `[at]atrim=start=${seconds}:end=${seconds + c},asetpts=PTS-STARTPTS[tail]`,
    `[tail][head]acrossfade=d=${c}:c1=qsin:c2=qsin[seam]`,
    `[body][seam]concat=n=2:v=0:a=1[aout]`,
  ].join(";");
}

/** Seconds of silence the music opens with, so the loop starts where it does. */
async function leadIn(ffmpeg: string, audio: string): Promise<number> {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-t", "60", "-i", audio, "-af", `silencedetect=n=${SILENCE}:d=0.1`, "-f", "null", "-"], { maxBuffer: 8 * 1024 * 1024 });
  const start = stderr.match(/silence_start: (-?[\d.]+)/);
  const end = stderr.match(/silence_end: ([\d.]+)/);
  return start && Number(start[1]) <= 0.05 && end ? Number(end[1]) : 0;
}

/** Loudness envelope frames per second used to choose a loop. */
const ENVELOPE_RATE = 50;

/**
 * Where to start a `seconds` loop of `samples` (mono, `rate` Hz) within [`from`, `to`] seconds:
 * the start whose rhythm `seconds` later best matches its own (the onsets over the next 2 s
 * correlate), among starts whose loop never drops below half the window's median level.
 */
export function bestLoopStart(samples: Float32Array, rate: number, seconds: number, crossfade: number, from: number, to: number): number {
  const hop = Math.round(rate / ENVELOPE_RATE);
  const env: number[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j++) s += samples[j] * samples[j];
    env.push(Math.sqrt(s / hop));
  }
  const onset = env.map((v, i) => Math.max(0, v - (env[i - 1] ?? v)));
  const half = Math.round(ENVELOPE_RATE / 4);
  const level = env.map((_v, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(env.length - 1, i + half); j++) { s += env[j]; n++; }
    return s / n;
  });
  const span = Math.round((seconds + crossfade) * ENVELOPE_RATE), loop = Math.round(seconds * ENVELOPE_RATE);
  const context = 2 * ENVELOPE_RATE;
  const first = Math.max(0, Math.round(from * ENVELOPE_RATE));
  const last = Math.min(env.length - Math.max(span, loop + context), Math.round(to * ENVELOPE_RATE) - span);
  if (last < first) return from;
  const window = level.slice(first, last + span).sort((a, b) => a - b);
  const floor = 0.5 * window[Math.floor(window.length / 2)];

  let best = first, bestScore = -Infinity;
  for (let s = first; s <= last; s++) {
    let quiet = false;
    for (let j = s; j < s + span && !quiet; j++) quiet = level[j] < floor;
    if (quiet) continue;
    let ab = 0, aa = 0, bb = 0;
    for (let j = 0; j < context; j++) {
      const a = onset[s + j], b = onset[s + loop + j];
      ab += a * b; aa += a * a; bb += b * b;
    }
    const score = aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best / ENVELOPE_RATE;
}

/**
 * ffmpeg inputs, filter and map for a video's soundtrack: `audio` looped, or silence. The loop is
 * taken from `window` (seconds into the track; by default from the first sound to the end), at the
 * start `bestLoopStart` picks.
 */
async function soundtrack(
  ffmpeg: string,
  audio: string | undefined,
  input: number,
  seconds: number,
  window: { start?: number; end?: number } = {},
): Promise<{ inputs: string[]; filter?: string; map: string }> {
  if (!audio) return { inputs: ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"], map: `${input}:a` };
  const { stdout } = await run(ffprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio]);
  const from = window.start ?? (await leadIn(ffmpeg, audio));
  const to = Math.min(window.end ?? Infinity, Number(stdout));
  const crossfade = Math.min(AUDIO_CROSSFADE, seconds / 4);
  const needed = seconds + crossfade;
  if (!(to - from >= needed - 0.01)) {
    throw new Error(`${audio} has ${(to - from).toFixed(1)} s of music between ${from.toFixed(1)} s and ${to.toFixed(1)} s; a ${seconds} s looping video needs at least ${needed} s.`);
  }
  const rate = 8000;
  const pcm = (await run(ffmpeg, ["-v", "error", "-i", audio, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 })).stdout as unknown as Buffer;
  const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + Math.floor(pcm.length / 4) * 4));
  const start = to - from - needed < 0.05 ? from : bestLoopStart(samples, rate, seconds, crossfade, from, to);
  return { inputs: ["-i", audio], filter: audioLoopFilter(input, seconds, start), map: "[aout]" };
}

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

/**
 * Encoders for `codec` in order of preference. H.264 takes libx264 first: VideoToolbox's quality
 * pulses at each keyframe, which shows as a hitch where a loop restarts. ProRes is all keyframes,
 * so on a Mac its VideoToolbox encoder goes first.
 */
export function encoderPreference(codec: AppStoreVideoCodec, platform: NodeJS.Platform = process.platform): string[] {
  if (codec === "h264") return ["libx264", "h264_videotoolbox"];
  return platform === "darwin" ? ["prores_videotoolbox", "prores_ks"] : ["prores_ks", "prores_videotoolbox"];
}

/** The first encoder in `encoderPreference` this ffmpeg build offers. */
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
  const wanted = encoderPreference(codec);
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
  /** Music for the soundtrack, looped; silence without it. */
  audio?: string;
  /** Seconds into `audio` the loop is taken from. */
  audioWindow?: { start?: number; end?: number };
}): Promise<void> {
  const last = await recordingEnd(options.source);
  const crossfade = LOOP_CROSSFADE;
  const end = Math.min(last, MAX_SECONDS + crossfade);
  if (end - crossfade < options.minSeconds) {
    throw new Error(`${options.source} is ${last.toFixed(1)} s; this placement's looping video needs at least ${options.minSeconds + crossfade} s.`);
  }
  const sound = await soundtrack(options.ffmpeg, options.audio, 1, end - crossfade, options.audioWindow);
  const filter = [recordingFilter({ ...options, end, crossfade }), sound.filter].filter(Boolean).join(";");
  await run(
    options.ffmpeg,
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", options.source,
      ...sound.inputs,
      "-filter_complex", filter, "-map", "[v]", "-map", sound.map,
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

/** Frames rendered ahead of the one ffmpeg is waiting for. */
const IN_FLIGHT = Math.min(8, Math.max(2, os.availableParallelism?.() ?? os.cpus().length));

/**
 * Slide the rows of row artwork one pitch per loop, so the last frame runs into the first;
 * everything outside the mask stays put. Frames are rendered several at a time and piped to
 * ffmpeg in order.
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
  /** Music for the soundtrack, looped; silence without it. */
  audio?: string;
  /** Seconds into `audio` the loop is taken from. */
  audioWindow?: { start?: number; end?: number };
}): Promise<void> {
  const { width, height, fps, seconds, centre } = options;
  const art = parseRowArtwork(readFileSync(options.source, "utf8"));
  for (const dur of animationPeriods(art.source)) {
    const cycles = seconds / dur;
    if (!(dur > 0) || Math.abs(cycles - Math.round(cycles)) > 1e-6) {
      throw new Error(`Row artwork: an <animate> lasts ${dur} s, which does not divide the ${seconds} s loop, so the loop would jump.`);
    }
  }
  const frames = Math.round(seconds * fps);
  // Shapes riding a card hand over to the next card in the last moments, so the loop closes.
  const fade = Math.min(LOOP_CROSSFADE, seconds / 4);
  const motion = (t: number): RowMotion => ({
    offsets: (k) => rowOffset(k, t, seconds, art.pitchX),
    seam: t > seconds - fade ? { weight: (t - (seconds - fade)) / fade, shift: (k) => rowOffset(k, seconds, seconds, art.pitchX) } : undefined,
  });
  const source = await rowFrames(art, width, height, centre ?? { x: width / 2, y: height / 2 }, motion, [seconds * 0.37, seconds - fade / 2]);
  const pixelFormat = options.codec === "prores" ? "yuv422p10le" : "yuv420p";
  const sound = await soundtrack(options.ffmpeg, options.audio, 1, frames / fps, options.audioWindow);
  const filter = [`[0:v]scale=out_color_matrix=bt709:out_range=tv:sws_dither=ed,format=${pixelFormat}[v]`, sound.filter].filter(Boolean).join(";");
  const ff = spawn(
    options.ffmpeg,
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-framerate", String(fps), "-i", "-",
      ...sound.inputs,
      "-filter_complex", filter,
      "-map", "[v]", "-map", sound.map, "-t", String(frames / fps), "-r", String(fps),
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

  const ahead = new Map<number, Promise<Buffer>>();
  let next = 0;
  try {
    for (let f = 0; f < frames; f++) {
      while (next < frames && next < f + IN_FLIGHT) {
        const n = next++;
        const pending = source.frame(n / fps);
        pending.catch(() => undefined);
        ahead.set(n, pending);
      }
      const raw = await (ahead.get(f) as Promise<Buffer>);
      ahead.delete(f);
      if (!ff.stdin.write(raw)) await new Promise((resolve) => ff.stdin.once("drain", resolve));
    }
  } finally {
    ff.stdin.end();
  }
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

  const { fps, codec, audio, audioStart, audioEnd } = config.appStore.video;
  const audioWindow = { start: audioStart, end: audioEnd };
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
    const common = { ffmpeg, encoder, output, width: asset.width, height: asset.height, fps, codec, audio, audioWindow };
    const centre = designCentre(asset, readRowArtwork(placement.source));
    const sound = [Boolean(audio), AUDIO_CROSSFADE, audioStart ?? null, audioEnd ?? null];
    const key = placement.video
      ? inputKey([placement.video, audio], ["recording", common.width, common.height, fps, codec, encoder, sound])
      : inputKey([placement.source, audio], ["rows", common.width, common.height, fps, codec, encoder, placement.animate, centre, sound]);
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
