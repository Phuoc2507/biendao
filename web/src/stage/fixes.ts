// Sửa nhanh một cảnh báo chuyển đội hình, một bấm (có Hoàn tác). THUẦN, chỉ
// import model/autoplan/checks/timing để chạy được cả trong Vite lẫn `node --test`.
//
//  * Đổi chỗ cho gần: giữ nguyên các chỗ đứng của đội hình đích, chỉ đổi ai
//    đứng chỗ nào, gán theo tổng bình phương quãng đường nhỏ nhất từ đội hình
//    trước (assignNearest). Gán kiểu này ít khi cắt nhau và đường đi ngắn hơn,
//    nên bớt cả va nhau lẫn chạy quá nhanh. Chỉ đề nghị khi số cảnh báo quanh
//    đội hình đó (lúc vào và lúc ra) giảm thật. Đổi riêng một đội hình mà làm
//    đoạn ra xấu đi thì thử ĐỔI VAI từ đó về sau: người A nhận luôn mọi chỗ của
//    B ở các đội hình sau. Hình các khoảng chuyển sau giữ y nguyên (chỉ đổi tên
//    người), nên chỉ khoảng chuyển vào thay đổi.
//  * Nới khoảng chuyển: rời đội hình trước sớm hơn để ai cũng đi kịp dưới VMAX.
//    Giữ nguyên lúc tới đội hình mới (vẫn đúng phách), mép rời bắt về phách
//    trước đó; đội hình trước giữ lại ít nhất một phách.

import { type Formation, type StageSize, assignNearest, dist } from "./model.ts";
import { VMAX } from "./autoplan.ts";
import { type Issue, transitionIssues } from "./checks.ts";
import { beatLen } from "./timing.ts";

type Who = { id: string; name: string; hidden?: boolean };

/** Số cảnh báo của hai khoảng chuyển vào và ra khỏi đội hình k. */
function around(fs: Formation[], k: number, dancers: Who[], stage: StageSize, bpm: number | null): number {
  const lo = Math.max(0, k - 1), hi = Math.min(fs.length, k + 2);
  return transitionIssues(fs.slice(lo, hi), dancers, stage, bpm).length;
}

export interface Fix {
  fs: Formation[];
  /** cảnh báo quanh đội hình đó trước và sau khi sửa */
  before: number;
  after: number;
  /** đã đổi vai cho cả các đội hình sau */
  carry?: boolean;
}

/** Đổi ai đứng chỗ nào trong đội hình k cho gần đội hình trước. null nếu không đỡ hơn. */
export function reassignFix(
  fs: Formation[], k: number, dancers: Who[], stage: StageSize, bpm: number | null,
): Fix | null {
  if (k < 1 || k >= fs.length) return null;
  const f = fs[k - 1], g = fs[k];
  const ids = dancers.filter((d) => !d.hidden && f.pos[d.id] && g.pos[d.id]).map((d) => d.id);
  if (ids.length < 2) return null;
  const asg = assignNearest(ids.map((id) => f.pos[id]), ids.map((id) => g.pos[id]));
  const pos = { ...g.pos };
  let moved = false;
  ids.forEach((id, i) => {
    const to = g.pos[ids[asg[i]]];
    if (asg[i] !== i) moved = true;
    pos[id] = [to[0], to[1]];
  });
  if (!moved) return null;
  const out = fs.map((x, j) => (j === k ? { ...x, pos } : x));
  const before = around(fs, k, dancers, stage, bpm), after = around(out, k, dancers, stage, bpm);
  if (after < before) return { fs: out, before, after };
  // đổi vai từ k về sau: ids[i] nhận chỗ của ids[asg[i]] ở mọi đội hình j >= k
  const carried = fs.map((x, j) => {
    if (j < k) return x;
    const q = { ...x.pos };
    ids.forEach((id, i) => {
      const src = x.pos[ids[asg[i]]];
      if (src) q[id] = [src[0], src[1]];
      else delete q[id];
    });
    return { ...x, pos: q };
  });
  const b2 = transitionIssues(fs, dancers, stage, bpm).length;
  const a2 = transitionIssues(carried, dancers, stage, bpm).length;
  if (a2 >= b2) return null;
  return { fs: carried, before: b2, after: a2, carry: true };
}

export interface WidenFix {
  fs: Formation[];
  /** số giây rời sớm hơn */
  sec: number;
  /** vẫn chưa đủ (đội hình trước quá ngắn) */
  partial: boolean;
}

/** Rời đội hình k-1 sớm hơn cho kịp đường xa nhất vào đội hình k. null nếu không cần hoặc không dời được. */
export function widenFix(
  fs: Formation[], k: number, dancers: Who[], stage: StageSize, bpm: number | null,
  downbeat = 0, vmax = VMAX,
): WidenFix | null {
  if (k < 1 || k >= fs.length) return null;
  const f = fs[k - 1], g = fs[k];
  const fast = transitionIssues([f, g], dancers, stage, bpm, { vmax }).filter((i: Issue) => i.kind === "fast");
  if (!fast.length) return null;
  const len = Math.max(...fast.map((i) => dist(i.paths[0][0], i.paths[0][1])));
  const need = (1.5 * len) / vmax;
  let end = g.start - need;
  const b = bpm && bpm > 0 ? beatLen(bpm) : 0;
  if (b) end = downbeat + Math.floor((end - downbeat) / b + 1e-6) * b;
  const minEnd = f.start + (b || 0.5);
  let partial = false;
  if (end < minEnd) {
    end = minEnd;
    partial = true;
  }
  end = Math.round(end * 1000) / 1000;
  if (end >= f.end - 1e-3) return null;
  return { fs: fs.map((x, j) => (j === k - 1 ? { ...x, end } : x)), sec: f.end - end, partial };
}

/** Sửa lần lượt mọi khoảng chuyển: đổi chỗ nếu đỡ hơn, rồi nới nếu còn quá nhanh.
 *  Dùng khi dựng bài mẫu, và cho nút "Sửa tất cả". */
export function fixAll(
  fs: Formation[], dancers: Who[], stage: StageSize, bpm: number | null, downbeat = 0,
): Formation[] {
  let out = fs;
  for (let k = 1; k < out.length; k++) {
    const r = reassignFix(out, k, dancers, stage, bpm);
    if (r) out = r.fs;
    const w = widenFix(out, k, dancers, stage, bpm, downbeat);
    if (w) out = w.fs;
  }
  return out;
}
