// Trạng thái toàn cục của sequencer (zustand).
// LƯU Ý hiệu năng: `time` được cập nhật ~60fps bởi PlaybackClock. Các component
// nóng (Mannequin) KHÔNG subscribe `time` mà đọc qua useStore.getState() trong
// useFrame để tránh re-render React mỗi khung.

import { create } from "zustand";
import type { ClipData, ClipIndexEntry } from "./clip";
import { clipDuration } from "./clip";

export type CameraMode = "orbit" | "follow" | "front";

export interface Dancer {
  id: string;
  name: string;
  color: string;
  clipName: string; // clip động tác đang gán
  position: [number, number, number]; // vị trí trên sàn khi KHÔNG có đường đi (mét)
  rotationY: number; // hướng mặt (radian)
  mirror: boolean; // lật gương (bài tập soi gương)
  timeOffset: number; // lệch thời gian so với clip gốc (giây) — canon/đuổi
  waypoints: [number, number][]; // đường đi trên sàn [x,z]; rỗng = đứng yên
  faceAlongPath: boolean; // tự xoay mặt theo hướng đường đi (Frenet)
}

const PALETTE = [
  "#4f8cff", "#ff5d5d", "#37d67a", "#ffb020",
  "#b56cff", "#00c2c7", "#ff7ab6", "#9aa7b2",
];

// Giới hạn sân khấu: kẹp waypoint để click gần chân trời không tạo toạ độ xa vô lý.
const STAGE = 6;
const clampXZ = (xz: [number, number]): [number, number] => [
  Math.max(-STAGE, Math.min(STAGE, xz[0])),
  Math.max(-STAGE, Math.min(STAGE, xz[1])),
];

let counter = 0;
function makeDancer(partial: Partial<Dancer> = {}): Dancer {
  const idx = counter++;
  return {
    id: `d${idx}`,
    name: `Vũ công ${idx + 1}`,
    color: PALETTE[idx % PALETTE.length],
    clipName: "",
    position: [0, 0, 0],
    rotationY: 0,
    mirror: false,
    timeOffset: 0,
    waypoints: [],
    faceAlongPath: true,
    ...partial,
  };
}

interface State {
  clips: Record<string, ClipData>;
  clipIndex: ClipIndexEntry[];
  defaultClip: string;
  clip: ClipData | null; // clip "chuẩn" để suy ra thời lượng/lưới nhịp chung
  duration: number;
  time: number;
  playing: boolean;
  bpm: number;
  beatsPerBar: number;
  showBeatGrid: boolean;
  cameraMode: CameraMode;
  editingPath: boolean;
  dancers: Dancer[];
  selectedId: string | null;
  exporting: string | null; // tên vũ công đang xuất video, null = không xuất

  setLibrary: (index: ClipIndexEntry[], clips: Record<string, ClipData>) => void;
  clipFor: (d: Dancer) => ClipData | null;
  setDancerClip: (id: string, clipName: string) => void;
  setTime: (t: number) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  addDancer: () => void;
  cloneSelected: () => void;
  removeDancer: (id: string) => void;
  updateDancer: (id: string, patch: Partial<Dancer>) => void;
  select: (id: string | null) => void;
  toggleBeatGrid: () => void;
  setCameraMode: (m: CameraMode) => void;
  setEditingPath: (v: boolean) => void;
  setExporting: (label: string | null) => void;
  // Đường đi
  addWaypoint: (id: string, xz: [number, number]) => void;
  updateWaypoint: (id: string, i: number, xz: [number, number]) => void;
  removeWaypoint: (id: string, i: number) => void;
  clearPath: (id: string) => void;
  // Lưu/tải
  loadProject: (dancers: Dancer[]) => void;
}

export const useStore = create<State>((set, get) => ({
  clips: {},
  clipIndex: [],
  defaultClip: "",
  clip: null,
  duration: 0,
  time: 0,
  playing: false,
  bpm: 120,
  beatsPerBar: 8,
  showBeatGrid: true,
  cameraMode: "orbit",
  editingPath: false,
  dancers: [makeDancer({ position: [0, 0, 0] })],
  selectedId: "d0",
  exporting: null,

  setLibrary: (index, clips) => {
    const defaultClip = index[0]?.name ?? "";
    const ref = clips[defaultClip] ?? null;
    set((s) => ({
      clips,
      clipIndex: index,
      defaultClip,
      clip: ref,
      duration: ref ? clipDuration(ref) : 0,
      bpm: ref?.beatGrid?.bpm ?? s.bpm,
      time: 0,
      dancers: s.dancers.map((d) =>
        d.clipName ? d : { ...d, clipName: defaultClip }
      ),
    }));
  },
  clipFor: (d) => {
    const { clips, defaultClip } = get();
    return clips[d.clipName] ?? clips[defaultClip] ?? null;
  },
  setDancerClip: (id, clipName) =>
    set((s) => ({
      dancers: s.dancers.map((d) => (d.id === id ? { ...d, clipName } : d)),
    })),
  setTime: (t) => set({ time: t }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),

  addDancer: () => {
    const { dancers, defaultClip } = get();
    const n = dancers.length;
    const d = makeDancer({
      clipName: defaultClip,
      position: [(n % 4) * 0.8 - 1.2, 0, Math.floor(n / 4) * 0.8],
    });
    set((s) => ({ dancers: [...s.dancers, d], selectedId: d.id }));
  },
  cloneSelected: () => {
    const { dancers, selectedId, defaultClip } = get();
    const src = dancers.find((d) => d.id === selectedId) ?? dancers[0];
    if (!src) return;
    const d = makeDancer({
      clipName: src.clipName || defaultClip,
      position: [src.position[0] + 0.8, src.position[1], src.position[2]],
      rotationY: src.rotationY,
      mirror: src.mirror,
      timeOffset: src.timeOffset,
      waypoints: src.waypoints.map((w) => [w[0] + 0.8, w[1]] as [number, number]),
      faceAlongPath: src.faceAlongPath,
    });
    set((s) => ({ dancers: [...s.dancers, d], selectedId: d.id }));
  },
  removeDancer: (id) =>
    set((s) => {
      const dancers = s.dancers.filter((d) => d.id !== id);
      return { dancers, selectedId: dancers.length ? dancers[0].id : null };
    }),
  updateDancer: (id, patch) =>
    set((s) => ({
      dancers: s.dancers.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  select: (id) => set({ selectedId: id }),
  toggleBeatGrid: () => set((s) => ({ showBeatGrid: !s.showBeatGrid })),
  setCameraMode: (m) => set({ cameraMode: m }),
  setEditingPath: (v) => set({ editingPath: v }),
  setExporting: (label) => set({ exporting: label }),

  addWaypoint: (id, xz) =>
    set((s) => ({
      dancers: s.dancers.map((d) =>
        d.id === id ? { ...d, waypoints: [...d.waypoints, clampXZ(xz)] } : d
      ),
    })),
  updateWaypoint: (id, i, xz) =>
    set((s) => ({
      dancers: s.dancers.map((d) =>
        d.id === id
          ? { ...d, waypoints: d.waypoints.map((w, k) => (k === i ? clampXZ(xz) : w)) }
          : d
      ),
    })),
  removeWaypoint: (id, i) =>
    set((s) => ({
      dancers: s.dancers.map((d) =>
        d.id === id
          ? { ...d, waypoints: d.waypoints.filter((_, k) => k !== i) }
          : d
      ),
    })),
  clearPath: (id) =>
    set((s) => ({
      dancers: s.dancers.map((d) => (d.id === id ? { ...d, waypoints: [] } : d)),
    })),

  loadProject: (dancers) => {
    // đảm bảo counter không đụng id cũ
    dancers.forEach((d) => {
      const n = parseInt(d.id.slice(1), 10);
      if (!Number.isNaN(n) && n >= counter) counter = n + 1;
    });
    set({ dancers, selectedId: dancers[0]?.id ?? null });
  },
}));
