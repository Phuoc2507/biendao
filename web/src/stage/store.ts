// Trạng thái app: dự án (có hoàn tác) và trạng thái giao diện.

import { create } from "zustand";
import { type Project, emptyProject } from "./model";
import { canMerge, makeBatcher, pruneSelection } from "./history";
import { type Toast, pushToast, toastMs } from "./toasts";
import { savedPlanFromStage, savedSide, startSideOpen } from "./layout";

export type { Toast };

export type View = "plan" | "split" | "audience";
export type Tab = "dancers" | "formations" | "warnings";

export interface UI {
  view: View;
  sideOpen: boolean; // cột trái (điện thoại: ngăn kéo đè lên)
  tab: Tab;
  selected: string[];
  selectedBlock: string | null;
  snap: boolean;
  showPaths: boolean;
  showGhosts: boolean;
  showNames: boolean;
  planFromStage: boolean; // sơ đồ nhìn từ sân khấu ra (xoay 180°), nhớ theo máy
  presenting: boolean;
  learning: boolean; // chế độ Học động tác từ video cả đội (không lưu vào dự án)
  // trình chiếu & tập (không lưu vào dự án)
  me: string | null; countIn: boolean; orbitFree: boolean; mirror: boolean; bright: boolean; showNext: boolean;
  pxPerSec: number;
  saveState: "saved" | "saving" | "error";
  saveError: string | null; // lời báo khi không lưu được
  help: boolean;
  busy: { msg: string; progress: number; cancel?: boolean } | null; // cancel: hiện nút Dừng
  camReset: number; // tăng để đưa camera khán giả về chỗ cũ
  loaded: boolean;
}

interface State {
  project: Project;
  ui: UI;
  past: Project[];
  future: Project[];
  gestureBase: Project | null;
  /** Các thông báo đang hiện, cũ trước mới sau (tối đa 3). */
  toasts: Toast[];
  /** Thông báo mới nhất. */
  toast: Toast | null;

  load(p: Project): void;
  /** merge: các lần sửa liền nhau cùng khoá (kéo thanh, gõ nhịp) gộp thành một bước hoàn tác. */
  commit(fn: (p: Project) => Project, merge?: string): void;
  beginGesture(): void;
  live(fn: (p: Project) => Project): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  setUI(u: Partial<UI>): void;
  notify(msg: string, o?: { undo?: boolean; kind?: Toast["kind"] }): void;
  clearToast(id: number): void;
}

const HISTORY = 100;
let toastId = 0;
let lastMerge: string | null = null;
let lastAt = 0;
const stamp = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  ui: {
    view: typeof window !== "undefined" && window.innerWidth >= 1280 ? "split" : "plan",
    sideOpen: typeof window === "undefined" || startSideOpen(savedSide(), window.innerWidth, window.innerHeight),
    tab: "dancers",
    selected: [],
    selectedBlock: null,
    snap: true,
    showPaths: true,
    showGhosts: true,
    showNames: true,
    planFromStage: savedPlanFromStage(),
    presenting: false,
    learning: false,
    me: null, countIn: true, orbitFree: false, mirror: false, bright: false, showNext: false,
    pxPerSec: 40,
    saveState: "saved",
    saveError: null,
    help: false,
    busy: null,
    camReset: 0,
    loaded: false,
  },
  past: [],
  future: [],
  gestureBase: null,
  toasts: [],
  toast: null,

  load(p) {
    lastMerge = null;
    set({ project: p, past: [], future: [], gestureBase: null, ui: pruneSelection(get().ui, p) });
  },
  commit(fn, merge) {
    const s = get();
    const cur = s.project;
    const next = fn(cur);
    if (next === cur) return;
    const at = stamp();
    if (!s.gestureBase && s.past.length && canMerge(lastMerge, lastAt, merge, at)) set({ project: next, future: [] });
    else set({ project: next, past: [...s.past, cur].slice(-HISTORY), future: [] });
    lastMerge = merge ?? null;
    lastAt = at;
  },
  beginGesture() {
    lastMerge = null;
    if (!get().gestureBase) set({ gestureBase: get().project });
  },
  live(fn) {
    const cur = get().project;
    const next = fn(cur);
    if (next !== cur) set({ project: next });
  },
  endGesture() {
    lastMerge = null;
    const base = get().gestureBase;
    if (!base) return;
    if (base !== get().project)
      set({ past: [...get().past, base].slice(-HISTORY), future: [], gestureBase: null });
    else set({ gestureBase: null });
  },
  undo() {
    // đang kéo dở: chốt bước kéo trước, hoàn tác xong thì kéo tiếp từ chỗ mới
    const dragging = !!get().gestureBase;
    if (dragging) get().endGesture();
    lastMerge = null;
    const { past, project, future, ui } = get();
    if (past.length) {
      const prev = past[past.length - 1];
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future], ui: pruneSelection(ui, prev) });
    }
    if (dragging) set({ gestureBase: get().project });
  },
  redo() {
    const dragging = !!get().gestureBase;
    if (dragging) get().endGesture();
    lastMerge = null;
    const { past, project, future, ui } = get();
    if (future.length) {
      const next = future[0];
      set({ project: next, future: future.slice(1), past: [...past, project], ui: pruneSelection(ui, next) });
    }
    if (dragging) set({ gestureBase: get().project });
  },
  setUI(u) {
    set({ ui: { ...get().ui, ...u } });
  },
  notify(msg, o = {}) {
    const t: Toast = { id: ++toastId, msg, ...o, at: o.undo ? get().project : undefined };
    const toasts = pushToast(get().toasts, t);
    set({ toasts, toast: toasts[toasts.length - 1] ?? null });
    setTimeout(() => get().clearToast(t.id), toastMs(t));
  },
  clearToast(id) {
    const toasts = get().toasts.filter((x) => x.id !== id);
    if (toasts.length !== get().toasts.length) set({ toasts, toast: toasts[toasts.length - 1] ?? null });
  },
}));

export const st = () => useStore.getState();
export const useProject = () => useStore((s) => s.project);
export const useUI = () => useStore((s) => s.ui);

// Gộp mọi commit bên trong (kể cả hàm async, lồng nhau) thành MỘT bước hoàn tác.
const batcher = makeBatcher<Project>(() => useStore.getState(), (s) => useStore.setState(s));
export const batch = batcher.batch;
export const inBatch = batcher.active;
