// Mốc đoạn nhạc có tên trên dòng thời gian ("Nhạc dạo", "Điệp khúc", "Đoạn rap").
// THUẦN, chỉ import kiểu để chạy được cả trong Vite lẫn `node --test`.
//
// Mỗi mốc là một thời điểm; đoạn của mốc kéo dài tới mốc sau (mốc cuối tới hết bài).
// Mọi hàm sửa trả mảng MỚI đã xếp theo giờ, không đột biến đầu vào.

import type { Project, SongMark } from "./model.ts";

/** Nhãn dài hơn mức này thì cắt (nhãn nằm trên dải mỏng và đầu màn trình chiếu). */
export const MARK_LABEL_MAX = 40;
/** Hai mốc gần hơn khoảng này (giây) coi như trùng chỗ. */
export const MARK_NEAR = 0.05;

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;
const byT = (a: SongMark, b: SongMark) => a.t - b.t;

/** Nhãn sạch: bỏ khoảng trắng thừa, cắt độ dài. Rỗng thì trả "". */
export function cleanLabel(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, MARK_LABEL_MAX).trim();
}

/** Giờ của mốc: không âm, có thời lượng nhạc thì không quá cuối bài. */
const clampT = (t: number, duration: number) => r3(Math.max(0, duration > 0 ? Math.min(duration, t) : t));

/**
 * Mốc đọc từ tệp: bỏ mốc hỏng (không phải object, id không phải chữ, trùng id,
 * giờ không phải số hữu hạn), kẹp giờ vào [0, duration] nếu biết thời lượng,
 * nhãn rỗng thì đặt "Đoạn", xếp theo giờ.
 */
export function cleanMarks(raw: unknown, duration = 0): SongMark[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SongMark[] = [];
  for (const m of raw as Partial<SongMark>[]) {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || seen.has(m.id) || !fin(m.t)) continue;
    seen.add(m.id);
    out.push({ id: m.id, t: clampT(m.t, fin(duration) ? duration : 0), label: cleanLabel(m.label) || "Đoạn" });
  }
  return out.sort(byT);
}

/** Dự án với danh sách mốc mới: rỗng thì bỏ hẳn trường (tệp cũ không đổi). */
export function withMarks(p: Project, marks: SongMark[]): Project {
  const { marks: _m, ...rest } = p;
  return marks.length ? { ...rest, marks } : rest;
}

/** Mốc của đoạn đang chứa t (mốc cuối cùng có giờ ≤ t), chưa tới mốc đầu thì null. */
export function markAt(marks: readonly SongMark[] | undefined, t: number): SongMark | null {
  let cur: SongMark | null = null;
  for (const m of marks ?? []) {
    if (m.t <= t + 1e-6) cur = m;
    else break;
  }
  return cur;
}

/**
 * Giờ cần nhảy tới theo mốc: tới là mốc đầu tiên sau t; lùi là mốc đầu đoạn
 * đang đứng, nhưng vừa qua mốc chưa tới 0,3 s thì về mốc trước nữa (bấm lùi
 * hai lần liền đi được hai đoạn, như nhảy đội hình). Không có thì null.
 */
export function markJump(marks: readonly SongMark[] | undefined, t: number, dir: -1 | 1): number | null {
  const ms = marks ?? [];
  if (dir > 0) return ms.find((m) => m.t > t + 0.01)?.t ?? null;
  let best: number | null = null;
  for (const m of ms) if (m.t < t - 0.3) best = m.t;
  return best;
}

/** "Đoạn n" chưa có trong danh sách, n nhỏ nhất từ số mốc + 1. */
export function nextMarkLabel(marks: readonly SongMark[] | undefined): string {
  const used = new Set((marks ?? []).map((m) => m.label));
  let n = (marks?.length ?? 0) + 1;
  while (used.has(`Đoạn ${n}`)) n++;
  return `Đoạn ${n}`;
}

/** Có mốc nào cách t chưa tới near giây không (trừ mốc id). */
export function markNear(marks: readonly SongMark[] | undefined, t: number, near = MARK_NEAR, except?: string): SongMark | null {
  return (marks ?? []).find((m) => m.id !== except && Math.abs(m.t - t) < near) ?? null;
}

export function addMark(marks: readonly SongMark[] | undefined, m: SongMark, duration = 0): SongMark[] {
  const x = { id: m.id, t: clampT(m.t, duration), label: cleanLabel(m.label) || nextMarkLabel(marks) };
  return [...(marks ?? []).filter((o) => o.id !== m.id), x].sort(byT);
}

/** Đổi tên; nhãn rỗng thì giữ tên cũ. */
export function renameMark(marks: readonly SongMark[] | undefined, id: string, label: string): SongMark[] {
  const v = cleanLabel(label);
  return (marks ?? []).map((m) => (m.id === id && v ? { ...m, label: v } : m));
}

export function moveMark(marks: readonly SongMark[] | undefined, id: string, t: number, duration = 0): SongMark[] {
  if (!fin(t)) return [...(marks ?? [])];
  return (marks ?? []).map((m) => (m.id === id ? { ...m, t: clampT(t, duration) } : m)).sort(byT);
}

export function removeMark(marks: readonly SongMark[] | undefined, id: string): SongMark[] {
  return (marks ?? []).filter((m) => m.id !== id);
}

/**
 * Thêm các mốc gợi ý ở các giờ times, nhãn "Đoạn 1", "Đoạn 2"... theo thứ tự
 * giờ. Giờ nào đã có mốc trong vòng near giây (mốc người dùng đặt, hay lần gợi ý
 * trước) thì bỏ qua: không ghi đè, không chồng mốc.
 */
export function mergeSuggested(
  marks: readonly SongMark[] | undefined, times: readonly number[], newId: () => string, near = 2, duration = 0,
): { marks: SongMark[]; added: number } {
  let out = [...(marks ?? [])];
  let added = 0;
  for (const t of [...times].filter(fin).sort((a, b) => a - b)) {
    if (markNear(out, clampT(t, duration), near)) continue;
    out = addMark(out, { id: newId(), t, label: nextMarkLabel(out) }, duration);
    added++;
  }
  return { marks: out, added };
}
