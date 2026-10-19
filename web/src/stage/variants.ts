// Phương án song song: nhiều bản chụp có tên của bài đang mở, cất trong
// IndexedDB cạnh dự án (khoá "variants" của kho "project"). Bản chụp chỉ là
// dữ liệu dự án, video và nhạc dùng chung kho media nên không chép blob.
// Phần thuần (đặt tên, so sánh, chọn "Trước khi đổi") test được bằng node;
// phần lưu đi qua một kho khoá giá trị có thể giả lập (KV).

import type { Project, Formation, Vec2 } from "./model.ts";
import { fmtTime } from "./timing.ts";
import { facingName, normFacing } from "./facing.ts";
import { mainName } from "./cast.ts";

export interface Variant {
  id: string;
  name: string;
  savedAt: number; // ms (Date.now)
  project: Project;
}

export const BACKUP_NAME = "Trước khi đổi";
export const VARIANTS_KEY = "variants";

// ---------- tên ----------

const norm = (s: string) => s.trim().toLocaleLowerCase("vi");

/** "Phương án A", "Phương án B"... qua Z thì "Phương án 27", không trùng tên đã có. */
export function defaultVariantName(existing: string[]): string {
  const used = new Set(existing.map(norm));
  for (let i = 0; ; i++) {
    const tag = i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
    const name = `Phương án ${tag}`;
    if (!used.has(norm(name))) return name;
  }
}

/** Tên không trùng: "Tên", rồi "Tên 2", "Tên 3"... */
export function uniqueName(base: string, existing: string[]): string {
  const b = base.trim() || "Phương án";
  const used = new Set(existing.map(norm));
  if (!used.has(norm(b))) return b;
  for (let i = 2; ; i++) if (!used.has(norm(`${b} ${i}`))) return `${b} ${i}`;
}

// ---------- so trùng ----------

/** Chuỗi JSON khoá xếp theo thứ tự chữ, để hai bản cùng nội dung ra cùng chuỗi. */
export function stableJson(x: unknown): string {
  if (x === undefined) return "null";
  if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "null";
  if (Array.isArray(x)) return `[${x.map(stableJson).join(",")}]`;
  const o = x as Record<string, unknown>;
  const ks = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${ks.map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

export const sameProject = (a: Project, b: Project) => a === b || stableJson(a) === stableJson(b);

const isBlank = (p: Project) => !p.dancers.length && !p.formations.length && !p.musicId;

/**
 * Trước khi mở phương án khác: bản đang làm có cần cất thành "Trước khi đổi"
 * không. Không cần khi bài trống hoặc trùng hẳn một phương án đã lưu.
 * Trả tên sẽ dùng (không trùng tên cũ), hoặc null.
 */
export function backupBeforeSwitch(cur: Project, list: Variant[]): string | null {
  if (isBlank(cur)) return null;
  if (list.some((v) => sameProject(v.project, cur))) return null;
  return uniqueName(BACKUP_NAME, list.map((v) => v.name));
}

// ---------- tóm tắt ----------

export function variantSummary(p: Project): string {
  const f = p.formations.length;
  return `${f} đội hình, ${p.dancers.length} người`;
}

/** "19/10 14:05" theo giờ máy. */
export function fmtSavedAt(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (same) return `hôm nay ${hm}`;
  const dm = `${d.getDate()}/${d.getMonth() + 1}`;
  return d.getFullYear() === n.getFullYear() ? `${dm} ${hm}` : `${dm}/${d.getFullYear()} ${hm}`;
}

// ---------- so sánh ----------

export type Change =
  | { kind: "title"; from: string; to: string }
  | { kind: "stage"; from: string; to: string }
  | { kind: "bpm"; from: number | null; to: number | null }
  | { kind: "music"; from: string; to: string }
  | { kind: "dancerAdded"; dancer: string }
  | { kind: "dancerRemoved"; dancer: string }
  | { kind: "dancerRenamed"; from: string; to: string }
  | { kind: "cast"; role: string; from: string; to: string }
  | { kind: "formAdded"; formation: string; start: number; end: number }
  | { kind: "formRemoved"; formation: string; start: number; end: number }
  | { kind: "formRenamed"; from: string; to: string }
  | { kind: "formRetimed"; formation: string; from: [number, number]; to: [number, number] }
  | { kind: "moved"; formation: string; dancer: string; dist: number }
  | { kind: "swapped"; formation: string; a: string; b: string }
  | { kind: "path"; formation: string; dancer: string }
  | { kind: "facing"; formation: string; dancer: string; to: number }
  | { kind: "note"; formation: string; from: string; to: string }
  | { kind: "personNote"; formation: string; dancer: string; from: string; to: string }
  | { kind: "other"; what: string };

const MOVE_EPS = 0.05; // m: dưới mức này coi như đứng yên (bám lưới thường 0,25 m)
const TIME_EPS = 0.05; // giây
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const close = (a: Vec2 | undefined, b: Vec2 | undefined) => !!a && !!b && dist(a, b) < MOVE_EPS;

/**
 * Khác nhau giữa hai bản của cùng một bài: `b` so với `a` (mở `b` thì bài
 * đổi thế này). Ghép đội hình và vũ công theo id (phương án chụp từ cùng bài
 * nên id giữ nguyên). Hai người đổi chỗ cho nhau ghi một dòng "đổi chỗ".
 */
const propsKey = (p: Project) => ({
  props: p.props ?? [],
  at: p.formations.filter((f) => f.propPos).map((f) => [f.id, f.propPos]),
});

export function diffProjects(a: Project, b: Project): Change[] {
  const out: Change[] = [];
  if (a.title !== b.title) out.push({ kind: "title", from: a.title, to: b.title });
  if (a.stage.width !== b.stage.width || a.stage.depth !== b.stage.depth)
    out.push({ kind: "stage", from: stageText(a), to: stageText(b) });
  if ((a.bpm ?? null) !== (b.bpm ?? null)) out.push({ kind: "bpm", from: a.bpm ?? null, to: b.bpm ?? null });
  if (a.musicId !== b.musicId || a.musicName !== b.musicName)
    out.push({ kind: "music", from: a.musicName || "(không có)", to: b.musicName || "(không có)" });

  const nameA = new Map(a.dancers.map((d) => [d.id, d.name]));
  const nameB = new Map(b.dancers.map((d) => [d.id, d.name]));
  const who = (id: string) => nameB.get(id) ?? nameA.get(id) ?? "?";
  const byIdA = new Map(a.dancers.map((d) => [d.id, d]));
  // vai đổi người đóng (cùng người chính, khác người đang đóng): một dòng "thay vai", không phải đổi tên
  const recast = new Set<string>();
  for (const d of b.dancers) {
    const old = nameA.get(d.id);
    if (old === undefined) out.push({ kind: "dancerAdded", dancer: d.name });
    else if (old !== d.name) {
      const o = byIdA.get(d.id)!;
      if ((o.lead || d.lead) && mainName(o) === mainName(d)) {
        recast.add(d.id);
        out.push({ kind: "cast", role: mainName(d), from: old, to: d.name });
      } else out.push({ kind: "dancerRenamed", from: old, to: d.name });
    }
  }
  for (const d of a.dancers) if (!nameB.has(d.id)) out.push({ kind: "dancerRemoved", dancer: d.name });

  const fa = new Map(a.formations.map((f) => [f.id, f]));
  const fb = new Map(b.formations.map((f) => [f.id, f]));
  for (const f of a.formations) if (!fb.has(f.id)) out.push({ kind: "formRemoved", formation: f.name, start: f.start, end: f.end });
  for (const f of b.formations) {
    const o = fa.get(f.id);
    if (!o) {
      out.push({ kind: "formAdded", formation: f.name, start: f.start, end: f.end });
      continue;
    }
    if (o.name !== f.name) out.push({ kind: "formRenamed", from: o.name, to: f.name });
    if (Math.abs(o.start - f.start) >= TIME_EPS || Math.abs(o.end - f.end) >= TIME_EPS)
      out.push({ kind: "formRetimed", formation: f.name, from: [o.start, o.end], to: [f.start, f.end] });
    if ((o.note ?? "").trim() !== (f.note ?? "").trim())
      out.push({ kind: "note", formation: f.name, from: (o.note ?? "").trim(), to: (f.note ?? "").trim() });
    diffPositions(o, f, who, out);
  }

  const extra: [string, unknown, unknown][] = [
    ["mốc đoạn nhạc", a.marks ?? [], b.marks ?? []],
    ["nhóm", a.groups ?? [], b.groups ?? []],
    // đạo cụ: cả chỗ gốc lẫn chỗ riêng theo đội hình (Formation.propPos)
    ["đạo cụ", propsKey(a), propsKey(b)],
    ["Hình của tôi", a.myShapes ?? [], b.myShapes ?? []],
    ["cách ghi \"(thay ...)\"", a.castNote !== false, b.castNote !== false],
  ];
  for (const [what, x, y] of extra) if (stableJson(x) !== stableJson(y)) out.push({ kind: "other", what });
  // phần còn lại của vũ công (video, lệch, canon, lật gương...) gộp một dòng
  // (người dự bị, người thay và màu người thay đã có dòng riêng ở trên)
  const both = (p: Project) => p.dancers.filter((d) => nameA.has(d.id) && nameB.has(d.id));
  const dancerRest = (p: Project) =>
    stableJson(both(p).map(({ subs: _s, lead: _l, ...d }) => ({ ...d, name: "", color: recast.has(d.id) ? "" : d.color })));
  if (dancerRest(a) !== dancerRest(b)) out.push({ kind: "other", what: "video, khớp nhạc hoặc canon của vũ công" });
  const subsOf = (p: Project) => stableJson(both(p).map((d) => d.subs ?? []));
  if (subsOf(a) !== subsOf(b)) out.push({ kind: "other", what: "người dự bị" });
  return out;
}

const stageText = (p: Project) => `${fmtM(p.stage.width)} × ${fmtM(p.stage.depth)} m`;

function diffPositions(o: Formation, f: Formation, who: (id: string) => string, out: Change[]) {
  const moved: string[] = [];
  for (const id of Object.keys(f.pos)) {
    const p0 = o.pos[id];
    const p1 = f.pos[id];
    if (p0 && p1 && dist(p0, p1) >= MOVE_EPS) moved.push(id);
  }
  // hai người đổi chỗ cho nhau: chỗ mới của người này là chỗ cũ của người kia
  const done = new Set<string>();
  for (const x of moved) {
    if (done.has(x)) continue;
    const y = moved.find((m) => m !== x && !done.has(m) && close(f.pos[x], o.pos[m]) && close(f.pos[m], o.pos[x]));
    if (y) {
      done.add(x).add(y);
      out.push({ kind: "swapped", formation: f.name, a: who(x), b: who(y) });
    }
  }
  for (const id of moved)
    if (!done.has(id)) out.push({ kind: "moved", formation: f.name, dancer: who(id), dist: dist(o.pos[id], f.pos[id]) });
  const vo = o.via ?? {};
  const vf = f.via ?? {};
  for (const id of new Set([...Object.keys(vo), ...Object.keys(vf)])) {
    const a = vo[id];
    const b = vf[id];
    if (a && b ? dist(a, b) >= MOVE_EPS : a !== b) out.push({ kind: "path", formation: f.name, dancer: who(id) });
  }
  const fo = o.facing ?? {};
  const ff = f.facing ?? {};
  for (const id of new Set([...Object.keys(fo), ...Object.keys(ff)])) {
    const b = normFacing(ff[id] ?? 0);
    if (normFacing(fo[id] ?? 0) !== b) out.push({ kind: "facing", formation: f.name, dancer: who(id), to: b });
  }
  const no = o.notes ?? {};
  const nf = f.notes ?? {};
  for (const id of new Set([...Object.keys(no), ...Object.keys(nf)])) {
    const a = (no[id] ?? "").trim();
    const b = (nf[id] ?? "").trim();
    if (a !== b) out.push({ kind: "personNote", formation: f.name, dancer: who(id), from: a, to: b });
  }
}

const fmtM = (m: number) => String(Math.round(m * 10) / 10).replace(".", ",");
const cut = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const q = (s: string) => (s ? `"${cut(s)}"` : "(trống)");

/** Một dòng chữ cho mỗi thay đổi. */
export function changeText(c: Change): string {
  switch (c.kind) {
    case "title": return `Tên bài: ${q(c.from)} thành ${q(c.to)}`;
    case "stage": return `Sân: ${c.from} thành ${c.to}`;
    case "bpm": return `Nhịp: ${c.from ?? "chưa đặt"} thành ${c.to ?? "chưa đặt"} BPM`;
    case "music": return `Nhạc: ${c.from} thành ${c.to}`;
    case "dancerAdded": return `Thêm vũ công ${c.dancer}`;
    case "dancerRemoved": return `Bớt vũ công ${c.dancer}`;
    case "dancerRenamed": return `Đổi tên vũ công ${c.from} thành ${c.to}`;
    case "cast": return c.to === c.role ? `${c.role} đóng lại vai của mình (thôi ${c.from} thay)` : `Vai của ${c.role}: ${c.to} đóng (trước là ${c.from})`;
    case "formAdded": return `Thêm đội hình ${c.formation} (${fmtTime(c.start)} tới ${fmtTime(c.end)})`;
    case "formRemoved": return `Bớt đội hình ${c.formation} (${fmtTime(c.start)} tới ${fmtTime(c.end)})`;
    case "formRenamed": return `Đổi tên đội hình ${c.from} thành ${c.to}`;
    case "formRetimed":
      return `${c.formation}: giờ ${fmtTime(c.from[0])} tới ${fmtTime(c.from[1])} thành ${fmtTime(c.to[0])} tới ${fmtTime(c.to[1])}`;
    case "moved": return `${c.formation}: ${c.dancer} dời ${fmtM(c.dist)} m`;
    case "swapped": return `${c.formation}: ${c.a} đổi chỗ với ${c.b}`;
    case "path": return `${c.formation}: đổi đường đi của ${c.dancer}`;
    case "facing": return `${c.formation}: ${c.dancer} giờ ${facingName(c.to)}`;
    case "note": return `${c.formation}: ghi chú ${q(c.from)} thành ${q(c.to)}`;
    case "personNote": return `${c.formation}: ghi chú của ${c.dancer} ${q(c.from)} thành ${q(c.to)}`;
    case "other": return `Đổi ${c.what}`;
  }
}

// ---------- kho lưu ----------

/** Kho khoá giá trị tối thiểu (db.ts loadKey/saveKey, hoặc Map khi test). */
export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, v: unknown): Promise<unknown>;
}

const okVariant = (x: unknown): x is Variant => {
  if (!x || typeof x !== "object") return false;
  const v = x as Partial<Variant>;
  const p = v.project as Partial<Project> | undefined;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.savedAt === "number"
    && !!p && typeof p === "object" && Array.isArray(p.dancers) && Array.isArray(p.formations);
};

/** Đọc danh sách đã lưu, bỏ bản hỏng; mới lưu đứng trước. */
export function parseVariants(raw: unknown): Variant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(okVariant).sort((x, y) => y.savedAt - x.savedAt);
}

export interface VariantRepo {
  list(): Promise<Variant[]>;
  /** Lưu bản chụp mới. Tên trùng thì thêm số. */
  add(name: string, project: Project, now?: number): Promise<Variant>;
  /** Đưa lại một phương án đã xoá (Hoàn tác xoá). */
  restore(v: Variant): Promise<void>;
  rename(id: string, name: string): Promise<boolean>;
  remove(id: string): Promise<Variant | null>;
  /** Mọi id media các phương án dùng (để dọn media không xoá nhầm). */
  mediaIds(): Promise<string[]>;
}

let seq = 0;
const newId = () => `v${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Khoá loại trừ dùng chung giữa các thẻ trình duyệt (navigator.locks), hoặc giả khi test. */
export type Lock = <T>(fn: () => Promise<T>) => Promise<T>;
const noLock: Lock = (fn) => fn();

/**
 * Mỗi lần ghi: giữ khoá, đọc bản MỚI NHẤT trong kho, sửa đúng phần mình đổi rồi
 * ghi. Trong một thẻ các lần ghi xếp hàng nối nhau; giữa hai thẻ cùng mở thì
 * khoá `lock` ngăn thẻ này đọc xong mà chưa ghi thì thẻ kia chen vào, nên
 * không ai ghi đè danh sách của ai (phương án thẻ kia vừa thêm vẫn còn).
 */
export function variantRepo(kv: KV, lock: Lock = noLock): VariantRepo {
  let chain: Promise<unknown> = Promise.resolve();
  const read = async () => parseVariants(await kv.get(VARIANTS_KEY));
  const edit = <T>(fn: (l: Variant[]) => { list: Variant[]; out: T }): Promise<T> => {
    const job = chain.then(() =>
      lock(async () => {
        const r = fn(await read());
        await kv.set(VARIANTS_KEY, r.list);
        return r.out;
      }),
    );
    chain = job.catch(() => {});
    return job;
  };
  return {
    list: () => chain.then(read),
    add: (name, project, now = Date.now()) =>
      edit((l) => {
        const v: Variant = { id: newId(), name: uniqueName(name, l.map((x) => x.name)), savedAt: now, project };
        return { list: [v, ...l], out: v };
      }),
    restore: (v) => edit((l) => ({ list: l.some((x) => x.id === v.id) ? l : [...l, v], out: undefined })),
    rename: (id, name) =>
      edit((l) => {
        const t = name.trim();
        const i = l.findIndex((x) => x.id === id);
        if (i < 0 || !t) return { list: l, out: false };
        const nm = uniqueName(t, l.filter((x) => x.id !== id).map((x) => x.name));
        return { list: l.map((x) => (x.id === id ? { ...x, name: nm } : x)), out: true };
      }),
    remove: (id) =>
      edit((l) => ({ list: l.filter((x) => x.id !== id), out: l.find((x) => x.id === id) ?? null })),
    mediaIds: async () => {
      const ids = new Set<string>();
      for (const v of await chain.then(read)) {
        if (v.project.musicId) ids.add(v.project.musicId);
        for (const d of v.project.dancers) if (d.mediaId) ids.add(d.mediaId);
      }
      return [...ids];
    },
  };
}
