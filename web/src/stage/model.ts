// Lõi THUẦN của sân khấu thẻ video: kiểu dữ liệu và các hàm đội hình.
// Chỉ import kiểu (bị xoá khi chạy) để chạy được cả trong Vite lẫn `node --test`.
//
// Quy ước sân khấu (giữ như app 3D cũ): khán giả ở phía +Z, x dương là bên
// PHẢI khi nhìn từ khán giả. Gốc (0, 0) ở tâm sàn diễn. Mép trước ở z = +depth/2.
// Hai bên có cánh gà rộng WING mét để "cất" người chưa ra sân.
//
// Một đội hình là một KHỐI ĐỨNG [start, end] trên dải thời gian; khoảng trống
// giữa hai khối là lúc mọi người TRƯỢT sang đội hình sau (smoothstep).

import type { CanonSeg } from "./timing.ts";
import { copyFacing, dropFacing, facingAt, normFacing, withFacing } from "./facing.ts";

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
  /** lật ngang thẻ (đối xứng gương), ví dụ người bên phải của tổ hợp ba người */
  flip?: boolean;
  /** canon theo đoạn: trong mỗi đoạn nhạc người này vào trễ lag giây */
  canon?: CanonSeg[];
}

export interface Formation {
  id: string;
  name: string;
  start: number;
  end: number;
  pos: Record<string, Vec2>;
  /** Ghi chú cho người tập (động tác, nhịp quay...), hiện lúc trình chiếu và trong bản in. */
  note?: string;
  /** Ghi chú riêng từng người ở đội hình này (id vũ công: chữ), vd "cầm quạt đỏ". Không có ai thì bỏ trường. */
  notes?: Record<string, string>;
  /** Đường đi cong lúc chuyển VÀO đội hình này: điểm điều khiển Bézier bậc hai
   *  của từng người (id vũ công: điểm). Không có thì đi thẳng; đội hình đầu không có. */
  via?: Record<string, Vec2>;
  /** Hướng mặt từng người (id vũ công: độ, facing.ts): 0 nhìn khán giả, dương quay sang
   *  phải người múa, bội 45 trong (-180, 180]. Chỉ lưu người khác 0; không ai thì bỏ trường. */
  facing?: Record<string, number>;
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
  /** "Hình của tôi": các hình tự lưu, đi theo tệp dự án. Không có thì coi như rỗng. */
  myShapes?: SavedShape[];
  /** Mốc đoạn nhạc có tên ("Nhạc dạo", "Điệp khúc"...), xếp theo giờ. Không có thì coi như rỗng. */
  marks?: SongMark[];
  /** Nhóm lưu sẵn (nam nữ, nhóm hát, cánh A B...) để chọn cả nhóm một chạm. Không có thì coi như rỗng. */
  groups?: DancerGroup[];
  /** false: tắt viền màu nhóm quanh chấm (sơ đồ, ảnh, bản in, video). Không có là bật. */
  groupRings?: boolean;
  /** Đạo cụ và mốc sàn đứng yên suốt bài (props.ts). Không có thì coi như rỗng. */
  props?: StageProp[];
}

/** Một nhóm lưu sẵn: members là id vũ công theo thứ tự danh sách; một người có thể ở nhiều nhóm. */
export interface DancerGroup {
  id: string;
  name: string;
  color: string;
  members: string[];
}

export type PropKind = "box" | "round" | "mark";

/** Một đạo cụ trên sàn, đơn vị mét. Hộp xoay quanh tâm theo rot (độ); tròn thì w là đường kính. */
export interface StageProp {
  id: string;
  name: string;
  /** box: bục, ghế; round: micro đứng, cột; mark: mốc sàn phẳng, chỉ vẽ, không chặn */
  kind: PropKind;
  x: number;
  z: number;
  w: number;
  d: number;
  rot?: number;
}

/** Một mốc đoạn nhạc: từ giây t trở đi là đoạn `label` cho tới mốc sau. */
export interface SongMark {
  id: string;
  t: number;
  label: string;
}

/** Một hình tự lưu: các điểm đã trừ tâm nhóm, không gắn với người nào. */
export interface SavedShape {
  id: string;
  name: string;
  pts: Vec2[];
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

/** Bản sao vũ công dùng chung tệp video gốc (cùng mediaId, cùng độ lệch nhạc);
 *  mỗi bản vẫn có <video> riêng nên sửa offsetSec từng người được. */
export function cloneDancer(src: VDancer, id: string, names: string[], color: string): VDancer {
  const base = src.name.replace(/ \d+$/, "");
  let k = 2;
  while (names.includes(`${base} ${k}`)) k++;
  return { ...src, id, name: `${base} ${k}`, color };
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

/** Kéo mọi chỗ đứng (và điểm uốn đường cong) vào sân + cánh gà (sau khi thu nhỏ sân). Khối không đổi thì giữ đúng đối tượng cũ. */
export function fitFormationsToStage(fs: Formation[], stage: StageSize): Formation[] {
  let changed = false;
  const fit = (m: Record<string, Vec2> | undefined) => {
    let out: Record<string, Vec2> | null = null;
    for (const [id, q] of Object.entries(m ?? {})) {
      const c = clampToStage(q, stage);
      if (c[0] === q[0] && c[1] === q[1]) continue;
      out ??= { ...m };
      out[id] = c;
    }
    return out;
  };
  const out = fs.map((f) => {
    const pos = fit(f.pos), via = fit(f.via);
    if (!pos && !via) return f;
    changed = true;
    return { ...f, ...(pos && { pos }), ...(via && { via }) };
  });
  return changed ? out : fs;
}

// ---------- đường đi cong (Bézier bậc hai) ----------
//
// Lúc chuyển từ P (đội hình trước) sang Q (đội hình sau), người có điểm điều
// khiển V trong `via` của đội hình sau đi theo B(s) = (1-s)²P + 2(1-s)sV + s²Q,
// với s = smoothstep(phần thời gian) như đường thẳng. Không có V thì đi thẳng.

/** Điểm trên đường đi tại tham số s (0..1): thẳng nếu không có điểm điều khiển c. */
export function pathAt(a: Vec2, b: Vec2, c: Vec2 | null | undefined, s: number): Vec2 {
  if (!c) return lerp2(a, b, s);
  const r = 1 - s;
  return [r * r * a[0] + 2 * r * s * c[0] + s * s * b[0], r * r * a[1] + 2 * r * s * c[1] + s * s * b[1]];
}

/** Đạo hàm dB/ds. */
export function pathTangent(a: Vec2, b: Vec2, c: Vec2 | null | undefined, s: number): Vec2 {
  if (!c) return [b[0] - a[0], b[1] - a[1]];
  const r = 1 - s;
  return [2 * r * (c[0] - a[0]) + 2 * s * (b[0] - c[0]), 2 * r * (c[1] - a[1]) + 2 * s * (b[1] - c[1])];
}

/** Độ dài đường đi (m). */
export function pathLength(a: Vec2, b: Vec2, c: Vec2 | null | undefined): number {
  if (!c) return dist(a, b);
  const N = 48;
  let len = 0;
  let p = a;
  for (let i = 1; i <= N; i++) {
    const q = pathAt(a, b, c, i / N);
    len += dist(p, q);
    p = q;
  }
  return len;
}

/** Tốc độ đỉnh nhân với thời gian chuyển: chia cho dur ra m/s. Đường thẳng
 *  theo smoothstep thì đúng bằng 1,5 lần độ dài. */
export function pathPeak(a: Vec2, b: Vec2, c: Vec2 | null | undefined): number {
  if (!c) return 1.5 * dist(a, b);
  const N = 96;
  let m = 0;
  for (let i = 1; i < N; i++) {
    const u = i / N;
    const d = pathTangent(a, b, c, smoothstep(u));
    m = Math.max(m, Math.hypot(d[0], d[1]) * 6 * u * (1 - u));
  }
  return m;
}

/** Đoạn s0..s1 của đường đi, vẫn là Bézier bậc hai: hai đầu và điểm điều
 *  khiển (null nếu đường thẳng). Dùng để vẽ mũi tên rút bớt hai đầu, hay phần
 *  đường còn lại khi đang chuyển. */
export function subPath(a: Vec2, b: Vec2, c: Vec2 | null | undefined, s0: number, s1: number): [Vec2, Vec2, Vec2 | null] {
  const p0 = pathAt(a, b, c, s0), p1 = pathAt(a, b, c, s1);
  if (!c) return [p0, p1, null];
  const d = pathTangent(a, b, c, s0), h = (s1 - s0) / 2;
  return [p0, p1, [p0[0] + h * d[0], p0[1] + h * d[1]]];
}

/** Điểm giữa đường cong (s = 0,5), chỗ đặt núm kéo. */
export const pathMid = (a: Vec2, b: Vec2, c: Vec2 | null | undefined): Vec2 => pathAt(a, b, c, 0.5);

/** Điểm điều khiển để đường cong đi qua m ở giữa (s = 0,5). */
export const viaThrough = (a: Vec2, b: Vec2, m: Vec2): Vec2 => [
  2 * m[0] - (a[0] + b[0]) / 2,
  2 * m[1] - (a[1] + b[1]) / 2,
];

/** Điểm điều khiển của người id cho khoảng chuyển vào đội hình g. */
export const viaOf = (g: Formation | null | undefined, id: string): Vec2 | null => g?.via?.[id] ?? null;

/** Gắn bảng điểm uốn mới vào đội hình: rỗng thì bỏ trường. */
export function withVia(f: Formation, via: Record<string, Vec2>): Formation {
  const { via: _old, ...rest } = f;
  return Object.keys(via).length ? { ...rest, via } : rest;
}

/** Đổi điểm điều khiển khi hai đầu đường dời từ (p0, q0) sang (p1, q1): giữ
 *  vị trí tương đối với dây cung (dọc và vuông góc, theo độ dài dây). mirror
 *  lật phía vuông góc, đúng ảnh gương khi cả hai đầu cùng lật. */
export function remapVia(v: Vec2, p0: Vec2, q0: Vec2, p1: Vec2, q1: Vec2, mirror = false): Vec2 {
  const dx0 = q0[0] - p0[0], dz0 = q0[1] - p0[1];
  const dx1 = q1[0] - p1[0], dz1 = q1[1] - p1[1];
  const L0 = dx0 * dx0 + dz0 * dz0, L1 = dx1 * dx1 + dz1 * dz1;
  const m0: Vec2 = [(p0[0] + q0[0]) / 2, (p0[1] + q0[1]) / 2];
  const m1: Vec2 = [(p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2];
  if (L0 < 1e-12 || L1 < 1e-12) {
    const ox = v[0] - m0[0], oz = v[1] - m0[1];
    return [m1[0] + (mirror ? -ox : ox), m1[1] + oz];
  }
  const rx = v[0] - p0[0], rz = v[1] - p0[1];
  const lam = (rx * dx0 + rz * dz0) / L0;
  let mu = (rx * -dz0 + rz * dx0) / L0;
  if (mirror) mu = -mu;
  return [p1[0] + lam * dx1 - mu * dz1, p1[1] + lam * dz1 + mu * dx1];
}

/** Bám lưới bước `step` (m). Bước 0, âm hoặc không phải số thì giữ nguyên chỗ (khỏi ra NaN). */
export function snapPos(p: Vec2, step: number): Vec2 {
  if (!(step > 0) || !Number.isFinite(step)) return [p[0], p[1]];
  const r = (v: number) => (Number.isFinite(v) ? Math.round(v / step) * step + 0 : v); // +0 bỏ -0
  return [r(p[0]), r(p[1])];
}

export function inWings(p: Vec2, stage: StageSize): boolean {
  return Math.abs(p[0]) > stage.width / 2 + 1e-9;
}

/** Hàng ngang phía trước sân khấu, cách nhau tối đa 1 m, căn giữa. */
export function lineup(ids: string[], stage: StageSize): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  const n = ids.length;
  // sân hẹp hơn 1 m thì đứng dồn một chỗ, không để khoảng cách âm đảo thứ tự
  const gap = n > 1 ? Math.max(0, Math.min(1, (stage.width - 1) / (n - 1))) : 0;
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
      return pathAt(a, b, viaOf(fs[s.k + 1], id), smoothstep(s.u));
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
  // khối trước (nếu có) kết thúc trước t: khối mới không được lùi vào nó
  const lo = fs.reduce((m, f) => (f.end <= t ? Math.max(m, f.end) : m), 0);
  let start = Math.max(0, t);
  let end = start + holdLen;
  if (after) {
    end = Math.min(end, after.start);
    // khoảng trống ngắn hơn MIN_BLOCK thì khối mới lấp vừa khoảng đó, chịu ngắn hơn
    if (end - start < MIN_BLOCK) start = Math.max(lo, end - MIN_BLOCK);
  }
  const pos: Record<string, Vec2> = {};
  const now = posesAt(fs, ids, t, stage);
  for (const id of ids) pos[id] = [now[id][0], now[id][1]];
  let f: Formation = { id: newId, name: nextName(fs), start, end, pos };
  // hướng mặt lúc đó (giữa khoảng chuyển thì góc đang xoay dở, làm tròn về 45 độ)
  f = withFacing(f, Object.fromEntries(ids.map((id) => [id, facingAt(fs, id, t)])));
  let base = fs;
  // tạo giữa một đường cong: chẻ đôi đường (de Casteljau) để hình đi không đổi
  const seg = segmentAt(fs, t);
  const g = seg.kind === "gap" ? fs[seg.k + 1] : null;
  if (seg.kind === "gap" && g?.via) {
    const s = smoothstep(seg.u), P = fs[seg.k].pos;
    const v1: Record<string, Vec2> = {}, v2: Record<string, Vec2> = {};
    for (const [id, v] of Object.entries(g.via)) {
      if (!P[id] || !g.pos[id]) continue;
      if (pos[id]) v1[id] = lerp2(P[id], v, s);
      v2[id] = lerp2(v, g.pos[id], s);
    }
    f = withVia(f, v1);
    base = fs.map((x) => (x === g ? withVia(x, v2) : x));
  }
  return { formations: sortFs([...base, f]), id: newId, created: true };
}

/** Dời chỗ đứng ở đội hình fid. Đường cong vào và ra khỏi đội hình đó giữ
 *  dáng theo hai đầu mới (remapVia); mirror: các chỗ mới là ảnh gương, lật luôn
 *  phía cong.
 *  groupMap: phép biến đổi cả nhóm vừa làm (xoay, giãn quanh tâm nhóm). Khi
 *  có, điểm uốn đi theo nửa phép đó, V' = (V + T(V)) / 2: một đầu đường đứng
 *  yên, một đầu đi theo T, điểm điều khiển chịu ảnh hưởng đều của hai đầu (với
 *  phép dời thì trùng cách dời theo dây cung). Quay trọn V theo T thì đầu đứng
 *  yên bị vặn thành vòng thắt.
 *  dropVia: bỏ điểm uốn của người được dời (Đổi chỗ: đường cũ hết nghĩa). */
export function setPositions(
  fs: Formation[], fid: string, moves: Record<string, Vec2>, stage: StageSize,
  o: { mirror?: boolean; groupMap?: (v: Vec2) => Vec2; dropVia?: boolean } = {},
): Formation[] {
  const i = fs.findIndex((f) => f.id === fid);
  if (i < 0) return fs;
  const f = fs[i], prev = fs[i - 1], next = fs[i + 1];
  const pos = { ...f.pos };
  for (const [id, p] of Object.entries(moves)) pos[id] = clampToStage(p, stage);
  const remap = (g: Formation, ends: (id: string) => [Vec2, Vec2, Vec2, Vec2] | null) => {
    if (!g.via) return g;
    let via: Record<string, Vec2> | null = null;
    for (const [id, v] of Object.entries(g.via)) {
      if (!(id in moves)) continue;
      const e = ends(id);
      via ??= { ...g.via };
      if (!e || o.dropVia) delete via[id];
      else if (o.groupMap) {
        const t = o.groupMap(v);
        via[id] = clampToStage([(v[0] + t[0]) / 2, (v[1] + t[1]) / 2], stage);
      } else via[id] = clampToStage(remapVia(v, e[0], e[1], e[2], e[3], o.mirror), stage);
    }
    return via ? withVia(g, via) : g;
  };
  const into = remap({ ...f, pos }, (id) =>
    prev?.pos[id] && f.pos[id] ? [prev.pos[id], f.pos[id], prev.pos[id], pos[id]] : null);
  const out = next && remap(next, (id) =>
    f.pos[id] && next.pos[id] ? [f.pos[id], next.pos[id], pos[id], next.pos[id]] : null);
  return fs.map((x, j) => (j === i ? into : j === i + 1 && out ? out : x));
}

/** Đặt (hoặc bỏ, v = null) điểm điều khiển đường cong của người id lúc chuyển vào đội hình fid. */
export function setVia(fs: Formation[], fid: string, id: string, v: Vec2 | null, stage: StageSize): Formation[] {
  const i = fs.findIndex((f) => f.id === fid);
  if (i < 1) return fs;
  const f = fs[i];
  if (!v && !f.via?.[id]) return fs;
  const via = { ...f.via };
  if (v) via[id] = clampToStage(v, stage);
  else delete via[id];
  return fs.map((x, j) => (j === i ? withVia(x, via) : x));
}

/** Một đường cong đã chép: điểm điều khiển v cùng hai đầu a (chỗ trước), b (chỗ đến) lúc chép. */
export interface CopiedPath { v: Vec2; a: Vec2; b: Vec2 }

/** Đường cong vào đội hình fid của những người ids (để Ctrl C mang theo). */
export function pathsInto(fs: Formation[], fid: string, ids: string[]): Record<string, CopiedPath> {
  const i = fs.findIndex((f) => f.id === fid);
  const out: Record<string, CopiedPath> = {};
  if (i < 1) return out;
  const f = fs[i], prev = fs[i - 1];
  for (const id of ids) {
    const v = f.via?.[id], a = prev.pos[id], b = f.pos[id];
    if (v && a && b) out[id] = { v: [v[0], v[1]], a: [a[0], a[1]], b: [b[0], b[1]] };
  }
  return out;
}

/** Dưới khoảng này (m) người coi như đứng yên: không dán đường cong, không hiện núm uốn. */
export const BEND_MIN_M = 0.3;

/** Ctrl V: đặt đường cong đã chép vào đội hình fid, dời theo hai đầu mới
 *  (remapVia: chỗ trước ở đội hình đích có thể khác chỗ trước lúc chép). Đội
 *  hình đầu không có đường vào; người gần như đứng yên ở đích thì bỏ qua. */
export function pasteVia(fs: Formation[], fid: string, paths: Record<string, CopiedPath>, stage: StageSize): Formation[] {
  const i = fs.findIndex((f) => f.id === fid);
  if (i < 1) return fs;
  const f = fs[i], prev = fs[i - 1];
  let via: Record<string, Vec2> | null = null;
  for (const [id, c] of Object.entries(paths)) {
    const a = prev.pos[id], b = f.pos[id];
    if (!a || !b || dist(a, b) < BEND_MIN_M) continue;
    via ??= { ...f.via };
    via[id] = clampToStage(remapVia(c.v, c.a, c.b, a, b), stage);
  }
  return via ? fs.map((x, j) => (j === i ? withVia(x, via!) : x)) : fs;
}

/** Chỗ đặt núm uốn đường a→b (c: điểm điều khiển) trên sơ đồ. Thường là giữa
 *  đường; giữa đường cách chấm người (ở a) dưới gap thì đẩy ra vuông góc với
 *  dây cung (về phía đang cong) cho khỏi đè chấm. Đi dưới BEND_MIN_M mà chưa
 *  cong thì null (ẩn núm). Kéo núm thì giữ khoảng lệch lúc bấm so với giữa
 *  đường thật (pathMid), nên đường không giật. */
export function bendHandleAt(a: Vec2, b: Vec2, c: Vec2 | null | undefined, gap = 0.6): Vec2 | null {
  if (!c && dist(a, b) < BEND_MIN_M) return null;
  const m = pathMid(a, b, c);
  const wx = m[0] - a[0], wz = m[1] - a[1];
  if (Math.hypot(wx, wz) >= gap) return m;
  const L = dist(a, b);
  // pháp tuyến đơn vị của dây cung; dây quá ngắn thì theo hướng a→m, không có nữa thì lên trên
  let n: Vec2 = L > 1e-6 ? [-(b[1] - a[1]) / L, (b[0] - a[0]) / L] : [0, -1];
  if (L <= 1e-6 && Math.hypot(wx, wz) > 1e-6) n = [wx / Math.hypot(wx, wz), wz / Math.hypot(wx, wz)];
  else {
    const cm: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((m[0] - cm[0]) * n[0] + (m[1] - cm[1]) * n[1] < 0) n = [-n[0], -n[1]];
  }
  // tìm t > 0 nhỏ nhất để |m + t n - a| = gap
  const wn = wx * n[0] + wz * n[1];
  const t = -wn + Math.sqrt(Math.max(0, wn * wn - (wx * wx + wz * wz) + gap * gap));
  return [m[0] + t * n[0], m[1] + t * n[1]];
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
  // ghi chú riêng (cầm quạt, đội nón...) thường còn đúng ở đội hình kế: chép theo, sửa sau
  const notes: Record<string, string> = {};
  for (const id of ids) if (cur.notes?.[id]) notes[id] = cur.notes[id];
  // hướng mặt cũng chép theo như chỗ đứng
  const facing: Record<string, number> = {};
  for (const id of ids) if (cur.facing?.[id]) facing[id] = cur.facing[id];
  out.push(withFacing(withNotes({ id: newId, name: nextName(fs), start, end, pos }, notes), facing));
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
  const i = fs.findIndex((f) => f.id === id);
  if (i < 0) return fs;
  const gone = fs[i], prev = fs[i - 1], next = fs[i + 1];
  let nx = next;
  // đường cong vào đội hình sau giờ đi từ đội hình trước: giữ dáng theo đầu mới
  if (next?.via) {
    const via: Record<string, Vec2> = {};
    if (prev)
      for (const [d, v] of Object.entries(next.via)) {
        const p0 = gone.pos[d], p1 = prev.pos[d], q = next.pos[d];
        if (p0 && p1 && q) via[d] = remapVia(v, p0, q, p1, q);
      }
    nx = withVia(next, via);
  }
  return fs.filter((f) => f !== gone).map((f) => (f === next ? nx : f));
}

export function renameFormation(fs: Formation[], id: string, name: string): Formation[] {
  return fs.map((f) => (f.id === id ? { ...f, name } : f));
}

/** Đặt ghi chú; chuỗi rỗng thì bỏ trường. */
export function setFormationNote(fs: Formation[], id: string, note: string): Formation[] {
  const v = note.trim();
  return fs.map((f) => {
    if (f.id !== id) return f;
    const { note: _old, ...rest } = f;
    return v ? { ...rest, note: v } : rest;
  });
}

// ---------- ghi chú riêng từng người ----------

/** Ghi chú riêng dài tối đa bấy nhiêu ký tự (đếm ký tự thật, biểu tượng cảm xúc tính một). */
export const PERSON_NOTE_MAX = 200;

/** Cắt chuỗi còn tối đa n ký tự thật (Array.from) để không xẻ đôi biểu tượng cảm xúc; bị cắt thì thêm "…". */
export function clipChars(s: string, n: number): string {
  const cs = Array.from(s);
  return cs.length > n ? `${cs.slice(0, Math.max(0, n - 1)).join("")}…` : s;
}

/** Làm sạch một ghi chú riêng: gộp khoảng trắng, cắt hai đầu, cắt độ dài (không thêm "…"). */
export function cleanPersonNote(s: string): string {
  return Array.from(s.replace(/\s+/g, " ").trim()).slice(0, PERSON_NOTE_MAX).join("").trim();
}

/** Ghi chú riêng của người id ở đội hình f, không có thì "". */
export const personNote = (f: Formation | null | undefined, id: string): string => f?.notes?.[id] ?? "";

/** Gắn bảng ghi chú mới vào đội hình: rỗng thì bỏ trường. */
export function withNotes(f: Formation, notes: Record<string, string>): Formation {
  const { notes: _old, ...rest } = f;
  return Object.keys(notes).length ? { ...rest, notes } : rest;
}

/** Đặt ghi chú riêng của người did ở đội hình fid; chuỗi rỗng thì xoá. Không đổi gì thì giữ đúng mảng cũ. */
export function setPersonNote(fs: Formation[], fid: string, did: string, text: string): Formation[] {
  const v = cleanPersonNote(text);
  const f = fs.find((x) => x.id === fid);
  if (!f || personNote(f, did) === v) return fs;
  const notes = { ...f.notes };
  if (v) notes[did] = v;
  else delete notes[did];
  return fs.map((x) => (x === f ? withNotes(x, notes) : x));
}

/**
 * Chỉ số đội hình mà ghi chú tại t thuộc về: đang đứng thì đội hình đó, đang
 * chuyển thì đội hình sắp tới (như ghi chú đội hình lúc trình chiếu), trước khối
 * đầu thì khối đầu, sau khối cuối thì khối cuối. Chưa có đội hình: -1.
 */
export function noteIndexAt(fs: Formation[], t: number): number {
  const s = segmentAt(fs, t);
  if (s.kind === "none") return -1;
  return s.kind === "gap" ? s.k + 1 : s.k;
}

/** Các cột đứng trong cánh gà, từ giữa cánh gà ra hai bên (mét, trị tuyệt đối). */
const wingCols = (stage: StageSize) => {
  const c = stage.width / 2 + WING / 2;
  return [c, c - WING / 3, c + WING / 3];
};

/** Chỗ trống trong cánh gà (trái −1, phải +1; từ trước ra sau) cho người mới
 *  thêm. Cột giữa trước, cách nhau 1 m để tên trên sơ đồ không đè lên nhau,
 *  rồi chen 0.5 m, rồi sang hai cột bên. Kín hết thì null. */
export function freeWingSpot(taken: Vec2[], stage: StageSize, side: -1 | 1): Vec2 | null {
  const hz = stage.depth / 2;
  for (const cx of wingCols(stage))
    for (const step of [1, 0.5])
      for (let z = hz - 0.5; z >= -hz + 0.25; z -= step) {
        const p: Vec2 = [side * cx, Math.round(z * 100) / 100];
        if (taken.every((q) => dist(p, q) > step * 0.8)) return p;
      }
  return null;
}

/** Chỗ trong cánh gà bên side: chỗ trống đầu tiên, kín hết thì chỗ thưa người nhất. */
export function wingSpot(taken: Vec2[], stage: StageSize, side: -1 | 1 = -1): Vec2 {
  const free = freeWingSpot(taken, stage, side);
  if (free) return free;
  const hz = stage.depth / 2;
  let best: Vec2 = [side * wingCols(stage)[0], 0];
  let room = -1;
  for (const cx of wingCols(stage))
    for (let z = hz - 0.25; z >= -hz + 0.25 - 1e-9; z -= 0.25) {
      const p: Vec2 = [side * cx, Math.round(z * 100) / 100];
      const r = Math.min(...taken.map((q) => dist(p, q)));
      if (r > room + 1e-9) { room = r; best = p; }
    }
  return best;
}

export const MIN_GAP = 0.8; // khoảng cách tối thiểu khi đặt bản sao cạnh nhau

/**
 * Điểm trống TRÊN SÂN (không phải cánh gà) gần `near` nhất, cách mọi điểm
 * `taken` ít nhất `gap` mét. Dò theo các vòng lưới quanh `near` (bước gap/2),
 * ưu tiên điểm gần nhất, hoà thì ưu tiên cùng hàng rồi lệch phải. Hết chỗ: null.
 */
export function spotNear(near: Vec2, taken: Vec2[], stage: StageSize, gap = MIN_GAP): Vec2 | null {
  const hx = stage.width / 2 - 0.25;
  const hz = stage.depth / 2 - 0.25;
  const step = gap / 2;
  const cands: { p: Vec2; d: number }[] = [];
  const R = Math.ceil(Math.hypot(stage.width, stage.depth) / step);
  for (let i = -R; i <= R; i++)
    for (let j = -R; j <= R; j++) {
      const p: Vec2 = [Math.round((near[0] + i * step) * 100) / 100, Math.round((near[1] + j * step) * 100) / 100];
      if (Math.abs(p[0]) > hx || Math.abs(p[1]) > hz) continue;
      // cùng hàng (j = 0) được ưu tiên nhẹ, rồi bên phải trước bên trái
      cands.push({ p, d: Math.hypot(i, j) + (j !== 0 ? 0.01 : 0) + (i < 0 ? 0.001 : 0) });
    }
  cands.sort((a, b) => a.d - b.d);
  for (const { p } of cands) if (taken.every((q) => dist(p, q) >= gap - 1e-9)) return p;
  return null;
}

/**
 * Đặt các bản sao `newIds` vào mọi đội hình: cạnh vị trí bản gốc `srcId` ở
 * đội hình đó nếu bản gốc đang trên sân và còn chỗ, không thì vào cánh gà.
 */
export function placeClones(
  fs: Formation[], srcId: string, newIds: string[], stage: StageSize, gap = MIN_GAP,
): Formation[] {
  const placed = fs.map((f) => {
    // bản sao múa cùng video nên mang theo ghi chú riêng của bản gốc ở từng đội hình
    const srcNote = personNote(f, srcId);
    if (srcNote) f = withNotes(f, { ...f.notes, ...Object.fromEntries(newIds.map((id) => [id, srcNote])) });
    f = copyFacing(f, srcId, newIds);
    const pos = { ...f.pos };
    const src = pos[srcId];
    // cánh gà gần bản gốc trước, kín thì sang bên kia
    const side: -1 | 1 = src && src[0] > 0 ? 1 : -1;
    for (const id of newIds) {
      if (pos[id]) continue;
      const taken = Object.values(pos);
      const p = src && !inWings(src, stage) ? spotNear(src, taken, stage, gap) : null;
      pos[id] = p ?? freeWingSpot(taken, stage, side) ?? freeWingSpot(taken, stage, side === 1 ? -1 : 1)
        ?? wingSpot(taken, stage, side);
    }
    return { ...f, pos };
  });
  // bản gốc đi đường cong: bản sao đứng cạnh ở cả hai đầu thì đi đường cong
  // song song (dời theo độ lệch trung bình hai đầu); đứng xa thì đi thẳng
  return placed.map((g, k) => {
    const v = g.via?.[srcId];
    const f = placed[k - 1];
    if (!v || !f) return g;
    const via = { ...g.via };
    let add = false;
    for (const id of newIds) {
      const a = f.pos[srcId], b = g.pos[srcId], ca = f.pos[id], cb = g.pos[id];
      if (via[id] || !a || !b || !ca || !cb || dist(a, ca) > CLONE_CURVE_M || dist(b, cb) > CLONE_CURVE_M) continue;
      via[id] = clampToStage([v[0] + (ca[0] - a[0] + cb[0] - b[0]) / 2, v[1] + (ca[1] - a[1] + cb[1] - b[1]) / 2], stage);
      add = true;
    }
    return add ? { ...g, via } : g;
  });
}

/** Bản sao đứng cách bản gốc dưới khoảng này ở cả hai đầu thì chép đường cong. */
const CLONE_CURVE_M = 2;

/**
 * Lệch canon: trong những người đang chọn, chỉ những ai dùng CHUNG video với
 * người dẫn (người đầu tiên theo thứ tự danh sách có video) mới được đặt lại
 * offset = offset người dẫn + k·step. Người dùng video khác đã khớp nhạc riêng,
 * ghi đè sẽ làm lệch họ khỏi nhạc nên giữ nguyên. Không ai có video thì lấy
 * người đầu tiên làm dẫn.
 */
export function canonOffsets(dancers: VDancer[], ids: string[], step: number): Record<string, number> {
  const order = dancers.filter((d) => ids.includes(d.id));
  const out: Record<string, number> = {};
  if (!order.length) return out;
  const lead = order.find((d) => d.mediaId) ?? order[0];
  const base = lead.offsetSec;
  order
    .filter((d) => (d.mediaId ?? null) === (lead.mediaId ?? null))
    .forEach((d, k) => { out[d.id] = Math.round((base + k * step) * 1000) / 1000; });
  return out;
}

// ---------- canon theo đoạn ----------

export type CanonOrder = "list" | "ltr" | "rtl" | "center" | "front";
export const CANON_ORDER_LABEL: Record<CanonOrder, string> = {
  list: "Theo danh sách",
  ltr: "Trái sang phải",
  rtl: "Phải sang trái",
  center: "Giữa trước, hai bên sau",
  front: "Hàng đầu trước",
};

/**
 * Lượt vào canon của từng người (0 vào trước). pos là chỗ đứng lúc bắt đầu
 * đoạn; trái phải tính theo khán giả nhìn. Những người gần như cùng chỗ theo
 * tiêu chí (lệch dưới tol mét, ví dụ hai người đối xứng khi "giữa trước") vào
 * cùng một lượt.
 */
export function canonRanks(
  ids: string[], dancers: VDancer[], pos: Record<string, Vec2>, how: CanonOrder, tol = 0.3,
): Record<string, number> {
  const order = dancers.filter((d) => ids.includes(d.id)).map((d) => d.id);
  const out: Record<string, number> = {};
  if (how === "list") {
    order.forEach((id, k) => { out[id] = k; });
    return out;
  }
  const at = (id: string) => pos[id] ?? [0, 0];
  const cx = order.reduce((s, id) => s + at(id)[0], 0) / Math.max(1, order.length);
  const key = (id: string) => {
    const q = at(id);
    if (how === "ltr") return q[0];
    if (how === "rtl") return -q[0];
    if (how === "center") return Math.abs(q[0] - cx);
    return -q[1]; // front: gần khán giả (z lớn) vào trước
  };
  const sorted = order.map((id, i) => ({ id, i, k: key(id) })).sort((a, b) => a.k - b.k || a.i - b.i);
  let rank = -1;
  let head = -Infinity;
  for (const s of sorted) {
    if (s.k - head > tol) {
      rank++;
      head = s.k;
    }
    out[s.id] = rank;
  }
  return out;
}

/** Ai nằm bên phải khán giả so với giữa nhóm (để lật gương thành cặp đối xứng). */
export function rightSide(ids: string[], pos: Record<string, Vec2>, tol = 0.15): string[] {
  const xs = ids.map((id) => pos[id]?.[0] ?? 0);
  const cx = xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  return ids.filter((_, k) => xs[k] > cx + tol);
}

export function addDancerToAll(fs: Formation[], id: string, stage: StageSize): Formation[] {
  return fs.map((f) => {
    if (f.pos[id]) return f;
    return { ...f, pos: { ...f.pos, [id]: wingSpot(Object.values(f.pos), stage) } };
  });
}

export function removeDancerFromAll(fs: Formation[], id: string): Formation[] {
  return fs.map((f) => {
    if (!(id in f.pos) && !f.notes?.[id] && !f.via?.[id] && !f.facing?.[id]) return f;
    const pos = { ...f.pos };
    delete pos[id];
    let out: Formation = { ...f, pos };
    if (f.notes?.[id]) {
      const notes = { ...f.notes };
      delete notes[id];
      out = withNotes(out, notes);
    }
    if (f.via?.[id]) {
      const via = { ...f.via };
      delete via[id];
      out = withVia(out, via);
    }
    return dropFacing(out, id);
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
    for (const [id, v] of Object.entries(f.notes ?? {}))
      if (!ids.includes(id) || typeof v !== "string" || !v) errs.push(`${f.name}: ghi chú riêng hỏng (${id})`);
    if (f.via && k === 0) errs.push(`${f.name}: đội hình đầu có đường cong`);
    for (const [id, v] of Object.entries(f.facing ?? {}))
      if (!ids.includes(id) || typeof v !== "number" || !v || normFacing(v) !== v) errs.push(`${f.name}: hướng mặt hỏng (${id})`);
    for (const [id, v] of Object.entries(f.via ?? {})) {
      if (!ids.includes(id) || !Array.isArray(v) || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
        errs.push(`${f.name}: đường cong hỏng (${id})`);
        continue;
      }
      const c = clampToStage(v, p.stage);
      if (c[0] !== v[0] || c[1] !== v[1]) errs.push(`${f.name}: đường cong của ${id} ra ngoài sân`);
    }
    for (const [id, q] of Object.entries(f.pos)) {
      const c = clampToStage(q, p.stage);
      if (c[0] !== q[0] || c[1] !== q[1]) errs.push(`${f.name}: ${id} ngoài sân`);
    }
  });
  for (const s of p.myShapes ?? []) {
    if (!s.pts.length) errs.push(`hình ${s.name}: không có điểm`);
    if (s.pts.some((q) => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) errs.push(`hình ${s.name}: điểm hỏng`);
  }
  const propIds = new Set<string>();
  for (const o of p.props ?? []) {
    if (propIds.has(o.id)) errs.push(`đạo cụ ${o.name}: trùng id`);
    propIds.add(o.id);
    if (![o.x, o.z, o.w, o.d].every(Number.isFinite) || !(o.w > 0 && o.d > 0)) errs.push(`đạo cụ ${o.name}: số hỏng`);
    const c = clampToStage([o.x, o.z], p.stage);
    if (c[0] !== o.x || c[1] !== o.z) errs.push(`đạo cụ ${o.name}: ngoài sân`);
  }
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

const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

function centroid(current: Record<string, Vec2>, ids: string[]): Vec2 {
  let x = 0, z = 0;
  for (const id of ids) { x += current[id][0]; z += current[id][1]; }
  return [x / ids.length, z / ids.length];
}

/** Giữ cả nhóm trong sân khấu (cách mép pad): to quá thì thu quanh tâm, rồi dời vào trong. */
export function fitGroup(pts: Record<string, Vec2>, stage: StageSize, pad = 0.3): Record<string, Vec2> {
  const ids = Object.keys(pts);
  if (!ids.length) return pts;
  const m = fitMap(pts, stage, pad);
  const out: Record<string, Vec2> = {};
  for (const id of ids) {
    const q = m(pts[id]);
    out[id] = [r3(q[0]), r3(q[1])];
  }
  return out;
}

/** Phép thu và dời của fitGroup, dùng được cho điểm khác (điểm uốn đường cong). */
function fitMap(pts: Record<string, Vec2>, stage: StageSize, pad = 0.3): (q: Vec2) => Vec2 {
  const ids = Object.keys(pts);
  if (!ids.length) return (q) => q;
  const hx = Math.max(0, stage.width / 2 - pad), hz = Math.max(0, stage.depth / 2 - pad);
  const xs = ids.map((id) => pts[id][0]), zs = ids.map((id) => pts[id][1]);
  let [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const k = Math.min(1, x1 - x0 > 1e-9 ? (2 * hx) / (x1 - x0) : 1, z1 - z0 > 1e-9 ? (2 * hz) / (z1 - z0) : 1);
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  [x0, x1, z0, z1] = [cx + (x0 - cx) * k, cx + (x1 - cx) * k, cz + (z0 - cz) * k, cz + (z1 - cz) * k];
  const dx = x0 < -hx ? -hx - x0 : x1 > hx ? hx - x1 : 0;
  const dz = z0 < -hz ? -hz - z0 : z1 > hz ? hz - z1 : 0;
  return (q) => [cx + (q[0] - cx) * k + dx, cz + (q[1] - cz) * k + dz];
}

/** Xoay nhóm một phần tư vòng quanh tâm nhóm, chiều kim đồng hồ khi nhìn sơ đồ (dir = 1). */
export function rotateGroup(current: Record<string, Vec2>, ids: string[], dir: 1 | -1, stage: StageSize): Record<string, Vec2> {
  return rotateGroupMap(current, ids, dir, stage).moves;
}

/** Như rotateGroup, kèm phép biến đổi đã dùng (xoay rồi thu, dời cho vừa sân) để dời điểm uốn. */
export function rotateGroupMap(
  current: Record<string, Vec2>, ids: string[], dir: 1 | -1, stage: StageSize,
): { moves: Record<string, Vec2>; map: (v: Vec2) => Vec2 } {
  if (!ids.length) return { moves: {}, map: (v) => v };
  const [cx, cz] = centroid(current, ids);
  const rot = (q: Vec2): Vec2 => {
    const [dx, dz] = [q[0] - cx, q[1] - cz];
    return dir === 1 ? [cx - dz, cz + dx] : [cx + dz, cz - dx];
  };
  const out: Record<string, Vec2> = {};
  for (const id of ids) out[id] = rot(current[id]);
  const fm = fitMap(out, stage);
  return { moves: fitGroup(out, stage), map: (v) => fm(rot(v)) };
}

/**
 * Giãn (k > 1) hay thu (k < 1) nhóm quanh tâm nhóm. Giãn thì dừng ở mép sân,
 * thu thì không cho hai người gần nhau dưới minGap. Không đổi được thì null.
 */
export function scaleGroup(
  current: Record<string, Vec2>, ids: string[], k: number, stage: StageSize, minGap = 0.5, pad = 0.3,
): Record<string, Vec2> | null {
  return scaleGroupMap(current, ids, k, stage, minGap, pad)?.moves ?? null;
}

/** Như scaleGroup, kèm phép co giãn đã dùng (quanh tâm nhóm) để dời điểm uốn. */
export function scaleGroupMap(
  current: Record<string, Vec2>, ids: string[], k: number, stage: StageSize, minGap = 0.5, pad = 0.3,
): { moves: Record<string, Vec2>; map: (v: Vec2) => Vec2 } | null {
  if (ids.length < 2) return null;
  const [cx, cz] = centroid(current, ids);
  const hx = stage.width / 2 - pad, hz = stage.depth / 2 - pad;
  let kk = k;
  if (k > 1) {
    for (const id of ids) {
      const [dx, dz] = [current[id][0] - cx, current[id][1] - cz];
      if (Math.abs(dx) > 1e-9) kk = Math.min(kk, Math.max(1, ((dx > 0 ? hx : -hx) - cx) / dx));
      if (Math.abs(dz) > 1e-9) kk = Math.min(kk, Math.max(1, ((dz > 0 ? hz : -hz) - cz) / dz));
    }
  } else {
    let near = Infinity;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        near = Math.min(near, Math.hypot(current[ids[i]][0] - current[ids[j]][0], current[ids[i]][1] - current[ids[j]][1]));
    if (near > 1e-9) kk = Math.max(kk, Math.min(1, minGap / near));
  }
  if (Math.abs(kk - 1) < 1e-3) return null;
  const out: Record<string, Vec2> = {};
  for (const id of ids) out[id] = [r3(cx + (current[id][0] - cx) * kk), r3(cz + (current[id][1] - cz) * kk)];
  return { moves: out, map: (v) => [cx + (v[0] - cx) * kk, cz + (v[1] - cz) * kk] };
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

// ---------- hình của tôi ----------

/**
 * Chụp hình dạng của nhóm: điểm đã trừ tâm nhóm, làm tròn tới milimét, xếp
 * từ sau ra trước rồi trái sang phải để không còn dấu vết thứ tự người.
 */
export function captureShape(current: Record<string, Vec2>, ids: string[]): Vec2[] {
  const have = ids.filter((id) => current[id]);
  if (!have.length) return [];
  const [cx, cz] = centroid(current, have);
  return have
    .map((id): Vec2 => [r3(current[id][0] - cx), r3(current[id][1] - cz)])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export interface SavedShapeFit {
  /** vị trí mới của những người được xếp vào hình */
  moves: Record<string, Vec2>;
  /** người không có chỗ trong hình (nhóm đông hơn số điểm), giữ chỗ cũ */
  kept: string[];
  /** số điểm của hình bị bỏ (nhóm ít hơn số điểm) */
  unused: number;
}

/**
 * Áp hình đã lưu cho nhóm `ids` quanh tâm nhóm hiện tại, gán người theo đường
 * gần nhất rồi dời cả hình cho vừa sân. Nhóm đông hơn số điểm: chỉ những người
 * đi ít nhất được xếp, còn lại giữ chỗ. Nhóm ít hơn: dùng các điểm gần tâm hình nhất.
 */
export function fitSavedShape(
  current: Record<string, Vec2>, ids: string[], pts: Vec2[], stage: StageSize,
): SavedShapeFit {
  const group = ids.filter((id) => current[id]);
  if (!group.length || !pts.length) return { moves: {}, kept: group, unused: 0 };
  const [cx, cz] = centroid(current, group);
  let use = pts;
  let unused = 0;
  if (group.length < pts.length) {
    use = pts.map((q, i) => ({ q, i, d: q[0] ** 2 + q[1] ** 2 }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .slice(0, group.length)
      .map((o) => o.q);
    unused = pts.length - group.length;
  }
  const abs = use.map((q): Vec2 => [cx + q[0], cz + q[1]]);
  const from = group.map((id) => current[id]);
  const placed: Record<string, Vec2> = {};
  const kept: string[] = [];
  if (group.length <= abs.length) {
    const asg = assignNearest(from, abs);
    group.forEach((id, i) => { placed[id] = abs[asg[i]]; });
  } else {
    // gán ngược: mỗi điểm chọn một người, ai không được chọn thì đứng yên
    const asg = assignNearest(abs, from);
    const taken = new Set(asg);
    asg.forEach((k, j) => { placed[group[k]] = abs[j]; });
    group.forEach((id, i) => { if (!taken.has(i)) kept.push(id); });
  }
  const fitted = fitGroup(placed, stage);
  const moves: Record<string, Vec2> = {};
  for (const id of Object.keys(fitted)) moves[id] = clampToStage(fitted[id], stage);
  return { moves, kept, unused };
}

// ---------- cảnh báo ----------

export interface Warning {
  kind: "fast" | "collide" | "overlap" | "blocked" | "prop"; // blocked: bị che, prop: đi xuyên đạo cụ, chỉ checks.ts sinh ra
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
      // smoothstep: tốc độ đỉnh = 1.5 lần tốc độ trung bình (đường cong: tính theo đạo hàm)
      const peak = dur > 1e-6 ? pathPeak(a, b, viaOf(g, d.id)) / dur : len > 0.05 ? Infinity : 0;
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
        const ca = viaOf(g, vis[i].id), cb = viaOf(g, vis[j].id);
        for (let s = 1; s < S; s++) {
          const u = smoothstep(s / S);
          if (dist(pathAt(a0, a1, ca, u), pathAt(b0, b1, cb, u)) < NEAR_M) {
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
