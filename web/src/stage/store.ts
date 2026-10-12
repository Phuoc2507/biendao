// Trạng thái app: dự án (có hoàn tác) và trạng thái giao diện.

import { create } from "zustand";
import { type Project, emptyProject } from "./model";
import { makeBatcher } from "./history";

export type View = "plan" | "split" | "audience";
export type Tab = "dancers" | "formations" | "warnings";

export interface Toast {
  id: number;
  msg: string;
  undo?: boolean;
  kind?: "info" | "warn" | "error";
}

export interface UI {
  view: View;
  tab: Tab;
  selected: string[];
  selectedBlock: string | null;
  snap: boolean;
  showPaths: boolean;
  showGhosts: boolean;
  showNames: boolean;
  presenting: boolean;
  pxPerSec: number;
  saveState: "saved" | "saving" | "error";
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
  toast: Toast | null;

  load(p: Project): void;
  commit(fn: (p: Project) => Project): void;
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

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  ui: {
    view: typeof window !== "undefined" && window.innerWidth >= 1280 ? "split" : "plan",
    tab: "dancers",
    selected: [],
    selectedBlock: null,
    snap: true,
    showPaths: true,
    showGhosts: true,
    showNames: true,
    presenting: false,
    pxPerSec: 40,
    saveState: "saved",
    help: false,
    busy: null,
    camReset: 0,
    loaded: false,
  },
  past: [],
  future: [],
  gestureBase: null,
  toast: null,

  load(p) {
    set({ project: p, past: [], future: [], gestureBase: null });
  },
  commit(fn) {
    const cur = get().project;
    const next = fn(cur);
    if (next === cur) return;
    set({ project: next, past: [...get().past, cur].slice(-HISTORY), future: [] });
  },
  beginGesture() {
    if (!get().gestureBase) set({ gestureBase: get().project });
  },
  live(fn) {
    const cur = get().project;
    const next = fn(cur);
    if (next !== cur) set({ project: next });
  },
  endGesture() {
    const base = get().gestureBase;
    if (!base) return;
    if (base !== get().project)
      set({ past: [...get().past, base].slice(-HISTORY), future: [], gestureBase: null });
    else set({ gestureBase: null });
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project] });
  },
  setUI(u) {
    set({ ui: { ...get().ui, ...u } });
  },
  notify(msg, o = {}) {
    const id = ++toastId;
    set({ toast: { id, msg, ...o } });
    setTimeout(() => get().clearToast(id), o.undo ? 6000 : 3500);
  },
  clearToast(id) {
    if (get().toast?.id === id) set({ toast: null });
  },
}));

export const st = () => useStore.getState();
export const useProject = () => useStore((s) => s.project);
export const useUI = () => useStore((s) => s.ui);

// Gộp mọi commit bên trong (kể cả hàm async, lồng nhau) thành MỘT bước hoàn tác.
const batcher = makeBatcher<Project>(() => useStore.getState(), (s) => useStore.setState(s));
export const batch = batcher.batch;
export const inBatch = batcher.active;
