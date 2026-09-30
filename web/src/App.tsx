import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Stage } from "./components/Stage";
import { Mannequin } from "./components/Mannequin";
import { PathEditor } from "./components/PathEditor";
import { CameraRig } from "./components/CameraRig";
import { CanvasCapture } from "./components/CanvasCapture";
import { PlaybackClock } from "./components/PlaybackClock";
import { Timeline } from "./components/Timeline";
import { Panel } from "./components/Panel";
import { useStore } from "./store";
import { loadLibrary } from "./clip";
import { saveProject, loadSaved } from "./persist";

export default function App() {
  const ready = useStore((s) => s.clip);
  const clips = useStore((s) => s.clips);
  const defaultClip = useStore((s) => s.defaultClip);
  const dancers = useStore((s) => s.dancers);
  const selectedId = useStore((s) => s.selectedId);
  const cameraMode = useStore((s) => s.cameraMode);
  const editingPath = useStore((s) => s.editingPath);
  const exporting = useStore((s) => s.exporting);
  const panelOpen = useStore((s) => s.panelOpen);
  const setLibrary = useStore((s) => s.setLibrary);
  const setPlaying = useStore((s) => s.setPlaying);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const togglePanel = useStore((s) => s.togglePanel);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLibrary("/clips")
      .then(({ index, clips }) => {
        // Đọc bản lưu TRƯỚC: setLibrary đổi `dancers` sẽ kích hoạt autosave và
        // ghi đè localStorage, nên phải nắm dữ liệu cũ trong tay trước.
        const saved = loadSaved();
        setLibrary(index, clips);
        if (saved) {
          const st = useStore.getState();
          st.loadProject(saved.dancers);
          st.setCameraMode(saved.cameraMode);
          if (saved.showBeatGrid !== st.showBeatGrid) st.toggleBeatGrid();
        }
        setPlaying(true);
      })
      .catch((e) => setError(String(e)));
  }, [setLibrary, setPlaying]);

  // Tự lưu khi vũ công / camera / mốc đổi (bỏ qua cập nhật `time` 60fps).
  useEffect(() => {
    let prevD = useStore.getState().dancers;
    let prevC = useStore.getState().cameraMode;
    let prevG = useStore.getState().showBeatGrid;
    return useStore.subscribe((s) => {
      if (s.dancers !== prevD || s.cameraMode !== prevC || s.showBeatGrid !== prevG) {
        prevD = s.dancers;
        prevC = s.cameraMode;
        prevG = s.showBeatGrid;
        saveProject();
      }
    });
  }, []);

  const orbit = cameraMode === "orbit" && !editingPath;

  return (
    <div className={"app" + (panelOpen ? " panel-open" : "")}>
      {/* Nút mở bảng điều khiển — chỉ hiện trên mobile (CSS). */}
      <button
        className="panel-toggle"
        aria-label="Mở bảng điều khiển"
        onClick={togglePanel}
      >
        ☰
      </button>
      {/* Nền mờ sau drawer trên mobile; chạm để đóng. */}
      <div
        className="backdrop"
        onClick={() => setPanelOpen(false)}
        aria-hidden="true"
      />

      <Panel />

      <div className="viewport">
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true }}
          camera={{ position: [3.5, 2.4, 5], fov: 45 }}
        >
          <color attach="background" args={["#12161c"]} />
          <Stage />
          <PlaybackClock />
          <PathEditor />
          <CameraRig />
          <CanvasCapture />
          {ready &&
            dancers.map((d) => (
              <Mannequin
                key={d.id}
                clip={clips[d.clipName] ?? ready}
                dancer={d}
                selected={d.id === selectedId}
                showLabel={dancers.length > 1}
              />
            ))}
          <OrbitControls
            enabled={orbit}
            target={[0, 1, 0]}
            enableDamping
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
        </Canvas>

        {error && <div className="error">Lỗi nạp clip: {error}</div>}
        {!ready && !error && <div className="loading">Đang nạp clip…</div>}
        {exporting && (
          <div className="rec-badge">
            <span className="rec-dot" /> Đang ghi video: {exporting}…
          </div>
        )}
        {editingPath && (
          <div className="edit-hint">
            Sửa đường đi: <b>click sàn</b> để thêm mốc · <b>kéo</b> để dời ·
            <b>chuột phải</b> để xoá
          </div>
        )}
      </div>

      <Timeline />
    </div>
  );
}
