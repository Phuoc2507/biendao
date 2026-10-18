// Gói cả bài thành một tệp .zip: project.choreo.json + nhạc + mọi video được
// dùng + ĐỌC-TÔI.txt. THUẦN: media lấy qua hàm truyền vào (không import db) để
// test được bằng `node --test`.
//
// Trong project.choreo.json của gói có thêm mục "bundle" ghi đường dẫn, cỡ và
// CRC của từng media. Khi mở, tìm tệp theo đường dẫn, rồi theo cỡ + CRC (tên bị
// trình nén khác làm hỏng vẫn khớp), cuối cùng theo tên tệp.

import { type Project } from "../model.ts";
import { normalizeProject } from "../intake.ts";
import { type ZipEntry, type ZipInput, makeZip, listZip, readEntry, crc32Blob, checkZipLimits } from "./zip.ts";

export const PROJECT_ENTRY = "project.choreo.json";
export const README_ENTRY = "ĐỌC-TÔI.txt";

/** Cùng dạng với MediaRec trong db.ts. */
export interface MediaBlob {
  id: string;
  name: string;
  type: string;
  blob: Blob;
}

export interface BundleMedia {
  id: string;
  kind: "music" | "video";
  path: string; // trong gói, vd "video/Hương.card.mp4"
  name: string; // tên tệp gốc
  type: string;
  size: number;
  crc: number;
}

// ---------- tên tệp ----------

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i; // tên Windows cấm

/** Tên tệp dùng được trên mọi máy: bỏ ký tự cấm, cắt bớt nhưng giữ đuôi. */
export function safeName(s: string, fallback = "tep"): string {
  let t = (s || "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^[\s.]+|[\s.]+$/g, "");
  if (t.length > 120) {
    const ext = /(\.card)?\.[a-z0-9]{1,5}$/i.exec(t)?.[0] ?? "";
    t = t.slice(0, 120 - ext.length).trim() + ext;
  }
  if (!t) return fallback;
  return RESERVED.test(t.split(".")[0]) ? `_${t}` : t;
}

/** Tên bài thành tên tệp: "Bài múa mới" -> "Bài-múa-mới". */
export function slugTitle(title: string): string {
  return (title || "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "bai-mua";
}

const EXT_TYPE: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg",
  opus: "audio/ogg", flac: "audio/flac", json: "application/json", txt: "text/plain",
};

export function mimeFromName(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? "";
}

function extFromType(type: string): string {
  const t = type.split(";")[0].trim().toLowerCase();
  if (t === "audio/mpeg") return "mp3";
  if (t === "audio/mp4") return "m4a";
  for (const k of Object.keys(EXT_TYPE)) if (EXT_TYPE[k] === t) return k;
  return t.startsWith("audio/") ? "mp3" : "mp4";
}

/** Thêm hậu tố trước đuôi: "Lan.card.mp4" + " (2)" -> "Lan (2).card.mp4". */
function withSuffix(name: string, suffix: string): string {
  const m = /((\.card)?\.[a-z0-9]{1,5})$/i.exec(name);
  return m ? name.slice(0, m.index) + suffix + m[1] : name + suffix;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const keyOf = (s: string) => s.normalize("NFC").toLowerCase();

// ---------- dự án ----------

/** Kiểm tra và chuẩn hoá JSON dự án (điền trường thiếu, dọn số hỏng, bỏ mục "bundle").
 *  Dùng chung normalizeProject với lúc nạp lại từ trình duyệt để tệp mở ra cũng đúng bất biến. */
export function checkProject(j: unknown): Project {
  const p = normalizeProject(j);
  if (!p) throw new Error("Không phải tệp dự án sân khấu");
  delete (p as Project & { bundle?: unknown }).bundle;
  return p;
}

interface MediaRef {
  id: string;
  kind: "music" | "video";
  name: string;
}

/** Media dự án đang dùng: nhạc trước, rồi video theo thứ tự vũ công (bản nhân bản dùng chung chỉ tính một). */
export function mediaRefs(p: Project): MediaRef[] {
  const out: MediaRef[] = [];
  if (p.musicId) out.push({ id: p.musicId, kind: "music", name: p.musicName || "nhac" });
  const seen = new Set<string>();
  for (const d of p.dancers) {
    if (!d.mediaId || seen.has(d.mediaId) || d.mediaId === p.musicId) continue;
    seen.add(d.mediaId);
    out.push({ id: d.mediaId, kind: "video", name: d.mediaName || d.name });
  }
  return out;
}

/** Đặt đường dẫn trong gói cho từng media, không trùng (không phân biệt hoa thường). */
export function layoutPaths(list: { kind: "music" | "video"; name: string; type?: string }[]): string[] {
  const used = new Set<string>();
  return list.map((m) => {
    let base = safeName(m.name, m.kind === "music" ? "nhac" : "video");
    if (!/\.[a-z0-9]{1,5}$/i.test(base)) base += "." + extFromType(m.type || (m.kind === "music" ? "audio/mpeg" : "video/mp4"));
    const dir = m.kind === "music" ? "nhac" : "video";
    let path = `${dir}/${base}`;
    for (let k = 2; used.has(keyOf(path)); k++) path = `${dir}/${withSuffix(base, ` (${k})`)}`;
    used.add(keyOf(path));
    return path;
  });
}

function fmtDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Nội dung ĐỌC-TÔI.txt (có BOM và xuống dòng CRLF cho Notepad). */
export function readmeText(p: Project, media: { kind: string; path: string; name: string }[], date: Date): string {
  const music = media.find((m) => m.kind === "music");
  const nv = media.filter((m) => m.kind === "video").length;
  const lines = [
    "GÓI BÀI MÚA - SÂN KHẤU THẺ VIDEO",
    "",
    `Bài: ${p.title}`,
    `Đóng gói lúc: ${fmtDate(date)}`,
    `${p.dancers.length} vũ công, ${p.formations.length} đội hình${music ? `, nhạc "${music.name}"` : ", chưa có nhạc"}.`,
    "",
    "CÁCH MỞ TRÊN MÁY KHÁC",
    "1. Mở app Sân khấu thẻ video.",
    "2. Kéo thả nguyên tệp .zip này vào cửa sổ app (hoặc bấm Tệp ▸ Mở…).",
    "   Không cần giải nén.",
    "",
    "TRONG GÓI CÓ",
    `- ${PROJECT_ENTRY}: đội hình, thời gian, vị trí từng người.`,
    music ? `- ${music.path}: bản nhạc.` : "- Không có nhạc.",
    `- video/: ${nv} video của vũ công.`,
    "",
    "Lỡ giải nén rồi: chọn tệp .choreo.json cùng mọi tệp trong nhac/ và video/,",
    "rồi thả tất cả cùng lúc vào app.",
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ---------- đóng gói ----------

export interface BuildResult {
  blob: Blob;
  media: BundleMedia[];
  skipped: string[]; // tên media dự án cần nhưng máy không còn
}

export async function buildBundle(
  p: Project,
  get: (id: string) => Promise<MediaBlob | undefined>,
  o: { date?: Date; onProgress?: (fraction: number) => void } = {},
): Promise<BuildResult> {
  const date = o.date ?? new Date();
  const found: { ref: MediaRef; rec: MediaBlob }[] = [];
  const skipped: string[] = [];
  for (const ref of mediaRefs(p)) {
    const rec = await get(ref.id);
    if (rec) found.push({ ref, rec });
    else skipped.push(ref.name);
  }
  const enc = new TextEncoder();
  const paths = layoutPaths(found.map((f) => ({ kind: f.ref.kind, name: f.rec.name || f.ref.name, type: f.rec.type || f.rec.blob.type })));
  // báo quá cỡ ngay, trước khi mất công đọc hết video (dư 1 MB cho JSON)
  checkZipLimits([
    { nameBytes: 64, size: 1 << 20 },
    ...found.map((f, i) => ({ nameBytes: enc.encode(paths[i]).length, size: f.rec.blob.size })),
  ]);

  const total = found.reduce((s, f) => s + f.rec.blob.size, 0) || 1;
  let done = 0;
  const media: BundleMedia[] = [];
  for (let i = 0; i < found.length; i++) {
    const { ref, rec } = found[i];
    const crc = await crc32Blob(rec.blob, (n) => {
      done += n;
      o.onProgress?.(done / total);
    });
    media.push({
      id: ref.id, kind: ref.kind, path: paths[i], name: rec.name || ref.name,
      type: rec.type || rec.blob.type || mimeFromName(paths[i]), size: rec.blob.size, crc,
    });
  }
  const json = JSON.stringify({ ...p, bundle: { format: "choreo-bundle", version: 1, media } }, null, 2);
  const items: ZipInput[] = [
    { name: README_ENTRY, data: readmeText(p, media, date) },
    { name: PROJECT_ENTRY, data: json },
    ...found.map((f, i) => ({ name: media[i].path, data: f.rec.blob, crc: media[i].crc })),
  ];
  return { blob: await makeZip(items, { date }), media, skipped };
}

// ---------- mở gói ----------

export interface OpenResult {
  project: Project;
  media: MediaBlob[]; // giữ nguyên id cũ nên dự án khỏi phải sửa
  missing: string[]; // id media dự án cần mà gói không có
}

const junk = (e: ZipEntry) => e.dir || /(^|\/)__MACOSX\//i.test(e.name) || /(^|\/)\._/.test(e.name);

/** Tệp dự án trong gói: ưu tiên project.choreo.json, rồi *.choreo.json, rồi .json khác; nông nhất thắng. */
export function pickProjectEntry(entries: ZipEntry[]): ZipEntry | undefined {
  let best: ZipEntry | undefined;
  let bestScore = Infinity;
  for (const e of entries) {
    if (junk(e) || !/\.json$/i.test(e.name) || /\.card\.json$/i.test(e.name)) continue;
    const b = keyOf(baseName(e.name));
    const rank = b === PROJECT_ENTRY ? 0 : /\.choreo\.json$/.test(b) ? 1 : 2;
    const score = e.name.split("/").length * 10 + rank;
    if (score < bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function readManifest(j: unknown): BundleMedia[] | null {
  const b = (j as { bundle?: { media?: unknown } } | null)?.bundle;
  if (!b || !Array.isArray(b.media)) return null;
  return b.media.filter(
    (m): m is BundleMedia => !!m && typeof m.id === "string" && typeof m.path === "string" && (m.kind === "music" || m.kind === "video"),
  );
}

interface Wanted {
  id: string;
  name: string;
  path?: string;
  type?: string;
  size?: number;
  crc?: number;
}

function matchEntry(entries: ZipEntry[], w: Wanted, base: string, used: Set<ZipEntry>): ZipEntry | undefined {
  const free = entries.filter((e) => !used.has(e) && !junk(e));
  if (w.path) {
    const want = keyOf(base + w.path);
    const e = free.find((x) => keyOf(x.name) === want);
    if (e) return e;
  }
  if (w.size !== undefined && w.crc !== undefined) {
    const e = free.find((x) => x.size === w.size && x.crc === w.crc);
    if (e) return e;
  }
  const names = new Set([w.path ? baseName(w.path) : "", w.name, safeName(w.name)].filter(Boolean).map(keyOf));
  return free.find((x) => names.has(keyOf(baseName(x.name))));
}

export async function readBundle(zip: Blob, onProgress?: (fraction: number) => void): Promise<OpenResult> {
  const entries = await listZip(zip);
  const pe = pickProjectEntry(entries);
  if (!pe) throw new Error("Trong gói không có tệp dự án (.choreo.json).");
  let j: unknown;
  try {
    j = JSON.parse(await (await readEntry(zip, pe, "application/json")).text());
  } catch (e) {
    throw e instanceof SyntaxError ? new Error("Tệp dự án trong gói bị hỏng.") : e;
  }
  const project = checkProject(j);
  const base = pe.name.slice(0, pe.name.lastIndexOf("/") + 1);
  // theo mục lục của gói trước, rồi thêm media dự án cần mà mục lục thiếu
  const refs = mediaRefs(project);
  const man = (readManifest(j) ?? []).filter((m) => refs.some((r) => r.id === m.id));
  const wanted: Wanted[] = [...man, ...refs.filter((r) => !man.some((m) => m.id === r.id))];
  const used = new Set<ZipEntry>([pe]);
  const media: MediaBlob[] = [];
  const missing: string[] = [];
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i];
    if (media.some((m) => m.id === w.id) || missing.includes(w.id)) continue;
    const e = matchEntry(entries, w, base, used);
    if (!e) {
      missing.push(w.id);
      continue;
    }
    used.add(e);
    const type = w.type || mimeFromName(e.name) || mimeFromName(w.name);
    media.push({ id: w.id, name: w.name || baseName(e.name), type, blob: await readEntry(zip, e, type) });
    onProgress?.((i + 1) / wanted.length);
  }
  return { project, media, missing };
}
