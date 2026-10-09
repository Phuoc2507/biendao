// Khớp video với nhạc NGAY TRONG TRÌNH DUYỆT: bản chuyển của
// choreo/videocard/align.py (đường bao onset + tương quan chéo FFT).
// Thuần, không import, để `node --test` chạy được.
//
// Quy ước: offset là thời điểm trong bài nhạc khi video bắt đầu
// (thời gian video = thời gian nhạc − offset).

export const FRAME_RATE = 100;
const SR = 8000;
const HOP = SR / FRAME_RATE;
const WIN = 512;
export const CONFIDENT = 1.5;

export function resampleLinear(x: Float32Array | Float64Array, srIn: number, srOut: number): Float64Array {
  if (srIn === srOut || x.length === 0) return Float64Array.from(x);
  const n = Math.round((x.length * srOut) / srIn);
  const out = new Float64Array(n);
  const step = srIn / srOut;
  for (let i = 0; i < n; i++) {
    const p = i * step;
    const j = Math.floor(p);
    if (j >= x.length - 1) out[i] = x[x.length - 1];
    else out[i] = x[j] + (x[j + 1] - x[j]) * (p - j);
  }
  return out;
}

/** FFT phức tại chỗ, n là luỹ thừa 2. inverse: không chia n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Spectral flux log năng lượng, 100 khung/giây, chuẩn hoá z. */
export function onsetEnvelope(x: Float32Array | Float64Array, sr: number): Float64Array {
  const y = resampleLinear(x, sr, SR);
  const nFrames = Math.max(1, Math.ceil(y.length / HOP));
  const pad = new Float64Array(nFrames * HOP + WIN);
  pad.set(y, WIN / 2);
  const hann = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
  const nb = WIN / 2 + 1;
  let prev = new Float64Array(nb);
  let cur = new Float64Array(nb);
  const flux = new Float64Array(nFrames);
  const re = new Float64Array(WIN);
  const im = new Float64Array(WIN);
  for (let f = 0; f < nFrames; f++) {
    const o = f * HOP;
    for (let i = 0; i < WIN; i++) { re[i] = pad[o + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let s = 0;
    for (let k = 0; k < nb; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      if (f > 0) s += Math.max(0, cur[k] - prev[k]);
    }
    flux[f] = s;
    const t = prev; prev = cur; cur = t;
  }
  // bỏ thành phần chậm (trung bình trượt 0.5 s)
  const k = FRAME_RATE / 2;
  const cs = new Float64Array(nFrames + 1);
  for (let i = 0; i < nFrames; i++) cs[i + 1] = cs[i] + flux[i];
  const out = new Float64Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    const a = Math.max(0, i - k / 2);
    const b = Math.min(nFrames, i + k / 2);
    out[i] = Math.max(0, flux[i] - (cs[b] - cs[a]) / k);
  }
  let mean = 0;
  for (const v of out) mean += v;
  mean /= nFrames;
  let sd = 0;
  for (const v of out) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / nFrames);
  if (sd < 1e-12) return new Float64Array(nFrames);
  for (let i = 0; i < nFrames; i++) out[i] = (out[i] - mean) / sd;
  return out;
}

/** c[lag] = Σ a[n+lag]·b[n], lag từ −(len b − 1) tới len a − 1. */
export function xcorr(a: Float64Array, b: Float64Array): { lags: Int32Array; c: Float64Array } {
  const n = a.length + b.length - 1;
  let size = 1;
  while (size < n) size <<= 1;
  const ar = new Float64Array(size), ai = new Float64Array(size);
  const br = new Float64Array(size), bi = new Float64Array(size);
  ar.set(a); br.set(b);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < size; i++) {
    // a · conj(b)
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const m = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = r; ai[i] = m;
  }
  fft(ar, ai, true);
  const c = new Float64Array(n);
  const lags = new Int32Array(n);
  const nb = b.length - 1;
  for (let i = 0; i < n; i++) {
    const lag = i - nb;
    lags[i] = lag;
    c[i] = ar[lag >= 0 ? lag : size + lag] / size;
  }
  return { lags, c };
}

export function estimateOffset(
  video: Float32Array | Float64Array, srV: number,
  music: Float32Array | Float64Array, srM: number,
): { offset: number; confidence: number } {
  const ev = onsetEnvelope(video, srV);
  const em = onsetEnvelope(music, srM);
  const { lags, c } = xcorr(em, ev);
  const minOverlap = Math.min(ev.length, em.length) * 0.25;
  const score = new Float64Array(c.length);
  let best = -Infinity, bi = 0;
  for (let i = 0; i < c.length; i++) {
    const lag = lags[i];
    const ov = Math.max(1, Math.min(ev.length, em.length - lag) - Math.max(0, -lag));
    score[i] = ov >= minOverlap ? c[i] / Math.sqrt(ov) : -Infinity;
    if (score[i] > best) { best = score[i]; bi = i; }
  }
  let frac = 0;
  if (bi > 0 && bi < score.length - 1 && isFinite(score[bi - 1]) && isFinite(score[bi + 1])) {
    const y0 = score[bi - 1], y1 = score[bi], y2 = score[bi + 1];
    const den = y0 - 2 * y1 + y2;
    if (Math.abs(den) > 1e-12) frac = Math.min(0.5, Math.max(-0.5, (0.5 * (y0 - y2)) / den));
  }
  const offset = (lags[bi] + frac) / FRAME_RATE;
  const guard = FRAME_RATE / 2;
  let second = -Infinity;
  for (let i = 0; i < score.length; i++) {
    if (Math.abs(i - bi) <= guard) continue;
    if (score[i] > second) second = score[i];
  }
  let confidence: number;
  if (!(best > 0)) confidence = 0;
  else if (!(second > 1e-12)) confidence = Infinity;
  else confidence = best / second;
  return { offset, confidence };
}
