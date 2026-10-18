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

/** Chiều cao dòng thời gian: tự tính thì cửa sổ thấp chỉ lấy khoảng 2/5 cho
 *  sơ đồ và khung khán giả còn chỗ; người dùng đã kéo thì cho tới 55%. */
export function tlHeight(auto: number, user: number, winH: number): number {
  const cap = user ? Math.round(winH * 0.55) : Math.min(300, Math.round(winH * (winH < 760 ? 0.38 : 0.55)));
  return Math.max(150, Math.min(user || auto, cap));
}

/** Một phần tử nổi trên sơ đồ (nhãn, nút), tính bằng px trong khung sơ đồ. */
export type Overlay = { l: number; r: number; b: number };

/**
 * Cần chừa thêm bao nhiêu mét phía trên sơ đồ để sân không nằm dưới nút nổi.
 * Chỉ tính phần tử đè lên bề ngang thật của sân: khung rộng mà sân hẹp thì nút
 * nằm hai bên không làm sân nhỏ đi.
 */
export function topExtra(
  o: { w: number; h: number; els: Overlay[] }, vbw: number, D: number, pads: number, sideTop: number, label: number,
): number {
  if (o.w <= 0 || o.h <= 0 || !o.els.length) return 0;
  for (let e = 0; e <= 6; e += 0.1) {
    const h = D + pads + e;
    const k = Math.min(o.w / vbw, o.h / h);
    const x0 = (o.w - vbw * k) / 2;
    const x1 = x0 + vbw * k;
    const y = (o.h - h * k) / 2 + (sideTop + e - label) * k;
    let top = 0;
    for (const el of o.els) if (el.r > x0 && el.l < x1) top = Math.max(top, el.b);
    if (top <= 0 || y >= top + 4) return e;
  }
  return 6;
}
