// Hàng thông báo: tối đa 3 cái xếp chồng, mỗi cái hẹn giờ riêng, lỗi ở lâu hơn.

export interface Toast {
  id: number;
  msg: string;
  undo?: boolean;
  kind?: "info" | "warn" | "error";
  /** Dự án lúc báo: chỉ còn hiện nút Hoàn tác khi chưa sửa gì thêm. */
  at?: unknown;
  /** Nút làm tiếp (ví dụ Sửa tất cả); có Hoàn tác thì cũng chỉ hiện khi chưa sửa gì thêm. */
  action?: { label: string; run: () => void };
}

const kindOf = (t: Toast) => t.kind ?? "info";

/** Thêm thông báo mới vào cuối; trùng nội dung thì thay cái cũ; quá max thì bỏ cái cũ nhất (giữ lỗi lâu nhất có thể). */
export function pushToast(list: Toast[], t: Toast, max = 3): Toast[] {
  const out = list.filter((x) => !(x.msg === t.msg && kindOf(x) === kindOf(t)));
  out.push(t);
  while (out.length > max) {
    const i = out.findIndex((x, j) => j < out.length - 1 && kindOf(x) !== "error");
    out.splice(i >= 0 ? i : 0, 1);
  }
  return out;
}

/** Thời gian hiện (ms): lỗi 10 s, cảnh báo hoặc có Hoàn tác 6 s, còn lại 3,5 s; câu dài thì lâu hơn. */
export function toastMs(t: Toast): number {
  const base = t.kind === "error" ? 10000 : t.kind === "warn" || t.undo ? 6000 : 3500;
  return Math.max(base, Math.min(12000, 1500 + t.msg.length * 50));
}
