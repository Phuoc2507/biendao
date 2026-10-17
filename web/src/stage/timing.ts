// Thời gian, nhịp và đồng bộ video với nhạc. Thuần, không import.

/** Thời điểm cần đặt cho video ở thời điểm nhạc tMusic. */
export function videoTarget(
  tMusic: number, offsetSec: number, durationSec: number,
): { time: number; inRange: boolean } {
  const raw = tMusic - offsetSec;
  const last = Math.max(0, durationSec - 0.04);
  const inRange = raw >= 0 && raw <= durationSec;
  return { time: Math.min(last, Math.max(0, raw)), inRange };
}

// ---------- canon theo đoạn ----------

/** Trong đoạn nhạc [start, end) người này vào trễ lag giây so với cả nhóm. */
export interface CanonSeg { start: number; end: number; lag: number }

/** Trễ thật dùng được: luôn chừa ít nhất 0,1 s múa trong đoạn. */
const lagIn = (s: CanonSeg) => Math.max(0, Math.min(s.lag, s.end - s.start - 0.1));

/**
 * Thời điểm nhạc mà video người này "đang múa" khi nhạc ở t. Trong đoạn canon:
 * lag giây đầu đứng yên ở khung đầu đoạn (hold), sau đó múa trễ lag giây; hết
 * đoạn thì nhảy về đồng loạt với cả nhóm (bỏ qua phần cuối đoạn bị trễ).
 */
export function canonTime(t: number, segs?: readonly CanonSeg[] | null): { t: number; hold: boolean } {
  if (segs) for (const s of segs) {
    if (t < s.start || t >= s.end) continue;
    const L = lagIn(s);
    if (L <= 0) break;
    if (t < s.start + L) return { t: s.start, hold: true };
    return { t: t - L, hold: false };
  }
  return { t, hold: false };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Đặt (lag > 0) hoặc xoá (lag 0) canon trong [start, end): đoạn cũ chồng lên bị bỏ. */
export function putCanon(segs: readonly CanonSeg[] | null | undefined, seg: CanonSeg): CanonSeg[] {
  const a = r3(Math.min(seg.start, seg.end));
  const b = r3(Math.max(seg.start, seg.end));
  const out = (segs ?? []).filter((s) => s.end <= a || s.start >= b);
  if (seg.lag > 0 && b - a > 0.1) out.push({ start: a, end: b, lag: r3(Math.min(seg.lag, b - a - 0.1)) });
  return out.sort((x, y) => x.start - y.start);
}

/** Chuỗi nhận diện canon (khoá element video: canon khác nhau thì element riêng). */
export const canonSig = (segs?: readonly CanonSeg[] | null): string =>
  segs && segs.length
    ? "~" + segs.map((s) => [s.start, s.end, s.lag].map((x) => Math.round(x * 1000)).join(":")).join(",")
    : "";

export const beatLen = (bpm: number): number => 60 / bpm;

/** Bắt dính t vào phách (hoặc nửa phách) nếu có BPM, không thì vào bước step giây. */
export function snapTime(
  t: number, bpm: number | null, downbeat = 0, step = 0.1, sub = 1,
): number {
  if (bpm && bpm > 0) {
    const b = beatLen(bpm) / sub;
    const v = downbeat + Math.round((t - downbeat) / b) * b;
    return Math.max(0, Math.round(v * 1000) / 1000);
  }
  return Math.max(0, Math.round(Math.round(t / step) * step * 1000) / 1000);
}

/** "m:ss.d" */
export function fmtTime(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const tenth = Math.floor((r - whole) * 10 + 1e-6);
  return `${m}:${String(whole).padStart(2, "0")}.${tenth}`;
}

/** Chỉ số phách tuyệt đối (0 là phách 1 đầu tiên), có thể âm trước downbeat. */
export function beatIndex(t: number, bpm: number, downbeat = 0): number {
  return Math.floor((t - downbeat) / beatLen(bpm) + 1e-6);
}

/** Đếm kiểu múa: lượt 8 (từ 1) và phách 1..8. */
export function countAt(
  t: number, bpm: number, downbeat = 0,
): { eight: number; beat: number } {
  const i = beatIndex(t, bpm, downbeat);
  const beat = (((i % 8) + 8) % 8) + 1;
  const eight = Math.floor(i / 8) + 1;
  return { eight, beat };
}

/** Độ dài tính bằng phách, ví dụ "2×8", "1×8 + 4", "3 phách". */
export function fmtCounts(sec: number, bpm: number | null): string {
  if (!bpm) return `${sec.toFixed(1)} s`;
  const beats = Math.round(sec / beatLen(bpm));
  if (beats <= 0) return "0";
  const e = Math.floor(beats / 8);
  const r = beats % 8;
  if (e === 0) return `${r} phách`;
  return r ? `${e}×8 + ${r}` : `${e}×8`;
}

/** Tính BPM từ các lần gõ (ms), lấy trung vị khoảng cách, bỏ lần gõ cũ quá 2 s. */
export function tapTempo(taps: number[]): number | null {
  if (taps.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
  const ok = gaps.filter((g) => g > 200 && g < 2000).sort((a, b) => a - b);
  if (ok.length < 2) return null;
  const med = ok[Math.floor(ok.length / 2)];
  return Math.round((60000 / med) * 10) / 10;
}

/** Độ dài mặc định của khối đứng và khoảng chuyển. */
export function defaultLens(bpm: number | null): { hold: number; gap: number } {
  if (bpm && bpm > 0) return { hold: 8 * beatLen(bpm), gap: 8 * beatLen(bpm) };
  return { hold: 4, gap: 2 };
}
