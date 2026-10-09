import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateOffset, fft, onsetEnvelope, xcorr, CONFIDENT } from "./align.ts";

// Bộ sinh ngẫu nhiên tất định
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** "Nhạc" gồm các cú gõ ở thời điểm ngẫu nhiên (không tuần hoàn). */
function clicks(sr: number, sec: number, seed: number): Float32Array {
  const r = rng(seed);
  const x = new Float32Array(Math.round(sr * sec));
  let t = 0.2;
  while (t < sec - 0.1) {
    const i0 = Math.round(t * sr);
    const f = 300 + r() * 2000;
    for (let i = 0; i < sr * 0.05 && i0 + i < x.length; i++)
      x[i0 + i] += Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.01));
    t += 0.15 + r() * 0.5;
  }
  return x;
}

function slice(x: Float32Array, sr: number, from: number, sec: number): Float32Array {
  const out = new Float32Array(Math.round(sr * sec));
  const a = Math.round(from * sr);
  for (let i = 0; i < out.length; i++) {
    const j = a + i;
    out[i] = j >= 0 && j < x.length ? x[j] : 0;
  }
  return out;
}

test("fft rồi ifft trả lại tín hiệu", () => {
  const re = Float64Array.from([1, 2, 3, 4, 0, -1, 5, 2]);
  const im = new Float64Array(8);
  const keep = Float64Array.from(re);
  fft(re, im);
  fft(re, im, true);
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(re[i] / 8 - keep[i]) < 1e-9);
});

test("xcorr khớp định nghĩa trực tiếp", () => {
  const a = Float64Array.from([1, 0, 2, -1, 3]);
  const b = Float64Array.from([2, 1, -1]);
  const { lags, c } = xcorr(a, b);
  for (let i = 0; i < lags.length; i++) {
    let s = 0;
    for (let n = 0; n < b.length; n++) {
      const j = n + lags[i];
      if (j >= 0 && j < a.length) s += a[j] * b[n];
    }
    assert.ok(Math.abs(c[i] - s) < 1e-9);
  }
});

test("đường bao 100 khung/giây", () => {
  const e = onsetEnvelope(clicks(8000, 5, 1), 8000);
  assert.equal(e.length, 500);
});

test("tìm được offset dương, âm và khác tần số mẫu", () => {
  const sr = 22050;
  const music = clicks(sr, 40, 7);
  const v1 = slice(music, sr, 3.27, 20);
  const r1 = estimateOffset(v1, sr, music, sr);
  assert.ok(Math.abs(r1.offset - 3.27) < 0.02, `offset ${r1.offset}`);
  assert.ok(r1.confidence >= CONFIDENT);
  // video bật trước nhạc 1.5 s
  const v2 = slice(music, sr, -1.5, 20);
  const r2 = estimateOffset(v2, sr, music, sr);
  assert.ok(Math.abs(r2.offset + 1.5) < 0.02, `offset ${r2.offset}`);
  // video ghi 8 kHz, có nhiễu
  const v3 = slice(music, sr, 10, 15);
  const r = rng(3);
  const v3n = new Float32Array(Math.round(v3.length * 8000 / sr));
  for (let i = 0; i < v3n.length; i++) v3n[i] = 0.4 * v3[Math.floor(i * sr / 8000)] + (r() - 0.5) * 0.3;
  const r3 = estimateOffset(v3n, 8000, music, sr);
  assert.ok(Math.abs(r3.offset - 10) < 0.03, `offset ${r3.offset}`);
});
