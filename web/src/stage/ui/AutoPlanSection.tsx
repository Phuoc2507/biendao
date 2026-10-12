// Mục "Tự chia đội hình" trong thẻ Đội hình: một bấm ra cả bài.

import { useState } from "react";
import { useProject } from "../store";
import { autoFormations } from "../actions";
import { Icon } from "./icons";
import { NumField } from "./NumField";

export function AutoPlanSection() {
  const p = useProject();
  const [mode, setMode] = useState<"count" | "every">("every");
  const [count, setCount] = useState(8);
  const [every, setEvery] = useState(4);
  // có nhịp thì mỗi đoạn ít nhất 2 lượt 8 (autoplan tự nâng lên 2)
  const minEvery = p.bpm ? 2 : 1;
  const ev = Math.max(minEvery, every);
  const unit = p.bpm ? "lượt 8" : "lượt 8 (4 s)";
  return (
    <div className="section">
      <h4>Tự chia đội hình</h4>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Cách chia">
          <button className={mode === "every" ? "on" : ""} aria-pressed={mode === "every"} onClick={() => setMode("every")}>Mỗi</button>
          <button className={mode === "count" ? "on" : ""} aria-pressed={mode === "count"} onClick={() => setMode("count")}>Số đội hình</button>
        </div>
        {mode === "every" ? (
          <label className="field">
            <NumField
              value={ev} min={minEvery} max={32} quantum={1} step={1}
              onCommit={(v) => v !== null && setEvery(v)}
              aria-label={`Mỗi bao nhiêu ${unit}`} style={{ width: 44 }}
            />
            {unit}
          </label>
        ) : (
          <label className="field">
            <NumField
              value={count} min={1} max={60} quantum={1} step={1}
              onCommit={(v) => v !== null && setCount(v)}
              aria-label="Số đội hình" style={{ width: 44 }}
            />
            đội hình
          </label>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn sm primary" disabled={!p.dancers.length}
          title="Thay toàn bộ đội hình bằng các hình xoay vòng, gán người ít đi chéo nhau (Ctrl Z để hoàn tác)"
          onClick={() => autoFormations(mode === "count" ? { count } : { everyEights: ev })}
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
