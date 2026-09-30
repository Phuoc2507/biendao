import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

// Góc nhìn mặc định của chế độ Tự do — dùng chung cho camera Canvas và nút
// "Đặt lại góc" để hai nơi không lệch nhau.
const CAM_HOME: [number, number, number] = [3.5, 2.4, 5];
const CAM_TARGET: [number, number, number] = [0, 1, 0];
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
  const controlsRef = useRef<OrbitControlsImpl>(null);

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

  // Phím tắt kiểu DAW: Space = phát/dừng, ←/→ = tua lùi/tới 1 phách.
  // Bỏ qua khi con trỏ đang trong ô nhập (input/select/textarea) để không
  // nuốt phím gõ; ←/→ tự dừng phát để tua chính xác.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "SELECT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      const st = useStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        st.togglePlay();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        const beat = 60 / st.bpm;
        const dir = e.code === "ArrowLeft" ? -1 : 1;
        st.setPlaying(false);
        const next = Math.min(st.duration, Math.max(0, st.time + dir * beat));
        st.setTime(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
          camera={{ position: CAM_HOME, fov: 45 }}
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
            ref={controlsRef}
            enabled={orbit}
            target={CAM_TARGET}
            enableDamping
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
        </Canvas>

        {/* Về góc nhìn mặc định — chỉ hiện ở chế độ Tự do (dễ bị trôi khi xoay). */}
        {orbit && (
          <button
            className="view-reset"
            title="Về góc nhìn mặc định"
            onClick={() => {
              // Đặt tường minh về HOME (tất định) thay vì reset() — reset khôi
              // phục trạng thái lúc-mount, có thể lệch khung hình mong muốn.
              const ctl = controlsRef.current;
              if (!ctl) return;
              // enableDamping để lại QUÁN TÍNH (sphericalDelta) sau khi kéo: các
              // khung sau vẫn xoay tiếp và kéo camera TRÔI khỏi HOME. Trường quán
              // tính là biến closure private nên không zero trực tiếp được — thay
              // vào đó tắt damping rồi update() một lần: khi damping tắt, update()
              // tự đặt quán tính về 0 ở cuối. Sau đó mới ghim HOME và update() lần
              // nữa (quán tính đã =0 nên camera đứng yên đúng HOME), rồi bật lại
              // damping để vẫn mượt khi kéo tay.
              const dampWas = ctl.enableDamping;
              ctl.enableDamping = false;
              ctl.update(); // áp & XOÁ quán tính còn lại
              ctl.object.position.set(...CAM_HOME);
              ctl.target.set(...CAM_TARGET);
              ctl.update(); // ghim HOME sạch (không còn quán tính)
              ctl.enableDamping = dampWas;
            }}
          >
            ⤾ Đặt lại góc
          </button>
        )}

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
