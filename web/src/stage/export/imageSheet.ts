// Phần thuần của Xuất ảnh đội hình (PNG gửi Zalo/Messenger): chọn đội hình,
// bố cục khung dọc, chữ đầu ảnh, tên tệp. Vẽ bằng drawPlanFrame của planRender.ts
// nên kiểm thử được bằng Ctx2D giả; phần canvas và tải xuống nằm ở image.ts.

import { type Project, type StageSize, WING, segmentAt, dist, viaOf } from "../model.ts";
import { type Ctx2D, type FrameTrail, type PlanFrame, type PlanGeom, drawPlanFrame, planFrame, toPx } from "./planRender.ts";
import { holdPoses, timeLabel, safeColor, MOVE_MIN } from "./printSheet.ts";
import { slugTitle, safeName } from "./bundle.ts";

/** Rộng 1080, cao từ khung vuông tới dọc 4:5: vừa màn hình điện thoại và xem trước trong Zalo/Messenger. */
export const IMG_W = 1080;
export const IMG_H = 1350;

const FONT = '"Segoe UI", system-ui, Arial, sans-serif';
const PAD = 56; // lề trái phải của chữ
const CW = 0.47; // bề rộng trung bình một ký tự so với cỡ chữ (đo trên Segoe UI, chữ Việt có dấu)

/**
 * Đội hình ứng với vạch phát: đang đứng thì chính nó, đang chuyển thì đội hình
 * gần hơn (quá nửa đường thì đội hình tới), trước bài là đội hình đầu, sau bài là
 * đội hình cuối. Không có đội hình: -1.
 */
export function formationIndexAt(p: Project, t: number): number {
  const seg = segmentAt(p.formations, t);
  if (seg.kind === "none") return -1;
  if (seg.kind === "gap") return seg.u < 0.5 ? seg.k : seg.k + 1;
  return seg.k;
}

/** Ngắt chữ theo số ký tự ước lượng, tối đa maxLines dòng (dòng cuối thêm "…" nếu còn dư).
 *  Đếm và cắt theo ký tự thật (Array.from) để không xẻ đôi biểu tượng cảm xúc. */
export function wrapText(s: string, maxChars: number, maxLines: number): string[] {
  const len = (x: string) => Array.from(x).length;
  const cut = (x: string, a: number, b?: number) => Array.from(x).slice(a, b).join("");
  const lines: string[] = [];
  let cur = "";
  for (let w of s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)) {
    // từ quá dài thì cắt cứng
    while (len(w) > maxChars) {
      if (cur) lines.push(cur);
      cur = "";
      lines.push(cut(w, 0, maxChars));
      w = cut(w, maxChars);
    }
    if (!w) continue;
    const next = cur ? `${cur} ${w}` : w;
    if (len(next) <= maxChars) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  const last = out[maxLines - 1];
  out[maxLines - 1] = `${len(last) >= maxChars ? cut(last, 0, maxChars - 1) : last}…`;
  return out;
}

export interface TextLine {
  text: string;
  size: number; // cỡ chữ (điểm ảnh)
  weight: number;
  color: string;
  y: number; // đường giữa dòng
}

export interface ImageLayout {
  w: number;
  h: number;
  head: number; // đáy phần chữ đầu ảnh
  lines: TextLine[];
  geom: PlanGeom;
}

/** Số ký tự ước lượng vừa một dòng chữ cỡ size trên ảnh rộng w. */
export const lineChars = (size: number, w: number) => Math.max(8, Math.floor((w - 2 * PAD) / (size * CW)));

/** Các dòng chữ đầu ảnh: tên bài, tên đội hình, thời điểm và nhịp, ghi chú. */
export function headerLines(p: Project, k: number, w = IMG_W): TextLine[] {
  const f = p.formations[k];
  const n = p.formations.length;
  const spec: [string[], number, number, string, number][] = [
    // [các dòng, cỡ, đậm, màu, khoảng cách trước]
    [wrapText(p.title || "Bài múa", lineChars(40, w), 1), 40, 600, "#8b95a7", 0],
    [wrapText(`${k + 1}/${n} · ${f.name}`, lineChars(60, w), 2), 60, 700, "#e8ecf2", 14],
    [wrapText(timeLabel(p, k), lineChars(32, w), 2), 32, 400, "#ff9f43", 12],
  ];
  if (f.note?.trim()) spec.push([wrapText(f.note, lineChars(34, w), 3), 34, 400, "#e8ecf2", 18]);
  const out: TextLine[] = [];
  let y = PAD;
  for (const [ls, size, weight, color, gap] of spec) {
    y += gap;
    for (const text of ls) {
      out.push({ text, size, weight, color, y: y + size * 0.6 });
      y += size * 1.25;
    }
  }
  return out;
}

/** Cỡ chữ của sơ đồ (đơn vị u của drawPlanFrame) theo bề rộng ảnh: tên người khoảng 27 px trên ảnh 1080. */
export const imageUnit = (w: number) => w / 480;

/**
 * Bố cục: chữ ở trên, sân và cánh gà ở dưới, chừa dòng KHÁN GIẢ ở đáy ảnh.
 * Cao ảnh vừa nội dung nhưng không thấp hơn khung vuông và không cao quá maxH (4:5).
 */
export function imageLayout(p: Project, k: number, w = IMG_W, maxH = IMG_H): ImageLayout {
  const lines = headerLines(p, k, w);
  const last = lines[lines.length - 1];
  const head = Math.round(last.y + last.size * 0.65 + 28);
  const u = imageUnit(w);
  const foot = Math.round(40 * u);
  const top = head + Math.round(10 * u);
  const stage: StageSize = p.stage;
  const side = Math.round(w * 0.03);
  const fitW = (w - 2 * side) / (stage.width + 2 * WING);
  const h = Math.round(Math.min(maxH, Math.max(w, top + stage.depth * fitW + foot)));
  const avail = Math.max(40, h - top - foot);
  const s = Math.min(fitW, avail / stage.depth);
  const geom: PlanGeom = { w, h, s, cx: w / 2, cy: top + avail / 2, stage, head, u };
  return { w, h, head, lines, geom };
}

/** Nội dung sơ đồ đội hình k: chấm ở giữa khối giữ, mũi tên từ đội hình trước. */
export function imageFrame(p: Project, k: number, g: PlanGeom): PlanFrame {
  const f = p.formations[k];
  const fr = planFrame(p, (f.start + f.end) / 2, g);
  // chấm to hơn video một chút để đọc được chữ tắt trên điện thoại
  // tên ngắn đã nằm trọn trong chấm thì bỏ nhãn dưới chấm để khỏi đè chấm bên cạnh
  const dots = fr.dots.map((d) => ({ ...d, r: 0.36 * g.s, name: d.label === d.name ? "" : d.name }));
  const now = holdPoses(p, k);
  const prev = k > 0 ? holdPoses(p, k - 1) : null;
  const trails: FrameTrail[] = [];
  if (prev) {
    for (const d of p.dancers) {
      const a = prev[d.id], b = now[d.id];
      const v = viaOf(f, d.id);
      if (d.hidden || !a || !b || (dist(a, b) <= MOVE_MIN && !v)) continue;
      const [x0, y0] = toPx(g, a[0], a[1]);
      const [x1, y1] = toPx(g, b[0], b[1]);
      const c = v ? toPx(g, v[0], v[1]) : null;
      trails.push({ x0, y0, x1, y1, r: 0.36 * g.s, color: safeColor(d.color), ...(c && { cx: c[0], cy: c[1] }) });
    }
  }
  // chữ đầu ảnh do drawImage vẽ, để trống dải chữ của video
  return { ...fr, dots, title: "", sub: "", time: "", count: "", trails };
}

/** Vẽ trọn một ảnh đội hình lên ctx (cỡ w × h của bố cục). */
export function drawImage(ctx: Ctx2D, p: Project, k: number, L: ImageLayout = imageLayout(p, k)) {
  drawPlanFrame(ctx, L.geom, imageFrame(p, k, L.geom));
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const l of L.lines) {
    ctx.fillStyle = l.color;
    ctx.font = `${l.weight} ${l.size}px ${FONT}`;
    ctx.fillText(l.text, PAD, l.y);
  }
  // vạch ngăn chữ và sân
  ctx.strokeStyle = "#232a35";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, L.head - 8);
  ctx.lineTo(L.w - PAD, L.head - 8);
  ctx.stroke();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Tên ảnh: "<tên bài>-<số thứ tự>-<tên đội hình>.png", không dấu cách. */
export function imageFileName(p: Project, k: number): string {
  const n = p.formations[k].name;
  const fn = /[\p{L}\p{N}]/u.test(n) ? slugTitle(n) : "doi-hinh";
  return safeName(`${slugTitle(p.title)}-${pad2(k + 1)}-${fn}.png`);
}

/** Tên gói mọi ảnh: "<tên bài>-doi-hinh.zip". */
export const imagesZipName = (p: Project) => safeName(`${slugTitle(p.title)}-doi-hinh.zip`);

/** Phần của navigator mà mục Chia sẻ cần (để test bằng đối tượng giả). */
export interface ShareNav {
  share?: unknown;
  canShare?: (data: { files?: File[] }) => boolean;
}

/** Có hiện mục "Chia sẻ ảnh" không: cần share và canShare nhận đúng các tệp này (điện thoại, Safari, Edge). */
export function canShareImage(nav: ShareNav | undefined, files: File[]): boolean {
  if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files }) === true;
  } catch {
    return false;
  }
}

/** Phần của navigator mà mục Chép ảnh cần. */
export interface ClipNav {
  clipboard?: { write?: unknown };
}

/** Có hiện mục "Chép ảnh" không: cần clipboard.write (trang an toàn) và lớp ClipboardItem. */
export function canCopyImage(nav: ClipNav | undefined, clipboardItem: unknown): boolean {
  return typeof nav?.clipboard?.write === "function" && typeof clipboardItem === "function";
}
