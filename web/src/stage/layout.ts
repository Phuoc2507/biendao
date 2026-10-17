// Chọn bố cục theo cỡ cửa sổ và cỡ vùng chính. Thuần (không đụng DOM) để test
// bằng node; phần gắn vào React nằm ở ui/useLayout.ts.

export type SplitDir = "row" | "col";

/** Hẹp hơn mức này là điện thoại dựng đứng. */
export const PHONE_W = 600;
/** Thấp hơn mức này (mà không rộng lắm) là điện thoại xoay ngang. */
export const SHORT_H = 500;
export const SHORT_MAX_W = 1000;

/** Cửa sổ kiểu điện thoại: cột trái thành ngăn kéo đè lên, nút to cho ngón tay. */
export function isPhone(w: number, h: number): boolean {
  return w < PHONE_W || (h < SHORT_H && w < SHORT_MAX_W);
}

/** Khung nhỏ nhất còn xem được ở chế độ Cả hai. */
export const MIN_PANE_W = 260;
export const MIN_PANE_H = 140;
/** Tỉ lệ ngang/dọc vừa mắt cho mỗi khung (sân khấu khoảng 10×6, camera khoảng 16:9). */
export const PANE_ASPECT = 1.6;
/** Vùng đệm quanh ngưỡng để kéo cỡ cửa sổ không làm khung lật qua lật lại. */
export const SPLIT_HYST = 0.06;

/**
 * Chế độ Cả hai: hai khung cạnh nhau ("row") hay chồng trên dưới ("col").
 * Cách nào làm khung nhỏ hơn cỡ tối thiểu thì tránh; còn lại chọn cách cho mỗi
 * khung gần tỉ lệ PANE_ASPECT nhất, tức là so w/h với PANE_ASPECT.
 */
export function splitDir(w: number, h: number, prev?: SplitDir): SplitDir {
  if (!(w > 0 && h > 0)) return prev ?? "row";
  const rowOk = w / 2 >= MIN_PANE_W;
  const colOk = h / 2 >= MIN_PANE_H;
  if (rowOk !== colOk) return rowOk ? "row" : "col";
  const a = w / h;
  if (prev && Math.abs(Math.log(a / PANE_ASPECT)) < SPLIT_HYST) return prev;
  return a >= PANE_ASPECT ? "row" : "col";
}

export const SIDE_KEY = "stage.side";

/** Cột trái lúc mở app: điện thoại thì đóng; còn lại theo lần trước (mặc định mở). */
export function startSideOpen(saved: string | null, w: number, h: number): boolean {
  if (isPhone(w, h)) return false;
  return saved !== "0";
}

/** Lựa chọn cột trái đã nhớ trong trình duyệt (bị chặn bộ nhớ thì null). */
export function savedSide(): string | null {
  try {
    return localStorage.getItem(SIDE_KEY);
  } catch {
    return null;
  }
}

export function rememberSide(open: boolean): void {
  try {
    localStorage.setItem(SIDE_KEY, open ? "1" : "0");
  } catch {
    // bộ nhớ bị chặn (cửa sổ ẩn danh...): lần sau mở lại như mặc định
  }
}

export const PLAN_FROM_KEY = "stage.planFrom";

/** Sơ đồ lần trước nhìn từ sân khấu ra (xoay 180°) hay không. */
export function savedPlanFromStage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(PLAN_FROM_KEY) === "stage";
  } catch {
    return false;
  }
}

export function rememberPlanFromStage(on: boolean): void {
  try {
    localStorage.setItem(PLAN_FROM_KEY, on ? "stage" : "audience");
  } catch {
    // bộ nhớ bị chặn: lần sau về mặc định nhìn từ khán giả
  }
}
