// Đạo cụ và mốc sàn trên sân khấu (micro đứng, bục, ghế, dấu băng dính).
// THUẦN, chỉ import model để chạy được cả trong Vite lẫn `node --test`.
//
// Mỗi đạo cụ có CHỖ GỐC (x, z, rot trong StageProp). Đội hình nào cần đạo cụ ở
// chỗ khác thì ghi chỗ riêng trong Formation.propPos; lúc chuyển giữa hai đội
// hình đạo cụ trượt theo smoothstep như người (propsAt). Không đội hình nào có
// chỗ riêng thì đạo cụ đứng yên suốt bài như bản đầu. Toạ độ như chỗ đứng (mét,
// tâm sân là gốc, khán giả ở +Z, x dương là bên phải khán giả). "mark" là mốc
// sàn phẳng, chỉ để vẽ, không chặn ai. Mọi hàm sửa trả mảng MỚI.

import {
  type Formation, type Project, type PropSpot, type StageProp, type PropKind, type StageSize, type Vec2,
  clampToStage, segmentAt, smoothstep, spotNear,
} from "./model.ts";

/** Kích thước nhỏ nhất và lớn nhất của một cạnh (mét). */
export const PROP_MIN = 0.1;
export const PROP_MAX = 10;
/** Tên dài hơn mức này thì cắt (tên nằm ngay trên sơ đồ). */
export const PROP_NAME_MAX = 30;
/** Tâm người cách mép đạo cụ dưới khoảng này (mét) thì coi như đứng trong / đi xuyên. */
export const PROP_PAD = 0.1;

const KINDS: readonly PropKind[] = ["box", "round", "mark"];
const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100 + 0;
const size = (v: unknown, def: number) => r2(Math.min(PROP_MAX, Math.max(PROP_MIN, fin(v) ? v : def)));
/** Góc về [0, 360), làm tròn độ. 0 thì trả undefined để bỏ trường. */
const normRot = (v: unknown): number | undefined => {
  if (!fin(v)) return undefined;
  const r = ((Math.round(v) % 360) + 360) % 360;
  return r ? r : undefined;
};

/** Tên sạch: bỏ khoảng trắng thừa, cắt độ dài. Rỗng thì trả "". */
export function cleanPropName(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, PROP_NAME_MAX).trim();
}

/** Một đạo cụ đã chuẩn hoá: kích thước trong khoảng, tròn thì sâu = rộng, góc 0 bỏ trường. */
function tidy(o: StageProp, stage: StageSize): StageProp {
  const w = size(o.w, 1);
  const d = o.kind === "round" ? w : size(o.d, w);
  const [x, z] = clampToStage([fin(o.x) ? r2(o.x) : 0, fin(o.z) ? r2(o.z) : 0], stage);
  const rot = o.kind === "box" ? normRot(o.rot) : undefined;
  const out: StageProp = { id: o.id, name: o.name, kind: o.kind, x, z, w, d };
  if (rot !== undefined) out.rot = rot;
  return out;
}

/**
 * Đạo cụ đọc từ tệp: bỏ món hỏng (không phải object, id không phải chữ, trùng
 * id), loại lạ thì coi là hộp, số hỏng thì về mặc định, kích thước kẹp vào
 * [PROP_MIN, PROP_MAX], tâm kẹp vào sân cộng cánh gà, tên rỗng thì đặt "Đạo cụ".
 */
export function cleanProps(raw: unknown, stage: StageSize): StageProp[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StageProp[] = [];
  for (const m of raw as Partial<StageProp>[]) {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    const kind = KINDS.includes(m.kind as PropKind) ? (m.kind as PropKind) : "box";
    out.push(tidy({ id: m.id, name: cleanPropName(m.name) || "Đạo cụ", kind, x: m.x!, z: m.z!, w: m.w!, d: m.d!, rot: m.rot }, stage));
  }
  return out;
}

/** Dự án với danh sách đạo cụ mới: rỗng thì bỏ hẳn trường (tệp cũ không đổi). */
export function withProps(p: Project, props: StageProp[]): Project {
  const { props: _p, ...rest } = p;
  return props.length ? { ...rest, props } : rest;
}

/** Kéo tâm đạo cụ vào sân + cánh gà (sau khi thu nhỏ sân). Không có gì đổi thì giữ đúng mảng cũ. */
export function fitPropsToStage(props: StageProp[] | undefined, stage: StageSize): StageProp[] | undefined {
  if (!props?.length) return props;
  let changed = false;
  const out = props.map((o) => {
    const [x, z] = clampToStage([o.x, o.z], stage);
    if (x === o.x && z === o.z) return o;
    changed = true;
    return { ...o, x, z };
  });
  return changed ? out : props;
}

// ---------- mẫu nhanh ----------

export interface PropPreset {
  key: string;
  name: string;
  kind: PropKind;
  w: number;
  d: number;
}

export const PROP_PRESETS: readonly PropPreset[] = [
  { key: "mic", name: "Micro đứng", kind: "round", w: 0.4, d: 0.4 },
  { key: "riser", name: "Bục", kind: "box", w: 2, d: 1 },
  { key: "chair", name: "Ghế", kind: "box", w: 0.5, d: 0.5 },
  { key: "mark", name: "Mốc sàn", kind: "mark", w: 0.4, d: 0.4 },
];

/** Số nguyên dương nhỏ nhất chưa dùng làm tên mốc sàn (1, 2, 3...). */
export function nextMarkNumber(props: readonly StageProp[] | undefined): number {
  const used = new Set((props ?? []).filter((o) => o.kind === "mark").map((o) => o.name));
  let n = 1;
  while (used.has(String(n))) n++;
  return n;
}

/** Nửa đường chéo: bán kính vòng bao của đạo cụ, đủ để xếp các món không đè nhau. */
const reach = (o: { kind: PropKind; w: number; d: number }) => (o.kind === "round" ? o.w / 2 : Math.hypot(o.w, o.d) / 2);

/** Đạo cụ mới theo mẫu: đặt ở chỗ trống gần giữa sân (vòng bao không chạm món nào, chừa 0,3 m), mốc sàn đặt tên số. */
export function propFromPreset(
  props: readonly StageProp[] | undefined, preset: PropPreset, id: string, stage: StageSize, near: Vec2 = [0, 0],
): StageProp {
  const others = props ?? [];
  const r = reach(preset);
  const free = (q: Vec2) => others.every((o) => Math.hypot(q[0] - o.x, q[1] - o.z) >= reach(o) + r + 0.3);
  let at: Vec2 | null = free(near) ? near : null;
  // dò từng vòng 0,5 m quanh chỗ muốn đặt, mỗi vòng 16 hướng, chỉ lấy điểm nằm trọn trong sân
  for (let k = 1; !at && k <= 24; k++) {
    for (let i = 0; i < 16 && !at; i++) {
      const a = (i / 16) * 2 * Math.PI, q: Vec2 = [near[0] + 0.5 * k * Math.cos(a), near[1] + 0.5 * k * Math.sin(a)];
      if (Math.abs(q[0]) + r <= stage.width / 2 && Math.abs(q[1]) + r <= stage.depth / 2 && free(q)) at = q;
    }
  }
  at ??= spotNear(near, others.map((o): Vec2 => [o.x, o.z]), stage, 1) ?? near;
  const name = preset.kind === "mark" ? String(nextMarkNumber(props)) : preset.name;
  return tidy({ id, name, kind: preset.kind, x: at[0], z: at[1], w: preset.w, d: preset.d }, stage);
}

export function addProp(props: readonly StageProp[] | undefined, o: StageProp, stage: StageSize): StageProp[] {
  const x = tidy({ ...o, name: cleanPropName(o.name) || "Đạo cụ" }, stage);
  return [...(props ?? []).filter((q) => q.id !== o.id), x];
}

export function moveProp(props: readonly StageProp[] | undefined, id: string, x: number, z: number, stage: StageSize): StageProp[] {
  if (!fin(x) || !fin(z)) return [...(props ?? [])];
  return (props ?? []).map((o) => (o.id === id ? tidy({ ...o, x, z }, stage) : o));
}

/** Đổi tên; tên rỗng thì giữ tên cũ. */
export function renameProp(props: readonly StageProp[] | undefined, id: string, name: string): StageProp[] {
  const v = cleanPropName(name);
  return (props ?? []).map((o) => (o.id === id && v ? { ...o, name: v } : o));
}

/** Đổi kích thước (và góc xoay nếu có). Món tròn chỉ lấy w làm đường kính. */
export function resizeProp(
  props: readonly StageProp[] | undefined, id: string, ch: { w?: number; d?: number; rot?: number }, stage: StageSize,
): StageProp[] {
  return (props ?? []).map((o) => (o.id === id ? tidy({ ...o, ...ch }, stage) : o));
}

export function removeProp(props: readonly StageProp[] | undefined, id: string): StageProp[] {
  return (props ?? []).filter((o) => o.id !== id);
}

// ---------- hình học ----------

/** Món này có chặn người không (mốc sàn thì không). */
export const isSolid = (o: StageProp) => o.kind !== "mark";

/** Chiều cao vẽ 3D (mét): bục, ghế thấp; micro đứng cao ngang ngực. */
export const propHeight = (o: StageProp) => (o.kind === "round" ? (o.w <= 0.6 ? 1.4 : 0.9) : o.kind === "box" ? 0.45 : 0.01);

/** Bốn góc của hộp (đã xoay) trên mặt sàn, theo chiều kim đồng hồ khi nhìn từ trên. */
export function propCorners(o: StageProp): Vec2[] {
  const a = ((o.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const hw = o.w / 2, hd = o.d / 2;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Vec2[]).map(([u, v]): Vec2 => [o.x + u * c - v * s, o.z + u * s + v * c]);
}

/** Khoảng cách từ điểm q tới mép đạo cụ (mét); âm hoặc 0 khi q nằm bên trong. */
export function propDist(o: StageProp, q: Vec2): number {
  const dx = q[0] - o.x, dz = q[1] - o.z;
  if (o.kind === "round") return Math.hypot(dx, dz) - o.w / 2;
  const a = (-(o.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const u = Math.abs(dx * c - dz * s) - o.w / 2, v = Math.abs(dx * s + dz * c) - o.d / 2;
  if (u <= 0 && v <= 0) return Math.max(u, v);
  return Math.hypot(Math.max(u, 0), Math.max(v, 0));
}

// ---------- đạo cụ dời theo đội hình ----------

/** Góc về [0, 360) làm tròn độ, giữ cả 0 (chỗ riêng cần ghi 0 khi góc gốc khác 0). */
const deg = (v: number) => ((Math.round(v) % 360) + 360) % 360;
const sameSpot = (o: StageProp, q: PropSpot) =>
  q.x === o.x && q.z === o.z && (q.rot === undefined || q.rot === deg(o.rot ?? 0));

/** Đạo cụ o đứng ở đâu khi giữ đội hình f (chỗ riêng nếu có, không thì chỗ gốc). */
export function propIn(f: Formation | undefined, o: StageProp): StageProp {
  const q = f?.propPos?.[o.id];
  if (!q) return o;
  const out: StageProp = { ...o, x: q.x, z: q.z };
  if (o.kind === "box" && q.rot !== undefined) {
    const r = deg(q.rot);
    if (r) out.rot = r;
    else delete out.rot;
  }
  return out;
}

/** Mọi đạo cụ ở đội hình thứ k (ngoài khoảng thì chỗ gốc). */
export function propsIn(fs: readonly Formation[], k: number, props: readonly StageProp[] | undefined): StageProp[] {
  const f = fs[k];
  return (props ?? []).map((o) => propIn(f, o));
}

/** Có đội hình nào ghi chỗ riêng (cho một món, hay cho bất kỳ món nào khi không đưa id). */
export function propMoves(fs: readonly Formation[], id?: string): boolean {
  return fs.some((f) => (id ? !!f.propPos?.[id] : !!f.propPos && Object.keys(f.propPos).length > 0));
}

/** Trượt từ a sang b theo tham số s (đã qua smoothstep); góc đi đường ngắn nhất. */
export function lerpProp(a: StageProp, b: StageProp, s: number): StageProp {
  if (a === b || s <= 0) return a;
  if (s >= 1) return b;
  const out: StageProp = { ...a, x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s };
  if (a.kind === "box") {
    const r0 = a.rot ?? 0, r1 = b.rot ?? 0;
    const d = ((((r1 - r0) % 360) + 540) % 360) - 180;
    const r = r0 + d * s;
    if (r) out.rot = r;
    else delete out.rot;
  }
  return out;
}

/**
 * Đạo cụ tại giây t: trước đội hình đầu như đội hình đầu, sau cuối như đội hình
 * cuối, đang chuyển thì trượt cùng nhịp với người. Không đội hình nào có chỗ
 * riêng thì trả đúng mảng gốc (vẽ lại không tốn gì).
 */
export function propsAt(fs: readonly Formation[], props: readonly StageProp[] | undefined, t: number): readonly StageProp[] {
  const list = props ?? [];
  if (!list.length || !propMoves(fs)) return list;
  const seg = segmentAt(fs as Formation[], t);
  switch (seg.kind) {
    case "none":
      return list;
    case "before":
    case "hold":
    case "after":
      return propsIn(fs, seg.k, list);
    case "gap": {
      const f = fs[seg.k], g = fs[seg.k + 1], s = smoothstep(seg.u);
      return list.map((o) => lerpProp(propIn(f, o), propIn(g, o), s));
    }
  }
}

/** Formation với bảng chỗ đạo cụ mới: rỗng thì bỏ trường. */
export function withPropPos(f: Formation, m: Record<string, PropSpot> | undefined): Formation {
  const { propPos: _q, ...rest } = f;
  return m && Object.keys(m).length ? { ...rest, propPos: m } : rest;
}

/** Chỗ riêng đã chuẩn hoá cho đạo cụ o, hoặc null nếu trùng chỗ gốc (hay số hỏng). */
function tidySpot(o: StageProp, q: { x: unknown; z: unknown; rot?: unknown }, stage: StageSize): PropSpot | null | undefined {
  if (!fin(q.x) || !fin(q.z)) return undefined;
  const [x, z] = clampToStage([r2(q.x), r2(q.z)], stage);
  const out: PropSpot = { x, z };
  if (o.kind === "box" && fin(q.rot)) {
    const r = deg(q.rot);
    if (r !== deg(o.rot ?? 0)) out.rot = r;
  }
  return sameSpot(o, out) ? null : out;
}

/**
 * Đặt chỗ của đạo cụ o ở đội hình fid: làm tròn cm, kẹp vào sân, trùng chỗ gốc
 * thì xoá chỗ riêng. Không đổi gì thì trả đúng mảng cũ.
 */
export function setPropSpot(
  fs: Formation[], fid: string, o: StageProp, spot: { x: number; z: number; rot?: number }, stage: StageSize,
): Formation[] {
  const q = tidySpot(o, spot, stage);
  if (q === undefined) return fs;
  let changed = false;
  const out = fs.map((f) => {
    if (f.id !== fid) return f;
    const cur = f.propPos?.[o.id];
    if (!q && !cur) return f;
    if (q && cur && cur.x === q.x && cur.z === q.z && cur.rot === q.rot) return f;
    changed = true;
    const m = { ...f.propPos };
    if (q) m[o.id] = q;
    else delete m[o.id];
    return withPropPos(f, m);
  });
  return changed ? out : fs;
}

/** Xoá chỗ riêng của một đạo cụ ở mọi đội hình ("Giữ yên cả bài", xoá đạo cụ). Không có gì thì trả đúng mảng cũ. */
export function clearPropSpots(fs: Formation[], id: string): Formation[] {
  if (!propMoves(fs, id)) return fs;
  return fs.map((f) => {
    if (!f.propPos?.[id]) return f;
    const m = { ...f.propPos };
    delete m[id];
    return withPropPos(f, m);
  });
}

/**
 * Dời đạo cụ CẢ BÀI: chỗ gốc tới (x, z), mọi chỗ riêng dời cùng độ lệch (kẹp
 * vào sân). Gọi trên bản trước khi kéo để kẹp ở mép không làm lệch dần.
 */
export function shiftPropAll(
  props: readonly StageProp[] | undefined, fs: Formation[], id: string, x: number, z: number, stage: StageSize,
): { props: StageProp[]; formations: Formation[] } {
  const o = (props ?? []).find((q) => q.id === id);
  if (!o || !fin(x) || !fin(z)) return { props: [...(props ?? [])], formations: fs };
  const nextProps = moveProp(props, id, x, z, stage);
  const n = nextProps.find((q) => q.id === id)!;
  const dx = n.x - o.x, dz = n.z - o.z;
  let formations = fs;
  if (propMoves(fs, id)) {
    formations = fs.map((f) => {
      const q = f.propPos?.[id];
      if (!q) return f;
      const t = tidySpot(n, { x: q.x + dx, z: q.z + dz, rot: q.rot ?? deg(o.rot ?? 0) }, stage);
      const m = { ...f.propPos };
      if (t) m[id] = t;
      else delete m[id];
      return withPropPos(f, m);
    });
  }
  return { props: nextProps, formations };
}

/** Xoay đạo cụ CẢ BÀI thêm d độ: góc gốc và mọi góc riêng. */
export function rotatePropAll(
  props: readonly StageProp[] | undefined, fs: Formation[], id: string, d: number, stage: StageSize,
): { props: StageProp[]; formations: Formation[] } {
  const o = (props ?? []).find((q) => q.id === id);
  if (!o || o.kind !== "box") return { props: [...(props ?? [])], formations: fs };
  const nextProps = resizeProp(props, id, { rot: (o.rot ?? 0) + d }, stage);
  const n = nextProps.find((q) => q.id === id)!;
  const formations = !propMoves(fs, id) ? fs : fs.map((f) => {
    const q = f.propPos?.[id];
    if (!q) return f;
    const t = tidySpot(n, { x: q.x, z: q.z, rot: q.rot === undefined ? undefined : q.rot + d }, stage);
    const m = { ...f.propPos };
    if (t) m[id] = t;
    else delete m[id];
    return withPropPos(f, m);
  });
  return { props: nextProps, formations };
}

/**
 * Lật gương đạo cụ ở đội hình fid (x thành -x, hộp đổi chiều góc), dùng khi lật
 * cả đội. Chỉ lật món có đi theo đội hình (có chỗ riêng ở đâu đó): món đứng yên
 * cả bài (micro cố định, mốc sàn) là đồ của sân, không lật theo người.
 */
export function mirrorPropsIn(fs: Formation[], fid: string, props: readonly StageProp[] | undefined, stage: StageSize): Formation[] {
  const f = fs.find((x) => x.id === fid);
  if (!f) return fs;
  let out = fs;
  for (const o of props ?? []) {
    if (!propMoves(fs, o.id)) continue;
    const c = propIn(f, o);
    out = setPropSpot(out, fid, o, { x: -c.x, z: c.z, ...(o.kind === "box" && { rot: -(c.rot ?? 0) }) }, stage);
  }
  return out;
}

/**
 * Đội hình fid mới tạo giữa chừng: đạo cụ có đi theo đội hình nhận đúng chỗ
 * đang trượt dở ở giây t (tính trên các đội hình TRƯỚC khi tạo), để hình đi
 * không đổi.
 */
export function seedPropSpots(
  before: readonly Formation[], fs: Formation[], fid: string, props: readonly StageProp[] | undefined, t: number, stage: StageSize,
): Formation[] {
  if (!props?.length || !propMoves(before)) return fs;
  const now = propsAt(before, props, t);
  let out = fs;
  props.forEach((o, i) => {
    if (!propMoves(before, o.id)) return;
    const c = now[i];
    out = setPropSpot(out, fid, o, { x: c.x, z: c.z, ...(o.kind === "box" && { rot: c.rot ?? 0 }) }, stage);
  });
  return out;
}

/** Chỗ đạo cụ đọc từ tệp: bỏ id lạ, số hỏng; kẹp vào sân; trùng chỗ gốc thì bỏ. Rỗng trả undefined. */
export function cleanPropPos(raw: unknown, props: readonly StageProp[], stage: StageSize): Record<string, PropSpot> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, PropSpot> = {};
  for (const [id, q] of Object.entries(raw as Record<string, unknown>)) {
    const o = props.find((x) => x.id === id);
    if (!o || !q || typeof q !== "object") continue;
    const t = tidySpot(o, q as { x: unknown; z: unknown; rot?: unknown }, stage);
    if (t) out[id] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

// ---------- xếp nhãn tên không chồng nhau ----------

export interface LabelSpot {
  /** tâm ngang của chữ và đường chân chữ, theo đơn vị bản vẽ */
  x: number;
  y: number;
}

/**
 * Chọn chỗ đặt tên cho từng đạo cụ trên bản vẽ để hai tên không đè nhau: món
 * lớn thử trong lòng trước, món nhỏ thử dưới, trên, phải, trái; mốc sàn thử bốn
 * góc chéo. Hết chỗ thì ẩn tên (null). Món đầu danh sách được ưu tiên, nên đưa
 * món đang chọn lên trước. X, Z đổi mét ra bản vẽ (có thể lật); font là cỡ chữ.
 */
export function layoutPropLabels(
  props: readonly StageProp[], X: (x: number) => number, Z: (z: number) => number, font: number,
  order?: readonly string[],
): Map<string, LabelSpot | null> {
  const unit = Math.abs(X(1) - X(0)) || Math.abs(Z(1) - Z(0)) || 1;
  const placed: [number, number, number, number][] = [];
  const hit = (b: [number, number, number, number]) =>
    placed.some((p) => b[0] < p[2] && p[0] < b[2] && b[1] < p[3] && p[1] < b[3]);
  const out = new Map<string, LabelSpot | null>();
  const rank = (o: StageProp) => {
    const i = order?.indexOf(o.id) ?? -1;
    return i < 0 ? Infinity : i;
  };
  const list = [...props].sort((a, b) => rank(a) - rank(b));
  const h = font * 1.15, gap = font * 0.3;
  for (const o of list) {
    const w = Math.max(1, o.name.length) * font * 0.58 + font * 0.2;
    const cx = X(o.x), cy = Z(o.z);
    // nửa bề ngang và nửa bề dọc của món trên bản vẽ (hộp xoay thì lấy khung bao)
    let hx: number, hy: number;
    if (o.kind === "box") {
      const cs = propCorners(o);
      hx = (Math.max(...cs.map((c) => c[0])) - Math.min(...cs.map((c) => c[0]))) / 2 * unit;
      hy = (Math.max(...cs.map((c) => c[1])) - Math.min(...cs.map((c) => c[1]))) / 2 * unit;
    } else {
      hx = hy = (o.kind === "mark" ? 0.16 : o.w / 2) * unit;
    }
    const cands: [number, number][] = []; // tâm hộp chữ
    if (o.kind === "mark") {
      const dx = hx + gap + w / 2, dy = hy * 0.6 + h / 2;
      cands.push([cx + dx, cy - dy], [cx - dx, cy - dy], [cx + dx, cy + dy], [cx - dx, cy + dy]);
    } else {
      if (2 * hx >= w && 2 * hy >= h && Math.min(o.w, o.d) >= 0.7) cands.push([cx, cy]);
      cands.push([cx, cy + hy + gap + h / 2], [cx, cy - hy - gap - h / 2], [cx + hx + gap + w / 2, cy], [cx - hx - gap - w / 2, cy]);
    }
    let got: LabelSpot | null = null;
    for (const [x, y] of cands) {
      const b: [number, number, number, number] = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (hit(b)) continue;
      placed.push(b);
      got = { x, y: y + font * 0.35 };
      break;
    }
    out.set(o.id, got);
  }
  return out;
}
