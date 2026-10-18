// Vẽ sơ đồ từ trên lên canvas 2D để xuất video (không cần WebGL). Hình học và
// nội dung khung là hàm thuần; drawPlanFrame chỉ dùng vài lệnh canvas cơ bản.

import { type Project, type StageSize, WING, posesAt, segmentAt, initials } from "../model.ts";
import { countAt, fmtTime } from "../timing.ts";

export interface PlanGeom {
  w: number;
  h: number;
  s: number; // điểm ảnh mỗi mét
  cx: number; // điểm ảnh của x = 0
  cy: number; // điểm ảnh của z = 0
  stage: StageSize;
  head: number; // chiều cao dải chữ phía trên
  u?: number; // cỡ chữ riêng (ảnh gửi điện thoại); bỏ trống thì theo độ cao khung
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
}

export interface PlanFrame {
  title: string;
  sub: string; // đội hình đang đứng / đang chuyển
  time: string;
  count: string;
  dots: FrameDot[];
  /** Mũi tên từ chỗ đứng trước (ảnh đội hình); video không dùng. */
  trails?: FrameTrail[];
}

/** Bóng chỗ cũ và mũi tên tới chỗ mới, toạ độ điểm ảnh. */
export interface FrameTrail {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  color: string;
}

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
  const note = nf?.note?.replace(/\s+/g, " ");
  if (note) sub += ` · ${note.length > 60 ? `${note.slice(0, 59)}…` : note}`;
  const hi = o.highlightId ? ds.find((d) => d.id === o.highlightId) : undefined;
  const c = p.bpm ? countAt(t, p.bpm, p.downbeat) : null;
  const dots = ds.map((d) => {
    const [x, y] = toPx(g, poses[d.id][0], poses[d.id][1]);
    const me = !!hi && d.id === hi.id;
    return {
      id: d.id, x, y, r: 0.3 * g.s * (me ? 1.25 : 1), color: d.color, label: initials(d.name), name: d.name,
      alpha: hi && !me ? 0.35 : 1, highlight: me,
    };
  });
  // người được tô vẽ sau cùng để nằm trên
  if (hi) dots.sort((a, b) => Number(a.highlight) - Number(b.highlight));
  return {
    title: hi ? `Vị trí của ${hi.name}` : p.title || "Bài múa",
    sub,
    time: fmtTime(t),
    count: c ? `${c.beat}/8 · lượt ${c.eight}` : "",
    dots,
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

export function drawPlanFrame(ctx: Ctx2D, g: PlanGeom, f: PlanFrame) {
  const { w, h, s } = g;
  const W = g.stage.width, D = g.stage.depth;
  const u = g.u ?? h / 720; // cỡ chữ theo độ cao khung
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, w, h);

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

  // bóng chỗ cũ và mũi tên, vẽ dưới chấm
  for (const t of f.trails ?? []) {
    const len = Math.hypot(t.x1 - t.x0, t.y1 - t.y0);
    if (len < 1e-6) continue;
    const ux = (t.x1 - t.x0) / len, uy = (t.y1 - t.y0) / len;
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([4 * u, 4 * u]);
    ctx.beginPath();
    ctx.arc(t.x0, t.y0, t.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#aab3c2";
    ctx.setLineDash([7 * u, 5 * u]);
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
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f1115";
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(Math.max(9, d.r * 0.75))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(d.label, d.x, d.y + 1);
    ctx.fillStyle = "#e8ecf2";
    ctx.font = `${d.highlight ? "700 " : ""}${Math.round(12 * u * (d.highlight ? 1.2 : 1))}px ${FONT}`;
    ctx.fillText(d.name, d.x, d.y + d.r + 12 * u);
  }
  ctx.globalAlpha = 1;

  // dải chữ trên
  ctx.textBaseline = "middle";
  const my = g.head / 2 + 4 * u;
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8ecf2";
  ctx.font = `700 ${Math.round(24 * u)}px ${FONT}`;
  ctx.fillText(f.title, 32 * u, my - 10 * u);
  ctx.fillStyle = "#8b95a7";
  ctx.font = `${Math.round(16 * u)}px ${FONT}`;
  ctx.fillText(f.sub, 32 * u, my + 16 * u);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e8ecf2";
  ctx.font = `600 ${Math.round(24 * u)}px ${FONT}`;
  ctx.fillText(f.time, w - 32 * u, my - 10 * u);
  if (f.count) {
    ctx.fillStyle = "#ff9f43";
    ctx.font = `${Math.round(16 * u)}px ${FONT}`;
    ctx.fillText(f.count, w - 32 * u, my + 16 * u);
  }
}
