// Xuất video: phát bài theo thời gian thật và ghi lại khung hình (cảnh 3D hoặc
// sơ đồ vẽ riêng) kèm nhạc bằng MediaRecorder. Xong thì trả lại trạng thái cũ.

import { st } from "../store";
import * as clock from "../clock";
import { music } from "../media";
import { projectEnd } from "../actions";
import { download } from "./save";
import {
  type VideoView, type RangeKind, type Res, pickMime, extFor, rangeFor, outputSize, bitrateFor, videoFileName,
} from "./videoOpts";
import { planGeometry, planFrame, drawPlanFrame } from "./planRender";

export interface RecordOpts {
  view: VideoView;
  range: RangeKind;
  res: Res;
  highlightId: string | null; // chỉ cho sơ đồ: video riêng một người
}

export interface Progress {
  t: number;
  a: number;
  b: number;
  fraction: number;
  note: string; // vd. "Cảnh 3D không ghi được, chuyển sang sơ đồ"
}

export interface RecordJob {
  cancel(): void;
  /** Tên tệp đã tải, hoặc null nếu bị Hủy. Ném lỗi khi hỏng. */
  done: Promise<string | null>;
}

const FPS = 30;
const BG3D = "#07080a";

export function canRecord(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    return "Trình duyệt này không quay được video. Hãy dùng Chrome hoặc Edge bản mới.";
  }
  return pickMime((m) => MediaRecorder.isTypeSupported(m)) ? null : "Trình duyệt không hỗ trợ định dạng video nào để ghi.";
}

export const recordMime = () =>
  typeof MediaRecorder === "undefined" ? null : pickMime((m) => MediaRecorder.isTypeSupported(m));

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Canvas WebGL của cảnh khán giả đang hiện trên màn hình (lớn nhất). */
function find3DCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  let area = 0;
  for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas[data-engine^="three.js"]')) {
    const a = c.clientWidth * c.clientHeight;
    if (a > area) {
      area = a;
      best = c;
    }
  }
  return area > 100 ? best : null;
}

// Nhạc: captureStream của <audio> (Chrome, Edge); không có thì đi qua AudioContext
// (một lần cho mỗi element, vẫn phát ra loa như cũ).
const routed = new WeakMap<HTMLMediaElement, { ctx: AudioContext; dest: MediaStreamAudioDestinationNode }>();
function audioTrack(el: HTMLMediaElement): { track: MediaStreamTrack; own: boolean } | null {
  const cs = (el as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream;
  if (typeof cs === "function" && !routed.has(el)) {
    try {
      const tr = cs.call(el).getAudioTracks()[0];
      if (tr) return { track: tr, own: true };
    } catch {
      /* thử cách dưới */
    }
  }
  try {
    let r = routed.get(el);
    if (!r) {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(el);
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ctx.destination);
      r = { ctx, dest };
      routed.set(el, r);
    }
    void r.ctx.resume();
    const tr = r.dest.stream.getAudioTracks()[0];
    return tr ? { track: tr, own: false } : null;
  } catch {
    return null;
  }
}

/** Ảnh gần như toàn màu nền: WebGL không cho đọc khung. */
function looksBlank(src: CanvasImageSource): boolean {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 18;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return false;
  x.fillStyle = BG3D;
  x.fillRect(0, 0, 32, 18);
  x.drawImage(src, 0, 0, 32, 18);
  const d = x.getImageData(0, 0, 32, 18).data;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 20 || d[i + 1] > 20 || d[i + 2] > 22) return false;
  return true;
}

export function startRecording(o: RecordOpts, onProgress: (p: Progress) => void): RecordJob {
  let cancelled = false;
  let stopNow: (() => void) | null = null;
  const job: RecordJob = {
    cancel() {
      cancelled = true;
      stopNow?.();
    },
    done: run(),
  };
  return job;

  async function run(): Promise<string | null> {
    const why = canRecord();
    if (why) throw new Error(why);
    const mime = recordMime()!;
    const p = st().project;
    const r = rangeFor(o.range, { end: projectEnd(p), loop: clock.getLoop(), t: clock.now() });
    if ("error" in r) throw new Error(r.error);
    const { a, b } = r;

    // giữ trạng thái để trả lại
    const saved = { t: clock.now(), loop: clock.getLoop(), speed: clock.getSpeed(), view: st().ui.view };
    clock.pause();
    clock.setLoop(null);
    clock.setSpeed(1);

    let note = "";
    let src: HTMLCanvasElement | null = null;
    if (o.view === "audience") {
      if (saved.view === "plan") st().setUI({ view: "audience" });
      for (let i = 0; i < 30 && !(src = find3DCanvas()); i++) await frame();
      if (!src) note = "Không thấy cảnh 3D, ghi sơ đồ từ trên thay thế.";
    }
    const aspect = src ? src.clientWidth / Math.max(1, src.clientHeight) : 16 / 9;
    const { w, h } = outputSize(o.res, aspect);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d")!;
    const geom = planGeometry(p.stage, w, h);
    const hl = src ? null : o.highlightId;
    const draw = () => {
      const t = clock.now();
      if (src) {
        ctx.fillStyle = BG3D;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(src, 0, 0, w, h);
      } else drawPlanFrame(ctx, geom, planFrame(st().project, t, geom, { highlightId: hl }));
      return t;
    };

    const stream = out.captureStream(FPS);
    let audio: { track: MediaStreamTrack; own: boolean } | null = null;
    const tracks: MediaStreamTrack[] = [...stream.getVideoTracks()];
    const restore = () => {
      clock.pause();
      for (const tr of tracks) tr.stop();
      if (audio?.own) audio.track.stop();
      clock.setSpeed(saved.speed);
      clock.setLoop(saved.loop);
      clock.seek(saved.t);
      if (st().ui.view !== saved.view) st().setUI({ view: saved.view });
    };

    try {
      clock.seek(a);
      // đợi video các vũ công tua xong và cảnh 3D vẽ lại
      for (let i = 0; i < 12; i++) {
        await frame();
        draw();
      }
      await wait(250);
      if (src && looksBlank(src)) {
        src = null;
        note = "Cảnh 3D không đọc được khung hình, ghi sơ đồ từ trên thay thế.";
      }
      draw();
      if (cancelled) return null;

      if (music.el && st().project.musicId) {
        audio = audioTrack(music.el);
        if (audio) stream.addTrack(audio.track);
        else note = (note ? note + " " : "") + "Không lấy được tiếng nhạc, video sẽ không có tiếng.";
      }
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, {
        mimeType: mime, videoBitsPerSecond: bitrateFor(o.res), audioBitsPerSecond: 128_000,
      });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise<void>((res, rej) => {
        rec.onstop = () => res();
        rec.onerror = (e) => rej(new Error(`Lỗi ghi video: ${(e as unknown as { error?: Error }).error?.message ?? "không rõ"}`));
      });
      stopped.catch(() => {}); // lỗi được đọc lại ở `await stopped`

      // rời tab thì trình duyệt ngừng vẽ: dừng hẳn thay vì ra video đứng hình
      let hiddenStop = false;
      const onVis = () => {
        if (document.hidden) {
          hiddenStop = true;
          stopNow?.();
        }
      };
      document.addEventListener("visibilitychange", onVis);

      let finish!: () => void;
      const ended = new Promise<void>((res) => (finish = res));
      stopNow = () => finish();

      rec.start(1000);
      clock.play();
      let started = false;
      const loop = () => {
        if (cancelled || hiddenStop) return finish();
        const t = draw();
        if (clock.isPlaying()) started = true;
        onProgress({ t, a, b, fraction: Math.min(1, (t - a) / (b - a)), note });
        if (t >= b - 1 / FPS || (started && !clock.isPlaying())) return finish();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      await ended;
      document.removeEventListener("visibilitychange", onVis);
      clock.pause();
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      if (cancelled) return null;
      if (hiddenStop) throw new Error("Đã dừng vì chuyển sang tab hoặc cửa sổ khác. Giữ tab này mở trong lúc xuất video.");
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      if (!blob.size) throw new Error("Không ghi được khung hình nào.");
      const who = hl ? p.dancers.find((d) => d.id === hl)?.name : undefined;
      const name = videoFileName(p.title, extFor(mime), who);
      download(blob, name);
      if (note) st().notify(note, { kind: "warn" });
      return name;
    } finally {
      stopNow = null;
      restore();
    }
  }
}
