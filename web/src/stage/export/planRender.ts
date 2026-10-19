// Vẽ sơ đồ từ trên lên canvas 2D để xuất video (không cần WebGL). Hình học và
// nội dung khung là hàm thuần; drawPlanFrame chỉ dùng vài lệnh canvas cơ bản.

import { type Project, type StageSize, WING, posesAt, segmentAt, initials, dist, viaOf } from "../model.ts";
import { countAt, fmtTime } from "../timing.ts";
import { groupRingColors } from "../groups.ts";
import { layoutPropLabels, propCorners, propsAt } from "../props.ts";
import type { StageProp } from "../model.ts";
import { MOVE_MIN } from "./printSheet.ts";
import { faceTri, facingAt } from "../facing.ts";

export interface PlanGeom {
  w: number;
  h: number;
  s: number; // điểm ảnh mỗi mét
  cx: number; // điểm ảnh của x = 0
  cy: number; // điểm ảnh của z = 0
  stage: StageSize;
  head: number; // chiều cao dải chữ phía trên
  u?: number; // cỡ chữ riêng (ảnh gửi điện thoại); bỏ trống thì theo độ cao khung
  ox?: number; // góc trên trái của khung trên canvas (ảnh nhiều sơ đồ); bỏ trống là 0
  oy?: number;
}

/** Đặt sân (kể cả cánh gà) vừa khung, chừa dải chữ trên và dòng KHÁN GIẢ dưới. */
export function planGeometry(stage: StageSize, w: number, h: number): PlanGeom {
  const head = Math.round(h * 0.11);
  const foot = Math.round(h * 0.09);
  const side = Math.round(w * 0.03);
  const mw = stage.width + 2 * WING, md = stage.depth;
  const s = Math.min((w - 2 * side) / mw, (h - head - foot - h * 0.03) / md);
  return { w, h, s, cx: w / 2, cy: head + h * 0.03 + (h - head - foot - h * 0.03) / 2, stage, head };
}

export const toPx = (g: PlanGeom, x: number, z: number): [number, number] => [g.cx + x * g.s, g.cy + z * g.s];

export interface FrameDot {
  id: string;
  x: number; // điểm ảnh
  y: number;
  r: number;
  color: string;
  label: string; // chữ trong chấm
  name: string;
  alpha: number;
  highlight: boolean;
  /** Màu viền theo nhóm (bật Viền theo nhóm và người này có nhóm). */
  ring?: string;
  /** Hướng mặt (độ, 0 nhìn khán giả); chỉ có khi khác 0. */
  face?: number;
}

export interface PlanFrame {
  title: string;
  sub: string; // đội hình đang đứng / đang chuyển
  time: string;
  count: string;
  dots: FrameDot[];
  /** Mũi tên từ chỗ đứng trước (ảnh đội hình), hay mũi tên mờ đường sắp đi (video, lúc đang giữ đội hình). */
  trails?: FrameTrail[];
  /** Đạo cụ và mốc sàn (ở chỗ của thời điểm khung), vẽ dưới mọi thứ khác. Không có thì bỏ trường. */
  props?: FrameProp[];
}

/** Một đạo cụ đã đổi ra điểm ảnh: hộp là đa giác 4 góc, tròn là tâm + bán kính, mốc sàn là dấu cộng. */
export interface FrameProp {
  kind: "box" | "round" | "mark";
  name: string;
  x: number;
  y: number;
  r: number; // bán kính (tròn), nửa cạnh dấu cộng (mốc sàn)
  pts?: [number, number][]; // bốn góc (hộp)
  /** chỗ tên (tâm ngang, chân chữ, điểm ảnh) đã xếp cho khỏi đè tên khác; null: ẩn tên vì hết chỗ */
  label?: [number, number] | null;
}

/** Cỡ chữ tên đạo cụ (điểm ảnh) trong khung g, như drawPlanFrame dùng. */
const propFont = (g: PlanGeom) => 11 * (g.u ?? g.h / 720);

/**
 * Đạo cụ của dự án ra điểm ảnh theo khung g: ở chỗ của giây t nếu có t (đạo cụ
 * dời theo đội hình), không thì chỗ gốc; hay đưa thẳng danh sách đã tính.
 */
export function framePropsOf(p: Project, g: PlanGeom, at?: number | readonly StageProp[]): FrameProp[] {
  const list = typeof at === "number" ? propsAt(p.formations, p.props, at) : at ?? p.props ?? [];
  const labels = layoutPropLabels(list, (x) => toPx(g, x, 0)[0], (z) => toPx(g, 0, z)[1], propFont(g));
  return list.map((o) => {
    const [x, y] = toPx(g, o.x, o.z);
    const lb = labels.get(o.id);
    const label: [number, number] | null = lb ? [lb.x, lb.y] : null;
    if (o.kind === "box") return { kind: o.kind, name: o.name, x, y, r: 0, pts: propCorners(o).map(([a, b]) => toPx(g, a, b)), label };
    return { kind: o.kind, name: o.name, x, y, r: o.kind === "round" ? (o.w / 2) * g.s : 0.16 * g.s, label };
  });
}

/** Bóng chỗ cũ và mũi tên tới chỗ mới, toạ độ điểm ảnh. */
export interface FrameTrail {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  color: string;
  /** điểm điều khiển (điểm ảnh) nếu đường đi cong, Bézier bậc hai */
  cx?: number;
  cy?: number;
  /** đường sắp đi (video): vẽ mờ, không có bóng chỗ cũ vì người còn đứng ở đầu mũi tên */
  ahead?: boolean;
}

type P2 = [number, number];

/** Bỏ đi một đoạn dài d (điểm ảnh) ở đầu đường gấp khúc. */
function trimStart(pts: P2[], d: number): P2[] {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= d) {
      const f = l > 1e-9 ? (d - acc) / l : 0;
      return [[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], ...pts.slice(i)];
    }
    acc += l;
  }
  return [pts[pts.length - 1]];
}

/** Đường cong của một mũi tên, lấy mẫu thành đường gấp khúc (ctx không cần quadraticCurveTo). */
function trailPoints(t: FrameTrail): P2[] {
  const cx = t.cx ?? (t.x0 + t.x1) / 2, cy = t.cy ?? (t.y0 + t.y1) / 2;
  const N = 40;
  const pts: P2[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, r = 1 - s;
    pts.push([r * r * t.x0 + 2 * r * s * cx + s * s * t.x1, r * r * t.y0 + 2 * r * s * cy + s * s * t.y1]);
  }
  return pts;
}

const polyLen = (pts: P2[]) => pts.slice(1).reduce((m, q, i) => m + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

/** Nội dung một khung tại thời điểm t. highlightId: video riêng cho một người. */
export function planFrame(p: Project, t: number, g: PlanGeom, o: { highlightId?: string | null } = {}): PlanFrame {
  const ds = p.dancers.filter((d) => !d.hidden);
  const poses = posesAt(p.formations, ds.map((d) => d.id), t, p.stage);
  const seg = segmentAt(p.formations, t);
  const fs = p.formations;
  let sub = "";
  if (seg.kind === "hold") sub = fs[seg.k].name;
  else if (seg.kind === "gap") sub = `${fs[seg.k].name} → ${fs[seg.k + 1].name}`;
  else if (seg.kind === "before") sub = `Sắp vào: ${fs[0].name}`;
  else if (seg.kind === "after") sub = fs[seg.k].name;
  // ghi chú của đội hình đang đứng (đang chuyển: của đội hình sắp tới), cắt ngắn cho vừa dải chữ
  const nf = seg.kind === "hold" || seg.kind === "after" ? fs[seg.k] : seg.kind === "gap" ? fs[seg.k + 1] : seg.kind === "before" ? fs[0] : null;
  // cắt theo ký tự thật (Array.from) để không xẻ đôi biểu tượng cảm xúc
  const note = nf?.note ? Array.from(nf.note.replace(/\s+/g, " ").trim()) : [];
  if (note.length) sub += ` · ${note.length > 60 ? `${note.slice(0, 59).join("")}…` : note.join("")}`;
  const hi = o.highlightId ? ds.find((d) => d.id === o.highlightId) : undefined;
  const c = p.bpm ? countAt(t, p.bpm, p.downbeat) : null;
  const rings = groupRingColors(p);
  const dots = ds.map((d) => {
    const [x, y] = toPx(g, poses[d.id][0], poses[d.id][1]);
    const me = !!hi && d.id === hi.id;
    const face = facingAt(fs, d.id, t);
    return {
      id: d.id, x, y, r: 0.3 * g.s * (me ? 1.25 : 1), color: d.color, label: initials(d.name), name: d.name,
      alpha: hi && !me ? 0.35 : 1, highlight: me, ...(d.id in rings ? { ring: rings[d.id] } : {}),
      ...(Math.abs(face) > 0.5 ? { face } : {}),
    };
  });
  // người được tô vẽ sau cùng để nằm trên
  if (hi) dots.sort((a, b) => Number(a.highlight) - Number(b.highlight));
  const props = framePropsOf(p, g, t);
  // đang giữ một đội hình có đội hình kế: mũi tên mờ đường sắp đi, như ảnh đội hình
  const trails: FrameTrail[] = [];
  if (seg.kind === "hold" && seg.k + 1 < fs.length) {
    const from = fs[seg.k], to = fs[seg.k + 1];
    for (const d of ds) {
      if (hi && d.id !== hi.id) continue; // video riêng một người: chỉ đường của người đó
      const a = from.pos[d.id], b = to.pos[d.id], v = viaOf(to, d.id);
      if (!a || !b || (dist(a, b) <= MOVE_MIN && !v)) continue;
      const [x0, y0] = toPx(g, poses[d.id][0], poses[d.id][1]);
      const [x1, y1] = toPx(g, b[0], b[1]);
      const c = v ? toPx(g, v[0], v[1]) : null;
      trails.push({ x0, y0, x1, y1, r: 0.3 * g.s, color: d.color, ahead: true, ...(c && { cx: c[0], cy: c[1] }) });
    }
  }
  return {
    title: hi ? `Vị trí của ${hi.name}` : p.title || "Bài múa",
    sub,
    time: fmtTime(t),
    count: c ? `${c.beat}/8 · lượt ${c.eight}` : "",
    dots,
    ...(props.length ? { props } : {}),
    ...(trails.length ? { trails } : {}),
  };
}

/** Phần canvas 2D cần dùng (để kiểm thử bằng bản giả). */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillText(s: string, x: number, y: number): void;
  setLineDash(d: number[]): void;
  save(): void;
  restore(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
}

const FONT = '"Segoe UI", system-ui, Arial, sans-serif';

/** Tam giác hướng mặt ở mép chấm; quay lưng hẳn thì thêm chữ "lưng" cạnh chấm cho dễ đọc khi in. */
function drawFace(ctx: Ctx2D, d: FrameDot, u: number) {
  const a = d.face ?? 0;
  const [tip, l, r] = faceTri(a, d.r);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#0f1115";
  ctx.lineWidth = 1.5 * u;
  ctx.beginPath();
  ctx.moveTo(d.x + tip[0], d.y + tip[1]);
  ctx.lineTo(d.x + l[0], d.y + l[1]);
  ctx.lineTo(d.x + r[0], d.y + r[1]);
  ctx.lineTo(d.x + tip[0], d.y + tip[1]);
  ctx.fill();
  ctx.stroke();
  if (Math.abs(Math.abs(a) - 180) < 23) {
    ctx.fillStyle = "#ffb86b";
    ctx.font = `700 ${Math.round(Math.max(9, 10 * u))}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText("lưng", d.x + d.r + 3 * u, d.y);
  }
}

/** Mũi tên theo đường cong: rút hai đầu khỏi chấm, đầu mũi tên theo hướng tiếp tuyến cuối. */

function drawCurvedArrow(ctx: Ctx2D, t: FrameTrail, u: number) {
  const all = trailPoints(t);
  const L = polyLen(all);
  if (L < 1e-6) return;
  const hl = Math.min(12 * u, L * 0.4);
  let pts = trimStart(all, Math.min(t.r, L / 3));
  pts = trimStart(pts.reverse(), Math.min(t.r + 3 * u, L / 3)); // ngược: pts[0] là đầu mũi tên
  const [ax, ay] = pts[0];
  // hướng tới: từ điểm cách đầu mũi tên một khúc ngắn
  const back = trimStart(pts, Math.max(hl * 0.6, 1e-3))[0];
  const dl = Math.hypot(ax - back[0], ay - back[1]) || 1;
  const ux = (ax - back[0]) / dl, uy = (ay - back[1]) / dl;
  const body = trimStart(pts, hl * 0.6).reverse();
  ctx.beginPath();
  ctx.moveTo(body[0][0], body[0][1]);
  for (const q of body.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#aab3c2";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - ux * hl - uy * hl * 0.5, ay - uy * hl + ux * hl * 0.5);
  ctx.lineTo(ax - ux * hl + uy * hl * 0.5, ay - uy * hl - ux * hl * 0.5);
  ctx.fill();
}

export function drawPlanFrame(ctx: Ctx2D, g: PlanGeom, f: PlanFrame) {
  const { w, h, s } = g;
  const W = g.stage.width, D = g.stage.depth;
  const u = g.u ?? h / 720; // cỡ chữ theo độ cao khung
  const ox = g.ox ?? 0, oy = g.oy ?? 0;
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.fillStyle = "#0f1115";
  ctx.fillRect(ox, oy, w, h);

  const [x0, y0] = toPx(g, -W / 2, -D / 2);
  const [x1, y1] = toPx(g, W / 2, D / 2);
  const wing = WING * s;
  // sàn và cánh gà gạch chéo
  ctx.fillStyle = "#161a21";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = "#12151b";
  ctx.fillRect(x0 - wing, y0, wing, y1 - y0);
  ctx.fillRect(x1, y0, wing, y1 - y0);
  ctx.strokeStyle = "#232a35";
  ctx.lineWidth = Math.max(1, u);
  for (const [l, r] of [[x0 - wing, x0], [x1, x1 + wing]]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(l, y0, r - l, y1 - y0);
    ctx.clip();
    ctx.beginPath();
    for (let k = -(y1 - y0); k < r - l; k += 14 * u) {
      ctx.moveTo(l + k, y1);
      ctx.lineTo(l + k + (y1 - y0), y0);
    }
    ctx.stroke();
    ctx.restore();
  }
  // lưới 0,5 m, đường giữa nét đứt
  ctx.strokeStyle = "#222833";
  ctx.beginPath();
  for (let x = -W / 2 + 0.5; x < W / 2 - 1e-6; x += 0.5) {
    if (Math.abs(x) < 1e-6) continue;
    const px = toPx(g, x, 0)[0];
    ctx.moveTo(px, y0);
    ctx.lineTo(px, y1);
  }
  for (let z = -D / 2 + 0.5; z < D / 2 - 1e-6; z += 0.5) {
    const py = toPx(g, 0, z)[1];
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
  }
  ctx.stroke();
  ctx.strokeStyle = "#3a4250";
  ctx.setLineDash([6 * u, 6 * u]);
  ctx.beginPath();
  ctx.moveTo(g.cx, y0);
  ctx.lineTo(g.cx, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#2a313d";
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // mép trước phía khán giả
  ctx.strokeStyle = "#ff9f43";
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(x0 - wing, y1);
  ctx.lineTo(x1 + wing, y1);
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(14 * u)}px ${FONT}`;
  ctx.fillStyle = "#ff9f43";
  ctx.textAlign = "center";
  ctx.fillText("▼ KHÁN GIẢ ▼", g.cx, y1 + 22 * u);
  ctx.fillStyle = "#5d6778";
  ctx.font = `${Math.round(12 * u)}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("◀ TRÁI", x0, y1 + 22 * u);
  ctx.textAlign = "right";
  ctx.fillText("PHẢI ▶", x1, y1 + 22 * u);
  ctx.textAlign = "center";
  ctx.fillText("CÁNH GÀ", x0 - wing / 2, y0 + 14 * u);
  ctx.fillText("CÁNH GÀ", x1 + wing / 2, y0 + 14 * u);

  // đạo cụ: hộp, tròn xám mờ có tên; mốc sàn là dấu cộng vàng kèm số
  for (const o of f.props ?? []) {
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    if (o.kind === "mark") {
      ctx.strokeStyle = "#e8d27a";
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.moveTo(o.x - o.r, o.y);
      ctx.lineTo(o.x + o.r, o.y);
      ctx.moveTo(o.x, o.y - o.r);
      ctx.lineTo(o.x, o.y + o.r);
      ctx.stroke();
      ctx.fillStyle = "#e8d27a";
      ctx.font = `700 ${Math.round(11 * u)}px ${FONT}`;
      if (o.label) {
        ctx.textAlign = "center";
        ctx.fillText(o.name, o.label[0], o.label[1]);
      } else if (o.label === undefined) {
        ctx.textAlign = "left";
        ctx.fillText(o.name, o.x + o.r + 2 * u, o.y - o.r);
      }
      continue;
    }
    ctx.beginPath();
    if (o.pts) {
      ctx.moveTo(o.pts[0][0], o.pts[0][1]);
      for (const q of o.pts.slice(1)) ctx.lineTo(q[0], q[1]);
      ctx.lineTo(o.pts[0][0], o.pts[0][1]);
    } else ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#8a93a3";
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#7d8798";
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();
    ctx.fillStyle = "#aab3c2";
    ctx.font = `${Math.round(11 * u)}px ${FONT}`;
    ctx.textAlign = "center";
    const half = o.pts ? Math.max(...o.pts.map((q) => q[1])) - o.y : o.r;
    // tên đã xếp khỏi đè nhau (null là ẩn); khung cũ không có thì trong món lớn, dưới món nhỏ
    if (o.label) ctx.fillText(o.name, o.label[0], o.label[1]);
    else if (o.label === undefined) ctx.fillText(o.name, o.x, half > 16 * u ? o.y : o.y + half + 9 * u);
  }
  ctx.globalAlpha = 1;

  // bóng chỗ cũ và mũi tên, vẽ dưới chấm
  for (const t of f.trails ?? []) {
    const curved = t.cx !== undefined && t.cy !== undefined;
    const len = Math.hypot(t.x1 - t.x0, t.y1 - t.y0);
    if (len < 1e-6 && !curved) continue;
    const ux = (t.x1 - t.x0) / (len || 1), uy = (t.y1 - t.y0) / (len || 1);
    ctx.lineWidth = 2 * u;
    if (!t.ahead) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = t.color;
      ctx.setLineDash([4 * u, 4 * u]);
      ctx.beginPath();
      ctx.arc(t.x0, t.y0, t.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = t.ahead ? 0.35 : 0.85;
    ctx.strokeStyle = "#aab3c2";
    ctx.setLineDash([7 * u, 5 * u]);
    if (curved) {
      drawCurvedArrow(ctx, t, u);
      continue;
    }
    const ax = t.x1 - ux * (t.r + 3 * u), ay = t.y1 - uy * (t.r + 3 * u);
    const hl = Math.min(12 * u, len * 0.4);
    ctx.beginPath();
    ctx.moveTo(t.x0 + ux * t.r, t.y0 + uy * t.r);
    ctx.lineTo(ax - ux * hl * 0.6, ay - uy * hl * 0.6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#aab3c2";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - ux * hl - uy * hl * 0.5, ay - uy * hl + ux * hl * 0.5);
    ctx.lineTo(ax - ux * hl + uy * hl * 0.5, ay - uy * hl - ux * hl * 0.5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // người
  for (const d of f.dots) {
    ctx.globalAlpha = d.alpha;
    if (d.highlight) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + 4 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d.ring) {
      ctx.strokeStyle = d.ring;
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + 2.5 * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f1115";
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    if (d.face !== undefined) drawFace(ctx, d, u);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(Math.max(9, d.r * 0.75))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(d.label, d.x, d.y + 1);
    if (!d.name) continue;
    ctx.fillStyle = "#e8ecf2";
    ctx.font = `${d.highlight ? "700 " : ""}${Math.round(12 * u * (d.highlight ? 1.2 : 1))}px ${FONT}`;
    ctx.fillText(d.name, d.x, d.y + d.r + 12 * u);
  }
  ctx.globalAlpha = 1;

  // dải chữ trên
  ctx.textBaseline = "middle";
  const my = oy + g.head / 2 + 4 * u;
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8ecf2";
  ctx.font = `700 ${Math.round(24 * u)}px ${FONT}`;
  ctx.fillText(f.title, ox + 32 * u, my - 10 * u);
  ctx.fillStyle = "#8b95a7";
  ctx.font = `${Math.round(16 * u)}px ${FONT}`;
  ctx.fillText(f.sub, ox + 32 * u, my + 16 * u);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e8ecf2";
  ctx.font = `600 ${Math.round(24 * u)}px ${FONT}`;
  ctx.fillText(f.time, ox + w - 32 * u, my - 10 * u);
  if (f.count) {
    ctx.fillStyle = "#ff9f43";
    ctx.font = `${Math.round(16 * u)}px ${FONT}`;
    ctx.fillText(f.count, ox + w - 32 * u, my + 16 * u);
  }
}
