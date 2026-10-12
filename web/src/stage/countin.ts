// Đếm vào "5 · 6 · 7 · 8" trước khi phát: đồng hồ đứng yên, hiện số to (kèm
// tiếng tích nhỏ), rồi gọi clock.play sao cho phách kế tiếp của nhạc rơi đúng
// sau số 8. Không đụng vào clock.ts, chỉ dùng API công khai của nó.

import { useSyncExternalStore } from "react";
import * as clock from "./clock";
import { COUNT_IN, countInBeat, leadIn } from "./rehearse";

let label: string | null = null;
let active = false;
let timer = 0;
let token = 0;

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

let ac: AudioContext | null = null;
function tick(last: boolean) {
  try {
    if (typeof AudioContext === "undefined") return;
    if (!ac) ac = new AudioContext();
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = last ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t0);
    o.stop(t0 + 0.1);
  } catch {
    // không phát được tiếng thì vẫn đếm bằng chữ
  }
}

/** Dừng đếm vào (không đụng tới đồng hồ). */
export function cancelCountIn() {
  token++;
  clearTimeout(timer);
  if (!active && label === null) return;
  active = false;
  label = null;
  emit();
}

/** beat: độ dài một số (giây thật); lead: nhạc còn bao lâu (giây thật) mới tới
 *  phách kế, nên onGo được gọi sớm hơn số "1" đúng chừng đó. */
export function startCountIn(o: { beat: number; lead: number; onGo: () => void }) {
  cancelCountIn();
  const my = ++token;
  const b = o.beat;
  const ev: { at: number; run: () => void }[] = COUNT_IN.map((s, i) => ({
    at: i * b,
    run: () => {
      label = s;
      emit();
      tick(i === COUNT_IN.length - 1);
    },
  }));
  ev.push({ at: COUNT_IN.length * b - Math.min(Math.max(0, o.lead), b * 0.999), run: o.onGo });
  ev.push({
    at: COUNT_IN.length * b,
    run: () => {
      label = null;
      active = false;
      emit();
    },
  });
  ev.sort((x, y) => x.at - y.at);
  active = true;
  emit();
  const t0 = performance.now();
  let i = 0;
  // chuỗi setTimeout tự bù trễ: luôn hẹn theo mốc tính từ t0
  const step = () => {
    if (my !== token) return;
    const el = (performance.now() - t0) / 1000;
    while (i < ev.length && ev[i].at <= el + 0.004) {
      ev[i++].run();
      if (my !== token) return;
    }
    if (i < ev.length) timer = window.setTimeout(step, Math.max(0, (ev[i].at - (performance.now() - t0) / 1000) * 1000));
  };
  step();
}

export const isCounting = () => active;
const getLabel = () => label;
export const useCountIn = () => useSyncExternalStore(subscribe, getLabel);
export const useCounting = () => useSyncExternalStore(subscribe, isCounting);

/** Nút phát của chế độ tập: đang đếm hoặc đang phát thì dừng; tắt đếm vào thì
 *  phát ngay; còn lại thì đếm 5 6 7 8 rồi mới phát. */
export function playWithCountIn(o: { on: boolean; bpm: number | null; downbeat: number; end: number }) {
  if (active) {
    cancelCountIn();
    if (clock.isPlaying()) clock.pause();
    return;
  }
  if (clock.isPlaying()) {
    clock.pause();
    return;
  }
  if (!o.on) {
    clock.play();
    return;
  }
  // chỗ sẽ phát thật: clock.play tự quay về đầu khi đang ở cuối bài, hoặc về
  // đầu vòng lặp khi đang ở ngoài. Tua trước để sân khấu hiện đúng chỗ lúc đếm.
  const t0 = clock.now();
  let t = t0;
  const loop = clock.getLoop();
  if (t >= o.end - 0.05) t = loop ? loop.a : 0;
  if (loop && (t < loop.a || t > loop.b)) t = loop.a;
  if (t !== t0) clock.seek(t);
  const sp = clock.getSpeed() > 0 ? clock.getSpeed() : 1;
  startCountIn({
    beat: countInBeat(o.bpm, sp),
    lead: leadIn(t, o.bpm, o.downbeat) / sp,
    onGo: () => clock.play(),
  });
}
