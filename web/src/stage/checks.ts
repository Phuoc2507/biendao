// Soát từng khoảng chuyển: ai đi sát nhau (dưới CLEAR_M) và ai phải chạy quá
// nhanh (tốc độ đỉnh trên VMAX). Tính đúng dạng đóng (không lấy mẫu), kèm chỗ và
// lúc xảy ra để vẽ lên sơ đồ và tua tới. THUẦN, chỉ import model/autoplan/timing.

import {
  type Formation, type StageSize, type Vec2, type Warning,
  NEAR_M, dist, findWarnings, inWings, lerp2,
} from "./model.ts";
import { CLEAR_M, VMAX, pairClearance } from "./autoplan.ts";
import { fmtCounts } from "./timing.ts";

export interface Issue extends Warning {
  from: string | null; // khối đi (null với overlap)
  at: Vec2; // chỗ đánh dấu trên sơ đồ
  paths: [Vec2, Vec2][]; // đường đi liên quan, tô đỏ
  value: number; // m/s với fast, khoảng cách (m) với collide / overlap, độ lệch ngang (m) với blocked
}

/** Ngược của smoothstep trên [0, 1]: phần đường u ứng với phần thời gian nào. */
export function invSmoothstep(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return 0.5 - Math.sin(Math.asin(1 - 2 * x) / 3);
}

/** Tham số đường đi (0..1) lúc hai người gần nhau nhất; NaN nếu khoảng cách không đổi.
 *  Hai người cùng trượt theo smoothstep nên vị trí tương đối tuyến tính theo u. */
export function closestU(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  const ax = a0[0] - b0[0], az = a0[1] - b0[1];
  const bx = a1[0] - b1[0] - ax, bz = a1[1] - b1[1] - az;
  const bb = bx * bx + bz * bz;
  return bb > 1e-12 ? -(ax * bx + az * bz) / bb : NaN;
}

const n1 = (v: number) => v.toFixed(1).replace(".", ",");
const span = (sec: number, bpm: number | null) =>
  bpm && bpm > 0 && fmtCounts(sec, bpm) !== "0" ? fmtCounts(sec, bpm) : `${n1(sec)} s`;

export function transitionIssues(
  fs: Formation[],
  dancers: { id: string; name: string; hidden?: boolean }[],
  stage: StageSize,
  bpm: number | null,
  o: { near?: number; vmax?: number } = {},
): Issue[] {
  const near = o.near ?? CLEAR_M;
  const vmax = o.vmax ?? VMAX;
  const vis = dancers.filter((d) => !d.hidden);
  const out: Issue[] = [];
  for (let k = 0; k + 1 < fs.length; k++) {
    const f = fs[k], g = fs[k + 1];
    const dur = g.start - f.end;
    for (const d of vis) {
      const a = f.pos[d.id], b = g.pos[d.id];
      if (!a || !b) continue;
      const len = dist(a, b);
      if (len < 0.05) continue;
      // đi lại trong cùng một bên cánh gà: khán giả không thấy
      if (inWings(a, stage) && inWings(b, stage) && a[0] * b[0] > 0) continue;
      const peak = dur > 1e-6 ? (1.5 * len) / dur : Infinity; // smoothstep: đỉnh = 1,5 lần trung bình
      if (peak <= vmax + 1e-6) continue; // tự chia giãn vừa khít VMAX: không báo oan
      out.push({
        kind: "fast", formation: g.id, from: f.id, ids: [d.id],
        t: f.end + Math.max(0, dur) / 2, at: lerp2(a, b, 0.5), paths: [[a, b]], value: peak,
        msg: dur > 1e-6
          ? `${d.name} phải đi ${n1(len)} m trong ${span(dur, bpm)} sang ${g.name} (tới ${n1(peak)} m/s)`
          : `${d.name} phải đổi chỗ ${n1(len)} m sang ${g.name} mà không có lúc chuyển`,
      });
    }
    if (dur <= 1e-6) continue;
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const a0 = f.pos[vis[i].id], a1 = g.pos[vis[i].id];
        const b0 = f.pos[vis[j].id], b1 = g.pos[vis[j].id];
        if (!a0 || !a1 || !b0 || !b1) continue;
        // gần nhất ở hai đầu là chuyện đứng chồng (đã có cảnh báo overlap)
        const u = closestU(a0, a1, b0, b1);
        if (!(u > 1e-6 && u < 1 - 1e-6)) continue;
        const c = pairClearance(a0, a1, b0, b1);
        if (c >= near - 1e-6) continue;
        const pa = lerp2(a0, a1, u), pb = lerp2(b0, b1, u);
        if (inWings(pa, stage) && inWings(pb, stage)) continue;
        out.push({
          kind: "collide", formation: g.id, from: f.id, ids: [vis[i].id, vis[j].id],
          t: f.end + dur * invSmoothstep(u), at: lerp2(pa, pb, 0.5), paths: [[a0, a1], [b0, b1]], value: c,
          msg: `${vis[i].name} và ${vis[j].name} ${c < NEAR_M ? "va nhau" : "đi sát nhau"} khi sang ${g.name} (cách ${Math.round(c * 100)} cm)`,
        });
      }
  }
  return out;
}

// ---------- bị che ----------
//
// Khán giả ngồi phía +Z và nhìn thẳng vào sân. Người A bị che khi có người B
// đứng gần khán giả hơn hẳn (z_B > z_A + BLOCK_Z_M) mà lệch ngang với A chưa
// tới BLOCK_X_M. Chỉ xét lúc GIỮ đội hình (lúc chuyển ai cũng đi qua nhau, che
// thoáng qua không sao), bỏ qua người ẩn và người trong cánh gà.

/** Bề ngang vai người lớn khoảng 0,35 đến 0,45 m: lệch ngang ít hơn khoảng này
 *  thì người sau bị thân người trước che gần hết khi nhìn thẳng. Lấy cận dưới
 *  để hai hàng so le (lệch nửa khoảng cách, thường 0,6 m trở lên) không bị báo. */
export const BLOCK_X_M = 0.35;
/** Gần khán giả hơn hẳn khoảng này mới tính là đứng trước; cùng một hàng mà
 *  lệch trước sau chút ít thì không ai che ai. */
export const BLOCK_Z_M = 0.3;

/** Loại cảnh báo nhẹ (bị che): vẫn liệt kê, nhưng không đếm trong thông báo
 *  sau thao tác xếp chỗ và không thuộc "Sửa tất cả" (vốn chỉ sửa lúc chuyển). */
export const isSoft = (kind: Warning["kind"]) => kind === "blocked";

export function blockedIssues(
  fs: Formation[],
  dancers: { id: string; name: string; hidden?: boolean }[],
  stage: StageSize,
): Issue[] {
  const vis = dancers.filter((d) => !d.hidden);
  const out: Issue[] = [];
  for (const f of fs) {
    const on = vis.filter((d) => f.pos[d.id] && !inWings(f.pos[d.id], stage));
    for (const a of on)
      for (const b of on) {
        if (a === b) continue;
        const pa = f.pos[a.id], pb = f.pos[b.id];
        if (!(pb[1] > pa[1] + BLOCK_Z_M)) continue;
        const dx = Math.abs(pa[0] - pb[0]);
        if (dx >= BLOCK_X_M) continue;
        if (dist(pa, pb) < NEAR_M) continue; // đã có cảnh báo đứng chồng
        out.push({
          kind: "blocked", formation: f.id, from: null, ids: [a.id, b.id],
          t: (f.start + f.end) / 2, at: pa, paths: [[pb, pa]], value: dx,
          msg: `${f.name}: ${a.name} bị ${b.name} che (khán giả nhìn thẳng)`,
        });
      }
  }
  return out;
}

/** Mọi cảnh báo, theo thứ tự thời gian: đứng chồng (từ findWarnings), bị che,
 *  cộng va nhau và chạy quá nhanh trong lúc chuyển (bản tính đúng, ngưỡng của tự chia). */
export function findIssues(
  fs: Formation[],
  dancers: { id: string; name: string; hidden?: boolean }[],
  stage: StageSize,
  bpm: number | null,
): Issue[] {
  const over: Issue[] = findWarnings(fs, dancers)
    .filter((w) => w.kind === "overlap")
    .map((w) => {
      const f = fs.find((x) => x.id === w.formation);
      const a = f?.pos[w.ids[0]], b = f?.pos[w.ids[1]];
      return { ...w, from: null, at: a && b ? lerp2(a, b, 0.5) : [0, 0], paths: [], value: a && b ? dist(a, b) : 0 };
    });
  return [...over, ...blockedIssues(fs, dancers, stage), ...transitionIssues(fs, dancers, stage, bpm)]
    .sort((a, b) => a.t - b.t);
}
