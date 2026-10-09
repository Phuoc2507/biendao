// Lõi THUẦN của sân khấu thẻ video: kiểu dữ liệu và các hàm đội hình.
// Không import gì để chạy được cả trong Vite lẫn `node --test`.
//
// Quy ước sân khấu (giữ như app 3D cũ): khán giả ở phía +Z, x dương là bên
// PHẢI khi nhìn từ khán giả. Gốc (0, 0) ở tâm sàn diễn. Mép trước ở z = +depth/2.
// Hai bên có cánh gà rộng WING mét để "cất" người chưa ra sân.
//
// Một đội hình là một KHỐI ĐỨNG [start, end] trên dải thời gian; khoảng trống
// giữa hai khối là lúc mọi người TRƯỢT sang đội hình sau (smoothstep).

export type Vec2 = [number, number];

export interface VDancer {
  id: string;
  name: string;
  color: string;
  mediaId: string | null; // null: chưa gắn video, hiện thẻ giữ chỗ
  mediaName: string; // tên tệp gốc, để ghép lại khi mở dự án từ tệp .json
  stacked: boolean; // true: video xếp chồng (nửa dưới là mặt nạ)
  offsetSec: number; // thời điểm trong bài nhạc khi video bắt đầu
  durationSec: number;
  aspect: number; // rộng / cao của phần hình
  cardHeight: number; // mét
  hidden: boolean;
  alignConfident: boolean;
}

export interface Formation {
  id: string;
  name: string;
  start: number;
  end: number;
  pos: Record<string, Vec2>;
}

export interface StageSize {
  width: number;
  depth: number;
}

export interface Project {
  version: 1;
  title: string;
  stage: StageSize;
  musicId: string | null;
  musicName: string;
  musicDuration: number;
  bpm: number | null;
  downbeat: number; // giây của phách 1 đầu tiên
  dancers: VDancer[];
  formations: Formation[];
}

export const WING = 1.5;
export const MIN_BLOCK = 0.2;
export const PALETTE = [
  "#ff5d6c", "#4f9dff", "#3ad07a", "#ffb020", "#b07cff",
  "#2fd3d3", "#ff7ac6", "#c7e04a", "#ff8a3d", "#8fa3c0",
  "#e05252", "#5b6cff",
];

export function emptyProject(): Project {
  return {
    version: 1,
    title: "Bài múa mới",
    stage: { width: 10, depth: 6 },
    musicId: null,
    musicName: "",
    musicDuration: 0,
    bpm: null,
    downbeat: 0,
    dancers: [],
    formations: [],
  };
}

export function newDancer(id: string, name: string, color: string): VDancer {
  return {
    id, name, color, mediaId: null, mediaName: "", stacked: false, offsetSec: 0,
    durationSec: 0, aspect: 0.45, cardHeight: 1.7, hidden: false,
    alignConfident: true,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts[parts.length - 1];
  // Tên Việt: chữ cái tên gọi (cuối) là dễ nhận nhất; thêm số nếu tên là "D3"
  const m = last.match(/^[A-Za-zÀ-ỹ]+(\d+)$/);
  if (m) return (last[0] + m[1]).toUpperCase();
  const cap = last.replace(/^./, (c) => c.toUpperCase());
  return cap.length <= 4 ? cap : cap.slice(0, 3);
}

// ---------- hình học cơ bản ----------

export const smoothstep = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

export const lerp2 = (a: Vec2, b: Vec2, u: number): Vec2 => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
];

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function clampToStage(p: Vec2, stage: StageSize): Vec2 {
  const hx = stage.width / 2 + WING;
  const hz = stage.depth / 2;
  return [Math.min(hx, Math.max(-hx, p[0])), Math.min(hz, Math.max(-hz, p[1]))];
}

export function snapPos(p: Vec2, step: number): Vec2 {
  const r = (v: number) => Math.round(v / step) * step + 0; // +0 bỏ -0
  return [r(p[0]), r(p[1])];
}

export function inWings(p: Vec2, stage: StageSize): boolean {
  return Math.abs(p[0]) > stage.width / 2 + 1e-9;
}

/** Hàng ngang phía trước sân khấu, cách nhau tối đa 1 m, căn giữa. */
export function lineup(ids: string[], stage: StageSize): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  const n = ids.length;
  const gap = n > 1 ? Math.min(1, (stage.width - 1) / (n - 1)) : 0;
  const z = Math.max(0, stage.depth / 2 - 1.5);
  ids.forEach((id, i) => {
    out[id] = [(i - (n - 1) / 2) * gap, z];
  });
  return out;
}

// ---------- tra cứu theo thời gian ----------

export type Segment =
  | { kind: "none" }
  | { kind: "before"; k: 0 }
  | { kind: "hold"; k: number }
  | { kind: "gap"; k: number; u: number } // giữa khối k và k+1
  | { kind: "after"; k: number };

export function segmentAt(fs: Formation[], t: number): Segment {
  if (fs.length === 0) return { kind: "none" };
  if (t < fs[0].start) return { kind: "before", k: 0 };
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    if (t >= f.start && t <= f.end) return { kind: "hold", k };
    const next = fs[k + 1];
    if (next && t > f.end && t < next.start) {
      return { kind: "gap", k, u: (t - f.end) / (next.start - f.end) };
    }
  }
  return { kind: "after", k: fs.length - 1 };
}

export function holdIndexAt(fs: Formation[], t: number): number {
  const s = segmentAt(fs, t);
  return s.kind === "hold" ? s.k : -1;
}

export function poseAt(fs: Formation[], id: string, t: number): Vec2 | null {
  const s = segmentAt(fs, t);
  switch (s.kind) {
    case "none":
      return null;
    case "before":
    case "hold":
    case "after":
      return fs[s.k].pos[id] ?? null;
    case "gap": {
      const a = fs[s.k].pos[id];
      const b = fs[s.k + 1].pos[id];
      if (!a || !b) return a ?? b ?? null;
      return lerp2(a, b, smoothstep(s.u));
    }
  }
}

export function posesAt(
  fs: Formation[], ids: string[], t: number, stage: StageSize,
): Record<string, Vec2> {
  const base = lineup(ids, stage);
  const out: Record<string, Vec2> = {};
  for (const id of ids) out[id] = poseAt(fs, id, t) ?? base[id];
  return out;
}

/** Đội hình đứng ngay trước thời điểm t (để vẽ bóng mờ), hoặc null. */
export function prevFormation(fs: Formation[], t: number): Formation | null {
  const s = segmentAt(fs, t);
  if (s.kind === "hold") return s.k > 0 ? fs[s.k - 1] : null;
  if (s.kind === "gap" || s.kind === "after") return fs[s.k];
  return null;
}

export function nextFormation(fs: Formation[], t: number): Formation | null {
  const s = segmentAt(fs, t);
  if (s.kind === "before") return fs[0];
  if (s.kind === "hold" || s.kind === "gap") return fs[s.k + 1] ?? null;
  return null;
}

// ---------- sửa đội hình (luôn trả mảng MỚI, không đột biến đầu vào) ----------

const sortFs = (fs: Formation[]) => [...fs].sort((a, b) => a.start - b.start);

export function nextName(fs: Formation[]): string {
  let n = fs.length + 1;
  const names = new Set(fs.map((f) => f.name));
  while (names.has(`Đội hình ${n}`)) n++;
  return `Đội hình ${n}`;
}

/**
 * Đảm bảo có khối đứng tại t. Nếu t đã nằm trong khối thì trả khối đó. Nếu
 * không, tạo khối mới bắt đầu tại t, dài tối đa holdLen nhưng không đè khối
 * sau, vị trí chép từ vị trí nội suy hiện tại.
 */
export function ensureFormationAt(
  fs: Formation[], t: number, ids: string[], stage: StageSize,
  newId: string, holdLen: number,
): { formations: Formation[]; id: string; created: boolean } {
  const k = holdIndexAt(fs, t);
  if (k >= 0) return { formations: fs, id: fs[k].id, created: false };
  const after = fs.find((f) => f.start > t);
  let start = Math.max(0, t);
  let end = start + holdLen;
  if (after) {
    end = Math.min(end, after.start);
    if (end - start < MIN_BLOCK) start = Math.max(0, end - MIN_BLOCK);
  }
  const pos: Record<string, Vec2> = {};
  const now = posesAt(fs, ids, t, stage);
  for (const id of ids) pos[id] = [now[id][0], now[id][1]];
  const f: Formation = { id: newId, name: nextName(fs), start, end, pos };
  return { formations: sortFs([...fs, f]), id: newId, created: true };
}

export function setPositions(
  fs: Formation[], fid: string, moves: Record<string, Vec2>, stage: StageSize,
): Formation[] {
  return fs.map((f) => {
    if (f.id !== fid) return f;
    const pos = { ...f.pos };
    for (const [id, p] of Object.entries(moves)) pos[id] = clampToStage(p, stage);
    return { ...f, pos };
  });
}

/**
 * Nút "+ Đội hình": chép đội hình đang đứng thành khối mới ngay sau nó.
 * Các khối đã gắn với nhạc nên ưu tiên nhét vừa khoảng trống phía sau (co
 * khoảng chuyển và độ dài khối lại); chỉ khi quá chật mới dời các khối sau,
 * và trả về số giây đã dời để báo người dùng. Ở chỗ trống thì tạo khối tại t
 * như ensureFormationAt. Trả thời điểm nên đưa vạch tới.
 */
export function addFormationAfter(
  fs: Formation[], t: number, ids: string[], stage: StageSize,
  newId: string, holdLen: number, gapLen: number,
): { formations: Formation[]; id: string; jumpTo: number; shifted: number } {
  const k = holdIndexAt(fs, t);
  if (k < 0) {
    const r = ensureFormationAt(fs, t, ids, stage, newId, holdLen);
    const f = r.formations.find((x) => x.id === r.id)!;
    return { formations: r.formations, id: r.id, jumpTo: f.start, shifted: 0 };
  }
  const cur = fs[k];
  const next = fs[k + 1];
  let start = cur.end + gapLen;
  let end = start + holdLen;
  let shift = 0;
  if (next) {
    const room = next.start - cur.end;
    const minGap = Math.min(gapLen, 0.5);
    const minHold = Math.max(MIN_BLOCK, Math.min(holdLen, 1));
    if (room >= 2 * minGap + minHold) {
      const g = Math.min(gapLen, (room - minHold) / 2);
      start = cur.end + g;
      end = Math.min(start + holdLen, next.start - g);
    } else {
      shift = end + gapLen - next.start;
    }
  }
  const pos: Record<string, Vec2> = {};
  for (const id of ids) {
    const p = cur.pos[id];
    if (p) pos[id] = [p[0], p[1]];
  }
  const out = fs.map((f, i) =>
    i > k && shift > 0 ? { ...f, start: f.start + shift, end: f.end + shift } : f,
  );
  out.push({ id: newId, name: nextName(fs), start, end, pos });
  return { formations: sortFs(out), id: newId, jumpTo: start, shifted: shift };
}

/** Đổi start/end của một khối, kẹp không vượt khối bên cạnh, dài ≥ MIN_BLOCK. */
export function setBlockTimes(
  fs: Formation[], id: string, start: number, end: number,
): Formation[] {
  const i = fs.findIndex((f) => f.id === id);
  if (i < 0) return fs;
  const lo = i > 0 ? fs[i - 1].end : 0;
  const hi = i < fs.length - 1 ? fs[i + 1].start : Infinity;
  let s = Math.max(lo, Math.min(start, hi - MIN_BLOCK));
  let e = Math.min(hi, Math.max(end, s + MIN_BLOCK));
  if (e - s < MIN_BLOCK) s = Math.max(lo, e - MIN_BLOCK);
  return fs.map((f, j) => (j === i ? { ...f, start: s, end: e } : f));
}

/** Dời cả khối (giữ độ dài) trong phạm vi hai khối bên cạnh. */
export function moveBlock(fs: Formation[], id: string, newStart: number): Formation[] {
  const i = fs.findIndex((f) => f.id === id);
  if (i < 0) return fs;
  const len = fs[i].end - fs[i].start;
  const lo = i > 0 ? fs[i - 1].end : 0;
  const hi = i < fs.length - 1 ? fs[i + 1].start - len : Infinity;
  const s = Math.max(lo, Math.min(newStart, hi));
  return fs.map((f, j) => (j === i ? { ...f, start: s, end: s + len } : f));
}

export function deleteFormation(fs: Formation[], id: string): Formation[] {
  return fs.filter((f) => f.id !== id);
}

export function renameFormation(fs: Formation[], id: string, name: string): Formation[] {
  return fs.map((f) => (f.id === id ? { ...f, name } : f));
}

/** Chỗ trống trong cánh gà (trái −1, phải +1; từ trước ra sau) cho người mới
 *  thêm. Cách nhau 1 m để tên trên sơ đồ không đè lên nhau. */
export function wingSpot(taken: Vec2[], stage: StageSize, side: -1 | 1 = -1): Vec2 {
  const x = side * (stage.width / 2 + WING / 2);
  const hz = stage.depth / 2;
  for (const step of [1, 0.5]) {
    for (let z = hz - 0.5; z >= -hz + 0.25; z -= step) {
      const p: Vec2 = [x, Math.round(z * 100) / 100];
      if (taken.every((q) => dist(p, q) > step * 0.8)) return p;
    }
  }
  return [x, 0];
}

export function addDancerToAll(fs: Formation[], id: string, stage: StageSize): Formation[] {
  return fs.map((f) => {
    if (f.pos[id]) return f;
    return { ...f, pos: { ...f.pos, [id]: wingSpot(Object.values(f.pos), stage) } };
  });
}

export function removeDancerFromAll(fs: Formation[], id: string): Formation[] {
  return fs.map((f) => {
    if (!(id in f.pos)) return f;
    const pos = { ...f.pos };
    delete pos[id];
    return { ...f, pos };
  });
}

export function checkInvariants(p: Project): string[] {
  const errs: string[] = [];
  const ids = p.dancers.map((d) => d.id);
  p.formations.forEach((f, k) => {
    if (!(f.start <= f.end)) errs.push(`${f.name}: start > end`);
    const next = p.formations[k + 1];
    if (next && f.end > next.start + 1e-9) errs.push(`${f.name} đè ${next.name}`);
    for (const id of ids) if (!f.pos[id]) errs.push(`${f.name} thiếu ${id}`);
    for (const [id, q] of Object.entries(f.pos)) {
      const c = clampToStage(q, p.stage);
      if (c[0] !== q[0] || c[1] !== q[1]) errs.push(`${f.name}: ${id} ngoài sân`);
    }
  });
  return errs;
}

// ---------- xếp hình nhanh ----------

export type ShapeKind = "line" | "twoLines" | "arc" | "v" | "circle" | "diagonal" | "stagger";

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  line: "Hàng ngang",
  twoLines: "Hai hàng",
  stagger: "So le",
  arc: "Vòng cung",
  v: "Chữ V",
  circle: "Vòng tròn",
  diagonal: "Đường chéo",
};

/** Điểm của một hình cho n người, quanh tâm c, bề rộng tối đa w (mét). */
export function shapePoints(kind: ShapeKind, n: number, c: Vec2, w: number): Vec2[] {
  if (n <= 0) return [];
  const sp = n > 1 ? Math.min(1.2, w / (n - 1)) : 0;
  const pts: Vec2[] = [];
  const at = (x: number, z: number): Vec2 => [c[0] + x, c[1] + z];
  switch (kind) {
    case "line":
      for (let i = 0; i < n; i++) pts.push(at((i - (n - 1) / 2) * sp, 0));
      break;
    case "twoLines":
    case "stagger": {
      const front = Math.ceil(n / 2);
      const back = n - front;
      const s2 = Math.min(1.4, w / Math.max(1, front - 1));
      for (let i = 0; i < front; i++) pts.push(at((i - (front - 1) / 2) * s2, 0.6));
      const shift = kind === "stagger" ? (front === back ? s2 / 2 : 0) : 0;
      for (let i = 0; i < back; i++) {
        const off = kind === "stagger" && front !== back ? 0 : -shift;
        pts.push(at((i - (back - 1) / 2) * s2 + off + (kind === "stagger" ? 0 : 0), -0.6));
      }
      break;
    }
    case "arc": {
      const r = Math.max(1.5, w / 2);
      const span = Math.min(Math.PI * 0.8, (sp * (n - 1)) / r || 0.01);
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? -span / 2 + (span * i) / (n - 1) : 0;
        pts.push(at(r * Math.sin(a), r * (1 - Math.cos(a)) * -1 + 0.6));
      }
      break;
    }
    case "v": {
      // đỉnh chữ V hướng ra khán giả
      pts.push(at(0, 1));
      for (let i = 1; i < n; i++) {
        const side = i % 2 === 1 ? -1 : 1;
        const step = Math.ceil(i / 2);
        pts.push(at(side * step * Math.min(0.9, sp), 1 - step * 0.7));
      }
      break;
    }
    case "circle": {
      const r = Math.max(1, Math.min(w / 2, (n * 0.9) / (2 * Math.PI)));
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n + Math.PI / 2;
        pts.push(at(r * Math.cos(a), r * Math.sin(a)));
      }
      break;
    }
    case "diagonal":
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) - 0.5 : 0;
        pts.push(at(u * Math.min(w, sp * (n - 1)), -u * 2.4));
      }
      break;
  }
  return pts;
}

/**
 * Gán người vào điểm sao cho tổng bình phương quãng đường nhỏ nhất (thuật toán
 * Hungary, n nhỏ). Trả mảng chỉ số: người i đi tới điểm result[i].
 */
export function assignNearest(from: Vec2[], to: Vec2[]): number[] {
  const n = from.length;
  if (n === 0) return [];
  const cost = from.map((a) => to.map((b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2));
  const m = to.length;
  // Hungary dạng thế vị, ma trận n x m với n <= m
  const INF = 1e18;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const res = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}

/** Xếp các người `ids` theo hình, gán người gần nhất, trả vị trí mới. */
export function arrangeShape(
  current: Record<string, Vec2>, ids: string[], kind: ShapeKind, stage: StageSize,
): Record<string, Vec2> {
  const from = ids.map((id) => current[id]);
  const cx = from.reduce((s, p) => s + p[0], 0) / Math.max(1, from.length);
  const cz = from.reduce((s, p) => s + p[1], 0) / Math.max(1, from.length);
  const centre: Vec2 = ids.length === Object.keys(current).length ? [0, 0] : [cx, cz];
  const pts = shapePoints(kind, ids.length, centre, stage.width - 2);
  const asg = assignNearest(from, pts);
  const out: Record<string, Vec2> = {};
  ids.forEach((id, i) => {
    out[id] = clampToStage(snapPos(pts[asg[i]], 0.25), stage);
  });
  return out;
}

/** Lật trái phải quanh trục giữa sân (x -> -x). */
export function mirrorPositions(current: Record<string, Vec2>, ids: string[]): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  for (const id of ids) out[id] = [-current[id][0] + 0, current[id][1]];
  return out;
}

/** Dàn đều theo trục x giữa người trái nhất và phải nhất (giữ z). */
export function distributeX(current: Record<string, Vec2>, ids: string[]): Record<string, Vec2> {
  const sorted = [...ids].sort((a, b) => current[a][0] - current[b][0]);
  const out: Record<string, Vec2> = {};
  if (sorted.length < 3) {
    for (const id of ids) out[id] = current[id];
    return out;
  }
  const x0 = current[sorted[0]][0];
  const x1 = current[sorted[sorted.length - 1]][0];
  sorted.forEach((id, i) => {
    out[id] = [x0 + ((x1 - x0) * i) / (sorted.length - 1), current[id][1]];
  });
  return out;
}

// ---------- cảnh báo ----------

export interface Warning {
  kind: "fast" | "collide" | "overlap";
  formation: string; // id khối (khối đích với fast/collide)
  ids: string[];
  t: number; // thời điểm nên tua tới để xem
  msg: string;
}

export const FAST_MPS = 2.2; // chạy nhanh hơn ~2.2 m/s là khó làm sạch
export const NEAR_M = 0.45; // gần hơn khoảng này là chạm nhau

export function findWarnings(
  fs: Formation[], dancers: { id: string; name: string; hidden?: boolean }[],
): Warning[] {
  const ws: Warning[] = [];
  const vis = dancers.filter((d) => !d.hidden);
  const name = (id: string) => vis.find((d) => d.id === id)?.name ?? id;
  fs.forEach((f, k) => {
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const a = f.pos[vis[i].id];
        const b = f.pos[vis[j].id];
        if (a && b && dist(a, b) < NEAR_M)
          ws.push({
            kind: "overlap", formation: f.id, ids: [vis[i].id, vis[j].id],
            t: (f.start + f.end) / 2,
            msg: `${f.name}: ${name(vis[i].id)} và ${name(vis[j].id)} đứng chồng lên nhau`,
          });
      }
    const g = fs[k + 1];
    if (!g) return;
    const dur = g.start - f.end;
    for (const d of vis) {
      const a = f.pos[d.id];
      const b = g.pos[d.id];
      if (!a || !b) continue;
      const len = dist(a, b);
      // smoothstep: tốc độ đỉnh = 1.5 lần tốc độ trung bình
      const peak = dur > 1e-6 ? (1.5 * len) / dur : len > 0.05 ? Infinity : 0;
      if (peak > FAST_MPS)
        ws.push({
          kind: "fast", formation: g.id, ids: [d.id], t: f.end,
          msg: `${name(d.id)} phải chạy ${len.toFixed(1)} m trong ${dur.toFixed(1)} s sang ${g.name}`,
        });
    }
    if (dur <= 1e-6) return;
    const S = 24;
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const a0 = f.pos[vis[i].id], a1 = g.pos[vis[i].id];
        const b0 = f.pos[vis[j].id], b1 = g.pos[vis[j].id];
        if (!a0 || !a1 || !b0 || !b1) continue;
        // chỉ báo nếu hai đầu đều không chạm (chạm sẵn đã có cảnh báo overlap)
        if (dist(a0, b0) < NEAR_M || dist(a1, b1) < NEAR_M) continue;
        for (let s = 1; s < S; s++) {
          const u = smoothstep(s / S);
          if (dist(lerp2(a0, a1, u), lerp2(b0, b1, u)) < NEAR_M) {
            ws.push({
              kind: "collide", formation: g.id, ids: [vis[i].id, vis[j].id],
              t: f.end + (dur * s) / S,
              msg: `${name(vis[i].id)} và ${name(vis[j].id)} va nhau khi sang ${g.name}`,
            });
            break;
          }
        }
      }
  });
  return ws;
}
