// Đồng hồ phát duy nhất. Có nhạc thì <audio> là đồng hồ gốc; video các vũ
// công bám theo (tua lại khi lệch quá DRIFT). Không có nhạc thì chạy bằng
// performance.now().

import { useSyncExternalStore } from "react";
import { getVideo, music } from "./media";
import { videoTarget } from "./timing";

export interface SyncDancer {
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

export function configureClock(o: { dancers: () => SyncDancer[]; end: () => number }) {
  getDancers = o.dancers;
  getEnd = o.end;
}

export const now = () => t;
export const isPlaying = () => playing;
export const getSpeed = () => speed;
export const getLoop = () => loop;

function syncVideos(hard: boolean) {
  for (const d of getDancers()) {
    const v = getVideo(d.mediaId);
    if (!v) continue;
    const el = v.el;
    const dur = d.durationSec || v.duration;
    const tg = videoTarget(t, d.offsetSec, dur);
    if (playing && tg.inRange && !d.hidden) {
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
  } else if (t >= getEnd() || (m && m.ended)) {
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

export const useTime = () => useSyncExternalStore(subscribeClock, now);
export const usePlaying = () => useSyncExternalStore(subscribeClock, isPlaying);
export const useSpeed = () => useSyncExternalStore(subscribeClock, getSpeed);
export const useLoop = () => useSyncExternalStore(subscribeClock, getLoop);
