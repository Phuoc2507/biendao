// Gắn bố cục (layout.ts) vào React: cửa sổ cỡ điện thoại, hướng chia của chế
// độ Cả hai, bật tắt cột trái.

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { isPhone, splitDir, rememberSide, type SplitDir } from "../layout";
import { st } from "../store";

const phoneNow = () => typeof window !== "undefined" && isPhone(window.innerWidth, window.innerHeight);

/** true khi cửa sổ cỡ điện thoại (tự đổi khi xoay máy hay kéo cửa sổ). */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(phoneNow);
  useEffect(() => {
    const on = () => setPhone(phoneNow());
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return phone;
}

/** Hướng chia Cả hai theo cỡ thật của vùng chính (đo lại mỗi khi vùng đổi cỡ). */
export function useSplitDir(ref: RefObject<HTMLElement>, on: boolean): SplitDir {
  const [dir, setDir] = useState<SplitDir>("row");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const measure = () => setDir((d) => splitDir(el.clientWidth, el.clientHeight, d));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, on]);
  return dir;
}

/** Bật tắt cột trái; trên máy tính thì nhớ cho lần mở sau. */
export function toggleSide(): void {
  const open = !st().ui.sideOpen;
  st().setUI({ sideOpen: open });
  if (!phoneNow()) rememberSide(open);
}

export const closeSide = (): void => st().setUI({ sideOpen: false });
