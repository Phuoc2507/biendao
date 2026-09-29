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

// ---- Xuất/nhập ra tệp .json để chia sẻ dàn dựng giữa các máy / thành viên ----

interface ProjectFile extends Saved {
  format: "choreo-project";
  version: 1;
  savedAt: string;
}

// Tải dàn dựng hiện tại về một tệp .json mang đi được.
export function exportProjectFile(): void {
  const s = useStore.getState();
  const data: ProjectFile = {
    format: "choreo-project",
    version: 1,
    savedAt: new Date().toISOString(),
    dancers: s.dancers,
    cameraMode: s.cameraMode,
    showBeatGrid: s.showBeatGrid,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const stamp = data.savedAt.slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `choreo-project-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Nạp dàn dựng từ một tệp .json đã xuất trước đó. Trả lỗi (chuỗi) nếu tệp sai.
export async function importProjectFile(file: File): Promise<void> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Tệp không phải JSON hợp lệ");
  }
  const d = data as Partial<ProjectFile>;
  if (
    !d ||
    typeof d !== "object" ||
    !Array.isArray(d.dancers) ||
    d.dancers.length === 0
  ) {
    throw new Error("Tệp không chứa dàn dựng hợp lệ");
  }
  const st = useStore.getState();
  st.loadProject(d.dancers as Dancer[]);
  if (d.cameraMode) st.setCameraMode(d.cameraMode);
  if (typeof d.showBeatGrid === "boolean" && d.showBeatGrid !== st.showBeatGrid) {
    st.toggleBeatGrid();
  }
  saveProject();
}
