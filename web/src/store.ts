// Trạng thái toàn cục của sequencer (zustand).
// LƯU Ý hiệu năng: `time` được cập nhật ~60fps bởi PlaybackClock. Các component
// nóng (Mannequin) KHÔNG subscribe `time` mà đọc qua useStore.getState() trong
// useFrame để tránh re-render React mỗi khung.

import { create } from "zustand";
import type { ClipData, ClipIndexEntry } from "./clip";
import { sequenceTotal } from "./clip";
import { formationPositions, type FormationShape } from "./formation";

export type CameraMode = "orbit" | "follow" | "front";

export interface Dancer {
  id: string;
  name: string;
  color: string;
  sequence: string[]; // CHUỖI clip phát nối tiếp (lặp cả chuỗi); >=0 phần tử
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
    sequence: [],
    position: [0, 0, 0],
    rotationY: 0,
    mirror: false,
    timeOffset: 0,
    waypoints: [],
    faceAlongPath: true,
    ...partial,
  };
}

// Thời lượng chung của dàn dựng = chuỗi DÀI NHẤT trong các vũ công (kiểu DAW:
// độ dài bản phối = track dài nhất). Vũ công ngắn hơn tự lặp chuỗi của mình.
function stageDuration(
  clips: Record<string, ClipData>,
  dancers: Dancer[]
): number {
  let max = 0;
  for (const d of dancers) max = Math.max(max, sequenceTotal(clips, d.sequence));
  return max;
}

// Di trú dự án cũ: bản lưu trước đây mỗi vũ công có `clipName` (một clip); nay
// dùng `sequence` (chuỗi). Chuyển clipName -> [clipName], đảm bảo luôn có mảng.
function normalizeDancer(d: Dancer & { clipName?: string }): Dancer {
  if (Array.isArray(d.sequence)) return d;
  const seq = d.clipName ? [d.clipName] : [];
  const { clipName: _drop, ...rest } = d;
  void _drop;
  return { ...rest, sequence: seq } as Dancer;
}

interface State {
  clips: Record<string, ClipData>;
  clipIndex: ClipIndexEntry[];
  defaultClip: string;
  clip: ClipData | null; // clip "chuẩn" để suy ra thời lượng/lưới nhịp chung
  duration: number;
  time: number;
  playing: boolean;
  speed: number; // tốc độ phát (1 = thật, <1 = chậm để tập từng động tác)
  bpm: number;
  beatsPerBar: number;
  showBeatGrid: boolean;
  cameraMode: CameraMode;
  editingPath: boolean;
  dancers: Dancer[];
  selectedId: string | null;
  exporting: string | null; // tên vũ công đang xuất video, null = không xuất
  panelOpen: boolean; // trên mobile: bảng điều khiển (drawer) đang mở hay không

  setLibrary: (index: ClipIndexEntry[], clips: Record<string, ClipData>) => void;
  // Chuỗi động tác (sequencer): thêm/đổi/xoá/di chuyển clip trong chuỗi vũ công
  addClip: (id: string, clipName: string) => void;
  setClipAt: (id: string, i: number, clipName: string) => void;
  removeClipAt: (id: string, i: number) => void;
  moveClip: (id: string, i: number, dir: -1 | 1) => void;
  setTime: (t: number) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (v: number) => void;
  addDancer: () => void;
  cloneSelected: () => void;
  removeDancer: (id: string) => void;
  updateDancer: (id: string, patch: Partial<Dancer>) => void;
  select: (id: string | null) => void;
  // Đội hình: xếp CẢ NHÓM thành hình khối, quay mặt khán giả (xoá đường đi).
  applyFormation: (shape: FormationShape) => void;
  toggleBeatGrid: () => void;
  setCameraMode: (m: CameraMode) => void;
  setEditingPath: (v: boolean) => void;
  setExporting: (label: string | null) => void;
  setPanelOpen: (v: boolean) => void;
  togglePanel: () => void;
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
  speed: 1,
  bpm: 120,
  beatsPerBar: 8,
  showBeatGrid: true,
  cameraMode: "orbit",
  editingPath: false,
  dancers: [makeDancer({ position: [0, 0, 0] })],
  selectedId: "d0",
  exporting: null,
  panelOpen: false, // mặc định đóng để mobile thấy sân khấu 3D trước; desktop luôn hiện qua CSS

  setLibrary: (index, clips) => {
    const defaultClip = index[0]?.name ?? "";
    const ref = clips[defaultClip] ?? null;
    set((s) => {
      // Vũ công chưa có chuỗi (mới tạo / dự án cũ đã di trú thành []) được gán
      // clip mặc định làm đoạn đầu tiên để luôn có động tác để phát.
      const dancers = s.dancers.map((d) =>
        d.sequence.length ? d : { ...d, sequence: [defaultClip] }
      );
      return {
        clips,
        clipIndex: index,
        defaultClip,
        clip: ref, // clip "chuẩn" để suy ra bpm/lưới nhịp
        duration: stageDuration(clips, dancers),
        bpm: ref?.beatGrid?.bpm ?? s.bpm,
        time: 0,
        dancers,
      };
    });
  },
  addClip: (id, clipName) =>
    set((s) => {
      const dancers = s.dancers.map((d) =>
        d.id === id ? { ...d, sequence: [...d.sequence, clipName] } : d
      );
      return { dancers, duration: stageDuration(s.clips, dancers) };
    }),
  setClipAt: (id, i, clipName) =>
    set((s) => {
      const dancers = s.dancers.map((d) =>
        d.id === id
          ? { ...d, sequence: d.sequence.map((c, k) => (k === i ? clipName : c)) }
          : d
      );
      return { dancers, duration: stageDuration(s.clips, dancers) };
    }),
  removeClipAt: (id, i) =>
    set((s) => {
      const dancers = s.dancers.map((d) => {
        if (d.id !== id) return d;
        // Giữ tối thiểu 1 đoạn: không cho xoá đoạn cuối cùng.
        if (d.sequence.length <= 1) return d;
        return { ...d, sequence: d.sequence.filter((_, k) => k !== i) };
      });
      return {
        dancers,
        duration: stageDuration(s.clips, dancers),
        time: Math.min(s.time, stageDuration(s.clips, dancers)),
      };
    }),
  moveClip: (id, i, dir) =>
    set((s) => {
      const dancers = s.dancers.map((d) => {
        if (d.id !== id) return d;
        const j = i + dir;
        if (j < 0 || j >= d.sequence.length) return d;
        const seq = d.sequence.slice();
        [seq[i], seq[j]] = [seq[j], seq[i]];
        return { ...d, sequence: seq };
      });
      // Đổi thứ tự không đổi tổng thời lượng, nhưng gọi lại cho nhất quán.
      return { dancers, duration: stageDuration(s.clips, dancers) };
    }),
  setTime: (t) => set({ time: t }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (v) => set({ speed: v }),

  addDancer: () => {
    const { dancers, defaultClip } = get();
    const n = dancers.length;
    const d = makeDancer({
      sequence: defaultClip ? [defaultClip] : [],
      position: [(n % 4) * 0.8 - 1.2, 0, Math.floor(n / 4) * 0.8],
    });
    set((s) => {
      const list = [...s.dancers, d];
      return {
        dancers: list,
        selectedId: d.id,
        duration: stageDuration(s.clips, list),
      };
    });
  },
  cloneSelected: () => {
    const { dancers, selectedId, defaultClip } = get();
    const src = dancers.find((d) => d.id === selectedId) ?? dancers[0];
    if (!src) return;
    const d = makeDancer({
      // Nhân bản trọn CHUỖI động tác của người nguồn.
      sequence: src.sequence.length ? [...src.sequence] : defaultClip ? [defaultClip] : [],
      position: [src.position[0] + 0.8, src.position[1], src.position[2]],
      rotationY: src.rotationY,
      mirror: src.mirror,
      timeOffset: src.timeOffset,
      waypoints: src.waypoints.map((w) => [w[0] + 0.8, w[1]] as [number, number]),
      faceAlongPath: src.faceAlongPath,
    });
    set((s) => {
      const list = [...s.dancers, d];
      return {
        dancers: list,
        selectedId: d.id,
        duration: stageDuration(s.clips, list),
      };
    });
  },
  removeDancer: (id) =>
    set((s) => {
      const dancers = s.dancers.filter((d) => d.id !== id);
      return {
        dancers,
        selectedId: dancers.length ? dancers[0].id : null,
        duration: stageDuration(s.clips, dancers),
      };
    }),
  updateDancer: (id, patch) =>
    set((s) => ({
      dancers: s.dancers.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  select: (id) => set({ selectedId: id }),
  applyFormation: (shape) =>
    set((s) => {
      const pos = formationPositions(shape, s.dancers.length);
      const dancers = s.dancers.map((d, i) => {
        const p = pos[i] ?? [d.position[0], d.position[2]];
        return {
          ...d,
          // Giữ nguyên chiều cao y; đặt x,z theo đội hình.
          position: [p[0], d.position[1], p[1]] as [number, number, number],
          rotationY: 0, // quay mặt về khán giả (+Z)
          waypoints: [], // xoá đường đi để vị trí tĩnh của đội hình hiện đúng
        };
      });
      return { dancers };
    }),
  toggleBeatGrid: () => set((s) => ({ showBeatGrid: !s.showBeatGrid })),
  setCameraMode: (m) => set({ cameraMode: m }),
  setEditingPath: (v) => set({ editingPath: v }),
  setExporting: (label) => set({ exporting: label }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

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
    // Di trú dự án cũ (clipName -> sequence) trước khi nạp.
    const migrated = dancers.map((d) => normalizeDancer(d as Dancer));
    // đảm bảo counter không đụng id cũ
    migrated.forEach((d) => {
      const n = parseInt(d.id.slice(1), 10);
      if (!Number.isNaN(n) && n >= counter) counter = n + 1;
    });
    set((s) => ({
      dancers: migrated,
      selectedId: migrated[0]?.id ?? null,
      duration: stageDuration(s.clips, migrated),
    }));
  },
}));
