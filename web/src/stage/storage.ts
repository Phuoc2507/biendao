// Chỗ lưu trong trình duyệt: đổi lỗi hết chỗ thành lời dễ hiểu, xin trình duyệt
// giữ dữ liệu lâu dài, đọc dung lượng đang dùng. Hàm thuần test được bằng node;
// hàm đụng navigator chỉ chạy khi được gọi.

export const QUOTA_MSG = "Hết chỗ lưu trong trình duyệt — hãy Lưu ra tệp rồi xoá bớt video không dùng";

const QUOTA_RE = /quota|disk is full|no space|not enough space/i;

/** Lỗi do hết chỗ lưu (Chrome, Firefox, Safari đặt tên khác nhau). */
export function isQuotaError(e: unknown): boolean {
  if (typeof e === "string") return QUOTA_RE.test(e);
  if (!e || typeof e !== "object") return false;
  const o = e as { name?: unknown; code?: unknown; message?: unknown };
  if (o.name === "QuotaExceededError" || o.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (o.code === 22 || o.code === 1014) return true;
  return typeof o.message === "string" && QUOTA_RE.test(o.message);
}

/** Câu báo lỗi: hết chỗ thì nói cách gỡ, còn lại "tiền tố: chi tiết". */
export function errText(e: unknown, prefix: string): string {
  if (isQuotaError(e)) return QUOTA_MSG;
  const m = typeof e === "string" ? e
    : e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string"
      ? (e as { message: string }).message : "";
  return m.trim() ? `${prefix}: ${m.trim()}` : prefix;
}

/** "850 KB", "2,5 MB", "1,2 GB" (cơ số 1024, dấu phẩy thập phân). */
export function fmtBytes(n: number): string {
  if (!(n > 0)) return "0 KB";
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1024; i++; }
  if (i === 0) return `${Math.max(1, Math.round(v))} KB`;
  const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${String(r).replace(".", ",")} ${units[i]}`;
}

/** Một hai câu về chỗ lưu cho ô "Đã lưu"; không biết dung lượng thì null. */
export function usageText(usage: number | undefined, quota: number | undefined, kept: boolean | null): string | null {
  if (usage == null || !Number.isFinite(usage)) return null;
  const q = quota != null && quota > 0 ? quota : 0;
  let s = q
    ? `Đang dùng ${fmtBytes(usage)} trên ${fmtBytes(q)} trình duyệt cho phép.`
    : `Đang dùng ${fmtBytes(usage)}.`;
  if (q && usage / q >= 0.8) s += " Sắp hết chỗ: nên Lưu ra tệp rồi xoá bớt video không dùng.";
  if (kept === true) s += " Trình duyệt sẽ giữ dữ liệu này, không tự xoá.";
  else if (kept === false) s += " Khi ổ đĩa gần đầy, trình duyệt có thể tự xoá dữ liệu này.";
  return s;
}

// ---------- phần chạy trong trình duyệt ----------

type SM = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
};

function sm(): SM | undefined {
  try {
    return typeof navigator !== "undefined" ? (navigator.storage as SM | undefined) : undefined;
  } catch {
    return undefined;
  }
}

let asked: Promise<boolean> | null = null;

/**
 * Xin trình duyệt giữ dữ liệu lâu dài (không tự xoá khi ổ gần đầy). Hỏi một
 * lần mỗi phiên, lặng lẽ: Chrome tự quyết không hiện hộp hỏi; bị từ chối cũng
 * không sao, app vẫn tự lưu như thường.
 */
export function requestPersist(): Promise<boolean> {
  if (asked) return asked;
  asked = (async () => {
    try {
      const s = sm();
      if (!s?.persist) return false;
      if (s.persisted && (await s.persisted())) return true;
      return await s.persist();
    } catch {
      return false;
    }
  })();
  return asked;
}

/** Dung lượng đang dùng (để hiện trong ô "Đã lưu"); không đọc được thì null. */
export async function storageInfo(): Promise<string | null> {
  try {
    const s = sm();
    if (!s?.estimate) return null;
    const est = await s.estimate();
    const kept = s.persisted ? await s.persisted().catch(() => null) : null;
    return usageText(est.usage, est.quota, kept);
  } catch {
    return null;
  }
}
