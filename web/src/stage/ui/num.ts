// Số kiểu Việt: dấu phẩy thập phân. Đọc nháp của ô số, làm tròn và kẹp.

export interface NumOpts {
  min: number;
  max: number;
  /** Bước làm tròn khi ghi (0.01 là hai chữ số lẻ). */
  quantum?: number;
  /** Cho phép để trống (ghi null). */
  allowEmpty?: boolean;
}

/** "1,5" và "1.5" đều là 1.5; rỗng là null; gõ sai là NaN. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s+/g, "").replace(/[−–]/g, "-").replace(",", ".");
  if (!t) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

const decimals = (q: number) => {
  const s = String(q);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};

/** Làm tròn theo bước rồi kẹp vào [min, max]. */
export function clampNum(n: number, o: NumOpts): number {
  const q = o.quantum ?? 0.01;
  const r = q > 0 ? Math.round(n / q) * q : n;
  const c = Math.max(o.min, Math.min(o.max, r));
  return q > 0 ? Number(c.toFixed(decimals(q))) : c;
}

/** Đọc nháp: số đã kẹp; null nếu để trống (khi cho phép); undefined nếu không hợp lệ. */
export function readNum(s: string, o: NumOpts): number | null | undefined {
  const v = parseNum(s);
  if (v === null) return o.allowEmpty ? null : undefined;
  if (!Number.isFinite(v)) return undefined;
  return clampNum(v, o);
}

/** 1.5 thành "1,5"; digits cố định số chữ số lẻ. Rỗng nếu không có số. */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  const s = digits === undefined ? String(Number(v.toFixed(6))) : v.toFixed(digits);
  return s.replace(".", ",");
}

/** Luôn có dấu: "+0,25", "−0,10". */
export function fmtSigned(v: number, digits = 2): string {
  const a = Math.abs(v).toFixed(digits);
  return (v < 0 && Number(a) !== 0 ? "−" : "+") + a.replace(".", ",");
}

/** Đổi dấu chấm thập phân giữa hai chữ số thành dấu phẩy ("4.5 s" thành "4,5 s"). */
export const commaDec = (s: string) => s.replace(/(\d)\.(\d)/g, "$1,$2");
