// Bảng điều khiển: danh sách vũ công + chọn clip / vị trí / hướng / lật gương /
// lệch nhịp + đường đi + chế độ camera.

import { useRef } from "react";
import { useStore, type CameraMode } from "../store";
import { FORMATIONS, formationLabel } from "../formation";
import { clearSaved, exportProjectFile, importProjectFile } from "../persist";
import { recordCurrentView } from "../record";

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
  const exporting = useStore((s) => s.exporting);
  const formations = useStore((s) => s.formations);
  const {
    addDancer, cloneSelected, removeDancer, updateDancer, select, toggleBeatGrid,
    addClip, setClipAt, removeClipAt, moveClip,
    addFormation, removeFormation, clearFormations,
    setCameraMode, setEditingPath, clearPath,
  } = useStore.getState();

  const sel = dancers.find((d) => d.id === selectedId) ?? null;
  const beatPeriod = 60 / bpm;
  const hasPath = !!sel && sel.waypoints.length >= 2;
  const hasFormation = formations.length > 0;
  // Khi đội hình theo count đang lái, vị trí tĩnh & đường đi bị ghi đè -> khoá.
  const posLocked = hasPath || hasFormation;
  // count 1-based -> nhãn ô nhịp "ô B·c" (bar . count-trong-bar) cho dễ đọc.
  const cueBarLabel = (count: number): string => {
    const bar = Math.floor((count - 1) / beatsPerBar) + 1;
    const inBar = ((count - 1) % beatsPerBar) + 1;
    return `${bar}·${inBar}`;
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultClipName = clipIndex[0]?.name ?? "";

  // Nạp dàn dựng từ tệp .json người dùng chọn.
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại cùng tệp lần sau
    if (!f) return;
    importProjectFile(f).catch((err) =>
      alert("Không mở được tệp: " + String(err))
    );
  }

  // Ghi một vũ công theo góc nhìn hiện tại. `label` hiển thị trên badge/nút.
  async function recordDancer(id: string, name: string, label: string) {
    const st = useStore.getState();
    st.select(id);
    st.setExporting(label);
    // Chờ React commit selectedId để CameraRig bám đúng người trước khi ghi
    // (warmup trong recordCurrentView lo phần camera lerp hội tụ).
    await new Promise((r) => setTimeout(r, 60));
    const duration = st.duration || 8;
    const modeLabel = CAM_LABELS[st.cameraMode];
    const safe = `${name}-${modeLabel}`.replace(/\s+/g, "_");
    await recordCurrentView(duration, `choreo-${safe}.webm`);
  }

  // Xuất video góc nhìn hiện tại của vũ công đang chọn (một vòng lặp).
  async function exportView() {
    if (!sel || exporting) return;
    try {
      await recordDancer(sel.id, sel.name, sel.name);
    } catch (e) {
      alert("Không ghi được video: " + String(e));
    } finally {
      useStore.getState().setExporting(null);
    }
  }

  // Xuất lần lượt một video cho từng vũ công theo góc nhìn hiện tại —
  // hiện thực "mỗi thành viên một clip tập riêng" cho cả nhóm trong một lượt.
  async function exportAll() {
    if (exporting) return;
    const list = useStore.getState().dancers;
    if (list.length === 0) return;
    const prevSel = useStore.getState().selectedId;
    try {
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        await recordDancer(d.id, d.name, `${d.name} (${i + 1}/${list.length})`);
      }
    } catch (e) {
      alert("Không ghi được video cả nhóm: " + String(e));
    } finally {
      const st = useStore.getState();
      st.select(prevSel);
      st.setExporting(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h1>Choreo Sequencer</h1>
          <p className="sub">2-cam · sân khấu ảo · POV/mirror</p>
        </div>
        {/* Nút đóng drawer — chỉ hiện trên mobile (CSS). */}
        <button
          className="panel-close"
          aria-label="Đóng bảng điều khiển"
          onClick={() => useStore.getState().setPanelOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="row">
        <button onClick={addDancer}>+ Vũ công</button>
        <button onClick={cloneSelected} disabled={!sel}>⧉ Nhân bản</button>
        <button className="ghost" onClick={toggleBeatGrid}>
          {showBeatGrid ? "Ẩn mốc SK" : "Hiện mốc SK"}
        </button>
        <button
          className="ghost"
          title="Xoá dự án đã lưu và dựng lại từ đầu"
          onClick={() => {
            if (confirm("Đặt lại toàn bộ dàn dựng? Không thể hoàn tác.")) {
              clearSaved();
              location.reload();
            }
          }}
        >
          ↺ Đặt lại
        </button>
      </div>

      {/* Đội hình THEO COUNT: mỗi nút thêm một MỐC đội hình ở count hiện tại của
          playhead (xem count ở thanh dưới). Nhiều mốc -> cả nhóm TỰ TRƯỢT giữa
          các đội hình theo nhạc. Trùng count thì đổi hình mốc đó. */}
      <div className="fmbox">
        <div className="camrow">
          <span className="camlabel">Đội hình ở count này:</span>
          {FORMATIONS.map((f) => (
            <button
              key={f.shape}
              className="cam"
              title={`Thêm mốc "${f.label.toLowerCase()}" ở count hiện tại của playhead`}
              disabled={dancers.length < 2}
              onClick={() => addFormation(f.shape)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {hasFormation && (
          <div className="fmlist">
            {formations.map((c) => (
              <div className="fmcue" key={c.id}>
                <span className="fmcount">ô {cueBarLabel(c.count)}</span>
                <span className="fmshape">{formationLabel(c.shape)}</span>
                <button
                  className="x"
                  title="Xoá mốc đội hình"
                  onClick={() => removeFormation(c.id)}
                >
                  ×
                </button>
              </div>
            ))}
            <button className="seqadd" onClick={clearFormations}>
              Xoá tất cả mốc đội hình
            </button>
            <span className="mini">
              {formations.length === 1
                ? "1 mốc → đội hình tĩnh cả bài."
                : `${formations.length} mốc → nhóm tự trượt giữa các đội hình.`}{" "}
              Ghi đè vị trí tĩnh & đường đi.
            </span>
          </div>
        )}
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

      <div className="camrow">
        <button
          className="export"
          disabled={!sel || !!exporting}
          title="Ghi một vòng lặp của góc nhìn hiện tại ra tệp .webm để mang đi tập"
          onClick={exportView}
        >
          {exporting ? `● đang ghi ${exporting}…` : "⤓ Xuất video vũ công này"}
        </button>
        <button
          className="export"
          disabled={dancers.length === 0 || !!exporting}
          title="Ghi lần lượt một video cho từng vũ công theo góc nhìn hiện tại"
          onClick={exportAll}
        >
          ⤓⤓ Xuất cả nhóm
        </button>
      </div>

      <div className="camrow">
        <span className="camlabel">Dự án:</span>
        <button
          className="cam"
          title="Lưu toàn bộ dàn dựng ra tệp .json để chia sẻ / mang sang máy khác"
          onClick={exportProjectFile}
        >
          ⭳ Lưu tệp
        </button>
        <button
          className="cam"
          title="Mở một dàn dựng đã lưu từ tệp .json"
          onClick={() => fileRef.current?.click()}
        >
          ⭱ Mở tệp
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={onImportFile}
        />
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
            {d.sequence.length > 1 && (
              <span className="tag">×{d.sequence.length} clip</span>
            )}
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

          <label>Chuỗi động tác ({sel.sequence.length} clip)</label>
          {/* Mỗi hàng = một đoạn trong chuỗi, phát nối tiếp rồi lặp cả chuỗi.
              Đổi clip qua ô chọn; ↑/↓ đổi thứ tự; × xoá (giữ tối thiểu 1). */}
          <div className="seq">
            {sel.sequence.map((name, i) => (
              <div className="seqrow" key={i}>
                <span className="seqnum">{i + 1}</span>
                <select
                  value={name}
                  onChange={(e) => setClipAt(sel.id, i, e.target.value)}
                >
                  {clipIndex.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.label} · {c.bpm}bpm
                    </option>
                  ))}
                </select>
                <button
                  className="seqbtn"
                  title="Lên"
                  disabled={i === 0}
                  onClick={() => moveClip(sel.id, i, -1)}
                >
                  ↑
                </button>
                <button
                  className="seqbtn"
                  title="Xuống"
                  disabled={i === sel.sequence.length - 1}
                  onClick={() => moveClip(sel.id, i, 1)}
                >
                  ↓
                </button>
                <button
                  className="seqbtn x"
                  title="Xoá đoạn"
                  disabled={sel.sequence.length <= 1}
                  onClick={() => removeClipAt(sel.id, i)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="seqadd"
              onClick={() =>
                addClip(sel.id, sel.sequence[sel.sequence.length - 1] ?? defaultClipName)
              }
            >
              ＋ Thêm clip
            </button>
          </div>

          <label>
            Vị trí X: {sel.position[0].toFixed(2)} m{" "}
            {hasFormation ? "(theo đội hình)" : hasPath ? "(theo đường)" : ""}
          </label>
          <input
            type="range" min={-4} max={4} step={0.1} value={sel.position[0]}
            disabled={posLocked}
            onChange={(e) =>
              updateDancer(sel.id, {
                position: [parseFloat(e.target.value), sel.position[1], sel.position[2]],
              })
            }
          />

          <label>
            Vị trí Z: {sel.position[2].toFixed(2)} m{" "}
            {hasFormation ? "(theo đội hình)" : hasPath ? "(theo đường)" : ""}
          </label>
          <input
            type="range" min={-4} max={4} step={0.1} value={sel.position[2]}
            disabled={posLocked}
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
        Kéo chuột để xoay góc nhìn · lăn để zoom · <b>Space</b> phát/dừng ·
        <b>←/→</b> tua 1 phách. Clip demo là chuyển động tổng hợp — sẽ thay bằng
        mocap 2-cam thật.
      </p>
    </div>
  );
}
