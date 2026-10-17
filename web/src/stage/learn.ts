// Học động tác từ video cả đội: khung "bám theo tôi" (nội suy theo thời gian,
// phóng to vừa khung), lặp A–B, lật gương. THUẦN, không import gì.

/** Khung chữ nhật chuẩn hoá 0..1 theo khung hình GỐC của video (chưa lật gương). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Một khung đã vẽ: lúc t (giây video) bạn ở trong khung r. */
export interface Key {
  t: number;
  r: Rect;
}

/** Biến hình của lớp bọc video: điểm p (phân số của khung nhìn) thành s·p + (tx, ty). */
export interface Fit {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Fit = { scale: 1, tx: 0, ty: 0 };
/** Phóng to tối đa (to hơn nữa thì vỡ hình). */
export const MAX_ZOOM = 6;
/** Hai khung cách nhau dưới chừng này giây coi là cùng một chỗ (vẽ lại thì thay). */
export const SAME_KEY = 0.1;
/** Đoạn lặp ngắn nhất (giây). */
export const MIN_LOOP = 0.2;
/** Một khung hình khi bước từng khung (giây). */
export const FRAME = 1 / 30;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Kẹp khung vào trong 0..1, không để rộng hay cao âm. */
export function clampRect(r: Rect): Rect {
  const x = clamp01(r.x);
  const y = clamp01(r.y);
  return { x, y, w: Math.min(1 - x, Math.max(0, r.w)), h: Math.min(1 - y, Math.max(0, r.h)) };
}

/** Khung từ hai góc kéo chuột bất kỳ (đã kẹp vào 0..1). */
export function rectFromPoints(a: [number, number], b: [number, number]): Rect {
  const x0 = clamp01(Math.min(a[0], b[0]));
  const x1 = clamp01(Math.max(a[0], b[0]));
  const y0 = clamp01(Math.min(a[1], b[1]));
  const y1 = clamp01(Math.max(a[1], b[1]));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Lật trái phải một khung (gương): x thành 1 − x − w. Lật hai lần là về như cũ. */
export const mirrorRect = (r: Rect): Rect => ({ x: 1 - r.x - r.w, y: r.y, w: r.w, h: r.h });

/** Các khung xếp theo thời gian (bản sao, không sửa mảng gốc). */
export const sortKeys = (keys: Key[]): Key[] => [...keys].sort((a, b) => a.t - b.t);

/** Thêm một khung; đã có khung gần cùng lúc (dưới SAME_KEY) thì thay khung đó. */
export function upsertKey(keys: Key[], k: Key): Key[] {
  const rest = keys.filter((x) => Math.abs(x.t - k.t) >= SAME_KEY);
  return sortKeys([...rest, { t: Math.max(0, k.t), r: clampRect(k.r) }]);
}

/** Khung tại t: nội suy thẳng giữa hai khung kề nhau, ngoài khoảng thì giữ khung đầu hoặc cuối. */
export function boxAt(keys: Key[], t: number): Rect | null {
  if (!keys.length) return null;
  const ks = sortKeys(keys);
  if (t <= ks[0].t) return { ...ks[0].r };
  const last = ks[ks.length - 1];
  if (t >= last.t) return { ...last.r };
  let i = 0;
  while (i + 1 < ks.length && ks[i + 1].t <= t) i++;
  const a = ks[i];
  const b = ks[i + 1];
  const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return {
    x: lerp(a.r.x, b.r.x, u),
    y: lerp(a.r.y, b.r.y, u),
    w: lerp(a.r.w, b.r.w, u),
    h: lerp(a.r.h, b.r.h, u),
  };
}

/** Chỗ khung hình nằm trong khung nhìn khi hiện vừa khít (object-fit: contain),
 *  tính bằng phân số của khung nhìn. aspect là rộng / cao. */
export function frameRect(frameAspect: number, viewAspect: number): Rect {
  if (!(frameAspect > 0) || !(viewAspect > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  if (frameAspect >= viewAspect) {
    const h = viewAspect / frameAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = frameAspect / viewAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** Khung gốc (theo video) sang chỗ hiện trong khung nhìn, có tính lật gương. */
export function sourceToView(r: Rect, frame: Rect, mirror: boolean): Rect {
  const s = mirror ? mirrorRect(r) : r;
  return { x: frame.x + s.x * frame.w, y: frame.y + s.y * frame.h, w: s.w * frame.w, h: s.h * frame.h };
}

/** Điểm trong khung nhìn (phân số, chưa phóng to) sang toạ độ gốc của video
 *  (đã kẹp 0..1); đang soi gương thì lật lại để lưu đúng bên. */
export function viewToSource(p: [number, number], frame: Rect, mirror: boolean): [number, number] {
  const u = frame.w > 0 ? clamp01((p[0] - frame.x) / frame.w) : 0;
  const v = frame.h > 0 ? clamp01((p[1] - frame.y) / frame.h) : 0;
  return [mirror ? 1 - u : u, v];
}

/** Một trục: kẹp dịch chuyển để nền ngoài khung hình (dải đen) không lộ ra nhiều
 *  hơn lúc hiện vừa khít. lo, len: chỗ khung hình trên trục (0..1), dải đen hai
 *  bên bằng nhau nên mỗi bên rộng lo. */
function clampAxis(t: number, s: number, lo: number, len: number): number {
  return Math.min(lo - s * lo, Math.max(1 - lo - s * (lo + len), t));
}

/**
 * Phóng to và dịch để khung box (theo khung hình đang hiện, đã lật nếu cần)
 * lấp đầy khung nhìn, chừa margin mỗi bên (phân số cỡ khung), giữ tỉ lệ.
 * Không thu nhỏ dưới 1, không phóng quá MAX_ZOOM, không lộ nền ngoài khung hình
 * nhiều hơn mức vốn có khi hiện vừa khít.
 */
export function fitView(box: Rect, frameAspect: number, viewAspect: number, margin = 0.15): Fit {
  const fr = frameRect(frameAspect, viewAspect);
  const b = sourceToView(clampRect(box), fr, false);
  if (b.w <= 1e-6 || b.h <= 1e-6) return { ...IDENTITY };
  const m = Math.max(0, margin);
  const bw = b.w * (1 + 2 * m);
  const bh = b.h * (1 + 2 * m);
  const scale = Math.min(MAX_ZOOM, Math.max(1, Math.min(1 / bw, 1 / bh)));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const tx = clampAxis(0.5 - scale * cx, scale, fr.x, fr.w);
  const ty = clampAxis(0.5 - scale * cy, scale, fr.y, fr.h);
  return { scale, tx, ty };
}

/** Chuỗi CSS transform cho lớp bọc (transform-origin 0 0, dịch theo % cỡ chính nó). */
export const fitCss = (f: Fit): string =>
  `translate(${(f.tx * 100).toFixed(3)}%, ${(f.ty * 100).toFixed(3)}%) scale(${f.scale.toFixed(4)})`;

// ---------- lặp A–B ----------

export interface Loop {
  a: number | null;
  b: number | null;
}

export const NO_LOOP: Loop = { a: null, b: null };

/** Đoạn lặp đủ hai đầu và đủ dài. */
export const loopOn = (l: Loop): l is { a: number; b: number } =>
  l.a !== null && l.b !== null && l.b - l.a >= MIN_LOOP;

/** Đặt A tại t; B cũ không còn sau A đủ xa thì bỏ B. */
export function setA(l: Loop, t: number): Loop {
  const a = Math.max(0, t);
  return { a, b: l.b !== null && l.b - a >= MIN_LOOP ? l.b : null };
}

/** Đặt B tại t. Chưa có A thì A là đầu video; B trước A thì đổi chỗ hai đầu;
 *  sát A quá thì không đổi gì. */
export function setB(l: Loop, t: number): Loop {
  const b = Math.max(0, t);
  const a = l.a ?? 0;
  if (Math.abs(b - a) < MIN_LOOP) return l;
  return b > a ? { a, b } : { a: b, b: a };
}

/** Đang phát mà đã tới (hoặc qua) B thì trả về A để tua về, không thì null. */
export function loopWrap(t: number, l: Loop): number | null {
  if (!loopOn(l)) return null;
  return t >= l.b ? l.a : null;
}

/** Chỗ bắt đầu phát (và đếm vào): đang lặp mà ở ngoài đoạn thì về A; hết video
 *  thì về đầu (hoặc A). */
export function playStart(t: number, l: Loop, duration: number): number {
  if (loopOn(l) && (t < l.a || t >= l.b - 0.02)) return l.a;
  if (duration > 0 && t >= duration - 0.05) return loopOn(l) ? l.a : 0;
  return Math.max(0, t);
}

/** Tua thêm d giây, kẹp trong video. */
export function stepTime(t: number, d: number, duration: number): number {
  const end = duration > 0 ? duration : Infinity;
  return Math.min(end, Math.max(0, t + d));
}

// ---------- đọc lại dữ liệu đã nhớ ----------

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Kiểm các khung đọc từ bộ nhớ trình duyệt: bỏ mục hỏng, kẹp vào 0..1, xếp theo thời gian. */
export function cleanKeys(raw: unknown): Key[] {
  if (!Array.isArray(raw)) return [];
  const out: Key[] = [];
  for (const k of raw) {
    const r = (k as Key | null)?.r;
    if (!k || !num((k as Key).t) || !r || ![r.x, r.y, r.w, r.h].every(num)) continue;
    const c = clampRect(r);
    if (c.w > 0 && c.h > 0) out.push({ t: Math.max(0, (k as Key).t), r: c });
  }
  return sortKeys(out);
}

/** Kiểm đoạn lặp đọc lại: đầu nào hỏng thì bỏ. */
export function cleanLoop(raw: unknown): Loop {
  const l = raw as Partial<Loop> | null;
  const a = l && num(l.a) && l.a >= 0 ? l.a : null;
  const b = l && num(l.b) && l.b >= 0 ? l.b : null;
  if (a !== null && b !== null && b - a < MIN_LOOP) return { a, b: null };
  return { a, b };
}
