// Hook dùng chung cho giao diện.

import { type KeyboardEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type Formation, holdIndexAt, segmentAt } from "../model";
import { findIssues } from "../checks";
import { useProject } from "../store";
import { mediaVersion, subscribeMedia } from "../media";
import { now, subscribeClock, useTime } from "../clock";
import { targetKind } from "./keys";

export function useWarnings() {
  const p = useProject();
  return useMemo(() => findIssues(p.formations, p.dancers, p.stage, p.bpm), [p.formations, p.dancers, p.stage, p.bpm]);
}

export const useMediaVersion = () => useSyncExternalStore(subscribeMedia, mediaVersion);

/** Khối đang đứng / đang chuyển tại vạch phát. */
export function useSegment() {
  const p = useProject();
  const t = useTime();
  return segmentAt(p.formations, t);
}

/** Chỉ số đội hình đang đứng tại vạch phát (-1 nếu đang chuyển). Chỉ vẽ lại khi đổi khối, không theo từng khung. */
export function useHoldIndex(fs: Formation[]) {
  const [k, setK] = useState(() => holdIndexAt(fs, now()));
  useEffect(() => {
    const f = () => setK(holdIndexAt(fs, now()));
    f();
    const off = subscribeClock(f);
    return () => {
      off();
    };
  }, [fs]);
  return k;
}

/** Đang gõ chữ (ô nhập chữ, ô số, vùng soạn thảo): phím tắt nhường chỗ. Checkbox, thanh kéo, nút thì không tính. */
export const isTyping = (e: Event) => targetKind(e.target) === "text";

// Ô vừa được bấm chuột (khác với đi tới bằng Tab): phím tắt được giành phím của ô.
let pointerFocus = false;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => (pointerFocus = true), true);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Tab") pointerFocus = false;
  }, true);
}
export const focusByPointer = () => pointerFocus;

/** Dòng bấm được (div): Tab tới được, Enter để chọn. */
export function rowKeys(act: () => void) {
  return {
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target !== e.currentTarget || pointerFocus) return;
      e.preventDefault();
      act();
    },
  };
}

/** Mô tả vị trí cho người không quen toạ độ: "phải 2 m · cách mép 1.5 m". */
export function describePos(x: number, z: number, width: number, depth: number): string {
  const half = width / 2;
  const fx = (v: number) => (Math.round(v * 4) / 4).toString().replace(".", ",");
  let side: string;
  if (Math.abs(x) > half + 1e-6) side = x < 0 ? "cánh gà trái" : "cánh gà phải";
  else if (Math.abs(x) < 0.125) side = "giữa";
  else side = `${x < 0 ? "trái" : "phải"} ${fx(Math.abs(x))} m`;
  const front = depth / 2 - z;
  return `${side} · cách mép ${fx(front)} m`;
}
