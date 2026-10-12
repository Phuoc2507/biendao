// Đồng hồ phát duy nhất. Có nhạc thì <audio> là đồng hồ gốc; video các vũ
// công bám theo (tua lại khi lệch quá DRIFT). Không có nhạc thì chạy bằng
// performance.now().

import { useSyncExternalStore } from "react";
import { getVideo, listPlayers, syncPlayers, subscribeMedia, subscribePlayerReady, music } from "./media";
import { videoTarget } from "./timing";

export interface SyncDancer {
  id: string;
  mediaId: string | null;
  offsetSec: number;
  durationSec: number;
  hidden: boolean;
}

const DRIFT = 0.08;

let t = 0;
let playing = false;
let speed = 1;
let loop: { a: number; b: number } | null = null;
let raf = 0;
let lastNow = 0;
let getDancers: () => SyncDancer[] = () => [];
let getEnd: () => number = () => 30;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

let mediaHooked = false;
export function configureClock(o: { dancers: () => SyncDancer[]; end: () => number }) {
  getDancers = o.dancers;
  getEnd = o.end;
  if (!mediaHooked) {
    mediaHooked = true;
    subscribeMedia(() => syncVideos(false));
    // element video mới vừa có khung đầu: tua riêng nó tới đúng chỗ ngay
    subscribePlayerReady((el) => syncVideos(true, el));
  }
}

/** Đang phát theo nhạc thì đọc thẳng <audio> (đúng cả khi tab bị ẩn, rAF ngừng). */
export const now = () => {
  const m = music.el;
  return playing && m && !m.paused && !(loop && m.currentTime >= loop.b) ? Math.min(m.currentTime, getEnd()) : t;
};
export const isPlaying = () => playing;
export const getSpeed = () => speed;
export const getLoop = () => loop;

function syncVideos(hard: boolean, only?: HTMLVideoElement) {
  // mỗi element gắn với một khoá tệp@độ lệch (bản nhân bản cùng lệch dùng
  // chung), nên ai cũng tua theo offsetSec của mình; người bị ẩn không có element
  syncPlayers(getDancers());
  for (const p of listPlayers()) {
    const el = p.el;
    if (only && el !== only) continue;
    const v = getVideo(p.mediaId);
    if (!v) continue;
    // thời lượng chưa rõ (0) thì coi như không giới hạn
    const dur = p.durationSec || v.duration || Infinity;
    const tg = videoTarget(t, p.offsetSec, dur);
    if (playing && tg.inRange) {
      if (el.playbackRate !== speed) el.playbackRate = speed;
      if (Math.abs(el.currentTime - tg.time) > DRIFT || hard) el.currentTime = tg.time;
      if (el.paused) el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - tg.time) > 0.02) el.currentTime = tg.time;
    }
  }
}

function tick() {
  raf = 0;
  if (!playing) return;
  const n = performance.now();
  const m = music.el;
  if (m && !m.paused) {
    t = m.currentTime;
  } else {
    t += ((n - lastNow) / 1000) * speed;
  }
  lastNow = n;
  if (loop && t >= loop.b) {
    seek(loop.a);
  } else if (t >= getEnd()) {
    // không dừng theo m.ended: nhạc hết sớm hơn bài thì đồng hồ chạy tiếp tới cuối
    t = Math.min(t, getEnd());
    pause();
    return;
  }
  syncVideos(false);
  emit();
  raf = requestAnimationFrame(tick);
}

export function seek(to: number) {
  t = Math.max(0, Math.min(to, getEnd()));
  const m = music.el;
  if (m) {
    const d = Number.isFinite(m.duration) ? m.duration : Infinity;
    if (t < d) m.currentTime = t;
    if (playing && t < d && m.paused) m.play().catch(() => {});
  }
  syncVideos(true);
  emit();
}

export function play() {
  if (playing) return;
  if (t >= getEnd() - 0.05) t = loop ? loop.a : 0;
  if (loop && (t < loop.a || t > loop.b)) t = loop.a;
  playing = true;
  lastNow = performance.now();
  const m = music.el;
  if (m) {
    m.playbackRate = speed;
    const d = Number.isFinite(m.duration) ? m.duration : Infinity;
    if (t < d) {
      m.currentTime = t;
      m.play().catch(() => {});
    }
  }
  syncVideos(true);
  emit();
  if (!raf) raf = requestAnimationFrame(tick);
}

export function pause() {
  playing = false;
  music.el?.pause();
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  syncVideos(true);
  emit();
}

export const toggle = () => (playing ? pause() : play());

export function setSpeed(s: number) {
  speed = s;
  if (music.el) music.el.playbackRate = s;
  syncVideos(false);
  emit();
}

export function setLoop(l: { a: number; b: number } | null) {
  loop = l;
  emit();
}

/** Gọi khi danh sách video/offset thay đổi để video nhảy đúng khung ngay. */
export const resync = () => syncVideos(true);

export function subscribeClock(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

// React cần ảnh chụp ổn định giữa hai lần emit, nên dùng t của khung gần nhất
const snapTime = () => t;
export const useTime = () => useSyncExternalStore(subscribeClock, snapTime);
export const usePlaying = () => useSyncExternalStore(subscribeClock, isPlaying);
export const useSpeed = () => useSyncExternalStore(subscribeClock, getSpeed);
export const useLoop = () => useSyncExternalStore(subscribeClock, getLoop);
