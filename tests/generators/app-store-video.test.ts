jest.setTimeout(180000);

import sharp from "sharp";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import {
  encodeRows,
  ffmpegPath,
  generateAppStoreVideos,
  pickEncoder,
  recordingFilter,
  rowOffset,
  videoAssets,
} from "../../src/generators/app-store-video";
import { ROW_SVG } from "../fixtures/row-artwork";

const TMP = join(__dirname, "../../.test-tmp-app-store-video");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("recordingFilter", () => {
  it("fits to the canvas at a constant rate and dissolves the tail into the head", () => {
    const filter = recordingFilter({ width: 3840, height: 2560, fps: 30, end: 16, crossfade: 0.5, codec: "h264" });
    expect(filter).toContain("[0]fps=30,scale=3840:2560:force_original_aspect_ratio=increase,crop=3840:2560,setsar=1,split=3");
    expect(filter).toContain("[h]trim=end=0.5,setpts=PTS-STARTPTS[head]");
    expect(filter).toContain("[a]trim=start=0.5:end=15.5,setpts=PTS-STARTPTS[body]");
    expect(filter).toContain("[b]trim=start=15.5:end=16,setpts=PTS-STARTPTS[tail]");
    expect(filter).toContain("[tail][head]xfade=transition=fade:duration=0.5:offset=0[seam]");
    expect(filter.endsWith("[body][seam]concat=n=2:v=1:a=0,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]")).toBe(true);
  });

  it("only trims when there is no crossfade", () => {
    const filter = recordingFilter({ width: 3840, height: 1646, fps: 60, end: 8, crossfade: 0, codec: "prores" });
    expect(filter).toContain("trim=end=8");
    expect(filter).not.toContain("xfade");
    expect(filter.endsWith("format=yuv422p10le[v]")).toBe(true);
  });
});

async function writeImage(name: string, size: number, channels: 3 | 4): Promise<string> {
  const path = join(TMP, name);
  const background = channels === 4 ? { r: 255, g: 255, b: 255, alpha: 0.5 } : { r: 0, g: 0, b: 0 };
  writeFileSync(path, await sharp({ create: { width: size, height: size, channels, background } }).png().toBuffer());
  return path;
}

describe("recordings", () => {
  it("are the only videos: none without one, and none for the universal placement", async () => {
    const icon = await writeImage("icon.png", 1280, 4);
    const background = await writeImage("bg.png", 2000, 3);
    const clip = join(TMP, "clip.mp4");
    writeFileSync(clip, "");

    const plain = resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { enabled: true } } });
    expect(videoAssets(plain)).toEqual([]);

    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { universal: { video: clip } } } }),
    ).toThrow(/no video for the universal asset/);
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { header: { video: icon } } } }),
    ).toThrow(/must be a \.mov, \.mp4 or \.m4v/);
  });
});

describe("row motion", () => {
  it("moves the top source row right-to-left, the next left-to-right, one pitch per loop", () => {
    expect(rowOffset(0, 0, 20, 785)).toBeCloseTo(0, 9);
    expect(rowOffset(0, 20, 20, 785)).toBeCloseTo(-785, 9);
    expect(rowOffset(1, 10, 20, 785)).toBeCloseTo(392.5, 9);
    expect(rowOffset(2, 10, 20, 785)).toBeCloseTo(-392.5, 9);
    expect(rowOffset(-1, 10, 20, 785)).toBeCloseTo(392.5, 9);
  });

  it("gives a placement a video for row artwork with animate, and only for header and search results", async () => {
    const icon = await writeImage("icon.png", 1280, 4);
    const background = await writeImage("bg.png", 2000, 3);
    const art = join(TMP, "wall.svg");
    writeFileSync(art, ROW_SVG);
    const config = resolveConfig({
      icon,
      background,
      color: "#000000",
      overrides: {
        appStore: {
          enabled: true,
          header: { source: art, animate: { rows: 20 } },
          searchResults: { source: art, animate: { rows: 20 } },
          universal: { enabled: false },
        },
      },
    });
    expect(videoAssets(config).map((asset) => asset.video)).toEqual(["header", "search-results"]);

    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { universal: { source: art, animate: { rows: 20 } } } } }),
    ).toThrow(/no video for the universal asset/);
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { header: { source: background, animate: { rows: 20 } } } } }),
    ).toThrow(/needs an SVG/);
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { header: { source: art, animate: { rows: 2 } } } } }),
    ).toThrow(/5 to 30 seconds/);
  });
});

const hasFfmpeg = spawnSync(ffmpegPath(), ["-version"]).status === 0;
const describeWithFfmpeg = hasFfmpeg ? describe : describe.skip;

describeWithFfmpeg("encodeRows (ffmpeg)", () => {
  it("slides the rows in a seamless loop while the fixed layer stays put", async () => {
    const source = join(TMP, "wall.svg");
    writeFileSync(source, ROW_SVG);
    const output = join(TMP, "rows.mp4");
    const ffmpeg = ffmpegPath();
    await encodeRows({ ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output, width: 400, height: 200, fps: 30, seconds: 5, codec: "h264" });

    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], { encoding: "utf-8" }),
    ) as { streams: Record<string, string | number>[] };
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    expect(video).toMatchObject({ codec_name: "h264", width: 400, height: 200, r_frame_rate: "30/1" });
    expect(Number(video?.nb_frames)).toBe(150);

    const frames = execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const size = 400 * 200 * 3;
    const frame = (n: number) => frames.subarray(n * size, (n + 1) * size);
    const diff = (a: Buffer, b: Buffer) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
    const step = diff(frame(0), frame(1));
    expect(step).toBeGreaterThan(0); // the rows move
    expect(diff(frame(149), frame(0))).toBeLessThan(step * 1.5); // the loop closes like any other step
    // The red mark at the centre never moves.
    for (const n of [0, 40, 80, 149]) {
      const p = (100 * 400 + 200) * 3;
      expect(frame(n)[p]).toBeGreaterThan(180);
      expect(frame(n)[p + 1]).toBeLessThan(80);
    }
  });
});

describeWithFfmpeg("generateAppStoreVideos (ffmpeg)", () => {
  it("cuts a recording into a looping search-results video", async () => {
    // A 7 s 16:9 clip whose colour drifts, so the seam is measurable.
    const source = join(TMP, "tour.mp4");
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=1280x720:r=24:d=7",
      "-vf", "geq=r='128+100*sin(T)':g='128':b='128+100*cos(T)'", "-c:v", "libx264", "-pix_fmt", "yuv420p", source,
    ]);
    const icon = await writeImage("icon.png", 1280, 4);
    const background = await writeImage("bg.png", 2000, 3);
    const config = resolveConfig({
      icon,
      background,
      color: "#000000",
      overrides: { appStore: { enabled: true, searchResults: { video: source } } },
    });
    expect(videoAssets(config).map((asset) => asset.video)).toEqual(["search-results"]);

    const written = await generateAppStoreVideos(join(TMP, "AppStore"), config);
    expect(written.map((path) => path.split("/").at(-1))).toEqual(["search-results.mp4"]);

    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", written[0]], { encoding: "utf-8" }),
    ) as { streams: Record<string, string | number>[] };
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    expect(video).toMatchObject({ codec_name: "h264", profile: "High", width: 3840, height: 2560, r_frame_rate: "30/1" });
    expect(audio).toMatchObject({ codec_name: "aac", channels: 2, sample_rate: "48000" });
    // 7 s of frames (the last at 6.958 s) minus the 0.5 s dissolve.
    expect(Math.abs(Number(video?.nb_frames) - 194)).toBeLessThanOrEqual(2);

    const frame = (args: string[]): Buffer =>
      execFileSync("ffmpeg", ["-v", "error", ...args, "-i", written[0], "-frames:v", "1", "-vf", "scale=64:43", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    const first = frame([]);
    const last = frame(["-sseof", "-0.04"]);
    let diff = 0;
    for (let i = 0; i < first.length; i++) diff += Math.abs(first[i] - last[i]);
    expect(diff / first.length).toBeLessThan(6);
  });
});
