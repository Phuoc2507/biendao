// Hook dùng chung cho giao diện.

import { useMemo, useSyncExternalStore } from "react";
import { findWarnings, segmentAt } from "../model";
import { useProject } from "../store";
import { mediaVersion, subscribeMedia } from "../media";
import { useTime } from "../clock";

export function useWarnings() {
  const p = useProject();
  return useMemo(() => findWarnings(p.formations, p.dancers), [p.formations, p.dancers]);
}

export const useMediaVersion = () => useSyncExternalStore(subscribeMedia, mediaVersion);

/** Khối đang đứng / đang chuyển tại vạch phát. */
export function useSegment() {
  const p = useProject();
  const t = useTime();
  return segmentAt(p.formations, t);
}

export const isTyping = (e: Event) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

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
