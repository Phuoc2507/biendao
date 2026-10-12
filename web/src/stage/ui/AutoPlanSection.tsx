// Mục "Tự chia đội hình" trong thẻ Đội hình: một bấm ra cả bài.

import { useState } from "react";
import { useProject } from "../store";
import { autoFormations } from "../actions";
import { Icon } from "./icons";

export function AutoPlanSection() {
  const p = useProject();
  const [mode, setMode] = useState<"count" | "every">("every");
  const [count, setCount] = useState(8);
  const [every, setEvery] = useState(4);
  const unit = p.bpm ? "lượt 8" : "lượt 8 (4 s)";
  return (
    <div className="section">
      <h4>Tự chia đội hình</h4>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div className="seg">
          <button className={mode === "every" ? "on" : ""} onClick={() => setMode("every")}>Mỗi</button>
          <button className={mode === "count" ? "on" : ""} onClick={() => setMode("count")}>Số đội hình</button>
        </div>
        {mode === "every" ? (
          <label className="field">
            <input type="number" min={1} max={32} step={1} value={every} onChange={(e) => setEvery(Math.max(1, Math.min(32, Math.round(Number(e.target.value) || 1))))} />
            {unit}
          </label>
        ) : (
          <label className="field">
            <input type="number" min={1} max={60} step={1} value={count} onChange={(e) => setCount(Math.max(1, Math.min(60, Math.round(Number(e.target.value) || 1))))} />
            đội hình
          </label>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn sm primary" disabled={!p.dancers.length}
          title="Thay toàn bộ đội hình bằng các hình xoay vòng, gán người ít đi chéo nhau (Ctrl Z để hoàn tác)"
          onClick={() => autoFormations(mode === "count" ? { count } : { everyEights: every })}
        >
          <Icon name="sync" /> Tạo
        </button>
        <span className="dim" style={{ flex: 1 }}>
          {p.musicId ? "Đổi đội hình ở chỗ nhạc đổi, " : ""}
          {p.bpm ? "bám vạch lượt 8" : "chưa có nhịp: chia theo mốc 4 s"}
        </span>
      </div>
    </div>
  );
}
