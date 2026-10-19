// Đạo cụ và mốc sàn trên sân khấu (micro đứng, bục, ghế, dấu băng dính).
// THUẦN, chỉ import model để chạy được cả trong Vite lẫn `node --test`.
//
// Bản đầu: đạo cụ ĐỨNG YÊN suốt bài, không đi theo đội hình. Toạ độ như chỗ
// đứng (mét, tâm sân là gốc, khán giả ở +Z, x dương là bên phải khán giả).
// "mark" là mốc sàn phẳng, chỉ để vẽ, không chặn ai. Mọi hàm sửa trả mảng MỚI.

import { type Project, type StageProp, type PropKind, type StageSize, type Vec2, clampToStage, spotNear } from "./model.ts";

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
