// Logic thuần của khâu nhập tệp: phân loại, đọc card.json, kiểm dự án, chọn
// cách lấy độ lệch nhạc và soạn thông báo tổng kết (test bằng node --test).

import {
  type Project, type VDancer, type SavedShape, type Vec2, type Formation, type StageSize,
  clampToStage, emptyProject, newDancer, wingSpot, withNotes, withVia, cleanPersonNote,
} from "./model.ts";
import { cleanFacing, withFacing } from "./facing.ts";
import { cleanMarks } from "./marks.ts";
import { cleanGroups } from "./groups.ts";
import { cleanPropPos, cleanProps, withPropPos } from "./props.ts";
import { cleanCast } from "./cast.ts";

export const stripName = (name: string): string =>
  name.replace(/\.[^.]+$/, "").replace(/\.card$/i, "");

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;
/** Tệp JSON lớn hơn mức này chắc chắn không phải dự án/thẻ: bỏ, khỏi đọc. */
export const JSON_MAX = 20 * 1024 * 1024;
/** Tệp video thô lớn hơn mức này không tự giải mã tiếng để khớp (tốn RAM). */
export const ALIGN_MAX_BYTES = 400 * 1024 * 1024;

export const isJunk = (name: string): boolean => /^\.|^(desktop\.ini|thumbs\.db)$/i.test(name);

export type FileKind = "card" | "motion" | "json" | "music" | "video" | "junk" | "other";

export function fileKind(name: string, type = ""): FileKind {
  if (isJunk(name)) return "junk";
  if (/\.card\.json$/i.test(name)) return "card";
  if (/\.motion\.json$/i.test(name)) return "motion"; // động tác 3D (choreo.pose3d)
  if (/\.json$/i.test(name)) return "json";
  // video trước: .mp4 có thể mang type audio/mp4 nhưng vẫn là video
  if (VIDEO_EXT.test(name) || type.startsWith("video/")) return "video";
  if (AUDIO_EXT.test(name) || type.startsWith("audio/")) return "music";
  return "other";
}

export interface CardMeta {
  name?: string;
  stacked?: boolean;
  offsetSec?: number;
  durationSec?: number;
  alignConfident?: boolean;
}

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Đọc card.json do công cụ videocard ghi. Không đúng định dạng: null. */
export function parseCardMeta(text: string): CardMeta | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || j.format !== "choreo-card") return null;
  const m: CardMeta = {};
  if (typeof j.name === "string" && j.name.trim()) m.name = j.name.trim();
  if (typeof j.stacked === "boolean") m.stacked = j.stacked;
  if (fin(j.offsetSec)) m.offsetSec = j.offsetSec;
  if (fin(j.durationSec) && j.durationSec > 0) m.durationSec = j.durationSec;
  if (typeof j.alignConfident === "boolean") m.alignConfident = j.alignConfident;
  return m;
}

export const looksLikeProject = (j: unknown): boolean =>
  !!j && typeof j === "object" && (j as Project).version === 1 && Array.isArray((j as Project).dancers);

/** Dựng dự án đủ trường từ dữ liệu đọc được (tệp hoặc IndexedDB). Hỏng: null. */
export function normalizeProject(raw: unknown): Project | null {
  if (!looksLikeProject(raw)) return null;
  const j = raw as Partial<Project>;
  const base = emptyProject();
  const num = (x: unknown, d: number, min = -Infinity) => (fin(x) && x >= min ? x : d);
  const dancers: VDancer[] = [];
  const seen = new Set<string>();
  for (const d of j.dancers as Partial<VDancer>[]) {
    // id trùng thì giữ người đầu: hai người cùng id sẽ chung một chỗ trong mọi đội hình
    if (!d || typeof d !== "object" || typeof d.id !== "string" || seen.has(d.id)) continue;
    seen.add(d.id);
    const def = newDancer(d.id, typeof d.name === "string" ? d.name : d.id, typeof d.color === "string" ? d.color : "#8fa3c0");
    const x = { ...def, ...d } as VDancer;
    x.name = def.name;
    x.color = def.color;
    for (const k of ["stacked", "hidden", "alignConfident"] as const) if (typeof x[k] !== "boolean") x[k] = def[k];
    x.offsetSec = num(d.offsetSec, 0);
    x.durationSec = num(d.durationSec, 0, 0);
    x.aspect = num(d.aspect, def.aspect, 0.01) || def.aspect;
    x.cardHeight = num(d.cardHeight, def.cardHeight, 0.01) || def.cardHeight;
    if (typeof x.mediaName !== "string") x.mediaName = "";
    if (x.mediaId !== null && typeof x.mediaId !== "string") x.mediaId = null;
    if (typeof x.motionId !== "string" || !x.motionId) delete x.motionId;
    if (typeof x.flip !== "boolean") delete x.flip;
    const segs = Array.isArray(d.canon)
      ? d.canon.filter((s) => s && fin(s.start) && fin(s.end) && fin(s.lag) && s.end > s.start && s.lag > 0)
          .map((s) => ({ start: s.start, end: s.end, lag: s.lag }))
          .sort((a, b) => a.start - b.start)
      : [];
    if (segs.length) x.canon = segs;
    else delete x.canon;
    cleanCast(x, d);
    dancers.push(x);
  }
  const stage = cleanStage(j.stage, base.stage);
  const out = {
    ...base, ...j,
    version: 1,
    title: typeof j.title === "string" ? j.title : base.title,
    stage,
    musicId: typeof j.musicId === "string" ? j.musicId : null,
    musicName: typeof j.musicName === "string" ? j.musicName : "",
    musicDuration: num(j.musicDuration, 0, 0),
    // nhịp 0 hay âm làm chia cho 0 ở lưới phách: coi như chưa có nhịp
    bpm: fin(j.bpm) && j.bpm > 0 ? Math.min(BPM_MAX, Math.max(BPM_MIN, j.bpm)) : null,
    downbeat: num(j.downbeat, 0),
    dancers,
    formations: cleanFormations(j.formations, dancers.map((d) => d.id), stage),
  } as Project;
  const shapes = normalizeShapes(j.myShapes);
  if (shapes.length) out.myShapes = shapes;
  else delete out.myShapes;
  const marks = cleanMarks(j.marks, out.musicDuration);
  if (marks.length) out.marks = marks;
  else delete out.marks;
  const groups = cleanGroups(j.groups, dancers.map((d) => d.id));
  if (groups.length) out.groups = groups;
  else delete out.groups;
  if (out.groupRings !== false) delete out.groupRings;
  if (out.castNote !== false) delete out.castNote;
  const props = cleanProps(j.props, stage);
  if (props.length) out.props = props;
  else delete out.props;
  // chỗ đạo cụ theo đội hình (tệp cũ không có trường này): chỉ giữ món còn trong danh sách
  out.formations = out.formations.map((f) => {
    const raw = (f as { propPos?: unknown }).propPos;
    return raw === undefined ? f : withPropPos(f, cleanPropPos(raw, props, stage));
  });
  return out;
}

const BPM_MIN = 20, BPM_MAX = 400;
/** Sân đọc từ tệp: kích thước hỏng thì lấy mặc định; kẹp lại vì sân khổng lồ làm dò chỗ trống chạy mãi. */
const STAGE_MIN = 1, STAGE_MAX = 60;
function cleanStage(raw: unknown, def: StageSize): StageSize {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<StageSize>;
  const side = (x: unknown, d: number) => (fin(x) && x > 0 ? Math.min(STAGE_MAX, Math.max(STAGE_MIN, x)) : d);
  return { width: side(r.width, def.width), depth: side(r.depth, def.depth) };
}

/**
 * Đội hình đọc từ tệp, dọn cho đúng bất biến của checkInvariants: bỏ khối hỏng
 * (không phải object, id không phải chữ, trùng id, không có giờ nào), thiếu một
 * đầu thì lấy đầu kia, ngược thì đảo, xếp theo giờ rồi đẩy khối đè sang sau;
 * chỗ đứng chỉ giữ của người có trong danh sách, kẹp vào sân, ai thiếu thì đứng
 * trong cánh gà như khi thêm người mới. Ghi chú riêng từng người dọn bằng cleanNotes.
 */
function cleanFormations(raw: unknown, ids: string[], stage: StageSize): Formation[] {
  if (!Array.isArray(raw)) return [];
  const idSet = new Set(ids);

  const seen = new Set<string>();
  const out: Formation[] = [];
  raw.forEach((r0, k) => {
    if (!r0 || typeof r0 !== "object" || Array.isArray(r0)) return;
    const r = r0 as Partial<Formation>;
    if (typeof r.id !== "string" || seen.has(r.id)) return;
    let s = fin(r.start) ? r.start : null, e = fin(r.end) ? r.end : null;
    if (s === null && e === null) return;
    seen.add(r.id);
    s ??= e!;
    e ??= s;
    if (e < s) [s, e] = [e, s];
    s = Math.max(0, s);
    e = Math.max(s, e);
    const src = (r.pos && typeof r.pos === "object" ? r.pos : {}) as Record<string, unknown>;
    const pos: Record<string, Vec2> = {};
    for (const id of ids) {
      const q = Object.prototype.hasOwnProperty.call(src, id) ? src[id] : undefined;
      if (Array.isArray(q) && q.length === 2 && typeof q[0] === "number" && typeof q[1] === "number" && !isNaN(q[0]) && !isNaN(q[1]))
        pos[id] = clampToStage([q[0], q[1]], stage);
    }
    for (const id of ids) if (!pos[id]) pos[id] = wingSpot(Object.values(pos), stage);
    const f = cleanNote({ ...r, id: r.id, name: typeof r.name === "string" ? r.name : `Đội hình ${k + 1}`, start: s, end: e, pos } as Formation);
    // hướng mặt: bỏ id lạ, NaN, chữ; làm tròn về bội 45, bỏ người nhìn khán giả
    out.push(withFacing(withVia(withNotes(f, cleanNotes(r.notes, ids)), cleanVia(r.via, ids, stage)), cleanFacing(r.facing, idSet)));
  });
  out.sort((a, b) => a.start - b.start);
  // đội hình đầu không có khoảng chuyển vào nên không có đường cong
  if (out[0]?.via) out[0] = withVia(out[0], {});
  for (let k = 1; k < out.length; k++) {
    const prev = out[k - 1], f = out[k];
    if (f.start < prev.end) {
      const start = prev.end;
      out[k] = { ...f, start, end: Math.max(f.end, start) };
    }
  }
  return out;
}

/** Điểm uốn đường cong đọc từ tệp: chỉ giữ người có thật, hai số hữu hạn, kéo vào sân. */
function cleanVia(raw: unknown, ids: string[], stage: StageSize): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const id of ids) {
    const q = Object.prototype.hasOwnProperty.call(src, id) ? src[id] : undefined;
    if (Array.isArray(q) && q.length === 2 && fin(q[0]) && fin(q[1])) out[id] = clampToStage([q[0], q[1]], stage);
  }
  return out;
}

/** Ghi chú đọc từ tệp: như setFormationNote, cắt khoảng trắng hai đầu, rỗng hay không phải chữ thì bỏ trường. */
function cleanNote<F>(f: F): F {
  if (!f || typeof f !== "object" || !("note" in f)) return f;
  const { note, ...rest } = f as F & { note: unknown };
  const v = typeof note === "string" ? note.trim() : "";
  return (v ? { ...rest, note: v } : rest) as F;
}

/** Ghi chú riêng đọc từ tệp: chỉ giữ của người có trong danh sách, phải là chữ, làm sạch và
 *  cắt độ dài như khi gõ (cleanPersonNote); chỉ còn khoảng trắng thì bỏ. */
function cleanNotes(raw: unknown, ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const id of ids) {
    const v = Object.prototype.hasOwnProperty.call(src, id) ? src[id] : undefined;
    const c = typeof v === "string" ? cleanPersonNote(v) : "";
    if (c) out[id] = c;
  }
  return out;
}

/** Điểm của hình tự lưu là độ lệch so với tâm nhóm (mét): xa quá mức này là tệp hỏng,
 *  cộng hai số khổng lồ có thể tràn thành Infinity rồi NaN khi áp hình. */
const SHAPE_MAX_M = 1000;
const isPt = (q: unknown): q is Vec2 =>
  Array.isArray(q) && q.length === 2 && fin(q[0]) && fin(q[1]) && Math.abs(q[0]) <= SHAPE_MAX_M && Math.abs(q[1]) <= SHAPE_MAX_M;

/** "Hình của tôi" đọc từ tệp: bỏ hình hỏng, bỏ điểm hỏng, id trùng thì giữ hình đầu. */
export function normalizeShapes(raw: unknown): SavedShape[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedShape[] = [];
  for (const s of raw as Partial<SavedShape>[]) {
    if (!s || typeof s !== "object" || typeof s.id !== "string" || seen.has(s.id) || !Array.isArray(s.pts)) continue;
    const pts = s.pts.filter(isPt).map((q): Vec2 => [q[0], q[1]]);
    if (!pts.length) continue;
    seen.add(s.id);
    out.push({ id: s.id, name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : "Hình không tên", pts });
  }
  return out;
}

/** Khoá nhận ra cùng một tệp được thả lại (không lưu blob lần hai). */
export const mediaKey = (f: { name: string; size: number; lastModified: number }): string =>
  `${f.name}|${f.size}|${f.lastModified}`;

// ---------- độ lệch nhạc khi gắn video ----------

export interface OffsetInput {
  prev?: Pick<VDancer, "mediaName" | "offsetSec" | "alignConfident" | "durationSec"> | null;
  fileName: string;
  fileSize: number;
  durationSec: number;
  meta: CardMeta | null;
  hasMusic: boolean;
}
export type OffsetHow = "keep" | "card" | "none" | "big" | "align";

/**
 * Cách lấy offset cho video vừa gắn:
 *  keep  – đúng tệp cũ (cùng tên, cùng độ dài) và offset cũ đã tin được: giữ;
 *  card  – card.json có sẵn offset: dùng, khỏi giải mã;
 *  none  – chưa có nhạc: tạm giữ (chưa tin), có nhạc sẽ tự khớp;
 *  big   – tệp quá lớn để giải mã tiếng: tạm giữ, nhắc căn tay;
 *  align – giải mã tiếng và tự khớp.
 */
export function offsetPlan(o: OffsetInput): { how: OffsetHow; offsetSec: number; confident: boolean } {
  const p = o.prev;
  const same = !!p && !!p.mediaName && p.mediaName.toLowerCase() === o.fileName.toLowerCase()
    && !(p.durationSec > 0 && o.durationSec > 0 && Math.abs(p.durationSec - o.durationSec) > 0.6);
  if (same && p!.alignConfident) return { how: "keep", offsetSec: p!.offsetSec, confident: true };
  if (o.meta && o.meta.offsetSec !== undefined)
    return { how: "card", offsetSec: o.meta.offsetSec, confident: o.meta.alignConfident !== false };
  const fallback = same ? p!.offsetSec : 0;
  if (!o.hasMusic) return { how: "none", offsetSec: fallback, confident: false };
  if (o.fileSize > ALIGN_MAX_BYTES) return { how: "big", offsetSec: fallback, confident: false };
  return { how: "align", offsetSec: fallback, confident: false };
}

// ---------- lỗi và thông báo ----------

export type Problem = "nosize" | "decode" | "timeout" | "read" | "quota";

export const HINT =
  "Mẹo: đổi video sang H.264 bằng python -m choreo.videocard (ra tệp .card.mp4), " +
  "hoặc trên iPhone chọn Cài đặt › Camera › Định dạng › Tương thích nhất rồi quay lại.";

export const QUOTA_MSG =
  "Bộ nhớ trình duyệt đã đầy. Xoá bớt video không dùng, hoặc dùng Tệp ▸ Lưu ra tệp để giữ bài.";

export function videoProblem(code: Problem): string {
  switch (code) {
    case "nosize": return "không có hình (mã hoá lạ)";
    case "decode": return "trình duyệt không giải mã được";
    case "timeout": return "đọc quá lâu";
    case "read": return "không đọc được tệp";
    case "quota": return "bộ nhớ đầy";
  }
}

export interface ImportReport {
  project: boolean;
  projectError?: boolean;
  music: string | null;
  musicSame: boolean;
  added: string[];
  same: string[];
  weak: string[];
  noMusic: number;
  noAudio: string[];
  big: string[];
  bad: { name: string; code: Problem }[];
  skipped: string[];
  cancelled: boolean;
  realigned: number;
  /** người vừa có động tác 3D */
  motions?: string[];
  /** tệp động tác không khớp tên người nào */
  motionLost?: string[];
}

export const emptyReport = (): ImportReport => ({
  project: false, music: null, musicSame: false, added: [], same: [], weak: [], noMusic: 0, noAudio: [],
  big: [], bad: [], skipped: [], cancelled: false, realigned: 0, motions: [], motionLost: [],
});

export const nameList = (xs: string[], max = 3): string =>
  xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")}…`;

/** Một thông báo tổng kết cho cả lượt nhập. */
export function importSummary(r: ImportReport): { msg: string; kind: "info" | "warn" | "error" } {
  const got: string[] = [];
  if (r.project) got.push("dự án");
  if (r.music) got.push(`nhạc "${r.music}"`);
  if (r.added.length) got.push(`${r.added.length} video`);
  if (r.motions?.length) got.push(`động tác 3D cho ${nameList(r.motions)}`);
  const parts: string[] = [];
  if (got.length) parts.push(`Đã nạp ${got.join(", ")}`);
  if (r.cancelled) parts.push("Đã dừng giữa chừng");
  if (r.projectError) parts.push("Tệp dự án hỏng, không mở được");
  if (r.musicSame) parts.push("Nhạc này đã có sẵn");
  if (r.same.length) parts.push(`${r.same.length} video đã có sẵn, bỏ qua`);
  if (r.realigned) parts.push(`Đã khớp lại ${r.realigned} video theo nhạc`);
  if (r.weak.length) parts.push(`Khớp nhạc chưa chắc: ${nameList(r.weak)} (xem dấu ⚠)`);
  if (r.noAudio.length) parts.push(`Video không có tiếng nên chưa tự khớp: ${nameList(r.noAudio)}. Hãy căn tay`);
  if (r.noMusic) parts.push(`${r.noMusic} video chưa khớp vì chưa có nhạc`);
  if (r.big.length) parts.push(`Tệp quá lớn, chưa tự khớp: ${nameList(r.big)}. Hãy căn tay`);
  const quota = r.bad.some((b) => b.code === "quota");
  const other = r.bad.filter((b) => b.code !== "quota");
  if (other.length)
    parts.push(`Không mở được ${other.length} tệp: ${nameList(other.map((b) => `${b.name} (${videoProblem(b.code)})`), 2)}`);
  if (r.motionLost?.length) parts.push(`Tệp động tác không trùng tên người hay tên video nào: ${nameList(r.motionLost)}. Đổi tên tệp cho trùng rồi thả lại`);
  if (r.skipped.length) parts.push(`Bỏ qua tệp không nhận ra: ${nameList(r.skipped)}`);
  if (quota) parts.push(QUOTA_MSG);
  else if (other.some((b) => b.code !== "read")) parts.push(HINT);
  if (!parts.length) parts.push("Không có gì mới để nạp");
  const ok = got.length > 0 || r.same.length > 0 || r.musicSame;
  const kind = r.bad.length && !ok ? "error"
    : r.bad.length || r.weak.length || r.noAudio.length || r.big.length || r.skipped.length || r.motionLost?.length || r.projectError || r.cancelled ? "warn"
    : "info";
  return { msg: parts.join(". ") + (parts[parts.length - 1].endsWith(".") ? "" : "."), kind };
}

/** Thu khung hình về cạnh dài tối đa `max` (giữ tỉ lệ, số nguyên ≥ 1). */
export function fitSize(w: number, h: number, max: number): [number, number] {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/**
 * Người nhận tệp động tác tên fileName: trùng tên người, hoặc trùng tên video
 * thẻ (mọi bản nhân bản dùng chung video đó). Không ai trùng: rỗng.
 */
export function motionTargets(dancers: VDancer[], fileName: string): string[] {
  const key = fileName.replace(/\.motion\.json$/i, "").replace(/\.card$/i, "").trim().toLowerCase();
  if (!key) return [];
  return dancers
    .filter((d) => d.name.trim().toLowerCase() === key || (!!d.mediaName && stripName(d.mediaName).toLowerCase() === key))
    .map((d) => d.id);
}
