// Bảng điều khiển: danh sách vũ công + chỉnh vị trí / hướng / lật gương / lệch nhịp.

import { useStore } from "../store";

export function Panel() {
  const dancers = useStore((s) => s.dancers);
  const selectedId = useStore((s) => s.selectedId);
  const bpm = useStore((s) => s.bpm);
  const beatsPerBar = useStore((s) => s.beatsPerBar);
  const showBeatGrid = useStore((s) => s.showBeatGrid);
  const {
    addDancer, cloneSelected, removeDancer, updateDancer, select, toggleBeatGrid,
  } = useStore.getState();

  const sel = dancers.find((d) => d.id === selectedId) ?? null;
  const beatPeriod = 60 / bpm;

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

          <label>Vị trí X: {sel.position[0].toFixed(2)} m</label>
          <input
            type="range" min={-4} max={4} step={0.1} value={sel.position[0]}
            onChange={(e) =>
              updateDancer(sel.id, {
                position: [parseFloat(e.target.value), sel.position[1], sel.position[2]],
              })
            }
          />

          <label>Vị trí Z: {sel.position[2].toFixed(2)} m</label>
          <input
            type="range" min={-4} max={4} step={0.1} value={sel.position[2]}
            onChange={(e) =>
              updateDancer(sel.id, {
                position: [sel.position[0], sel.position[1], parseFloat(e.target.value)],
              })
            }
          />

          <label>Hướng mặt: {Math.round((sel.rotationY * 180) / Math.PI)}°</label>
          <input
            type="range" min={-Math.PI} max={Math.PI} step={0.05} value={sel.rotationY}
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
        </div>
      )}

      <p className="hint">
        Kéo chuột để xoay góc nhìn · lăn để zoom. Clip demo là chuyển động tổng
        hợp — sẽ thay bằng mocap 2-cam thật.
      </p>
    </div>
  );
}
