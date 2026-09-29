// Bảng điều khiển: danh sách vũ công + chọn clip / vị trí / hướng / lật gương /
// lệch nhịp + đường đi + chế độ camera.

import { useStore, type CameraMode } from "../store";

const CAM_LABELS: Record<CameraMode, string> = {
  orbit: "Tự do",
  follow: "Bám lưng",
  front: "Soi gương",
};

export function Panel() {
  const dancers = useStore((s) => s.dancers);
  const selectedId = useStore((s) => s.selectedId);
  const clipIndex = useStore((s) => s.clipIndex);
  const bpm = useStore((s) => s.bpm);
  const beatsPerBar = useStore((s) => s.beatsPerBar);
  const showBeatGrid = useStore((s) => s.showBeatGrid);
  const cameraMode = useStore((s) => s.cameraMode);
  const editingPath = useStore((s) => s.editingPath);
  const {
    addDancer, cloneSelected, removeDancer, updateDancer, select, toggleBeatGrid,
    setDancerClip, setCameraMode, setEditingPath, clearPath,
  } = useStore.getState();

  const sel = dancers.find((d) => d.id === selectedId) ?? null;
  const beatPeriod = 60 / bpm;
  const hasPath = !!sel && sel.waypoints.length >= 2;

  return (
    <div className="panel">
      <h1>Choreo Sequencer</h1>
      <p className="sub">2-cam · sân khấu ảo · POV/mirror</p>

      <div className="row">
        <button onClick={addDancer}>+ Vũ công</button>
        <button onClick={cloneSelected} disabled={!sel}>⧉ Nhân bản</button>
        <button className="ghost" onClick={toggleBeatGrid}>
          {showBeatGrid ? "Ẩn mốc SK" : "Hiện mốc SK"}
        </button>
      </div>

      <div className="camrow">
        <span className="camlabel">Camera:</span>
        {(["orbit", "follow", "front"] as CameraMode[]).map((m) => (
          <button
            key={m}
            className={"cam" + (cameraMode === m ? " active" : "")}
            onClick={() => setCameraMode(m)}
          >
            {CAM_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="list">
        {dancers.map((d) => (
          <div
            key={d.id}
            className={"item" + (d.id === selectedId ? " active" : "")}
            onClick={() => select(d.id)}
          >
            <span className="dot" style={{ background: d.color }} />
            <span className="nm">{d.name}</span>
            {d.mirror && <span className="tag">gương</span>}
            {d.waypoints.length >= 2 && <span className="tag">đường</span>}
            {d.timeOffset !== 0 && (
              <span className="tag">+{d.timeOffset.toFixed(2)}s</span>
            )}
            <button
              className="x"
              onClick={(e) => {
                e.stopPropagation();
                removeDancer(d.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {sel && (
        <div className="editor">
          <h2>{sel.name}</h2>

          <label>Động tác</label>
          <select
            value={sel.clipName}
            onChange={(e) => setDancerClip(sel.id, e.target.value)}
          >
            {clipIndex.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label} · {c.bpm}bpm
              </option>
            ))}
          </select>

          <label>Vị trí X: {sel.position[0].toFixed(2)} m {hasPath && "(theo đường)"}</label>
          <input
            type="range" min={-4} max={4} step={0.1} value={sel.position[0]}
            disabled={hasPath}
            onChange={(e) =>
              updateDancer(sel.id, {
                position: [parseFloat(e.target.value), sel.position[1], sel.position[2]],
              })
            }
          />

          <label>Vị trí Z: {sel.position[2].toFixed(2)} m {hasPath && "(theo đường)"}</label>
          <input
            type="range" min={-4} max={4} step={0.1} value={sel.position[2]}
            disabled={hasPath}
            onChange={(e) =>
              updateDancer(sel.id, {
                position: [sel.position[0], sel.position[1], parseFloat(e.target.value)],
              })
            }
          />

          <label>
            Hướng mặt: {Math.round((sel.rotationY * 180) / Math.PI)}°
            {hasPath && sel.faceAlongPath && " (theo đường)"}
          </label>
          <input
            type="range" min={-Math.PI} max={Math.PI} step={0.05} value={sel.rotationY}
            disabled={hasPath && sel.faceAlongPath}
            onChange={(e) => updateDancer(sel.id, { rotationY: parseFloat(e.target.value) })}
          />

          <label>
            Lệch nhịp: {sel.timeOffset.toFixed(2)}s
            {" "}({(sel.timeOffset / beatPeriod).toFixed(1)} phách)
          </label>
          <input
            type="range" min={0} max={beatPeriod * beatsPerBar} step={beatPeriod / 4}
            value={sel.timeOffset}
            onChange={(e) => updateDancer(sel.id, { timeOffset: parseFloat(e.target.value) })}
          />

          <label className="check">
            <input
              type="checkbox" checked={sel.mirror}
              onChange={(e) => updateDancer(sel.id, { mirror: e.target.checked })}
            />
            Lật gương (bài tập soi gương)
          </label>

          <div className="pathbox">
            <div className="pathrow">
              <button
                className={editingPath ? "active" : ""}
                onClick={() => setEditingPath(!editingPath)}
              >
                {editingPath ? "✓ Đang sửa đường" : "✎ Sửa đường đi"}
              </button>
              <button
                className="ghost"
                disabled={sel.waypoints.length === 0}
                onClick={() => clearPath(sel.id)}
              >
                Xoá đường
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox" checked={sel.faceAlongPath}
                onChange={(e) => updateDancer(sel.id, { faceAlongPath: e.target.checked })}
              />
              Xoay mặt theo đường đi
            </label>
            <span className="mini">{sel.waypoints.length} mốc</span>
          </div>
        </div>
      )}

      <p className="hint">
        Kéo chuột để xoay góc nhìn · lăn để zoom. Clip demo là chuyển động tổng
        hợp — sẽ thay bằng mocap 2-cam thật.
      </p>
    </div>
  );
}
