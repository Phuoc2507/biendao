// Xuất video sơ đồ NHANH HƠN THỜI GIAN THỰC bằng WebCodecs.
//
// Không phát bài, không đụng đồng hồ: vẽ từng khung bằng drawPlanFrame theo thời
// gian giả t = a + i/fps, mã hoá bằng VideoEncoder (VP9, lùi về VP8); nhạc lấy từ
// bản đã giải mã bằng AudioContext.decodeAudioData, cắt đúng đoạn và đổi về 48 kHz
// bằng OfflineAudioContext, mã hoá Opus bằng AudioEncoder; đóng gói WebM bằng
// webm-muxer (đã có sẵn trong package.json, cũng dùng ở demo.ts).
//
// Thiếu API hoặc bộ mã nào thì trả "unsupported" để recordVideo.ts lùi về đường
// MediaRecorder thời gian thực.

import { Muxer, ArrayBufferTarget } from "webm-muxer";
import type { Project } from "../model";
import { music, decodeAudio } from "../media";
import { type Res, outputSize, bitrateFor, frameCount, opusHead } from "./videoOpts";
import { planGeometry, planFrame, drawPlanFrame } from "./planRender";

export interface FastProgress {
  t: number;
  fraction: number;
}

export interface FastOpts {
  project: Project;
  a: number;
  b: number;
  res: Res;
  highlightId: string | null;
  fps: number;
  isCancelled: () => boolean;
  onProgress: (p: FastProgress) => void;
}

const RATE = 48000; // Opus trong WebM luôn ghi 48 kHz
const ACHUNK = 4800; // 0,1 giây âm thanh mỗi AudioData

/** Trình duyệt có đủ lớp WebCodecs để thử đường nhanh (chưa kiểm bộ mã). */
export function hasWebCodecs(): boolean {
  const g = globalThis as unknown as Record<string, unknown>;
  return ["VideoEncoder", "AudioEncoder", "VideoFrame", "AudioData", "OfflineAudioContext"].every((k) => typeof g[k] === "function");
}

/** Nhường một nhịp cho trình duyệt (vẽ tiến độ, nhận khối đã mã hoá). Không bị hãm như setTimeout ở tab ẩn. */
const yieldNow = () =>
  new Promise<void>((r) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      r();
    };
    ch.port2.postMessage(0);
  });

async function pickVideoCodec(w: number, h: number, bitrate: number, fps: number): Promise<{ codec: string; mux: string } | null> {
  for (const [codec, mux] of [["vp09.00.10.08", "V_VP9"], ["vp8", "V_VP8"]] as const) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps });
      if (s.supported) return { codec, mux };
    } catch {
      /* thử bộ mã sau */
    }
  }
  return null;
}

/** Nhạc đã giải mã của dự án (dùng lại bản trong media.ts, thiếu thì giải mã lại từ tệp đang mở). */
async function musicBuffer(p: Project): Promise<AudioBuffer | null> {
  if (!p.musicId || music.id !== p.musicId) return null;
  if (music.buffer) return music.buffer;
  if (!music.el?.src) return null;
  try {
    const blob = await fetch(music.el.src).then((r) => r.blob());
    return await decodeAudio(blob);
  } catch {
    return null;
  }
}

/** Cắt đoạn [a, b] của bài nhạc, đổi về 48 kHz, ch kênh. */
async function renderSegment(buf: AudioBuffer, a: number, b: number, ch: number): Promise<AudioBuffer> {
  const len = Math.max(1, Math.ceil((b - a) * RATE));
  const oc = new OfflineAudioContext(ch, len, RATE);
  if (a < buf.duration) {
    const src = oc.createBufferSource();
    src.buffer = buf;
    src.connect(oc.destination);
    src.start(0, a, Math.min(b, buf.duration) - a);
  }
  return oc.startRendering();
}

/**
 * Dựng video sơ đồ đoạn [a, b]. Trả Blob WebM, null nếu bị Huỷ,
 * hoặc "unsupported" khi trình duyệt thiếu bộ mã (chưa làm gì cả).
 */
export async function renderPlanFast(o: FastOpts): Promise<Blob | null | "unsupported"> {
  if (!hasWebCodecs()) return "unsupported";
  const { project: p, a, b, fps } = o;
  const { w, h } = outputSize(o.res, 16 / 9);
  const bitrate = bitrateFor(o.res);
  const vc = await pickVideoCodec(w, h, bitrate, fps);
  if (!vc) return "unsupported";

  // nhạc: có bài nhạc thì bắt buộc mã hoá được tiếng, không thì để đường cũ lo
  let audio: AudioBuffer | null = null;
  let ch = 0;
  const src = p.musicId ? await musicBuffer(p) : null;
  if (p.musicId && !src) return "unsupported";
  if (src) {
    ch = Math.min(2, Math.max(1, src.numberOfChannels));
    const cfg: AudioEncoderConfig = { codec: "opus", sampleRate: RATE, numberOfChannels: ch, bitrate: 128_000 };
    let ok = false;
    try {
      ok = !!(await AudioEncoder.isConfigSupported(cfg)).supported;
    } catch {
      ok = false;
    }
    if (!ok) return "unsupported";
    audio = await renderSegment(src, a, b, ch);
  }
  if (o.isCancelled()) return null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: vc.mux, width: w, height: h, frameRate: fps },
    ...(audio ? { audio: { codec: "A_OPUS", numberOfChannels: ch, sampleRate: RATE } } : {}),
    firstTimestampBehavior: "offset",
  });

  let failure: Error | null = null;
  const fail = (what: string) => (e: unknown) => {
    failure ??= new Error(`${what}: ${(e as Error)?.message ?? "không rõ"}`);
  };
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: fail("Lỗi mã hoá hình"),
  });
  venc.configure({ codec: vc.codec, width: w, height: h, bitrate, framerate: fps });

  let aenc: AudioEncoder | null = null;
  if (audio) {
    let first = true;
    aenc = new AudioEncoder({
      output: (chunk, meta) => {
        // Một số bản Chrome không trả OpusHead: tự dựng để trình phát đọc được rãnh tiếng
        if (first && !meta?.decoderConfig?.description) {
          meta = { decoderConfig: { codec: "opus", sampleRate: RATE, numberOfChannels: ch, description: opusHead(ch, RATE) } };
        }
        first = false;
        muxer.addAudioChunk(chunk, meta);
      },
      error: fail("Lỗi mã hoá tiếng"),
    });
    aenc.configure({ codec: "opus", sampleRate: RATE, numberOfChannels: ch, bitrate: 128_000 });
  }
  const planes = audio ? Array.from({ length: ch }, (_, c) => audio!.getChannelData(c)) : [];
  const total = audio?.length ?? 0;
  let apos = 0;
  const feedAudio = (upTo: number) => {
    if (!aenc) return;
    const stop = Math.min(total, upTo);
    while (apos < stop) {
      const n = Math.min(ACHUNK, total - apos);
      const data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) data.set(planes[c].subarray(apos, apos + n), c * n);
      const ad = new AudioData({
        format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: ch,
        timestamp: Math.round((apos / RATE) * 1e6), data,
      });
      aenc.encode(ad);
      ad.close();
      apos += n;
    }
  };

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không tạo được khung vẽ.");
  const geom = planGeometry(p.stage, w, h);
  const N = frameCount(a, b, fps);
  const usPer = 1e6 / fps;

  try {
    for (let i = 0; i < N; i++) {
      if (failure) throw failure;
      const t = a + i / fps;
      drawPlanFrame(ctx, geom, planFrame(p, t, geom, { highlightId: o.highlightId }));
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * usPer), duration: Math.round(usPer) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      feedAudio(Math.ceil(((i + 1) / fps) * RATE));
      // chống dồn hàng đợi, và nhường để vẽ tiến độ, nhận nút Huỷ
      while (venc.encodeQueueSize > 6 || (aenc?.encodeQueueSize ?? 0) > 12) await yieldNow();
      if (i % 5 === 4) {
        o.onProgress({ t, fraction: (i + 1) / N });
        await yieldNow();
        if (o.isCancelled()) return null;
      }
    }
    feedAudio(total);
    o.onProgress({ t: b, fraction: 1 });
    await venc.flush();
    if (aenc) await aenc.flush();
    if (failure) throw failure;
    if (o.isCancelled()) return null;
    muxer.finalize();
    const { buffer } = muxer.target as ArrayBufferTarget;
    if (!buffer.byteLength) throw new Error("Không ghi được khung hình nào.");
    return new Blob([buffer], { type: "video/webm" });
  } finally {
    for (const e of [venc, aenc]) {
      try {
        if (e && e.state !== "closed") e.close();
      } catch {
        /* đã đóng */
      }
    }
  }
}
