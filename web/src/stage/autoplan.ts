// "Tự chia đội hình": một bấm ra cả bài. THUẦN, chỉ import model/timing để
// chạy được cả trong Vite lẫn `node --test`.
//
// Cách làm, theo thứ tự:
//  1. Chọn hình cho từng đội hình (xoay vòng danh sách kiểu hình), đặt hình gọn
//     trong sàn diễn (không ai vào cánh gà), gán người bằng assignNearest từ đội
//     hình trước. Gán tổng bình phương quãng đường nhỏ nhất có tính chất hay:
//     khi mọi người đi thẳng cùng nhịp thì ít khi cắt nhau (kết quả CAPT của
//     Turpin, Michael, Kumar 2014). Vẫn còn va thì thử hoán đổi gán, lật hình,
//     hoặc đổi sang kiểu hình khác.
//  2. Chia thời gian: điểm đổi đội hình nằm trên vạch lượt 8 (có BPM) hoặc mốc
//     4 s đều (không BPM). Nếu có điểm số "nhạc đổi mạnh" theo thời gian thì
//     dời điểm đổi tới vạch có điểm cao nhất gần đó.
//  3. Khoảng chuyển nằm ngay TRƯỚC điểm đổi, nên mọi người tới đội hình mới
//     đúng phách 1. Khoảng chuyển tối thiểu 1 lượt 8 (hoặc 2 s), giãn thêm khi
//     đường xa để tốc độ đỉnh không quá VMAX. Đoạn quá ngắn không kịp đi tới
//     hình mới thì giữ nguyên đội hình cũ qua điểm đổi đó (bớt một đội hình)
//     chứ không bắt ai chạy quá VMAX.
//  Đông người: kiểu hình nào làm hai người đứng gần hơn CLEAR_M thì bỏ, không
//  kiểu nào đủ chỗ thì chỉ dùng các kiểu thoáng nhất.

import {
  type Formation, type ShapeKind, type StageSize, type Vec2,
  SHAPE_LABEL, assignNearest, dist, shapePoints, snapPos,
} from "./model.ts";
import { beatLen } from "./timing.ts";

/** Tốc độ đỉnh tối đa khi chuyển (m/s). Smoothstep: đỉnh = 1.5 lần trung bình. */
export const VMAX = 1.5;
/** Gần hơn khoảng này trong lúc chuyển là coi như va nhau (m). */
export const CLEAR_M = 0.5;
/** Lề trong sàn diễn khi đặt hình: cách mép trái phải và trước sau. */
export const MARGIN_X = 0.5;
export const MARGIN_Z = 0.4;
/** Không có BPM: coi một "lượt 8" là 4 s (8 phách ở 120 BPM). */
export const PSEUDO_EIGHT = 4;

export const DEFAULT_SHAPES: ShapeKind[] = ["line", "v", "circle", "twoLines", "diagonal", "stagger", "arc"];

export interface AutoPlanOpts {
  ids: string[];
  stage: StageSize;
  duration: number; // độ dài bài (s)
  bpm?: number | null;
  downbeat?: number; // giây của phách 1 đầu tiên
  count?: number; // số đội hình mong muốn (ưu tiên hơn everyEights)
  everyEights?: number; // hoặc mỗi N lượt 8 một đội hình (mặc định 4)
  shapes?: ShapeKind[];
  start?: Record<string, Vec2>; // vị trí hiện có, để gán đội hình đầu cho ít xáo trộn
  changeScore?: (t: number) => number; // điểm "nhạc đổi mạnh" tại t, càng cao càng nên đổi
  newId?: (k: number) => string;
}

// ---------- hình học khi chuyển ----------

/**
 * Khoảng cách nhỏ nhất giữa hai người trong lúc cùng trượt từ a0→a1 và b0→b1.
 * Mọi người dùng chung một tham số u = smoothstep(thời gian) nên quỹ đạo tương
 * đối là đoạn thẳng theo u: lấy cực tiểu chính xác, không cần lấy mẫu.
 */
export function pairClearance(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  const ax = a0[0] - b0[0], az = a0[1] - b0[1];
  const bx = a1[0] - b1[0] - ax, bz = a1[1] - b1[1] - az;
  const bb = bx * bx + bz * bz;
  const u = bb > 1e-12 ? Math.min(1, Math.max(0, -(ax * bx + az * bz) / bb)) : 0;
  return Math.hypot(ax + u * bx, az + u * bz);
}

export interface Clearance {
  min: number; // khoảng cách nhỏ nhất giữa hai người bất kỳ trong lúc chuyển
  hits: number; // số cặp gần hơn CLEAR_M
  pair: [number, number] | null; // cặp gần nhất (chỉ số)
}

export function clearance(from: Vec2[], to: Vec2[], near = CLEAR_M): Clearance {
  let min = Infinity;
  let hits = 0;
  let pair: [number, number] | null = null;
  for (let i = 0; i < from.length; i++)
    for (let j = i + 1; j < from.length; j++) {
      const d = pairClearance(from[i], to[i], from[j], to[j]);
      if (d < near) hits++;
      if (d < min) { min = d; pair = [i, j]; }
    }
  return { min, hits, pair };
}

/** Khoảng cách nhỏ nhất giữa hai người trong mọi khoảng chuyển của dãy đội hình. */
export function minTransitionGap(fs: Formation[], ids: string[]): number {
  let m = Infinity;
  for (let k = 0; k + 1 < fs.length; k++) {
    const a = ids.map((id) => fs[k].pos[id]);
    const b = ids.map((id) => fs[k + 1].pos[id]);
    m = Math.min(m, clearance(a, b).min);
  }
  return m;
}

// ---------- đặt hình gọn trong sàn ----------

export function minPairDist(pts: Vec2[]): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) m = Math.min(m, dist(pts[i], pts[j]));
  return m;
}

/** Điểm của hình, căn giữa sàn, co lại nếu tràn, bám lưới 25 cm khi không làm ai sát nhau. */
export function fittedShape(kind: ShapeKind, n: number, stage: StageSize, mirror = false): Vec2[] {
  const raw = shapePoints(kind, n, [0, 0], Math.max(1, stage.width - 2));
  if (!raw.length) return [];
  const hx = stage.width / 2 - MARGIN_X;
  const hz = Math.max(0.1, stage.depth / 2 - MARGIN_Z);
  const xs = raw.map((p) => p[0]), zs = raw.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const s = Math.min(1, (2 * hx) / Math.max(1e-9, x1 - x0), (2 * hz) / Math.max(1e-9, z1 - z0));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const fit: Vec2[] = raw.map((p) => [((mirror ? -1 : 1) * (p[0] - cx)) * s, (p[1] - cz) * s]);
  const clampIn = (p: Vec2): Vec2 => [
    Math.min(hx, Math.max(-hx, p[0])) + 0, Math.min(hz, Math.max(-hz, p[1])) + 0,
  ];
  const snapped = fit.map((p) => clampIn(snapPos(p, 0.25)));
  return minPairDist(snapped) >= Math.min(minPairDist(fit), CLEAR_M + 0.25) - 1e-9 ? snapped : fit.map(clampIn);
}

/**
 * Các kiểu hình đủ chỗ cho n người trên sàn (không ai đứng gần ai hơn CLEAR_M),
 * giữ thứ tự. Không kiểu nào đủ chỗ thì lấy các kiểu thoáng nhất.
 */
export function roomyShapes(shapes: ShapeKind[], n: number, stage: StageSize): ShapeKind[] {
  const room = shapes.map((k) => minPairDist(fittedShape(k, n, stage)));
  const ok = shapes.filter((_, i) => room[i] >= CLEAR_M - 1e-9);
  if (ok.length) return ok;
  const top = Math.max(...room);
  return shapes.filter((_, i) => room[i] >= top - 0.02);
}

// ---------- gán người, sửa va chạm ----------

interface Cand {
  kind: ShapeKind;
  mirror: boolean;
  to: Vec2[]; // vị trí đích theo thứ tự người
  c: Clearance;
  cost: number; // tổng bình phương quãng đường
  over: number; // quãng vượt tầm với (m): > 0 là phải chạy quá VMAX
}

const sq = (a: Vec2, b: Vec2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const totalCost = (from: Vec2[], to: Vec2[]) => from.reduce((s, p, i) => s + sq(p, to[i]), 0);

const OVER_EPS = 1e-6;

/**
 * a tốt hơn b: kịp đi (không ai quá tầm với) trước, rồi ít cặp va hơn, rồi vượt
 * tầm ít hơn, rồi (nếu còn va) thoáng hơn, rồi đi ít hơn.
 */
function better(a: Cand, b: Cand): boolean {
  const fa = a.over <= OVER_EPS, fb = b.over <= OVER_EPS;
  if (fa !== fb) return fa;
  if (a.c.hits !== b.c.hits) return a.c.hits < b.c.hits;
  if (Math.abs(a.over - b.over) > OVER_EPS) return a.over < b.over;
  if (a.c.hits > 0 && Math.abs(a.c.min - b.c.min) > 1e-6) return a.c.min > b.c.min;
  return a.cost < b.cost - 1e-9;
}

function evalCand(kind: ShapeKind, mirror: boolean, from: Vec2[], to: Vec2[], reach = Infinity): Cand {
  let far = 0;
  for (let i = 0; i < from.length; i++) far = Math.max(far, dist(from[i], to[i]));
  return { kind, mirror, to, c: clearance(from, to), cost: totalCost(from, to), over: Math.max(0, far - reach) };
}

/** Hoán đổi đích của từng cặp người khi việc đó làm giảm va chạm. */
export function repairSwaps(from: Vec2[], to: Vec2[], maxIter = 40): Vec2[] {
  let cur = evalCand("line", false, from, to.slice());
  for (let it = 0; it < maxIter && cur.c.hits > 0 && cur.c.pair; it++) {
    let best: Cand | null = null;
    for (const i of cur.c.pair)
      for (let j = 0; j < from.length; j++) {
        if (j === i) continue;
        const t = cur.to.slice();
        [t[i], t[j]] = [t[j], t[i]];
        const c = evalCand("line", false, from, t);
        if (better(c, best ?? cur)) best = c;
      }
    if (!best) break;
    cur = best;
  }
  return cur.to;
}

function candidate(kind: ShapeKind, mirror: boolean, from: Vec2[], stage: StageSize, reach: number): Cand {
  const pts = fittedShape(kind, from.length, stage, mirror);
  const asg = assignNearest(from, pts);
  const a = evalCand(kind, mirror, from, from.map((_, i) => pts[asg[i]]), reach);
  if (a.c.hits === 0) return a;
  const b = evalCand(kind, mirror, from, repairSwaps(from, a.to), reach);
  return better(b, a) ? b : a;
}

const sameSet = (a: Vec2[], b: Vec2[]) =>
  a.length === b.length && a.every((p) => b.some((q) => dist(p, q) < 1e-6));

/**
 * Chọn đội hình kế tiếp: thử kiểu hình dự định (thường và lật), nếu vẫn va hoặc
 * có người phải đi xa hơn reach mét thì thử các kiểu khác; lấy phương án tốt
 * nhất theo better(), ưu tiên kiểu dự định. over > 0: không phương án nào kịp.
 */
export function nextArrangement(
  from: Vec2[], planned: ShapeKind, others: ShapeKind[], stage: StageSize, reach = Infinity,
): { kind: ShapeKind; mirror: boolean; to: Vec2[]; clearance: Clearance; over: number } {
  const tryKind = (k: ShapeKind): Cand => {
    const a = candidate(k, false, from, stage, reach);
    const mp = fittedShape(k, from.length, stage, true);
    if (sameSet(mp, fittedShape(k, from.length, stage, false))) return a;
    const b = candidate(k, true, from, stage, reach);
    return better(b, a) ? b : a;
  };
  const done = (c: Cand) => c.c.hits === 0 && c.over <= OVER_EPS;
  let best = tryKind(planned);
  if (!done(best)) {
    for (const k of others) {
      if (k === planned) continue;
      const c = tryKind(k);
      if (better(c, best)) best = c;
      if (done(best)) break;
    }
  }
  return { kind: best.kind, mirror: best.mirror, to: best.to, clearance: best.c, over: best.over };
}

// ---------- chia thời gian ----------

export interface TimeGrid {
  unit: number; // độ dài một lượt 8 (hoặc 4 s)
  lines: number[]; // các vạch từ đầu bài tới cuối bài
  onBeat: boolean;
}

export function timeGrid(duration: number, bpm?: number | null, downbeat = 0): TimeGrid {
  // độ dài vô hạn (webm ghi từ máy chưa có duration) hay BPM hỏng làm vòng lặp
  // dưới không dừng: coi như không có
  if (!Number.isFinite(duration)) duration = 0;
  const onBeat = typeof bpm === "number" && Number.isFinite(bpm) && bpm >= 20 && bpm <= 400;
  const unit = onBeat ? 8 * beatLen(bpm!) : PSEUDO_EIGHT;
  const base = onBeat && Number.isFinite(downbeat) ? downbeat : 0;
  const j0 = Math.ceil((0 - base) / unit - 1e-9);
  const lines: number[] = [];
  for (let j = j0; base + j * unit <= duration + 1e-6; j++) lines.push(round3(base + j * unit));
  return { unit, lines, onBeat };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/**
 * Chỉ số vạch của các điểm đổi đội hình c_0..c_N (c_0 = vạch đầu, c_N = vạch
 * cuối). Mỗi đoạn dài ít nhất minU vạch. Có score thì dời điểm đổi trong cửa sổ
 * ±1/3 đoạn tới vạch có điểm cao nhất (hoà thì vạch gần chỗ chia đều nhất).
 */
export function changeIndices(
  M: number, N: number, minU: number, score?: (j: number) => number,
): number[] {
  const out = [0];
  for (let k = 1; k < N; k++) {
    const target = Math.round((k * M) / N);
    const lo = Math.max(out[k - 1] + minU, score ? target - Math.floor(M / N / 3) : target);
    const hi = Math.min(M - (N - k) * minU, score ? target + Math.floor(M / N / 3) : target);
    let best = Math.min(hi, Math.max(lo, target));
    if (score) {
      let bs = -Infinity;
      for (let j = lo; j <= hi; j++) {
        const s = score(j);
        if (s > bs + 1e-9 || (Math.abs(s - bs) <= 1e-9 && Math.abs(j - target) < Math.abs(best - target))) {
          bs = s;
          best = j;
        }
      }
    }
    out.push(best);
  }
  out.push(M);
  return out;
}

const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

// ---------- tổng hợp ----------

export interface AutoPlanResult {
  formations: Formation[];
  /** Số đội hình định chia (đã kẹp theo độ dài bài). */
  wanted: number;
  /** Số điểm đổi bị bỏ vì đoạn quá ngắn, đi tới hình mới sẽ phải chạy quá VMAX. */
  merged: number;
  /** Kiểu hình bị bỏ vì quá chật cho từng ấy người. */
  crowded: ShapeKind[];
}

export function autoPlan(o: AutoPlanOpts): Formation[] {
  return planDance(o).formations;
}

export function planDance(o: AutoPlanOpts): AutoPlanResult {
  const ids = o.ids;
  const n = ids.length;
  const asked = o.shapes?.length ? o.shapes : DEFAULT_SHAPES;
  const shapes = roomyShapes(asked, n, o.stage);
  const duration = Number.isFinite(o.duration) ? Math.max(0, o.duration) : 0;
  const g = timeGrid(duration, o.bpm, o.downbeat ?? 0);
  const minHold = g.onBeat ? g.unit : 2;
  const baseGap = g.onBeat ? g.unit : 2;
  const minU = g.onBeat ? 2 : 1; // số vạch tối thiểu mỗi đoạn: giữ + chuyển
  const M = Math.max(0, g.lines.length - 1);
  const mkId = o.newId ?? ((k: number) => `auto${k + 1}`);

  let N: number;
  if (o.count && o.count > 0) N = Math.round(o.count);
  else N = Math.max(1, Math.round(M / Math.max(1, o.everyEights ?? 4)));
  N = Math.max(1, Math.min(N, Math.floor(M / minU)));

  // --- thời gian: cuts[k] là lúc bắt đầu đội hình k, cuts[N] là hết khối cuối ---
  let cuts: number[];
  if (M < minU) {
    // bài quá ngắn so với một đoạn: một khối duy nhất
    const s = g.lines[0] ?? 0;
    cuts = [s, Math.max(s + minHold, duration)];
    N = 1;
  } else {
    const score = o.changeScore;
    cuts = changeIndices(M, N, minU, score ? (j) => score(g.lines[j]) : undefined).map((j) => g.lines[j]);
  }

  // --- vị trí, lần lượt từng điểm đổi ---
  const blocks: { start: number; pts: Vec2[]; kind: ShapeKind }[] = [];
  {
    const planned = shapes[0];
    const pts = fittedShape(planned, n, o.stage);
    const st = o.start;
    let first: Vec2[];
    if (st && ids.every((id) => st[id])) {
      const from = ids.map((id) => st[id]);
      const asg = assignNearest(from, pts);
      first = from.map((_, i) => pts[asg[i]]);
    } else {
      // không có vị trí sẵn: xếp theo thứ tự danh sách từ trái sang phải
      const order = pts.map((p, i) => i).sort((a, b) => pts[a][0] - pts[b][0] || pts[b][1] - pts[a][1]);
      first = ids.map((_, i) => pts[order[i]]);
    }
    blocks.push({ start: cuts[0], pts: first, kind: planned });
  }
  let merged = 0;
  for (let j = 1; j < N; j++) {
    const k = blocks.length;
    const prev = blocks[k - 1];
    let planned = shapes[k % shapes.length];
    // lần trước phải đổi kiểu vì va: đừng lặp lại đúng kiểu vừa đứng
    if (planned === prev.kind && shapes.length > 1) planned = shapes[(k + 1) % shapes.length];
    // các kiểu khác: ưu tiên kiểu chưa dùng gần đây
    const others = [...shapes.slice((k + 1) % shapes.length), ...shapes.slice(0, (k + 1) % shapes.length)]
      .filter((s) => s !== prev.kind);
    // tầm với: đi xa nhất được bao nhiêu nếu dành hết phần sau lượt giữ để chuyển
    const reach = (VMAX * (cuts[j] - prev.start - minHold)) / 1.5;
    const r = nextArrangement(prev.pts, planned, others, o.stage, reach);
    if (r.over > OVER_EPS) {
      // không kịp: giữ đội hình cũ qua điểm đổi này, đoạn sau dài ra
      merged++;
      continue;
    }
    blocks.push({ start: cuts[j], pts: r.to, kind: r.kind });
  }

  // --- khoảng chuyển ---
  const lastEnd = cuts[N];
  const out: Formation[] = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    let end = k + 1 < blocks.length ? blocks[k + 1].start : lastEnd;
    if (k + 1 < blocks.length) {
      const nx = blocks[k + 1].pts;
      const travel = Math.max(0, ...b.pts.map((p, i) => dist(p, nx[i])));
      const need = (1.5 * travel) / VMAX; // tốc độ đỉnh smoothstep = 1.5·quãng/thời gian
      let gap = Math.max(baseGap, g.onBeat ? ceilTo(need, g.unit) : ceilTo(need, 0.5));
      gap = Math.min(gap, end - b.start - minHold);
      end = round3(end - gap);
    }
    const pos: Record<string, Vec2> = {};
    ids.forEach((id, i) => { pos[id] = [b.pts[i][0], b.pts[i][1]]; });
    out.push({
      id: mkId(k),
      name: `Đội hình ${k + 1} · ${SHAPE_LABEL[b.kind]}`,
      start: round3(b.start),
      end: round3(end),
      pos,
    });
  }
  return { formations: out, wanted: N, merged, crowded: asked.filter((k) => !shapes.includes(k)) };
}

// ---------- năng lượng nhạc ----------

/**
 * Điểm "nhạc đổi mạnh" theo thời gian từ tín hiệu mono: log năng lượng RMS mỗi
 * khung 50 ms; điểm tại t = |trung bình log RMS sau t − trước t| trong cửa sổ
 * win giây, cộng nửa bước nhảy năng lượng lớn nhất quanh t (±0.15 s, bắt tiếng
 * trống vào). Trả hàm t → điểm (≥ 0).
 */
export function energyChangeScore(x: Float32Array, sr: number, win = 2): (t: number) => number {
  const hop = Math.max(1, Math.round(sr * 0.05));
  const nF = Math.max(1, Math.floor(x.length / hop));
  const fr = sr / hop;
  const le = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    let s = 0;
    const a = f * hop, b = Math.min(x.length, a + hop);
    for (let i = a; i < b; i++) s += x[i] * x[i];
    le[f] = Math.log(1e-8 + s / Math.max(1, b - a));
  }
  const cs = new Float64Array(nF + 1);
  for (let f = 0; f < nF; f++) cs[f + 1] = cs[f] + le[f];
  const mean = (a: number, b: number) => {
    a = Math.max(0, Math.min(nF, a));
    b = Math.max(0, Math.min(nF, b));
    return b > a ? (cs[b] - cs[a]) / (b - a) : NaN;
  };
  const W = Math.max(1, Math.round(win * fr));
  const J = Math.max(1, Math.round(0.15 * fr));
  return (t: number) => {
    const c = Math.round(t * fr);
    const before = mean(c - W, c);
    const after = mean(c, c + W);
    const step = Number.isFinite(before) && Number.isFinite(after) ? Math.abs(after - before) : 0;
    let jump = 0;
    for (let f = Math.max(1, c - J); f <= Math.min(nF - 1, c + J); f++) jump = Math.max(jump, le[f] - le[f - 1]);
    return step + 0.5 * Math.min(3, jump);
  };
}
