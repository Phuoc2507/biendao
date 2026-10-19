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
//  * Đứng so le (cảnh báo bị che): dời người đứng sau sang ngang vừa đủ lộ ra.
//    Không nằm trong fixAll: che là chuyện bố cục, có khi cố ý (đứng nấp, hiện
//    ra sau), nên chỉ sửa khi người dùng bấm từng dòng.

import { type Formation, type StageSize, type Vec2, assignNearest, findWarnings, pathPeak, withVia } from "./model.ts";
import { VMAX } from "./autoplan.ts";
import { BLOCK_X_M, type Issue, blockedIssues, transitionIssues } from "./checks.ts";
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
  // ai đổi chỗ thì bỏ đường cong vào và ra khỏi đội hình k (dáng cũ vẽ cho chỗ cũ)
  const swapped = ids.filter((_, i) => asg[i] !== i);
  const dropVia = (x: Formation) => {
    if (!x.via || !swapped.some((id) => x.via![id])) return x;
    const via = { ...x.via };
    for (const id of swapped) delete via[id];
    return withVia(x, via);
  };
  const out = fs.map((x, j) => (j === k ? dropVia({ ...x, pos }) : j === k + 1 ? dropVia(x) : x));
  const before = around(fs, k, dancers, stage, bpm), after = around(out, k, dancers, stage, bpm);
  if (after < before) return { fs: out, before, after };
  // đổi vai từ k về sau: ids[i] nhận chỗ của ids[asg[i]] ở mọi đội hình j >= k
  // đường cong các khoảng chuyển sau đổi tên theo (hình giữ y nguyên); khoảng
  // chuyển vào k đổi hình nên ai đổi chỗ thì bỏ đường cong
  const carried = fs.map((x, j) => {
    if (j < k) return x;
    const q = { ...x.pos };
    ids.forEach((id, i) => {
      const src = x.pos[ids[asg[i]]];
      if (src) q[id] = [src[0], src[1]];
      else delete q[id];
    });
    if (!x.via) return { ...x, pos: q };
    const via = { ...x.via };
    ids.forEach((id, i) => {
      const src = j === k ? (asg[i] === i ? x.via![id] : undefined) : x.via![ids[asg[i]]];
      if (src) via[id] = [src[0], src[1]];
      else delete via[id];
    });
    return withVia({ ...x, pos: q }, via);
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
  // tốc độ đỉnh nhân thời gian chuyển: đường thẳng là 1,5 lần độ dài, đường cong theo pathPeak
  const peak = Math.max(...fast.map((i) => pathPeak(i.paths[0][0], i.paths[0][1], i.ctrl?.[0])));
  const need = peak / vmax;
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
  // đi chậm lại thì lúc gặp nhau cũng đổi: không nhận nếu bớt nhanh mà thêm va
  const other = (x: Formation) =>
    transitionIssues([x, g], dancers, stage, bpm, { vmax }).filter((i: Issue) => i.kind !== "fast").length;
  if (other({ ...f, end }) > other(f)) return null;
  return { fs: fs.map((x, j) => (j === k - 1 ? { ...x, end } : x)), sec: f.end - end, partial };
}

/** Dời ngang thêm chút cho chắc khỏi bị che (khỏi bám sát mép ngưỡng). */
const STAGGER_PAD = 0.05;

/** Đứng so le: dời người bị che `a` sang ngang vừa đủ để lộ ra khỏi người `b`
 *  đứng trước, trong đội hình k. Thử bên xa người trước trước, rồi bên kia; chỉ
 *  nhận chỗ còn trên sân (không vào cánh gà), không đứng chồng thêm, không thêm
 *  cảnh báo lúc chuyển quanh đội hình đó, và số chỗ bị che trong đội hình giảm.
 *  null nếu không có chỗ như vậy. */
export function staggerFix(
  fs: Formation[], k: number, a: string, b: string, dancers: Who[], stage: StageSize, bpm: number | null,
): (Fix & { dx: number }) | null {
  const g = fs[k];
  const pa = g?.pos[a], pb = g?.pos[b];
  if (!pa || !pb) return null;
  const solo = (x: Formation[]) => blockedIssues([x[k]], dancers, stage).length;
  const over = (x: Formation[]) => findWarnings([x[k]], dancers).filter((w) => w.kind === "overlap").length;
  const before = solo(fs), over0 = over(fs), tr0 = around(fs, k, dancers, stage, bpm);
  const side = pa[0] >= pb[0] ? 1 : -1;
  let best: (Fix & { dx: number }) | null = null;
  for (const s of [side, -side]) {
    const x = Math.round((pb[0] + s * (BLOCK_X_M + STAGGER_PAD)) * 100) / 100;
    if (Math.abs(x) > stage.width / 2 + 1e-9) continue;
    const out = fs.map((f, j) => (j === k ? { ...f, pos: { ...f.pos, [a]: [x, pa[1]] as Vec2 } } : f));
    const after = solo(out);
    if (after >= before || over(out) > over0 || around(out, k, dancers, stage, bpm) > tr0) continue;
    const dx = Math.abs(x - pa[0]);
    if (!best || after < best.after || (after === best.after && dx < best.dx)) best = { fs: out, before, after, dx };
  }
  return best;
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
