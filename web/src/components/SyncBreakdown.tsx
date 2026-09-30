// Bảng "AI LỆCH NHỊP" (tầng đánh giá): độ lệch RIÊNG của từng vũ công so với tư
// thế TRUNG BÌNH nhóm tại playhead, tính bằng cm + thanh tỉ lệ + cờ ⚠ cho người
// lệch nổi bật. Subscribe `time` và `dancers` để cập nhật LIVE khi phát và khi
// sửa. Là component RIÊNG (không lồng trong Panel) nên việc bám `time` 60fps chỉ
// re-render bảng nhỏ này, KHÔNG re-render cả Panel. Chỉ hiện khi ≥2 vũ công.

import { useStore } from "../store";
import { groupDeviationAt, outlierIndex } from "../sync";

export function SyncBreakdown() {
  const time = useStore((s) => s.time);
  const dancers = useStore((s) => s.dancers);
  const clips = useStore((s) => s.clips);
  const layout = useStore((s) => s.clip);

  if (dancers.length < 2 || !layout) return null;
  const g = groupDeviationAt(clips, layout, dancers, time);
  if (!g) return null;
  const oi = outlierIndex(g);
  // Chuẩn hoá thanh theo người lệch nhất hiện tại (tránh chia 0 khi cả nhóm unison).
  const maxDev = Math.max(0.001, ...g.deviations);

  return (
    <div className="syncbox">
      <div className="camlabel" title="Độ lệch mỗi vũ công so với tư thế trung bình nhóm tại playhead">
        Ai lệch nhịp (tại playhead)
      </div>
      {dancers.map((d, i) => {
        const dev = g.deviations[i];
        const pct = Math.min(100, (dev / maxDev) * 100);
        const off = oi === i;
        return (
          <div className={"syncrow" + (off ? " off" : "")} key={d.id}>
            <span className="dot" style={{ background: d.color }} />
            <span className="nm">{d.name}</span>
            <span className="bar">
              <i style={{ width: `${pct}%`, background: d.color }} />
            </span>
            <span className="cm">
              {Math.round(dev * 100)}cm{off ? " ⚠" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
