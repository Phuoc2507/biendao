// Lưu/khôi phục dự án vào localStorage (per-viewer, không đồng bộ máy khác).
// Chỉ giữ phần do người dùng dựng: vũ công + chế độ camera + mốc sân khấu.

import { useStore, type Dancer, type CameraMode } from "./store";

const KEY = "choreo.project.v1";

interface Saved {
  dancers: Dancer[];
  cameraMode: CameraMode;
  showBeatGrid: boolean;
}

export function saveProject(): void {
  try {
    const s = useStore.getState();
    const data: Saved = {
      dancers: s.dancers,
      cameraMode: s.cameraMode,
      showBeatGrid: s.showBeatGrid,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — bỏ qua, app vẫn chạy */
  }
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Saved;
    if (!Array.isArray(d.dancers) || d.dancers.length === 0) return null;
    return d;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}
