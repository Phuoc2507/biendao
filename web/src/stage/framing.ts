// Canh khung máy quay khán giả cho vừa cả sàn diễn với mọi tỉ lệ khung.
// THUẦN (không dùng three) để kiểm thử được bằng `node --test`.
//
// Phép chiếu giống PerspectiveCamera của three: fov là góc DỌC (độ),
// toạ độ màn hình (NDC) từ -1 tới 1, y = -1 là đáy khung.

export type V3 = [number, number, number];
export interface Lens { fov: number; aspect: number } // aspect = rộng / cao
/** Lề an toàn theo NDC (khung cao 2 đơn vị): chừa chỗ cho chữ và nút. */
export interface Safe { top: number; bottom: number; side: number }
export interface View { pos: V3; target: V3 }
/** Hộp cần thấy: sàn W×D, thẻ cao tới H; half là nửa bề ngang thẻ ở mép,
 *  shadow là bóng dưới chân hàng đầu nhô ra trước mép sân. */
export interface Box { W: number; D: number; H: number; half?: number; shadow?: number }

const DEG = Math.PI / 180;
/** Độ cao mắt thấp nhất của máy quay khán giả (m). */
export const EYE = 1.6;
const CLIMB_MAX = 0.35; // nâng máy theo khoảng lùi: cao thì thấy rõ hàng sau
const CLIMB_MIN = 0.12;
/** Chúc xuống ít nhất 3° để OrbitControls (giới hạn ~89°) không bẻ lại góc. */
const MIN_PITCH = 3 * DEG;
const FAR = 400;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Chiếu điểm p lên màn hình của máy quay v. depth là khoảng cách dọc trục nhìn. */
export function project(p: V3, v: View, lens: Lens): { x: number; y: number; depth: number } {
  const f = norm(sub(v.target, v.pos));
  let r = cross(f, [0, 1, 0]);
  if (Math.hypot(r[0], r[1], r[2]) < 1e-9) r = [1, 0, 0];
  r = norm(r);
  const u = cross(r, f);
  const d = sub(p, v.pos);
  const depth = dot(d, f);
  const tv = Math.tan((lens.fov * DEG) / 2);
  return { x: dot(d, r) / (depth * tv * lens.aspect), y: dot(d, u) / (depth * tv), depth };
}

/** Mọi điểm đều nằm trong khung, chừa lề an toàn. */
export function inside(pts: V3[], v: View, lens: Lens, safe: Safe): boolean {
  for (const p of pts) {
    const q = project(p, v, lens);
    if (q.depth < 0.05) return false;
    if (Math.abs(q.x) > 1 - safe.side) return false;
    if (q.y > 1 - safe.top || q.y < -1 + safe.bottom - 1e-6) return false;
  }
  return true;
}

/** 8 góc của hộp cần thấy. */
export function stagePoints(b: Box): V3[] {
  const hx = b.W / 2 + (b.half ?? 0.4);
  const zf = b.D / 2 + (b.shadow ?? 0.3);
  const out: V3[] = [];
  for (const x of [-hx, hx]) for (const y of [0, b.H]) for (const z of [-b.D / 2, zf]) out.push([x, y, z]);
  return out;
}

/** Khoảng nhỏ nhất (trong [lo, FAR]) mà ok() đúng, tìm chia đôi. */
function minDist(ok: (s: number) => boolean, lo = 0.5): number {
  if (ok(lo)) return lo;
  let hi = FAR;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  return hi;
}

/** Góc khán giả: máy ở giữa, nhìn thẳng vào sân. Mép trước (tính cả bóng chân
 *  hàng đầu) nằm đúng trên lề dưới; lùi máy vừa đủ để thấy hết bề ngang và đỉnh
 *  thẻ hàng cuối. Máy được nâng cao nhất có thể mà chưa phải lùi xa hơn mức bề
 *  ngang đòi hỏi, để hàng sau ít bị hàng trước che. */
export function fitFront(box: Box, lens: Lens, safe: Safe): View {
  const pts = stagePoints(box);
  const zf = box.D / 2 + (box.shadow ?? 0.3);
  const delta = Math.atan((1 - safe.bottom) * Math.tan((lens.fov * DEG) / 2));
  const viewAt = (d: number, climb: number): View => {
    const y = Math.max(EYE + climb * d, d * Math.tan(MIN_PITCH + delta));
    const phi = Math.atan2(y, d) - delta; // góc chúc của trục nhìn
    const pos: V3 = [0, y, zf + d];
    // điểm xoay: trên trục nhìn, ở giữa sân (hoặc chỗ trục chạm sàn nếu sớm hơn)
    const ty = y - (zf + d) * Math.tan(phi);
    const target: V3 = ty >= 0 ? [0, ty, 0] : [0, 0, zf + d - y / Math.tan(phi)];
    return { pos, target };
  };
  const vert = (v: View) => inside(pts, v, lens, { ...safe, side: -Infinity });
  const horz = (v: View) => inside(pts, v, lens, { top: -Infinity, bottom: -Infinity, side: safe.side });
  let climb = CLIMB_MIN;
  for (let i = 0; i <= 10; i++) {
    const c = CLIMB_MAX - ((CLIMB_MAX - CLIMB_MIN) * i) / 10;
    if (minDist((d) => vert(viewAt(d, c))) <= minDist((d) => horz(viewAt(d, c))) + 1e-3) {
      climb = c;
      break;
    }
  }
  return viewAt(minDist((d) => inside(pts, viewAt(d, climb), lens, safe)), climb);
}

/** Lùi máy theo hướng dir (từ điểm nhìn ra) tới khi thấy hết hộp. */
export function fitAlong(box: Box, lens: Lens, safe: Safe, dir: V3, target: V3): View {
  const pts = stagePoints(box);
  const n = norm(dir);
  const at = (s: number): View => ({ pos: [target[0] + n[0] * s, target[1] + n[1] * s, target[2] + n[2] * s], target });
  return at(minDist((s) => inside(pts, at(s), lens, safe), 1));
}

/** Hướng máy "Trên cao" và "Chéo" (từ điểm nhìn ra máy). */
export const TOP_DIR: V3 = [0, 1, 0.42];
export const SIDE_DIR: V3 = [Math.sin(40 * DEG) * Math.cos(14 * DEG), Math.sin(14 * DEG), Math.cos(40 * DEG) * Math.cos(14 * DEG)];
