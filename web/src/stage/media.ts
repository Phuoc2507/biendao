// Kho media đang mở: thẻ video và bản nhạc (HTMLAudioElement + AudioBuffer đã
// giải mã để vẽ sóng âm và khớp nhạc).
//
// Video tách hai tầng: VideoEntry giữ blob URL + kích thước theo mediaId (một
// tệp), còn <video> phát thì tạo RIÊNG cho từng vũ công (getDancerVideo). Nhờ
// vậy các bản nhân bản dùng chung một tệp nhưng mỗi người tua theo offsetSec
// của mình (múa canon) mà không giành nhau một element.

import { type MediaRec, getMedia, putMedia } from "./db";

export interface VideoEntry {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number;
}

const videos = new Map<string, VideoEntry>();
// <video> theo vũ công: dancerId -> element đang phát mediaId nào
const players = new Map<string, { mediaId: string; el: HTMLVideoElement }>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((f) => f());
}
export function subscribeMedia(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
export const mediaVersion = () => version;

export const getVideo = (id: string | null | undefined): VideoEntry | undefined =>
  id ? videos.get(id) : undefined;

export function uid(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

function waitMeta(el: HTMLMediaElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (el.readyState >= 1) return resolve();
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error("Không đọc được tệp media")); };
    const cleanup = () => {
      el.removeEventListener("loadedmetadata", ok);
      el.removeEventListener("error", bad);
    };
    el.addEventListener("loadedmetadata", ok);
    el.addEventListener("error", bad);
  });
}

/** Thời lượng thật của webm do MediaRecorder/muxer ghi có thể là Infinity: tua tới cuối để lấy. */
async function fixDuration(el: HTMLMediaElement): Promise<void> {
  if (Number.isFinite(el.duration)) return;
  await new Promise<void>((resolve) => {
    const done = () => { el.removeEventListener("durationchange", done); resolve(); };
    el.addEventListener("durationchange", done);
    el.currentTime = 1e7;
    setTimeout(done, 1500);
  });
  el.currentTime = 0;
}

function makeVideoEl(url: string): HTMLVideoElement {
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  el.src = url;
  return el;
}

function dropEl(el: HTMLVideoElement) {
  el.pause();
  el.removeAttribute("src");
  el.load();
}

export async function registerVideo(rec: MediaRec): Promise<VideoEntry> {
  const old = videos.get(rec.id);
  if (old) return old;
  const url = URL.createObjectURL(rec.blob);
  // element dò: chỉ để đọc kích thước, thời lượng rồi bỏ
  const el = makeVideoEl(url);
  try {
    await waitMeta(el);
    await fixDuration(el);
  } catch (e) {
    dropEl(el);
    URL.revokeObjectURL(url);
    throw e;
  }
  const e: VideoEntry = {
    id: rec.id, name: rec.name, url,
    width: el.videoWidth, height: el.videoHeight, duration: el.duration || 0,
  };
  dropEl(el);
  videos.set(rec.id, e);
  emit();
  return e;
}

/**
 * <video> riêng của một vũ công (tạo lần đầu gọi, cùng blob URL với các bản
 * sao). Đổi video thì element cũ bị bỏ, tạo cái mới. Không có video: undefined.
 */
export function getDancerVideo(dancerId: string, mediaId: string | null | undefined): HTMLVideoElement | undefined {
  const v = getVideo(mediaId);
  const cur = players.get(dancerId);
  if (cur && (!v || cur.mediaId !== v.id)) {
    dropEl(cur.el);
    players.delete(dancerId);
  } else if (cur) return cur.el;
  if (!v) return undefined;
  const el = makeVideoEl(v.url);
  // có khung đầu thì báo để đồng hồ tua đúng chỗ và thẻ vẽ lại (không emit
  // ngay vì hàm này có thể được gọi giữa lúc React render)
  el.addEventListener("loadeddata", () => emit(), { once: true });
  players.set(dancerId, { mediaId: v.id, el });
  return el;
}

/** Element đã có của vũ công (không tạo mới), để dừng người bị ẩn. */
export const peekDancerVideo = (dancerId: string): HTMLVideoElement | undefined => players.get(dancerId)?.el;

/** Bỏ element của các vũ công không còn trong danh sách (bị xoá). */
export function pruneDancerVideos(keep: Iterable<string>): void {
  const k = new Set(keep);
  for (const [id, p] of players) {
    if (k.has(id)) continue;
    dropEl(p.el);
    players.delete(id);
  }
}

export const dancerVideoCount = () => players.size;

export function forgetVideo(id: string): void {
  const v = videos.get(id);
  if (!v) return;
  for (const [did, p] of players) {
    if (p.mediaId !== id) continue;
    dropEl(p.el);
    players.delete(did);
  }
  URL.revokeObjectURL(v.url);
  videos.delete(id);
  emit();
}

// ---------- nhạc ----------

export interface MusicState {
  id: string | null;
  name: string;
  el: HTMLAudioElement | null;
  buffer: AudioBuffer | null;
  peaks: Float32Array | null; // cặp (min, max) cho mỗi khung PEAK_RATE
}
export const PEAK_RATE = 200; // khung mỗi giây

export const music: MusicState = { id: null, name: "", el: null, buffer: null, peaks: null };

let actx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!actx) actx = new AudioContext();
  return actx;
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer | null> {
  try {
    const buf = await blob.arrayBuffer();
    return await audioCtx().decodeAudioData(buf);
  } catch {
    return null;
  }
}

export function computePeaks(b: AudioBuffer): Float32Array {
  const n = Math.ceil(b.duration * PEAK_RATE);
  const out = new Float32Array(n * 2);
  const step = b.sampleRate / PEAK_RATE;
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 0;
    const a = Math.floor(i * step), z = Math.min(b.length, Math.floor((i + 1) * step));
    for (let j = a; j < z; j++) {
      let v = 0;
      for (const ch of chans) v += ch[j];
      v /= chans.length;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[2 * i] = lo;
    out[2 * i + 1] = hi;
  }
  return out;
}

export function monoOf(b: AudioBuffer): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0);
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const ch = b.getChannelData(c);
    for (let i = 0; i < b.length; i++) out[i] += ch[i] / b.numberOfChannels;
  }
  return out;
}

export async function setMusic(rec: MediaRec | null): Promise<number> {
  if (music.el) {
    music.el.pause();
    URL.revokeObjectURL(music.el.src);
  }
  if (!rec) {
    Object.assign(music, { id: null, name: "", el: null, buffer: null, peaks: null });
    emit();
    return 0;
  }
  const el = new Audio();
  el.preload = "auto";
  el.src = URL.createObjectURL(rec.blob);
  await waitMeta(el);
  await fixDuration(el);
  const buffer = await decodeAudio(rec.blob);
  Object.assign(music, {
    id: rec.id, name: rec.name, el, buffer,
    peaks: buffer ? computePeaks(buffer) : null,
  });
  emit();
  return buffer?.duration ?? el.duration ?? 0;
}

/** Nạp media đã lưu cho một dự án (bỏ qua tệp bị thiếu). Trả danh sách id thiếu. */
export async function loadMediaFor(musicId: string | null, videoIds: string[]): Promise<string[]> {
  const missing: string[] = [];
  if (musicId && music.id !== musicId) {
    const rec = await getMedia(musicId);
    if (rec) await setMusic(rec);
    else missing.push(musicId);
  }
  for (const id of videoIds) {
    if (videos.has(id)) continue;
    const rec = await getMedia(id);
    if (!rec) { missing.push(id); continue; }
    try { await registerVideo(rec); } catch { missing.push(id); }
  }
  return missing;
}

export async function storeBlob(name: string, blob: Blob): Promise<MediaRec> {
  const rec: MediaRec = { id: uid("m"), name, type: blob.type, blob };
  await putMedia(rec);
  return rec;
}

// ---------- phân loại tệp thả vào ----------

export const stripName = (name: string): string =>
  name.replace(/\.[^.]+$/, "").replace(/\.card$/i, "");

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

export interface CardMeta {
  name?: string;
  stacked?: boolean;
  offsetSec?: number;
  durationSec?: number;
  alignConfident?: boolean;
}

export interface Classified {
  music: File | null;
  videos: { file: File; meta: CardMeta | null }[];
  project: File | null;
  unknown: File[];
}

export async function classify(files: File[]): Promise<Classified> {
  const out: Classified = { music: null, videos: [], project: null, unknown: [] };
  const metas = new Map<string, CardMeta>();
  for (const f of files) {
    if (/\.card\.json$/i.test(f.name)) {
      try {
        const j = JSON.parse(await f.text());
        if (j && j.format === "choreo-card") metas.set(stripName(f.name).toLowerCase(), j);
        else out.unknown.push(f);
      } catch {
        out.unknown.push(f);
      }
    } else if (/\.json$/i.test(f.name)) {
      out.project = f;
    }
  }
  for (const f of files) {
    if (/\.json$/i.test(f.name)) continue;
    const isAudio = AUDIO_EXT.test(f.name) || f.type.startsWith("audio/");
    const isVideo = VIDEO_EXT.test(f.name) || f.type.startsWith("video/");
    if (isAudio && !isVideo) {
      if (!out.music) out.music = f;
      else out.unknown.push(f);
    } else if (isVideo) {
      out.videos.push({ file: f, meta: metas.get(stripName(f.name).toLowerCase()) ?? null });
    } else out.unknown.push(f);
  }
  return out;
}
