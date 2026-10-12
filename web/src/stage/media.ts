// Kho media đang mở: thẻ video và bản nhạc (HTMLAudioElement + AudioBuffer đã
// giải mã để vẽ sóng âm và khớp nhạc).
//
// Video tách hai tầng: VideoEntry giữ blob + kích thước theo mediaId (một tệp),
// còn <video> phát gắn theo khoá mediaId@offset (players.ts): bản nhân bản
// cùng độ lệch dùng chung một element, lệch canon thì mỗi người một element.
// Chỉ tạo element khi đang có cảnh khán giả (holdVideos), xem sơ đồ thì không.

import { type MediaRec, getMedia, putMedia, deleteMedia, isQuotaError } from "./db";
import {
  type CardMeta, type Problem, fileKind, parseCardMeta, looksLikeProject, stripName, mediaKey, JSON_MAX,
} from "./intake";
import { type PlayerDancer, playerKey, wantPlayers, planPlayers } from "./players";

export { stripName, type CardMeta } from "./intake";

export interface VideoEntry {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  duration: number; // giây, luôn hữu hạn (0 = chưa rõ)
}

/** Lỗi đọc media có mã, để báo người dùng lý do cụ thể. */
export class MediaFail extends Error {
  code: Problem;
  constructor(code: Problem) {
    super(code);
    this.code = code;
  }
}
export const failCode = (e: unknown): Problem =>
  e instanceof MediaFail ? e.code : isQuotaError(e) ? "quota" : "read";

const videos = new Map<string, VideoEntry>();
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

/** Chờ sự kiện `ev` (hoặc ready() đã đúng). Lỗi media / quá giờ thì báo MediaFail. */
function waitFor(el: HTMLMediaElement, ev: string, ms: number, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    let timer = 0;
    const done = (e?: Error) => {
      clearTimeout(timer);
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", bad);
      if (e) reject(e);
      else resolve();
    };
    const ok = () => done();
    // MediaError 2 = lỗi đọc; 3, 4 = không giải mã / không hỗ trợ
    const bad = () => done(new MediaFail(el.error?.code === 2 ? "read" : "decode"));
    el.addEventListener(ev, ok);
    el.addEventListener("error", bad);
    timer = window.setTimeout(() => done(new MediaFail("timeout")), ms);
  });
}

/** Thời lượng thật của webm do MediaRecorder/muxer ghi có thể là Infinity: tua tới cuối để lấy. */
async function fixDuration(el: HTMLMediaElement): Promise<void> {
  if (Number.isFinite(el.duration)) return;
  await new Promise<void>((resolve) => {
    const t0 = Date.now();
    const check = () => {
      if (Number.isFinite(el.duration) || Date.now() - t0 > 4000) {
        el.removeEventListener("durationchange", check);
        clearInterval(iv);
        resolve();
      }
    };
    el.addEventListener("durationchange", check);
    const iv = window.setInterval(check, 200);
    el.currentTime = 1e7;
  });
  el.currentTime = 0;
}

const finite = (x: number | undefined | null) => (x != null && Number.isFinite(x) && x > 0 ? x : 0);

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

// tệp đã lưu: khoá tên|cỡ|ngày -> mediaId (thả lại cùng tệp thì không lưu lần hai)
const byKey = new Map<string, string>();
const remember = (rec: MediaRec) => {
  if (rec.key) byKey.set(rec.key, rec.id);
};

export async function registerVideo(rec: MediaRec): Promise<VideoEntry> {
  const old = videos.get(rec.id);
  if (old) return old;
  remember(rec);
  const url = URL.createObjectURL(rec.blob);
  // element dò: đọc kích thước, thời lượng, thử giải mã khung đầu rồi bỏ
  const el = makeVideoEl(url);
  try {
    await waitFor(el, "loadedmetadata", 20000, () => el.readyState >= 1);
    if (!el.videoWidth) throw new MediaFail("nosize");
    try {
      await waitFor(el, "loadeddata", 12000, () => el.readyState >= 2);
    } catch (e) {
      // trình duyệt không chịu tải trước (iOS) thì quá giờ ở đây không phải lỗi
      if (!(e instanceof MediaFail && e.code === "timeout")) throw e;
    }
    if (!el.videoWidth) throw new MediaFail("nosize");
    await fixDuration(el);
  } catch (e) {
    dropEl(el);
    URL.revokeObjectURL(url);
    throw e;
  }
  const e: VideoEntry = {
    id: rec.id, name: rec.name, url, blob: rec.blob,
    width: el.videoWidth, height: el.videoHeight, duration: finite(el.duration),
  };
  dropEl(el);
  videos.set(rec.id, e);
  emit();
  return e;
}

// ---------- element phát ----------

export interface Player {
  key: string;
  mediaId: string;
  offsetSec: number;
  durationSec: number;
  el: HTMLVideoElement;
}
const players = new Map<string, Player>();
let assign = new Map<string, string>(); // dancerId -> khoá element
const readyListeners = new Set<(el: HTMLVideoElement) => void>();

/** Element vừa có khung đầu: đồng hồ tua riêng nó tới đúng chỗ (không emit). */
export function subscribePlayerReady(f: (el: HTMLVideoElement) => void): () => void {
  readyListeners.add(f);
  return () => readyListeners.delete(f);
}

function makePlayer(key: string, v: VideoEntry, offsetSec: number, durationSec: number): Player {
  const el = makeVideoEl(v.url);
  el.addEventListener("loadeddata", () => readyListeners.forEach((f) => f(el)), { once: true });
  const p: Player = { key, mediaId: v.id, offsetSec, durationSec, el };
  players.set(key, p);
  return p;
}

function rekey(p: Player, key: string, offsetSec: number) {
  players.delete(p.key);
  p.key = key;
  p.offsetSec = offsetSec;
  players.set(key, p);
}

// chỉ giữ element khi có cảnh khán giả đang mở (đếm số thẻ đang hiện)
let holds = 0;
let idle = true;
let idleTimer = 0;
const poke = () => queueMicrotask(emit);

/** Thẻ video gọi khi hiện; trả hàm nhả. Hết người giữ 3 s thì bỏ mọi element. */
export function holdVideos(): () => void {
  holds++;
  clearTimeout(idleTimer);
  if (idle) {
    idle = false;
    poke();
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--holds > 0) return;
    idleTimer = window.setTimeout(() => {
      idle = true;
      poke();
    }, 3000);
  };
}

let seen: { ds: unknown; ver: number; idle: boolean } = { ds: null, ver: -1, idle: true };
let playersDirty = false;

/** Đối chiếu element với danh sách vũ công (đồng hồ gọi). */
export function syncPlayers(ds: PlayerDancer[]): void {
  // gọi mỗi khung hình khi phát: danh sách và kho không đổi thì khỏi tính lại
  if (ds === seen.ds && version === seen.ver && idle === seen.idle && !playersDirty) return;
  seen = { ds, ver: version, idle };
  playersDirty = false;
  if (idle) {
    if (!players.size) return;
    for (const p of players.values()) dropEl(p.el);
    players.clear();
    assign = new Map();
    return;
  }
  const w = wantPlayers(ds, (id) => videos.has(id));
  const plan = planPlayers(w.byKey, w.assign, assign, players.keys());
  for (const [from, to] of plan.renames) rekey(players.get(from)!, to, w.byKey.get(to)!.offsetSec);
  for (const k of plan.drops) {
    dropEl(players.get(k)!.el);
    players.delete(k);
  }
  for (const k of plan.creates) {
    const x = w.byKey.get(k)!;
    makePlayer(k, videos.get(x.mediaId)!, x.offsetSec, x.durationSec);
  }
  for (const [k, x] of w.byKey) players.get(k)!.durationSec = x.durationSec;
  assign = w.assign;
  if (plan.renames.length || plan.creates.length) poke();
}

/**
 * <video> phát của một vũ công (tạo khi cần). Gọi được giữa lúc React render:
 * không emit. Không có video: undefined.
 */
export function getDancerVideo(
  dancerId: string, mediaId: string | null | undefined, offsetSec?: number, durationSec = 0,
): HTMLVideoElement | undefined {
  const v = getVideo(mediaId);
  if (!v) return undefined;
  const curKey = assign.get(dancerId);
  const cur = curKey ? players.get(curKey) : undefined;
  if (offsetSec === undefined) {
    if (cur && cur.mediaId === v.id) return cur.el;
    offsetSec = 0;
  }
  const k = playerKey(v.id, offsetSec);
  let p = players.get(k);
  if (!p) {
    const shared = !!cur && [...assign].some(([did, kk]) => kk === curKey && did !== dancerId);
    if (cur && cur.mediaId === v.id && !shared) {
      rekey(cur, k, offsetSec);
      p = cur;
    } else p = makePlayer(k, v, offsetSec, durationSec);
    playersDirty = true;
  }
  if (curKey !== k) playersDirty = true;
  assign.set(dancerId, k);
  if (durationSec > p.durationSec) p.durationSec = durationSec;
  return p.el;
}

/** Element đã có của vũ công (không tạo mới). */
export const peekDancerVideo = (dancerId: string): HTMLVideoElement | undefined => {
  const k = assign.get(dancerId);
  return k ? players.get(k)?.el : undefined;
};

export const listPlayers = (): Iterable<Player> => players.values();
export const playerCount = () => players.size;

export function forgetVideo(id: string): void {
  const v = videos.get(id);
  for (const [k, p] of players) {
    if (p.mediaId !== id) continue;
    dropEl(p.el);
    players.delete(k);
  }
  for (const [did, k] of assign) if (!players.has(k)) assign.delete(did);
  for (const [k, mid] of byKey) if (mid === id) byKey.delete(k);
  if (!v) return;
  URL.revokeObjectURL(v.url);
  videos.delete(id);
  emit();
}

/** Bỏ hẳn một media vừa lưu mà không dùng được (tệp hỏng). */
export async function discardMedia(id: string): Promise<void> {
  forgetVideo(id);
  await deleteMedia(id).catch(() => {});
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

let musicSeq = 0;

function clearMusic() {
  if (music.el) {
    music.el.pause();
    URL.revokeObjectURL(music.el.src);
  }
  Object.assign(music, { id: null, name: "", el: null, buffer: null, peaks: null });
}

/** Đổi bài nhạc đang mở. Trả thời lượng (giây, hữu hạn). Lần gọi sau thắng lần gọi trước. */
export async function setMusic(rec: MediaRec | null): Promise<number> {
  const my = ++musicSeq;
  if (!rec) {
    clearMusic();
    emit();
    return 0;
  }
  const url = URL.createObjectURL(rec.blob);
  const el = new Audio();
  el.preload = "auto";
  el.src = url;
  let buffer: AudioBuffer | null;
  try {
    await waitFor(el, "loadedmetadata", 20000, () => el.readyState >= 1);
    await fixDuration(el);
    buffer = await decodeAudio(rec.blob);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const dur = finite(buffer?.duration) || finite(el.duration);
  if (my !== musicSeq) {
    // đã có lệnh đổi nhạc mới hơn
    URL.revokeObjectURL(url);
    return dur;
  }
  clearMusic();
  remember(rec);
  Object.assign(music, {
    id: rec.id, name: rec.name, el, buffer,
    peaks: buffer ? computePeaks(buffer) : null,
  });
  emit();
  return dur;
}

let musicLoading: { id: string; p: Promise<boolean> } | null = null;

/** Mở nhạc theo id đã lưu (gộp các lần gọi trùng). false: thiếu hoặc hỏng. */
export function loadMusicId(id: string | null): Promise<boolean> {
  if (!id) {
    musicLoading = null;
    if (music.id) return setMusic(null).then(() => true);
    return Promise.resolve(true);
  }
  if (music.id === id) return Promise.resolve(true);
  if (musicLoading?.id === id) return musicLoading.p;
  const p = getMedia(id)
    .then((rec) => (rec ? setMusic(rec).then(() => music.id === id) : false))
    .catch(() => false)
    .finally(() => {
      if (musicLoading?.p === p) musicLoading = null;
    });
  musicLoading = { id, p };
  return p;
}

/** Nạp media đã lưu cho một dự án: tách id thiếu hẳn (không có trong máy) và id hỏng. */
export async function loadMediaDetailed(
  musicId: string | null, videoIds: string[], onProgress?: (i: number, n: number) => void,
): Promise<{ missing: string[]; failed: string[] }> {
  const missing: string[] = [];
  const failed: string[] = [];
  if (musicId && music.id !== musicId) {
    const rec = await getMedia(musicId).catch(() => undefined);
    if (!rec) missing.push(musicId);
    else if (!(await loadMusicId(musicId))) failed.push(musicId);
  }
  const ids = [...new Set(videoIds)];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    onProgress?.(i + 1, ids.length);
    if (videos.has(id)) continue;
    let rec: MediaRec | undefined;
    try {
      rec = await getMedia(id);
    } catch {
      failed.push(id);
      continue;
    }
    if (!rec) { missing.push(id); continue; }
    try { await registerVideo(rec); } catch { failed.push(id); }
  }
  return { missing, failed };
}

/** Nạp media đã lưu cho một dự án (bỏ qua tệp thiếu/hỏng). Trả danh sách id không nạp được. */
export async function loadMediaFor(
  musicId: string | null, videoIds: string[], onProgress?: (i: number, n: number) => void,
): Promise<string[]> {
  const r = await loadMediaDetailed(musicId, videoIds, onProgress);
  return [...r.missing, ...r.failed];
}

export async function storeBlob(name: string, blob: Blob): Promise<MediaRec> {
  const rec: MediaRec = { id: uid("m"), name, type: blob.type, blob };
  await putMedia(rec);
  return rec;
}

/** Lưu tệp người dùng thả vào; cùng tệp đã lưu rồi thì dùng lại (fresh = false). */
export async function storeFile(file: File): Promise<{ rec: MediaRec; fresh: boolean }> {
  const key = mediaKey(file);
  const known = byKey.get(key);
  if (known) {
    const rec = await getMedia(known).catch(() => undefined);
    if (rec) return { rec, fresh: false };
    byKey.delete(key);
  }
  const rec: MediaRec = { id: uid("m"), name: file.name, type: file.type, blob: file, key };
  try {
    await putMedia(rec);
  } catch (e) {
    throw isQuotaError(e) ? new MediaFail("quota") : e;
  }
  byKey.set(key, rec.id);
  return { rec, fresh: true };
}

// ---------- phân loại tệp thả vào ----------

export interface Classified {
  music: File | null;
  videos: { file: File; meta: CardMeta | null }[];
  project: File | null;
  unknown: File[];
}

export async function classify(files: File[]): Promise<Classified> {
  const out: Classified = { music: null, videos: [], project: null, unknown: [] };
  const metas = new Map<string, CardMeta>();
  const text = (f: File) => (f.size > JSON_MAX ? Promise.resolve("") : f.text().catch(() => ""));
  for (const f of files) {
    const k = fileKind(f.name, f.type);
    if (k === "card") {
      const m = parseCardMeta(await text(f));
      if (m) metas.set(stripName(f.name).toLowerCase(), m);
      else out.unknown.push(f);
    } else if (k === "json") {
      // chỉ nhận đúng tệp dự án; JSON lạ thì bỏ qua và báo
      let j: unknown = null;
      try { j = JSON.parse(await text(f)); } catch { /* không phải JSON */ }
      if (!out.project && looksLikeProject(j)) out.project = f;
      else out.unknown.push(f);
    }
  }
  for (const f of files) {
    const k = fileKind(f.name, f.type);
    if (k === "music") {
      if (!out.music) out.music = f;
      else out.unknown.push(f);
    } else if (k === "video") {
      out.videos.push({ file: f, meta: metas.get(stripName(f.name).toLowerCase()) ?? null });
    } else if (k === "other") out.unknown.push(f);
  }
  return out;
}
