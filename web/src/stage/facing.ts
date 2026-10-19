// Hướng mặt từng người theo đội hình (học từ mo-sim). THUẦN, chỉ import kiểu.
//
// Góc tính bằng độ: 0 là nhìn khán giả (+Z), dương theo chiều kim đồng hồ khi
// nhìn từ trên xuống, tức người múa xoay sang PHẢI của chính họ: 90 là quay
// phải (nhìn về −X, bên trái khán giả), −90 quay trái, 180 quay lưng. Luôn là
// bội của 45, nằm trong (−180, 180]. Chỉ lưu người khác 0 trong Formation.facing.

import type { Formation, Vec2 } from "./model.ts";

export const FACE_STEP = 45;

/** Chuẩn hoá góc: làm tròn về bội 45, đưa về (−180, 180]. Không phải số hữu hạn thì 0. */
export function normFacing(a: unknown): number {
  if (typeof a !== "number" || !Number.isFinite(a)) return 0;
  let k = Math.round(a / FACE_STEP) % 8;
  if (k <= -4) k += 8;
  if (k > 4) k -= 8;
  return k * FACE_STEP + 0; // + 0: bỏ −0
}

/** Hướng mặt của người id ở đội hình f (0 nếu không có). */
export const facingOf = (f: Formation | null | undefined, id: string): number => normFacing(f?.facing?.[id] ?? 0);

/** Gắn bảng hướng mặt mới vào đội hình: bỏ người nhìn khán giả, rỗng thì bỏ trường. */
export function withFacing(f: Formation, facing: Record<string, number>): Formation {
  const { facing: _old, ...rest } = f;
  const out: Record<string, number> = {};
  for (const [id, a] of Object.entries(facing)) {
    const v = normFacing(a);
    if (v) out[id] = v;
  }
  return Object.keys(out).length ? { ...rest, facing: out } : rest;
}

/**
 * Đổi hướng mặt của các người ids ở đội hình fid theo hàm fn (góc cũ ra góc
 * mới). Không đổi gì thì trả đúng mảng cũ.
 */
export function mapFacing(
  fs: Formation[], fid: string, ids: string[], fn: (a: number, id: string) => number,
): Formation[] {
  const f = fs.find((x) => x.id === fid);
  if (!f) return fs;
  const next: Record<string, number> = { ...f.facing };
  let changed = false;
  for (const id of ids) {
    if (!(id in f.pos)) continue;
    const a = facingOf(f, id), b = normFacing(fn(a, id));
    if (a === b) continue;
    next[id] = b;
    changed = true;
  }
  return changed ? fs.map((x) => (x === f ? withFacing(x, next) : x)) : fs;
}

/** Quay thêm delta độ (phím Q: +45, Shift Q: −45; Xoay nhóm: ±90). */
export const turnFacing = (fs: Formation[], fid: string, ids: string[], delta: number) =>
  mapFacing(fs, fid, ids, (a) => a + delta);

/** Đặt hẳn một hướng cho các người ids. */
export const setFacing = (fs: Formation[], fid: string, ids: string[], deg: number) =>
  mapFacing(fs, fid, ids, () => deg);

/** Lật trái phải (soi gương): góc đổi dấu, 180 giữ nguyên. */
export const mirrorFacing = (fs: Formation[], fid: string, ids: string[]) =>
  mapFacing(fs, fid, ids, (a) => -a);

/** Bỏ người id khỏi bảng hướng mặt của mọi đội hình (xoá người). */
export function dropFacing(f: Formation, id: string): Formation {
  if (!f.facing || !(id in f.facing)) return f;
  const next = { ...f.facing };
  delete next[id];
  return withFacing(f, next);
}

/** Bản sao newIds nhìn cùng hướng với bản gốc srcId ở đội hình f. */
export function copyFacing(f: Formation, srcId: string, newIds: string[]): Formation {
  const a = facingOf(f, srcId);
  if (!a) return f;
  return withFacing(f, { ...f.facing, ...Object.fromEntries(newIds.map((id) => [id, a])) });
}

/** Làm sạch bảng hướng mặt khi nạp tệp: bỏ id lạ, góc hỏng; chuẩn hoá bội 45, bỏ 0. */
export function cleanFacing(raw: unknown, ids: Set<string>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, a] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(id) || typeof a !== "number" || !Number.isFinite(a)) continue;
    const v = normFacing(a);
    if (v) out[id] = v;
  }
  return out;
}

/** Hiệu góc ngắn nhất từ a tới b, trong (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** Nội suy theo đường ngắn nhất (u từ 0 tới 1). Quay lưng đúng 180 thì quay theo chiều kim đồng hồ. */
export const lerpFacing = (a: number, b: number, u: number): number => {
  const v = a + angleDiff(a, b) * Math.min(1, Math.max(0, u));
  return angleDiff(0, v);
};

const smooth = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/**
 * Hướng mặt (độ, chưa làm tròn) của người id tại t: đang đứng thì đúng góc đã
 * đặt, đang chuyển thì xoay dần theo đường ngắn nhất cùng nhịp với bước đi.
 * Trước khối đầu, sau khối cuối thì giữ góc khối đó. Chưa có đội hình: 0.
 */
export function facingAt(fs: Formation[], id: string, t: number): number {
  if (!fs.length) return 0;
  if (t < fs[0].start) return facingOf(fs[0], id);
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k], g = fs[k + 1];
    if (t >= f.start && t <= f.end) return facingOf(f, id);
    if (g && t > f.end && t < g.start) {
      if (!(id in f.pos) || !(id in g.pos)) return facingOf(g, id);
      return lerpFacing(facingOf(f, id), facingOf(g, id), smooth((t - f.end) / (g.start - f.end)));
    }
  }
  return facingOf(fs[fs.length - 1], id);
}

/** Vectơ đơn vị (x, z) của hướng nhìn: 0 là (0, 1) phía khán giả, 90 là (−1, 0). */
export function faceVec(deg: number): Vec2 {
  const r = (deg * Math.PI) / 180;
  return [-Math.sin(r) + 0, Math.cos(r) + 0];
}

/**
 * Tam giác nhỏ ở mép chấm bán kính r chỉ hướng mặt: [đỉnh, chân trái, chân
 * phải], toạ độ sân (mét) tương đối với tâm chấm. Bên vẽ tự đổi sang màn hình.
 */
export function faceTri(deg: number, r: number): [Vec2, Vec2, Vec2] {
  const [ux, uz] = faceVec(deg);
  const px = -uz, pz = ux; // vuông góc
  const tip = r * 1.5, base = r * 0.82, half = r * 0.42;
  return [
    [ux * tip, uz * tip],
    [ux * base + px * half, uz * base + pz * half],
    [ux * base - px * half, uz * base - pz * half],
  ];
}

/** Tên ngắn theo người múa, 0 thì "" (nhìn khán giả là mặc định nên không nhắc). */
export function facingLabel(deg: number): string {
  switch (normFacing(deg)) {
    case 45: return "chéo phải";
    case -45: return "chéo trái";
    case 90: return "quay phải";
    case -90: return "quay trái";
    case 135: return "lưng chéo phải";
    case -135: return "lưng chéo trái";
    case 180: return "quay lưng";
    default: return "";
  }
}

/** Tên đầy đủ cho nút chọn hướng (có cả nhìn khán giả). */
export const facingName = (deg: number): string => facingLabel(deg) || "nhìn khán giả";

/** Tám hướng theo thứ tự quay phải từ nhìn khán giả. */
export const FACINGS = [0, 45, 90, 135, 180, -135, -90, -45] as const;
