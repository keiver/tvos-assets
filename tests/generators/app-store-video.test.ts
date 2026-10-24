jest.setTimeout(180000);

import sharp from "sharp";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../../src/config";
import {
  audioLoopFilter,
  bestLoopStart,
  encodeRise,
  encodeRows,
  encodeScene,
  encoderPreference,
  ffmpegPath,
  generateAppStoreVideos,
  pickEncoder,
  recordingFilter,
  rowOffset,
  videoAssets,
} from "../../src/generators/app-store-video";
import { risePhase, riseTiming } from "../../src/utils/rise-frames";
import { openSceneBrowser } from "../../src/utils/scene-browser";
import { RAISED_SVG, ROW_SVG } from "../fixtures/row-artwork";
import { readFileSync } from "node:fs";

const SCENE_SVG = readFileSync(join(__dirname, "../../examples/scene-artwork/fireflies.svg"), "utf8");

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
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { video: { audio: icon } } } }),
    ).toThrow(/appStore\.video\.audio must be a \.mp3, \.m4a, \.aac, \.wav or \.aiff/);
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { video: { audioStart: -1 } } } }),
    ).toThrow(/Invalid appStore\.video\.audioStart/);
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { video: { audioStart: 30, audioEnd: 10 } } } }),
    ).toThrow(/audioEnd \(10\) must come after audioStart \(30\)/);
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

  it("takes rise in place of rows, with the same limits, and never both", async () => {
    const icon = await writeImage("icon.png", 1280, 4);
    const background = await writeImage("bg.png", 2000, 3);
    const art = join(TMP, "wall.svg");
    writeFileSync(art, ROW_SVG);
    const header = (animate: object) => resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { enabled: true, header: { source: art, animate } } } } as never);
    expect(videoAssets(header({ rise: 20 })).map((asset) => asset.video)).toEqual(["header"]);
    expect(() => header({ rise: 31 })).toThrow(/Invalid appStore\.header\.animate\.rise: "31"\. Use 5 to 30 seconds/);
    expect(() => header({ rows: 20, rise: 20 })).toThrow(/animate takes one of rows or rise, got: rows, rise/);
    expect(() => header({ fade: 20 })).toThrow(/animate takes one of rows or rise, got: fade/);
    expect(() =>
      resolveConfig({ icon, background, color: "#000000", overrides: { appStore: { eventCard: { enabled: true, source: art, animate: { rise: 10 } } } } }),
    ).toThrow(/animate\.rise: "10"\. Use 15 to 30 seconds/);
  });
});

describe("audioLoopFilter", () => {
  it("plays from the crossfade on and blends the tail into the head", () => {
    const filter = audioLoopFilter(1, 20);
    expect(filter).toContain("[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=0:end=21,");
    expect(audioLoopFilter(1, 20, 2.5)).toContain("atrim=start=2.5:end=23.5,");
    expect(filter).toContain("[ab]atrim=start=1:end=20,asetpts=PTS-STARTPTS[body]");
    expect(filter).toContain("[at]atrim=start=20:end=21,asetpts=PTS-STARTPTS[tail]");
    expect(filter).toContain("[tail][head]acrossfade=d=1:c1=qsin:c2=qsin[seam]");
    expect(filter.endsWith("[body][seam]concat=n=2:v=0:a=1[aout]")).toBe(true);
  });
});

describe("bestLoopStart", () => {
  // 30 s of beats every 0.5 s at 8 kHz, silent from 10 s to 11 s.
  const rate = 8000;
  const track = new Float32Array(30 * rate).map((_v, i) => {
    const t = i / rate;
    if (t >= 10 && t < 11) return 0;
    return Math.sin(2 * Math.PI * 440 * t) * Math.exp(-8 * (t % 0.5));
  });

  it("keeps the loop clear of a drop-out", () => {
    const start = bestLoopStart(track, rate, 5, 1, 0, 30);
    expect(start + 6 <= 10 || start >= 11).toBe(true);
  });

  it("stays inside the window it is given", () => {
    const start = bestLoopStart(track, rate, 5, 1, 15, 25);
    expect(start).toBeGreaterThanOrEqual(15);
    expect(start + 6).toBeLessThanOrEqual(25);
  });

  it("starts on the beat: the loop's end and start fall on the same phase of it", () => {
    const start = bestLoopStart(track, rate, 5, 1, 0, 30);
    const phase = (start % 0.5) / 0.5;
    expect(Math.min(phase, 1 - phase)).toBeLessThan(0.1);
  });
});

describe("encoderPreference", () => {
  it("takes libx264 first for H.264, and VideoToolbox first for ProRes on a Mac", () => {
    expect(encoderPreference("h264", "darwin")).toEqual(["libx264", "h264_videotoolbox"]);
    expect(encoderPreference("prores", "darwin")).toEqual(["prores_videotoolbox", "prores_ks"]);
    expect(encoderPreference("h264", "linux")).toEqual(["libx264", "h264_videotoolbox"]);
    expect(encoderPreference("prores", "linux")).toEqual(["prores_ks", "prores_videotoolbox"]);
  });
});

const hasFfmpeg = spawnSync(ffmpegPath(), ["-version"]).status === 0;
const describeWithFfmpeg = hasFfmpeg ? describe : describe.skip;

describeWithFfmpeg("encodeRise (ffmpeg)", () => {
  it("lifts cards out of an empty surface and back, in a loop that closes", async () => {
    const source = join(TMP, "raised.svg");
    writeFileSync(source, RAISED_SVG);
    const output = join(TMP, "rise.mp4");
    const ffmpeg = ffmpegPath();
    await encodeRise({ ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output, width: 400, height: 200, fps: 30, seconds: 5, codec: "h264" });

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
    let biggest = 0;
    for (let n = 0; n < 149; n++) biggest = Math.max(biggest, diff(frame(n), frame(n + 1)));
    expect(biggest).toBeGreaterThan(0); // cards move
    expect(diff(frame(149), frame(0))).toBeLessThanOrEqual(biggest); // the loop closes like any other step

    // The card at (200, 100), row 1 column 2: gold at the top of its rise, the black surface as it starts.
    const start = risePhase(2, 1, 5), { life } = riseTiming(5);
    const at = (t: number) => { const p = (100 * 400 + 180) * 3, f = frame(Math.round((t % 5) * 30) % 150); return [f[p], f[p + 1], f[p + 2]]; };
    expect(at(start + life / 2)[0]).toBeGreaterThan(200);
    expect(at(start + life / 2)[2]).toBeLessThan(80);
    expect(at(start)[0]).toBeLessThan(40);
  });

  it("writes a placement's video from animate.rise", async () => {
    const icon = await writeImage("icon.png", 1280, 4);
    const background = await writeImage("bg.png", 2000, 3);
    // Cards far apart, so the 4K canvas holds a couple of dozen and little of it moves.
    const cards = [[500, 250], [1500, 250], [0, 750], [1000, 750], [2000, 750]]
      .map(([x, y]) => `<rect x="${x - 100}" y="${y - 60}" width="200" height="120" rx="30" fill="white"/>`).join("");
    const art = join(TMP, "big.svg");
    writeFileSync(art, `<svg width="2000" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="2000" height="1000" fill="#101010"/><mask id="m">${cards}</mask><rect width="2000" height="1000" fill="#FFC312" mask="url(#m)"/></svg>`);
    const config = resolveConfig({
      icon,
      background,
      color: "#000000",
      overrides: { appStore: { enabled: true, header: { source: art, animate: { rise: 5 } } } },
    } as never);
    const written = await generateAppStoreVideos(join(TMP, "AppStore"), config);
    expect(written.map((path) => path.split("/").at(-1))).toEqual(["header.mp4"]);
    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", written[0]], { encoding: "utf-8" }),
    ) as { streams: Record<string, string | number>[] };
    expect(probe.streams.find((stream) => stream.codec_type === "video")).toMatchObject({ width: 3840, height: 1646, nb_frames: "150" });
    // Unchanged inputs: nothing is redrawn.
    expect(await generateAppStoreVideos(join(TMP, "AppStore"), config)).toEqual([]);
  });
});

describeWithFfmpeg("encodeRows (ffmpeg)", () => {
  it("slides the rows in a seamless loop, the mark riding its card", async () => {
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
    // The red mark sits on a middle-row card, which slides right 100 px over the loop: it rides along.
    const red = (n: number, x: number) => { const p = (100 * 400 + x) * 3; return frame(n)[p] > 180 && frame(n)[p + 1] < 80; };
    expect(red(0, 200)).toBe(true);
    expect(red(75, 250)).toBe(true);
    expect(red(75, 200)).toBe(false);
  });

  it("loops music as the soundtrack, its end running into its start", async () => {
    const source = join(TMP, "wall.svg");
    writeFileSync(source, ROW_SVG);
    const audio = join(TMP, "music.wav");
    // A 440 Hz tone with a slow swell, so a cut anywhere would show as a jump in the samples.
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*440*t)*(0.6+0.4*sin(2*PI*0.3*t)):s=48000:d=8", "-ac", "2", "-y", audio]);
    const output = join(TMP, "music.mp4");
    const ffmpeg = ffmpegPath();
    await encodeRows({ ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output, width: 400, height: 200, fps: 30, seconds: 5, codec: "h264", audio });

    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", output, "-map", "0:a", "-ac", "1", "-f", "f32le", "-"], { maxBuffer: 64 * 1024 * 1024 });
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
    expect(Math.abs(samples.length / 48000 - 5)).toBeLessThan(0.05);
    const loudness = (from: number, to: number) => { let s = 0; for (let i = from; i < to; i++) s += samples[i] * samples[i]; return Math.sqrt(s / (to - from)); };
    expect(loudness(0, 4800)).toBeGreaterThan(0.1); // music, not silence
    // Around the seam (end, then start) the level carries on, with no drop or click.
    const tailEnd = loudness(samples.length - 2400, samples.length), headStart = loudness(0, 2400);
    expect(Math.abs(tailEnd - headStart) / headStart).toBeLessThan(0.15);
  });

  it("refuses music shorter than the loop plus its crossfade", async () => {
    const source = join(TMP, "wall.svg");
    writeFileSync(source, ROW_SVG);
    const audio = join(TMP, "short.wav");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=5", "-y", audio]);
    const ffmpeg = ffmpegPath();
    await expect(
      encodeRows({ ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output: join(TMP, "short.mp4"), width: 400, height: 200, fps: 30, seconds: 5, codec: "h264", audio }),
    ).rejects.toThrow(/has 5\.0 s of music between 0\.0 s and 5\.0 s; a 5 s looping video needs at least 6 s/);
  });

  it("refuses an <animate> whose dur does not divide the loop", async () => {
    const source = join(TMP, "blink.svg");
    writeFileSync(source, ROW_SVG.replace('fill="#FF0000"/>', 'fill="#FF0000"><animate attributeName="opacity" values="1;0" dur="2s"/></rect>'));
    const ffmpeg = ffmpegPath();
    await expect(
      encodeRows({ ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output: join(TMP, "blink.mp4"), width: 400, height: 200, fps: 30, seconds: 5, codec: "h264" }),
    ).rejects.toThrow(/lasts 2 s, which does not divide the 5 s loop/);
  });
});

describeWithFfmpeg("encodeScene (ffmpeg and Chrome)", () => {
  it("plays the rules in Chrome for one loop, each light breathing out of step with the next", async () => {
    const source = join(TMP, "scene.svg");
    writeFileSync(source, SCENE_SVG);
    const output = join(TMP, "scene.mp4");
    const ffmpeg = ffmpegPath();
    const browser = await openSceneBrowser();
    try {
      await encodeScene({
        ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output, width: 480, height: 206, fps: 30, seconds: 5, codec: "h264", browser,
        elements: [{ select: "#lights g", attributeName: "opacity", values: "0;1;0", dur: 5, stagger: true }],
      });
    } finally {
      await browser.close();
    }
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], { encoding: "utf-8" })) as { streams: Record<string, string | number>[] };
    expect(probe.streams.find((s) => s.codec_type === "video")).toMatchObject({ width: 480, height: 206, nb_frames: "150" });
    const frame = (t: number): Buffer =>
      execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", output, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    const red = (buf: Buffer, x: number, y: number): number => buf[(y * 480 + x) * 3];
    // The first light (300,520 in the 1920x823 scene) begins 0.44 s in, so it peaks near 2.06 s and is dim at 0.
    expect(red(frame(2.06), 75, 130)).toBeGreaterThan(red(frame(0), 75, 130) + 60);
    // The second light (640,440) begins 2.91 s in, so at 2.06 s it is on its way down, dimmer than the first.
    expect(red(frame(2.06), 160, 110)).toBeLessThan(red(frame(2.06), 75, 130) - 40);
  });

  it("refuses a rule whose dur does not divide the loop", async () => {
    const source = join(TMP, "scene.svg");
    writeFileSync(source, SCENE_SVG);
    const ffmpeg = ffmpegPath();
    const browser = await openSceneBrowser();
    try {
      await expect(
        encodeScene({
          ffmpeg, encoder: await pickEncoder(ffmpeg, "h264"), source, output: join(TMP, "bad.mp4"), width: 480, height: 206, fps: 30, seconds: 5, codec: "h264", browser,
          elements: [{ select: "#lights g", attributeName: "opacity", values: "0;1;0", dur: 2 }],
        }),
      ).rejects.toThrow(/lasts 2 s, which does not divide the 5 s loop/);
    } finally {
      await browser.close();
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
