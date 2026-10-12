// Chống ghi đè bài đã lưu: chỉ MỘT thẻ trình duyệt được tự lưu (navigator.locks,
// không có thì BroadcastChannel), và không tự lưu đè lên dữ liệu chưa đọc được.

import { useSyncExternalStore } from "react";

export type TabRole = "checking" | "primary" | "secondary" | "taken";
export type BootProblem = "unreadable" | "invalid" | null;

export interface Guard {
  role: TabRole; // secondary: thẻ khác đang mở; taken: thẻ khác vừa giành quyền
  problem: BootProblem; // unreadable: đọc bài đã lưu bị lỗi; invalid: dữ liệu hỏng
  backedUp: boolean; // dữ liệu hỏng đã được cất sang "current-backup"
  raw: unknown; // dữ liệu hỏng, để tải về máy
}

let g: Guard = { role: "checking", problem: null, backedUp: false, raw: null };
const listeners = new Set<() => void>();
function set(u: Partial<Guard>) {
  g = { ...g, ...u };
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const getGuard = () => g;
export const useGuard = () => useSyncExternalStore(subscribe, getGuard);
export const subscribeGuard = subscribe;

/** Được tự lưu không: đúng thẻ chính và không có dữ liệu cũ đang chờ xử lý. */
export const canAutosave = (): boolean =>
  g.role === "primary" && g.problem !== "unreadable" && !(g.problem === "invalid" && !g.backedUp);

export function setBootProblem(problem: BootProblem, o: { backedUp?: boolean; raw?: unknown } = {}) {
  set({ problem, backedUp: !!o.backedUp, raw: o.raw ?? null });
}
/** Người dùng chọn "vẫn tự lưu" / "đóng". */
export const dismissProblem = () => set({ problem: null, raw: null });

const LOCK = "choreo-stage-tab";
const OPEN = "choreo-stage-open";
const hasLocks = () => typeof navigator !== "undefined" && !!navigator.locks;

let onTaken: (() => void) | null = null;
/** actions đăng ký: thẻ này vừa giành quyền thì lưu ngay bản của nó. */
export const onTakeOver = (f: () => void) => {
  onTaken = f;
};

function requestLock(steal: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise<void>(() => {}); // giữ tới khi đóng thẻ
      })
      .catch(() => {
        // thẻ khác giành quyền (steal) thì khoá của thẻ này bị huỷ
        if (g.role === "primary") set({ role: "taken" });
        resolve(false);
      });
  });
}

// ---------- dự phòng không có navigator.locks ----------

let bc: BroadcastChannel | null = null;
let othersSeen = false;

function channel(): BroadcastChannel | null {
  if (bc || typeof BroadcastChannel === "undefined") return bc;
  bc = new BroadcastChannel(LOCK);
  bc.onmessage = (e) => {
    const m = e.data;
    if (m === "hello") {
      othersSeen = true;
      bc!.postMessage(g.role === "primary" ? "here:primary" : "here");
    } else if (m === "here" || m === "here:primary") {
      othersSeen = true;
      if (m === "here:primary") primarySeen = true;
    } else if (m === "take" && g.role === "primary") set({ role: "taken" });
  };
  return bc;
}
let primarySeen = false;

/** Gọi lúc mở app, trước khi tự lưu. */
export async function claimTab(): Promise<void> {
  if (hasLocks()) {
    // khoá dùng chung: đếm số thẻ đang mở
    navigator.locks.request(OPEN, { mode: "shared" }, () => new Promise<void>(() => {})).catch(() => {});
    const ok = await requestLock(false);
    set({ role: ok ? "primary" : "secondary" });
    return;
  }
  const c = channel();
  if (!c) {
    set({ role: "primary" });
    return;
  }
  c.postMessage("hello");
  await new Promise((r) => setTimeout(r, 250));
  set({ role: primarySeen ? "secondary" : "primary" });
}

/** "Dùng thẻ này": giành quyền tự lưu từ thẻ kia rồi lưu ngay. */
export async function takeOver(): Promise<void> {
  if (hasLocks()) await requestLock(true);
  else channel()?.postMessage("take");
  set({ role: "primary" });
  onTaken?.();
}

/** Còn thẻ khác đang mở bài không (để khỏi dọn media thẻ kia còn dùng). */
export async function otherTabsOpen(): Promise<boolean> {
  if (hasLocks()) {
    try {
      const q = await navigator.locks.query();
      return (q.held ?? []).filter((l) => l.name === OPEN).length > 1 || g.role !== "primary";
    } catch {
      return true;
    }
  }
  return othersSeen || g.role !== "primary";
}
