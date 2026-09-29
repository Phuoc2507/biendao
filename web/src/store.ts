// Trạng thái toàn cục của sequencer (zustand).
// LƯU Ý hiệu năng: `time` được cập nhật ~60fps bởi PlaybackClock. Các component
// nóng (Mannequin) KHÔNG subscribe `time` mà đọc qua useStore.getState() trong
// useFrame để tránh re-render React mỗi khung.

import { create } from "zustand";
import type { ClipData } from "./clip";
import { clipDuration } from "./clip";

export interface Dancer {
  id: string;
  name: string;
  color: string;
  position: [number, number, number]; // vị trí trên sàn (mét)
  rotationY: number; // hướng mặt (radian)
  mirror: boolean; // lật gương (bài tập soi gương)
  timeOffset: number; // lệch thời gian so với clip gốc (giây) — canon/đuổi
}

const PALETTE = [
  "#4f8cff", "#ff5d5d", "#37d67a", "#ffb020",
  "#b56cff", "#00c2c7", "#ff7ab6", "#9aa7b2",
];

let counter = 0;
function makeDancer(partial: Partial<Dancer> = {}): Dancer {
  const idx = counter++;
  return {
    id: `d${idx}`,
    name: `Vũ công ${idx + 1}`,
    color: PALETTE[idx % PALETTE.length],
    position: [0, 0, 0],
    rotationY: 0,
    mirror: false,
    timeOffset: 0,
    ...partial,
  };
}

interface State {
  clip: ClipData | null;
  duration: number;
  time: number;
  playing: boolean;
  bpm: number;
  beatsPerBar: number;
  showBeatGrid: boolean;
  dancers: Dancer[];
  selectedId: string | null;

  setClip: (clip: ClipData) => void;
  setTime: (t: number) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  addDancer: () => void;
  cloneSelected: () => void;
  removeDancer: (id: string) => void;
  updateDancer: (id: string, patch: Partial<Dancer>) => void;
  select: (id: string | null) => void;
  toggleBeatGrid: () => void;
}

export const useStore = create<State>((set, get) => ({
  clip: null,
  duration: 0,
  time: 0,
  playing: false,
  bpm: 120,
  beatsPerBar: 8,
  showBeatGrid: true,
  dancers: [makeDancer({ position: [0, 0, 0] })],
  selectedId: "d0",

  setClip: (clip) =>
    set({
      clip,
      duration: clipDuration(clip),
      bpm: clip.beatGrid?.bpm ?? get().bpm,
      time: 0,
    }),
  setTime: (t) => set({ time: t }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),

  addDancer: () => {
    const n = get().dancers.length;
    const d = makeDancer({ position: [(n % 4) * 0.8 - 1.2, 0, Math.floor(n / 4) * 0.8] });
    set((s) => ({ dancers: [...s.dancers, d], selectedId: d.id }));
  },
  cloneSelected: () => {
    const { dancers, selectedId } = get();
    const src = dancers.find((d) => d.id === selectedId) ?? dancers[0];
    if (!src) return;
    const d = makeDancer({
      position: [src.position[0] + 0.8, src.position[1], src.position[2]],
      rotationY: src.rotationY,
      mirror: src.mirror,
      timeOffset: src.timeOffset,
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
}));
