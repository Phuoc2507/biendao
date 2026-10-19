// Thư viện đội hình theo số người (học từ FODI, mubo, Dance Formations Plus).
//
// Mỗi hình sinh bằng hàm cho một số người n (3 tới 16), không gõ tay toạ độ.
// Cùng định dạng với Hình của tôi (`SavedShape.pts`): điểm đã trừ tâm nhóm,
// làm tròn tới milimét, xếp từ sau ra trước rồi trái sang phải. Khán giả ở +Z.
//
// Hai cách dựng, cả hai đều bảo đảm mọi cặp cách nhau từ 0,8 m và người khác
// hàng lệch ngang từ SIDE_M (trên ngưỡng bị che 0,35 m của checks.ts):
//   * hình theo hàng (kim cương, tam giác, so le...): `staggerRows` dời ngang
//     từng hàng một chút cho so le với mọi hàng khác;
//   * hình theo đường (chữ V, chữ W, vòng cung, chéo...): `spread` xếp điểm
//     theo hoành độ rồi nới khoảng ngang giữa hai điểm liền nhau.
// `libraryFor` soát lại lần cuối và bỏ hình không đạt hoặc không vừa sân.
// THUẦN, chỉ import kiểu từ model.ts.

import type { StageSize, Vec2 } from "./model.ts";

export const LIB_MIN = 3;
export const LIB_MAX = 16;
/** Khoảng cách tối thiểu giữa hai chỗ đứng (yêu cầu 0,8 m, chừa 2 cm cho làm tròn). */
export const MIN_GAP_M = 0.82;
/** Lệch ngang tối thiểu giữa hai người khác hàng (ngưỡng bị che 0,35 m, chừa thêm). */
export const SIDE_M = 0.41;
/** Lề chừa mỗi bên sân khi xét hình có vừa không (fitGroup chừa 0,3 m). */
const EDGE_M = 0.4;
/** Khoảng cách hai hàng trước sau (không co theo sân để luôn đủ 0,8 m). */
const ROW_DZ = 0.85;
/** Bước dời ngang một hàng khi tìm cách so le. */
const SHIFT_STEP = 0.07;
/** Bề rộng lớn nhất giữa hai người cạnh nhau trong một hàng của hình theo hàng. */
const MAX_ROW_S = 2;
const DEFAULT_STAGE: StageSize = { width: 10, depth: 6 };

export interface LibShape {
  /** khoá ổn định, vd "diamond-9-0" */
  id: string;
  kind: string;
  name: string;
  pts: Vec2[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

// ---------- dựng điểm ----------

/** Một hàng `count` người cách nhau `s`, tâm ở `x0`, độ sâu `z`. */
function row(count: number, z: number, s: number, x0 = 0): Vec2[] {
  return Array.from({ length: count }, (_, i): Vec2 => [x0 + (i - (count - 1) / 2) * s, z]);
}

/** Trừ tâm, làm tròn milimét, xếp từ sau ra trước rồi trái sang phải. */
function center(pts: Vec2[]): Vec2[] {
  const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
  const mz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  return pts.map((q): Vec2 => [r3(q[0] - mx), r3(q[1] - mz)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Hình theo đường: nới ngang cho đủ khoảng cách và không ai bị che. */
export function spread(pts: Vec2[]): Vec2[] {
  if (!pts.length) return [];
  const eps = 1e-6;
  const items = pts.map((q) => ({ x: q[0], z: q[1] }));
  // trùng hoành độ: nửa trái người sau đứng ngoài, nửa phải soi gương, giữa thì người sau bên trái
  items.sort((a, b) => {
    const dx = a.x - b.x;
    if (Math.abs(dx) > eps) return dx;
    const side = a.x > eps ? -1 : 1;
    return side * (a.z - b.z);
  });
  const xs = [0];
  for (let k = 1; k < items.length; k++) {
    const dz = Math.abs(items[k].z - items[k - 1].z);
    // hai điểm liền nhau lệch ngang từ SIDE_M nên hai điểm cách một điểm lệch từ 2 × SIDE_M > 0,8 m
    const need = Math.max(SIDE_M, Math.sqrt(Math.max(0, MIN_GAP_M ** 2 - dz ** 2)));
    xs.push(xs[k - 1] + Math.max(items[k].x - items[k - 1].x, need));
  }
  return center(items.map((it, k): Vec2 => [xs[k], it.z]));
}

/**
 * Hình theo hàng: `sizes[0]` là hàng gần khán giả nhất, hàng sau cách hàng
 * trước `gaps[k]` (mặc định ROW_DZ). Mỗi hàng là một dãy cách đều S, dời ngang
 * ít nhất có thể (bước SHIFT_STEP, không quá S/2) sao cho mọi người khác hàng
 * lệch ngang từ SIDE_M. Tìm theo chiều sâu, thử S tăng dần; không có cách thì null.
 */
const rowCache = new Map<string, Vec2[] | null>();
function staggerRows(sizes: number[], s: number, gaps?: number[]): Vec2[] | null {
  const key = JSON.stringify([sizes, s, gaps ?? []]);
  if (!rowCache.has(key)) rowCache.set(key, searchRows(sizes, s, gaps));
  return rowCache.get(key)!;
}

function searchRows(sizes: number[], s: number, gaps?: number[]): Vec2[] | null {
  const zs: number[] = [];
  sizes.forEach((_, k) => zs.push(k === 0 ? 0 : zs[k - 1] - (gaps?.[k - 1] ?? ROW_DZ)));
  // hàng đông thì cần S rộng hơn: k hàng chồng bề ngang lên nhau cần k "pha" lệch nhau SIDE_M
  // quá MAX_ROW_S thì các hàng lệch nhau nhiều quá, nhìn không ra hình: bỏ để dùng hình viền
  const widths = [s, 1, 1.25, 1.5, 1.75, 2].filter((w) => w >= s && w <= MAX_ROW_S);
  for (const S of widths) {
    const shifts = [0];
    for (let j = 1; j * SHIFT_STEP <= S / 2 + 1e-9; j++) shifts.push(j * SHIFT_STEP, -j * SHIFT_STEP);
    const placed: Vec2[][] = [];
    let budget = 4000;
    const dfs = (k: number): boolean => {
      if (k === sizes.length) return true;
      if (--budget < 0) return false;
      for (const d of shifts) {
        const cand = row(sizes[k], zs[k], S, d);
        if (cand.every((p) => placed.every((r) => r.every((q) => Math.abs(p[0] - q[0]) >= SIDE_M)))) {
          placed.push(cand);
          if (dfs(k + 1)) return true;
          placed.pop();
        }
      }
      return false;
    };
    if (dfs(0)) return center(placed.flat());
  }
  return null;
}

/** Điểm rải đều theo bề ngang, độ sâu theo hàm z(u) với u từ 0 tới 1. */
function along(n: number, width: number, z: (u: number) => number): Vec2[] {
  return spread(Array.from({ length: n }, (_, i): Vec2 => {
    const u = i / (n - 1);
    return [(u - 0.5) * width, z(u)];
  }));
}

/** Dãy hàng tăng đều a, a+d, a+2d... (2 tới 6 hàng, a tới 3) có tổng đúng n; ưu tiên bước 1. */
function steadyRows(n: number): number[] | null {
  for (const d of [1, 2])
    for (let a = 1; a <= 3; a++)
      for (let k = 2; k <= 6; k++) {
        const seq = Array.from({ length: k }, (_, i) => a + i * d);
        if (sum(seq) === n) return seq;
      }
  return null;
}

/** Dãy hàng đối xứng kiểu kim cương: a, a+d, ..., đỉnh (1 hoặc 2 hàng), ..., a. */
function diamondRows(n: number): number[] | null {
  for (const a of [1, 2])
    for (const d of [1, 2])
      for (const rep of [1, 2])
        for (let peak = a + d; peak <= 7; peak += d) {
          const up: number[] = [];
          for (let c = a; c < peak; c += d) up.push(c);
          const seq = [...up, ...Array(rep).fill(peak), ...[...up].reverse()];
          if (seq.length <= 7 && sum(seq) === n) return seq;
        }
  return null;
}

/** Rải n người đều theo chu vi một đa giác (đỉnh đầu tiên có người), rồi `spread`. */
function outline(n: number, poly: Vec2[]): Vec2[] {
  const segs = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const L = sum(segs.map((g) => g.len));
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    let t = (i * L) / n;
    let g = segs[0];
    for (const h of segs) {
      g = h;
      if (t <= h.len) break;
      t -= h.len;
    }
    const u = g.len ? Math.min(1, t / g.len) : 0;
    pts.push([g.a[0] + (g.b[0] - g.a[0]) * u, g.a[1] + (g.b[1] - g.a[1]) * u]);
  }
  return spread(pts);
}

/** Viền kim cương có chu vi đủ cho n người cách nhau khoảng s. */
function diamondOutline(n: number, s: number): Vec2[] {
  const side = (n * 0.95 * s) / 4;
  const B = side / Math.hypot(1.4, 1), A = 1.4 * B;
  return outline(n, [[0, B], [A, 0], [0, -B], [-A, 0]]);
}

/** Viền tam giác (đỉnh hướng khán giả khi `inv` là false). */
function triangleOutline(n: number, s: number, inv: boolean): Vec2[] {
  const P = n * 0.95 * s;
  const B = P / (2 + 2 * Math.hypot(1, 0.75)), H = (1.5 * B) / 2; // nửa đáy B, nửa chiều cao H
  const tip = inv ? -H : H;
  return outline(n, [[0, tip], [B, -tip], [-B, -tip]]);
}

/** Chia n người thành hai hàng, hàng trước đông hơn khi lẻ. */
const halves = (n: number) => [Math.ceil(n / 2), Math.floor(n / 2)].filter((c) => c > 0);

// ---------- các loại hình ----------

interface Variant { name: string; pts: Vec2[] | null }
/** Sinh các biến thể cho n người với đơn vị khoảng cách s (m); cùng n thì số biến thể không đổi theo s. */
type Gen = (n: number, s: number) => Variant[];

const GENS: { kind: string; gen: Gen }[] = [
  {
    kind: "diamond",
    gen: (n, s) => {
      if (n < 4) return [];
      // đặc khi xếp được các hàng so le gọn, không thì chỉ viền
      const seq = diamondRows(n);
      const full = seq && staggerRows(seq, s, Array(seq.length).fill(0.82));
      return [{ name: "Kim cương", pts: full || (n >= 8 ? diamondOutline(n, s) : null) }];
    },
  },
  {
    kind: "triangle",
    gen: (n, s) => {
      const seq = steadyRows(n);
      const full = seq && staggerRows(seq, s);
      return [{ name: "Tam giác", pts: full || (n >= 7 ? triangleOutline(n, s, false) : null) }];
    },
  },
  {
    kind: "triangleInv",
    gen: (n, s) => {
      const seq = steadyRows(n);
      const full = seq && staggerRows([...seq].reverse(), s);
      return [{ name: "Tam giác ngược", pts: full || (n >= 7 ? triangleOutline(n, s, true) : null) }];
    },
  },
  {
    kind: "v",
    gen: (n, s) => {
      if (n < 4) return [];
      const w = (n - 1) * 0.55 * s;
      return [{ name: "Chữ V", pts: along(n, w, (u) => -Math.abs(2 * u - 1) * w * 0.4) }];
    },
  },
  {
    kind: "w",
    gen: (n, s) => {
      if (n < 7) return [];
      const w = (n - 1) * 0.55 * s;
      // đỉnh chữ W ở phía sau (hai đầu và giữa), hai đáy ở phía trước
      const f = (u: number) => Math.abs(((4 * u) % 2) - 1);
      return [{ name: "Chữ W", pts: along(n, w, (u) => -f(u) * 1.6 * s) }];
    },
  },
  {
    kind: "blocks",
    gen: (n, s) => {
      // khối so le nhiều hàng xen kẽ đông ít: 3-2-3, 2-3-2, 4-3-4-3...
      const out: Variant[] = [];
      for (let big = 3; big <= 6; big++)
        for (let k = 3; k <= 4; k++)
          for (const first of [big, big - 1]) {
            const seq = Array.from({ length: k }, (_, i) => (i % 2 === 0 ? first : first === big ? big - 1 : big));
            if (sum(seq) === n) out.push({ name: `So le ${seq.join("-")}`, pts: staggerRows(seq, s) });
          }
      return out.slice(0, 2);
    },
  },
  {
    kind: "twoRows",
    gen: (n, s) => [{ name: "Hai hàng so le", pts: staggerRows(halves(n), s) }],
  },
  {
    kind: "threeRows",
    gen: (n, s) => {
      if (n < 8) return [];
      const a = Math.ceil(n / 3), b = Math.ceil((n - a) / 2);
      return [{ name: "Ba hàng so le", pts: staggerRows([a, b, n - a - b], 1.25 * s) }];
    },
  },
  {
    kind: "lead",
    gen: (n, s) => {
      // một người nổi ở giữa phía trước, còn lại đứng sau (một hàng hay hai hàng so le)
      const rest = n - 1;
      return [{ name: "Người giữa nổi", pts: staggerRows([1, ...(rest <= 5 ? [rest] : halves(rest))], s, [1.2]) }];
    },
  },
  {
    kind: "arc",
    gen: (n, s) => {
      if (n < 4) return [];
      // cung tròn 140 độ, hai đầu chụm về phía khán giả
      const span = (140 * Math.PI) / 180;
      const step = span / (n - 1);
      const R = s / (2 * Math.sin(step / 2));
      return [{
        name: "Vòng cung",
        pts: spread(Array.from({ length: n }, (_, i): Vec2 => {
          const phi = -span / 2 + i * step;
          return [R * Math.sin(phi), -R * Math.cos(phi)];
        })),
      }];
    },
  },
  {
    kind: "diagonal",
    // từ sau bên trái tới trước bên phải
    gen: (n, s) => [{ name: "Đường chéo", pts: spread(Array.from({ length: n }, (_, i): Vec2 => [i * 0.62 * s, i * 0.5 * s])) }],
  },
  {
    kind: "diagonal2",
    gen: (n, s) => {
      if (n < 8) return [];
      const [a, b] = halves(n);
      const line = (c: number, dx: number, dz: number) =>
        Array.from({ length: c }, (_, i): Vec2 => [dx + i * 0.7 * s, dz + i * 0.5 * s]);
      return [{ name: "Hai đường chéo", pts: spread([...line(a, 0, 0), ...line(b, 1.1 * s, -1.0 * s)]) }];
    },
  },
  {
    kind: "arrow",
    gen: (n, s) => {
      if (n < 8 || n > 11) return [];
      // đầu mũi tên chĩa về khán giả, thân hai hàng dọc so le phía sau
      const head = [1, 2, 3];
      const tail: number[] = [];
      for (let r = n - sum(head); r > 0; r -= 2) tail.push(Math.min(2, r));
      const seq = [...head, ...tail];
      return [{ name: "Mũi tên", pts: staggerRows(seq, s, Array(seq.length).fill(0.82)) }];
    },
  },
  {
    kind: "split",
    gen: (n, s) => {
      if (n < 6) return [];
      // hai nhóm hai bên, mỗi nhóm hai hàng so le, chừa khoảng trống giữa sân
      const [left, right] = halves(n);
      const half = (c: number, x0: number): Vec2[] => {
        const [f, b = 0] = halves(c);
        const off = f === b ? s / 4 : 0;
        return [...row(f, 0, s, x0 - off), ...row(b, -0.9 * s, s, x0 + off)];
      };
      const wl = Math.ceil(left / 2) * s;
      const gap = 1.6 * s;
      return [{ name: "Hai nhóm hai bên", pts: spread([...half(left, -(gap + wl) / 2), ...half(right, (gap + wl) / 2)]) }];
    },
  },
];

// ---------- soát và lọc ----------

/** Khoảng cách nhỏ nhất giữa hai chỗ (Infinity khi dưới 2 chỗ). */
export function minSpacing(pts: Vec2[]): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return m;
}

/** Có ai bị che hẳn khi nhìn từ khán giả không (cùng ngưỡng với checks.ts: 0,35 m ngang, 0,3 m sâu). */
export function anyBlocked(pts: Vec2[]): boolean {
  return pts.some((a) => pts.some((b) => b[1] > a[1] + 0.3 && Math.abs(a[0] - b[0]) < 0.35));
}

function fits(pts: Vec2[], stage: StageSize): boolean {
  const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1]);
  return Math.max(...xs) - Math.min(...xs) <= stage.width - 2 * EDGE_M
    && Math.max(...zs) - Math.min(...zs) <= stage.depth - 2 * EDGE_M;
}

/** Thử co dần đơn vị khoảng cách tới khi hình vừa sân. */
const UNITS = [1, 0.92, 0.85, 0.8];

/** Mọi hình trong thư viện cho đúng `n` người vừa sân `stage` (mặc định 10 × 6 m). */
export function libraryFor(n: number, stage: StageSize = DEFAULT_STAGE): LibShape[] {
  if (!Number.isInteger(n) || n < LIB_MIN || n > LIB_MAX) return [];
  const key = `${n}@${stage.width}x${stage.depth}`;
  let hit = libCache.get(key);
  if (!hit) libCache.set(key, (hit = buildLibrary(n, stage)));
  return hit.map((s) => ({ ...s, pts: s.pts.map((q): Vec2 => [q[0], q[1]]) }));
}

const libCache = new Map<string, LibShape[]>();

/** Đã tính thư viện cho n người trên sân này chưa (chưa thì libraryFor tốn tới vài trăm ms). */
export const libraryReady = (n: number, stage: StageSize = DEFAULT_STAGE) => libCache.has(`${n}@${stage.width}x${stage.depth}`);

function buildLibrary(n: number, stage: StageSize): LibShape[] {
  const out: LibShape[] = [];
  for (const { kind, gen } of GENS) {
    const count = gen(n, 1).length;
    for (let v = 0; v < count; v++) {
      for (const s of UNITS) {
        const variant = gen(n, s)[v];
        const pts = variant?.pts;
        if (!pts || pts.length !== n || minSpacing(pts) < 0.8 || anyBlocked(pts)) continue;
        if (fits(pts, stage)) {
          out.push({ id: `${kind}-${n}-${v}`, kind, name: variant.name, pts });
          break;
        }
      }
    }
  }
  return out;
}

/** Hình có tên "so le", "tam giác", "kim cương": loại phải bảo đảm không ai bị che. */
export const isStaggerName = (name: string) => /so le|tam giác|kim cương/i.test(name);
