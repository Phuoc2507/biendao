// Tờ đội hình để in (A4 dọc, 2 đội hình mỗi trang). Thuần: chỉ tạo chuỗi
// HTML/SVG, không đụng DOM, để kiểm thử bằng node.

import { type Project, type Vec2, WING, posesAt, initials, dist } from "../model.ts";
import { countAt, fmtCounts, fmtTime } from "../timing.ts";

/** Mô tả vị trí bằng lời (ui/hooks.ts describePos), truyền vào để giữ thuần. */
export type Describe = (x: number, z: number, width: number, depth: number) => string;

export interface PrintOpts {
  describe: Describe;
  date?: Date;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Màu người dùng đặt: chỉ nhận dạng #rgb..#rrggbbaa, còn lại thay màu xám. */
export const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#888888");

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
export const MOVE_MIN = 0.15; // dời ít hơn thế thì không vẽ mũi tên

const S = 40; // đơn vị SVG mỗi mét
const PAD = 28;

/** Người có trên sân (bỏ người đang ẩn). */
const shown = (p: Project) => p.dancers.filter((d) => !d.hidden);

/** Vị trí giữa khối giữ đội hình k (giống lúc xem trên sân). */
export function holdPoses(p: Project, k: number): Record<string, Vec2> {
  const f = p.formations[k];
  return posesAt(p.formations, shown(p).map((d) => d.id), (f.start + f.end) / 2, p.stage);
}

/** Thời gian và đếm phách của đội hình k, ví dụ "0:04.0 – 0:08.0 · 8 thứ 2, phách 1 · 1×8". */
export function timeLabel(p: Project, k: number): string {
  const f = p.formations[k];
  let s = `${fmtTime(f.start)} – ${fmtTime(f.end)}`;
  if (p.bpm) {
    const c = countAt(f.start + 1e-3, p.bpm, p.downbeat);
    s += ` · bắt đầu 8 thứ ${c.eight}, phách ${c.beat} · giữ ${fmtCounts(f.end - f.start, p.bpm)}`;
  } else s += ` · giữ ${fmtCounts(f.end - f.start, null)}`;
  return s;
}

/** Sơ đồ nhìn từ trên của đội hình k: khán giả ở dưới, mũi tên từ đội hình trước. */
export function formationSvg(p: Project, k: number): string {
  const { width, depth } = p.stage;
  const W = width + 2 * WING;
  const vw = W * S + 2 * PAD;
  const vh = depth * S + 2 * PAD + 14;
  const X = (x: number) => PAD + (x + W / 2) * S;
  const Z = (z: number) => PAD + (z + depth / 2) * S;
  const o: string[] = [];
  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(vw)} ${n1(vh)}" class="plan" role="img" aria-label="Sơ đồ đội hình ${esc(p.formations[k].name)}">`,
    `<defs><pattern id="h${k}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#d6d9de" stroke-width="3"/></pattern>`,
    `<marker id="a${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#666"/></marker></defs>`,
  );
  // cánh gà hai bên
  const top = Z(-depth / 2), h = depth * S;
  o.push(
    `<rect x="${n1(X(-W / 2))}" y="${n1(top)}" width="${WING * S}" height="${n1(h)}" fill="url(#h${k})" stroke="#bbb"/>`,
    `<rect x="${n1(X(width / 2))}" y="${n1(top)}" width="${WING * S}" height="${n1(h)}" fill="url(#h${k})" stroke="#bbb"/>`,
    `<text x="${n1(X(-width / 2 - WING / 2))}" y="${n1(top + 14)}" class="lbl" text-anchor="middle">CÁNH GÀ</text>`,
    `<text x="${n1(X(width / 2 + WING / 2))}" y="${n1(top + 14)}" class="lbl" text-anchor="middle">CÁNH GÀ</text>`,
  );
  // lưới 0,5 m trên sàn diễn
  const g: string[] = [];
  for (let x = -width / 2; x <= width / 2 + 1e-6; x += 0.5) {
    if (Math.abs(x) < 1e-6) continue;
    g.push(`M${n1(X(x))} ${n1(top)}V${n1(top + h)}`);
  }
  for (let z = -depth / 2 + 0.5; z < depth / 2 - 1e-6; z += 0.5) g.push(`M${n1(X(-width / 2))} ${n1(Z(z))}H${n1(X(width / 2))}`);
  o.push(
    `<path d="${g.join("")}" stroke="#e6e8eb" stroke-width="1" fill="none"/>`,
    `<line x1="${n1(X(0))}" y1="${n1(top)}" x2="${n1(X(0))}" y2="${n1(top + h)}" stroke="#b8bcc4" stroke-dasharray="6 5"/>`,
    `<rect x="${n1(X(-width / 2))}" y="${n1(top)}" width="${n1(width * S)}" height="${n1(h)}" fill="none" stroke="#666" stroke-width="1.5"/>`,
    `<line x1="${n1(X(-W / 2))}" y1="${n1(top + h)}" x2="${n1(X(W / 2))}" y2="${n1(top + h)}" stroke="#e07a1f" stroke-width="4"/>`,
    `<text x="${n1(X(0))}" y="${n1(top - 9)}" class="lbl" text-anchor="middle">PHÔNG NỀN (CUỐI SÂN)</text>`,
    `<text x="${n1(X(0))}" y="${n1(top + h + 20)}" class="aud" text-anchor="middle">▼ KHÁN GIẢ ▼</text>`,
    `<text x="${n1(X(-width / 2) + 4)}" y="${n1(top + h + 20)}" class="lbl">◀ TRÁI</text>`,
    `<text x="${n1(X(width / 2) - 4)}" y="${n1(top + h + 20)}" class="lbl" text-anchor="end">PHẢI ▶</text>`,
  );
  // vũ công: bóng mờ + mũi tên từ đội hình trước, rồi chấm
  const now = holdPoses(p, k);
  const prev = k > 0 ? holdPoses(p, k - 1) : null;
  const R = 0.3 * S;
  for (const d of shown(p)) {
    const a = prev?.[d.id], b = now[d.id];
    if (!a || !b || dist(a, b) <= MOVE_MIN) continue;
    const len = dist(a, b) * S;
    const ux = (X(b[0]) - X(a[0])) / len, uz = (Z(b[1]) - Z(a[1])) / len;
    const c = safeColor(d.color);
    o.push(
      `<circle cx="${n1(X(a[0]))}" cy="${n1(Z(a[1]))}" r="${n1(R)}" fill="none" stroke="${c}" stroke-opacity=".55" stroke-dasharray="3 3"/>`,
      `<line x1="${n1(X(a[0]) + ux * R)}" y1="${n1(Z(a[1]) + uz * R)}" x2="${n1(X(b[0]) - ux * (R + 2))}" y2="${n1(Z(b[1]) - uz * (R + 2))}" stroke="#666" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#a${k})"/>`,
    );
  }
  for (const d of shown(p)) {
    const b = now[d.id];
    if (!b) continue;
    const cx = n1(X(b[0])), cy = n1(Z(b[1]));
    o.push(
      `<g class="dot"><circle cx="${cx}" cy="${cy}" r="${n1(R)}" fill="${safeColor(d.color)}" stroke="#222" stroke-width="1"/>`,
      `<text x="${cx}" y="${n1(Z(b[1]) + 4)}" class="ini" text-anchor="middle">${esc(initials(d.name))}</text>`,
      `<text x="${cx}" y="${n1(Z(b[1]) + R + 12)}" class="nm" text-anchor="middle">${esc(d.name)}</text></g>`,
    );
  }
  o.push("</svg>");
  return o.join("");
}

const CSS = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 11pt "Segoe UI", system-ui, Arial, sans-serif; color: #111; background: #fff; }
.page { page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
header.doc { border-bottom: 2px solid #111; margin-bottom: 4mm; padding-bottom: 2mm; }
header.doc h1 { margin: 0; font-size: 18pt; }
header.doc .meta { color: #444; font-size: 9.5pt; margin-top: 1mm; }
.f { break-inside: avoid; page-break-inside: avoid; margin-bottom: 5mm; }
.f h2 { margin: 0 0 1mm; font-size: 13pt; }
.f h2 small { font-weight: normal; color: #555; font-size: 9.5pt; margin-left: 2mm; }
.f .when { font-size: 9.5pt; color: #333; margin-bottom: 1.5mm; }
.f .fnote { font-size: 10pt; margin: 0 0 1.5mm; padding-left: 2mm; border-left: 0.6mm solid #888; white-space: pre-wrap; }
svg.plan { width: 100%; max-height: 112mm; display: block; }
svg .lbl { font-size: 10px; fill: #777; letter-spacing: .5px; }
svg .aud { font-size: 12px; font-weight: 700; fill: #e07a1f; letter-spacing: 1px; }
svg .ini { font-size: 9px; font-weight: 700; fill: #fff; paint-order: stroke; stroke: #0006; stroke-width: 2px; }
svg .nm { font-size: 10px; fill: #111; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
h2.tbl { font-size: 13pt; margin: 0 0 2mm; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 5mm; break-inside: auto; }
th, td { border: 1px solid #999; padding: 1.2mm 1.5mm; text-align: left; vertical-align: top; }
thead th { background: #eee; }
tr { break-inside: avoid; page-break-inside: avoid; }
td.who { white-space: nowrap; font-weight: 600; }
.sw { display: inline-block; width: 3mm; height: 3mm; border-radius: 50%; margin-right: 1.5mm; vertical-align: -.3mm; border: 1px solid #333; }
.note { color: #555; font-size: 9pt; }
`;

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Trang in đầy đủ: đầu trang, 2 đội hình mỗi trang, rồi bảng vị trí từng người. */
export function printHtml(p: Project, o: PrintOpts): string {
  const fs = p.formations;
  const people = shown(p);
  const meta = [
    `Sân ${n1(p.stage.width).replace(".", ",")} × ${n1(p.stage.depth).replace(".", ",")} m`,
    `${people.length} vũ công`,
    `${fs.length} đội hình`,
    p.musicName ? `Nhạc: ${esc(p.musicName)}` : "",
    p.bpm ? `${Math.round(p.bpm)} BPM` : "",
    `In ngày ${fmtDate(o.date ?? new Date())}`,
  ].filter(Boolean).join(" · ");
  const head = `<header class="doc"><h1>${esc(p.title || "Bài múa")}</h1><div class="meta">${meta}</div>`
    + `<div class="note">Nhìn từ trên xuống, khán giả ở phía dưới. Vòng nét đứt và mũi tên: chỗ đứng ở đội hình trước.</div></header>`;

  const block = (k: number) => {
    const f = fs[k];
    return `<div class="f"><h2>${k + 1}. ${esc(f.name)}<small>${k > 0 ? `sau “${esc(fs[k - 1].name)}”` : "mở đầu"}</small></h2>`
      + `<div class="when">${timeLabel(p, k)}</div>`
      + (f.note ? `<div class="fnote">${esc(f.note)}</div>` : "")
      + `${formationSvg(p, k)}</div>`;
  };

  const pages: string[] = [];
  for (let k = 0; k < fs.length; k += 2) {
    pages.push(`<section class="page">${k === 0 ? head : ""}${block(k)}${k + 1 < fs.length ? block(k + 1) : ""}</section>`);
  }
  if (!fs.length) pages.push(`<section class="page">${head}<p>Chưa có đội hình nào.</p></section>`);

  // bảng vị trí từng người, mỗi bảng 4 đội hình
  if (fs.length && people.length) {
    const poses = fs.map((_, k) => holdPoses(p, k));
    const tables: string[] = [];
    for (let c = 0; c < fs.length; c += 4) {
      const cols = fs.slice(c, c + 4).map((f, j) => ({ f, k: c + j }));
      const th = cols.map(({ f, k }) => `<th>${k + 1}. ${esc(f.name)}<br><span class="note">${fmtTime(f.start)}</span></th>`).join("");
      const rows = people.map((d) => {
        const cells = cols.map(({ k }) => {
          const q = poses[k][d.id];
          return `<td>${q ? esc(o.describe(q[0], q[1], p.stage.width, p.stage.depth)) : "–"}</td>`;
        }).join("");
        return `<tr><td class="who"><span class="sw" style="background:${safeColor(d.color)}"></span>${esc(d.name)}</td>${cells}</tr>`;
      }).join("");
      tables.push(`<table><thead><tr><th>Vũ công</th>${th}</tr></thead><tbody>${rows}</tbody></table>`);
    }
    pages.push(`<section class="page"><h2 class="tbl">Vị trí từng người</h2>`
      + `<p class="note">Trái/phải tính theo hướng nhìn từ khán giả (như sơ đồ). “Cách mép”: khoảng cách tới mép sân phía khán giả.</p>${tables.join("")}</section>`);
  }

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(p.title || "Bài múa")} – tờ đội hình</title>`
    + `<style>${CSS}</style></head><body>${pages.join("")}</body></html>`;
}
