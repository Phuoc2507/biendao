// Khoảng Từ / Tới của Xuất video: chọn nhanh cả bài, vùng lặp, đội hình tại vạch
// phát (kèm khoảng chuyển vào nó), mốc đoạn nhạc; gõ tay giờ; nhãn cho tên tệp.
// THUẦN, chỉ import kiểu để chạy được cả trong Vite lẫn `node --test`.

import type { Formation, SongMark } from "../model.ts";

export type SpanKind = "all" | "loop" | "formation" | "mark" | "custom";

/** Một đoạn cần ghi. tag: phần thêm vào tên tệp ("" là cả bài). */
export interface Span {
  kind: SpanKind;
  a: number;
  b: number;
  tag: string;
  /** Mô tả ngắn để hiện dưới ô Từ / Tới, vd "Đội hình Chữ V". */
  label: string;
}

export interface SpanCtx {
  end: number; // hết bài (projectEnd)
  loop: { a: number; b: number } | null;
  t: number; // vạch phát
  formations: readonly Formation[];
  marks?: readonly SongMark[];
}

/** Đoạn ngắn nhất được ghi (giây). */
export const MIN_SPAN = 0.5;

const r2 = (x: number) => Math.round(x * 100) / 100 + 0;

/** Nhãn khoảng giờ dùng cho tên tệp: "0m05s-0m20s" (bỏ phần lẻ giây). */
export function timeTag(a: number, b: number): string {
  const f = (x: number) => {
    const s = Math.max(0, Math.floor(x + 1e-6));
    return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  };
  return `${f(a)}-${f(b)}`;
}

/** Kẹp và kiểm một khoảng: a ≥ 0, b ≤ hết bài, dài ít nhất MIN_SPAN. */
export function checkSpan(a: number, b: number, end: number): { a: number; b: number } | { error: string } {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: "Giờ không hợp lệ." };
  const lo = r2(Math.max(0, a));
  const hi = r2(end > 0 ? Math.min(b, end) : b);
  if (hi - lo < MIN_SPAN - 1e-9) {
    return { error: lo >= end - MIN_SPAN ? "Từ đang ở sát cuối bài." : "Đoạn quá ngắn để ghi (dưới nửa giây)." };
  }
  return { a: lo, b: hi };
}

/** Chỉ số đội hình "tại vạch phát": đang đứng, hoặc đang chuyển vào; trước khối đầu là khối đầu, sau khối cuối là khối cuối. */
export function formationIndexAt(fs: readonly Formation[], t: number): number {
  if (!fs.length) return -1;
  for (let k = 0; k < fs.length; k++) if (t <= fs[k].end + 1e-9) return k;
  return fs.length - 1;
}

/** Đội hình tại vạch phát kèm khoảng chuyển vào nó: từ lúc rời khối trước tới hết khối này. */
export function formationSpan(fs: readonly Formation[], t: number): { a: number; b: number; name: string } | null {
  const s = [...fs].sort((x, y) => x.start - y.start);
  const k = formationIndexAt(s, t);
  if (k < 0) return null;
  const f = s[k];
  return { a: k > 0 ? Math.min(s[k - 1].end, f.start) : f.start, b: f.end, name: f.name };
}

/** Mốc đoạn nhạc chứa vạch phát (trước mốc đầu thì lấy mốc đầu), tới mốc sau hoặc hết bài. */
export function markSpan(marks: readonly SongMark[] | undefined, t: number, end: number): { a: number; b: number; label: string } | null {
  const ms = [...(marks ?? [])].sort((x, y) => x.t - y.t);
  if (!ms.length) return null;
  let i = 0;
  for (let j = 0; j < ms.length; j++) if (ms[j].t <= t + 1e-6) i = j;
  const m = ms[i];
  const next = ms.slice(i + 1).find((n) => n.t > m.t + 1e-6);
  return { a: m.t, b: next ? next.t : end, label: m.label };
}

/** Đoạn của một nút chọn nhanh, hoặc lý do không dùng được. */
export function presetSpan(kind: Exclude<SpanKind, "custom">, c: SpanCtx): Span | { error: string } {
  let a = 0, b = c.end, tag = "", label = "Cả bài";
  if (kind === "loop") {
    if (!c.loop) return { error: "Chưa đặt vùng lặp (phím L)." };
    ({ a, b } = c.loop);
    tag = timeTag(a, Math.min(b, c.end));
    label = "Vùng lặp";
  } else if (kind === "formation") {
    const f = formationSpan(c.formations, c.t);
    if (!f) return { error: "Chưa có đội hình nào." };
    ({ a, b } = f);
    tag = f.name;
    label = `Đội hình ${f.name}, kèm khoảng chuyển vào`;
  } else if (kind === "mark") {
    const m = markSpan(c.marks, c.t, c.end);
    if (!m) return { error: "Chưa có mốc đoạn nhạc (phím B)." };
    ({ a, b } = m);
    tag = m.label;
    label = `Đoạn ${m.label}`;
  }
  const ok = checkSpan(a, b, c.end);
  if ("error" in ok) return ok;
  return { kind, a: ok.a, b: ok.b, tag, label };
}

/** Đoạn gõ tay: nhãn tên tệp là khoảng giờ. */
export function customSpan(a: number, b: number, end: number): Span | { error: string } {
  const ok = checkSpan(a, b, end);
  if ("error" in ok) return ok;
  return { kind: "custom", a: ok.a, b: ok.b, tag: timeTag(ok.a, ok.b), label: "Khoảng tự chọn" };
}

/**
 * Đọc giờ gõ tay: "65", "65,5", "1:05", "1:05.5", "1:05,5". Sai thì null.
 */
export function parseClock(s: string): number | null {
  const t = s.trim().replace(/,/g, ".");
  const m = /^(?:(\d+):)?(\d+(?:\.\d*)?)$/.exec(t);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const sec = Number(m[2]);
  if (m[1] && sec >= 60) return null;
  const v = min * 60 + sec;
  return Number.isFinite(v) ? v : null;
}
