// Phần thuần của Ảnh vị trí từng người: mỗi vũ công một ảnh dọc gửi riêng qua Zalo.
// Đầu ảnh "Vị trí của <tên>", tên bài; dưới là lưới 2 cột, mỗi ô một đội hình nhỏ,
// người đó tô nổi (vòng trắng, to hơn), người khác mờ, mũi tên của riêng người đó.
// Quá nhiều đội hình thì chia nhiều ảnh (-p1, -p2). Vẽ bằng drawPlanFrame nên kiểm thử
// được bằng Ctx2D giả; phần canvas và tải xuống nằm ở image.ts.

import { type Project, WING, dist } from "../model.ts";
import { type Ctx2D, type FrameTrail, type PlanFrame, type PlanGeom, drawPlanFrame, planFrame, toPx } from "./planRender.ts";
import { countAt, fmtTime } from "../timing.ts";
import { holdPoses, safeColor, MOVE_MIN } from "./printSheet.ts";
import { wrapText, lineChars, type TextLine } from "./imageSheet.ts";
import { slugTitle, safeName } from "./bundle.ts";

/** Rộng 1080, cao tối đa 1080×1920 (9:16, cỡ màn hình điện thoại). */
export const PERSON_W = 1080;
export const PERSON_MAXH = 1920;
const COLS = 2;

const FONT = '"Segoe UI", system-ui, Arial, sans-serif';
const PAD = 56; // lề chữ đầu ảnh (giống ảnh đội hình)
const SIDE = 40; // lề trái phải của lưới
const GAP = 24; // khoảng cách giữa hai ô
const BOTTOM = 40;
const CPAD = 16; // lề chữ trong ô
const CW = 0.47; // bề rộng trung bình một ký tự so với cỡ chữ (như lineChars của ảnh đội hình)
const CAP = [32, 26] as const; // cỡ chữ hai dòng đầu ô
const CAP_TOP = 14;
const CAP_H = Math.round(CAP_TOP + (CAP[0] + CAP[1]) * 1.25 + 6);
const R_ME = 0.42; // bán kính chấm người đó (mét), người khác 0.3
const R_OTHER = 0.3;

const cellWidth = (w: number) => Math.floor((w - 2 * SIDE - (COLS - 1) * GAP) / COLS);

const dancerName = (p: Project, id: string) => p.dancers.find((d) => d.id === id)?.name.trim() || "?";

/** Chữ đầu ảnh: "Vị trí của <tên>", tên bài, số đội hình (và số trang). Luôn 3 dòng để mọi ảnh cùng bố cục. */
export function personHeader(p: Project, id: string, page: number, pages: number, w = PERSON_W): TextLine[] {
  const n = p.formations.length;
  const spec: [string, number, number, string, number][] = [
    // [chữ, cỡ, đậm, màu, khoảng cách trước]
    [`Vị trí của ${dancerName(p, id)}`, 56, 700, "#e8ecf2", 0],
    [p.title || "Bài múa", 36, 600, "#8b95a7", 12],
    [`${n} đội hình${pages > 1 ? ` · trang ${page + 1}/${pages}` : ""}`, 30, 400, "#ff9f43", 10],
  ];
  const out: TextLine[] = [];
  let y = PAD;
  for (const [s, size, weight, color, gap] of spec) {
    y += gap;
    const text = wrapText(s, lineChars(size, w), 1)[0] ?? "";
    out.push({ text, size, weight, color, y: y + size * 0.6 });
    y += size * 1.25;
  }
  return out;
}

const headBottom = (lines: TextLine[]) => {
  const last = lines[lines.length - 1];
  return Math.round(last.y + last.size * 0.65 + 28);
};

/** Hai dòng đầu ô: "số · tên đội hình" và giờ bắt đầu (kèm 8 thứ mấy, phách mấy nếu có nhịp). y tính từ đỉnh ô. */
export function cellLines(p: Project, k: number, cw: number, top = 0): TextLine[] {
  const f = p.formations[k];
  const chars = (size: number) => Math.max(8, Math.floor((cw - 2 * CPAD) / (size * CW)));
  let when = `bắt đầu ${fmtTime(f.start)}`;
  if (p.bpm) {
    const c = countAt(f.start + 1e-3, p.bpm, p.downbeat);
    when += ` · 8 thứ ${c.eight}, phách ${c.beat}`;
  }
  const y0 = top + CAP_TOP;
  return [
    { text: wrapText(`${k + 1} · ${f.name}`, chars(CAP[0]), 1)[0] ?? `${k + 1}`, size: CAP[0], weight: 700, color: "#e8ecf2", y: y0 + CAP[0] * 0.6 },
    { text: wrapText(when, chars(CAP[1]), 1)[0], size: CAP[1], weight: 400, color: "#ff9f43", y: y0 + CAP[0] * 1.25 + CAP[1] * 0.6 },
  ];
}

/** Kích thước sơ đồ trong ô: cùng cho mọi ô của bài. */
function cellPlan(p: Project, w: number) {
  const cw = cellWidth(w);
  const u = cw / 400;
  const W = p.stage.width, D = p.stage.depth;
  const fitW = (cw - 20) / (W + 2 * WING);
  const s = Math.min(fitW, (cw * 0.95) / D); // sân sâu: thu sân lại, ô không cao quá
  const topPad = Math.round(12 * u);
  const foot = Math.round(40 * u);
  const planH = Math.ceil(topPad + D * s + foot);
  return { cw, u, s, topPad, planH, cellH: CAP_H + planH };
}

/**
 * Chia các đội hình thành trang: mỗi trang tối đa bao nhiêu hàng 2 ô vừa cao 1920,
 * nhiều trang thì chia đều (9 đội hình, 8 ô mỗi trang: 5 và 4). Không có đội hình: [].
 */
export function personPages(p: Project, w = PERSON_W, maxH = PERSON_MAXH): number[][] {
  const n = p.formations.length;
  if (!n) return [];
  const head = headBottom(personHeader(p, "", 0, 2, w));
  const { cellH } = cellPlan(p, w);
  const rows = Math.max(1, Math.floor((maxH - head - BOTTOM + GAP) / (cellH + GAP)));
  const pages = Math.ceil(n / (rows * COLS));
  const per = Math.ceil(n / pages);
  const out: number[][] = [];
  for (let k = 0; k < n; k += per) out.push(Array.from({ length: Math.min(per, n - k) }, (_, j) => k + j));
  return out;
}

export interface PersonCell {
  k: number; // đội hình
  x: number;
  y: number;
  w: number;
  h: number;
  lines: TextLine[]; // chữ đầu ô, y tuyệt đối
  geom: PlanGeom; // sơ đồ dưới chữ, ox/oy là góc trên trái
}

export interface PersonLayout {
  w: number;
  h: number;
  head: number;
  lines: TextLine[];
  cells: PersonCell[];
}

/** Bố cục trang page của ảnh người id: chữ đầu ảnh, rồi các ô xếp 2 cột từ trái sang phải. */
export function personLayout(p: Project, id: string, pages: number[][], page: number, w = PERSON_W): PersonLayout {
  const ks = pages[page] ?? [];
  const lines = personHeader(p, id, page, pages.length, w);
  const head = headBottom(lines);
  const { cw, u, s, topPad, planH, cellH } = cellPlan(p, w);
  const rows = Math.max(1, Math.ceil(ks.length / COLS));
  const h = head + rows * cellH + (rows - 1) * GAP + BOTTOM;
  const D = p.stage.depth;
  const cells = ks.map((k, i): PersonCell => {
    const x = SIDE + (i % COLS) * (cw + GAP);
    const y = head + Math.floor(i / COLS) * (cellH + GAP);
    const oy = y + CAP_H;
    const geom: PlanGeom = { w: cw, h: planH, s, cx: x + cw / 2, cy: oy + topPad + (D * s) / 2, stage: p.stage, head: 0, u, ox: x, oy };
    return { k, x, y, w: cw, h: cellH, lines: cellLines(p, k, cw, y), geom };
  });
  return { w, h, head, lines, cells };
}

// ô nhỏ (sân rộng) thì chấm theo mét quá bé để nhìn trên điện thoại: giữ cỡ tối thiểu theo điểm ảnh
const ME_MIN_PX = 22, OTHER_MIN_PX = 12;
const meR = (g: PlanGeom) => Math.max(R_ME * g.s, ME_MIN_PX);

/** Nội dung ô đội hình k: người id tô nổi, người khác mờ chỉ còn chữ tắt, mũi tên của riêng người id. */
export function personFrame(p: Project, k: number, id: string, g: PlanGeom): PlanFrame {
  const f = p.formations[k];
  const fr = planFrame(p, (f.start + f.end) / 2, g, { highlightId: id });
  const dots = fr.dots.map((d) => ({
    ...d,
    r: d.highlight ? meR(g) : Math.max(R_OTHER * g.s, OTHER_MIN_PX),
    // chỉ người đó có nhãn tên; tên ngắn đã nằm trọn trong chấm thì bỏ nhãn
    name: d.highlight && d.label !== d.name ? d.name : "",
  }));
  const trails: FrameTrail[] = [];
  const me = p.dancers.find((d) => d.id === id);
  if (me && !me.hidden && k > 0) {
    const a = holdPoses(p, k - 1)[id], b = holdPoses(p, k)[id];
    if (a && b && dist(a, b) > MOVE_MIN) {
      const [x0, y0] = toPx(g, a[0], a[1]);
      const [x1, y1] = toPx(g, b[0], b[1]);
      trails.push({ x0, y0, x1, y1, r: meR(g), color: safeColor(me.color) });
    }
  }
  return { ...fr, dots, title: "", sub: "", time: "", count: "", trails };
}

function drawLines(ctx: Ctx2D, lines: TextLine[], x: number) {
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const l of lines) {
    ctx.fillStyle = l.color;
    ctx.font = `${l.weight} ${l.size}px ${FONT}`;
    ctx.fillText(l.text, x, l.y);
  }
}

/** Vẽ trọn một ảnh vị trí (cỡ w × h của bố cục). */
export function drawPersonSheet(ctx: Ctx2D, p: Project, id: string, L: PersonLayout) {
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, L.w, L.h);
  drawLines(ctx, L.lines, PAD);
  ctx.strokeStyle = "#232a35";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, L.head - 8);
  ctx.lineTo(L.w - PAD, L.head - 8);
  ctx.stroke();
  for (const c of L.cells) {
    drawPlanFrame(ctx, c.geom, personFrame(p, c.k, id, c.geom));
    drawLines(ctx, c.lines, c.x + CPAD);
    ctx.setLineDash([]);
    ctx.strokeStyle = "#2a313d";
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }
  ctx.globalAlpha = 1;
}

export interface PersonSheet {
  id: string;
  name: string;
  pages: number[][];
  files: string[]; // mỗi trang một tên tệp
}

/**
 * Danh sách ảnh cần xuất: mỗi người không ẩn một (hoặc vài) ảnh, theo thứ tự danh sách.
 * Tên "<tên bài>-vi-tri-<tên người>.png", nhiều trang thêm -p1, -p2; trùng tên thêm -2, -3.
 * only: chỉ những người này (vẫn đánh số trùng tên như khi xuất cả đội).
 */
export function personSheets(p: Project, only?: string[]): PersonSheet[] {
  const pages = personPages(p);
  const bai = slugTitle(p.title);
  const used = new Map<string, number>();
  const out: PersonSheet[] = [];
  p.dancers.forEach((d, i) => {
    if (d.hidden) return;
    const raw = /[\p{L}\p{N}]/u.test(d.name) ? slugTitle(d.name) : `nguoi-${i + 1}`;
    const seen = (used.get(raw.toLowerCase()) ?? 0) + 1;
    used.set(raw.toLowerCase(), seen);
    if (only && !only.includes(d.id)) return;
    const who = seen > 1 ? `${raw}-${seen}` : raw;
    const base = `${bai}-vi-tri-${who}`;
    const files = pages.length > 1 ? pages.map((_, j) => safeName(`${base}-p${j + 1}.png`)) : [safeName(`${base}.png`)];
    out.push({ id: d.id, name: d.name.trim() || "?", pages, files });
  });
  return out;
}

/** Tên gói: cả đội "<tên bài>-vi-tri-tung-nguoi.zip"; một người nhiều trang thì theo tên ảnh của người đó. */
export function personZipName(p: Project, one?: PersonSheet): string {
  if (one) return safeName(one.files[0].replace(/(-p1)?\.png$/, ".zip"));
  return safeName(`${slugTitle(p.title)}-vi-tri-tung-nguoi.zip`);
}
