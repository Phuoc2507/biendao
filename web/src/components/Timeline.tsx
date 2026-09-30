// Thanh thời gian: play/pause, thanh trượt tua, hiển thị 8-count + nhịp hiện tại,
// và DẢI CHUỖI động tác của vũ công đang chọn (các clip xếp nối tiếp).

import { useStore } from "../store";
import {
  sequenceDurations,
  sequenceBeatMarks,
  sequenceBpmAt,
  type BeatMark,
} from "../clip";
import { formationLabel } from "../formation";

export function Timeline() {
  const { time, duration, playing, bpm, beatsPerBar } = useStore((s) => ({
    time: s.time,
    duration: s.duration,
    playing: s.playing,
    bpm: s.bpm,
    beatsPerBar: s.beatsPerBar,
  }));
  const setTime = useStore((s) => s.setTime);
  const togglePlay = useStore((s) => s.togglePlay);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  // Chuỗi của vũ công đang chọn — để vẽ dải phân đoạn dưới thanh thời gian.
  const clips = useStore((s) => s.clips);
  const clipIndex = useStore((s) => s.clipIndex);
  const dancers = useStore((s) => s.dancers);
  const selectedId = useStore((s) => s.selectedId);
  const formations = useStore((s) => s.formations);

  const beatPeriod = 60 / bpm; // đồng hồ SÂN KHẤU — chỉ dùng cho mốc đội hình.

  // Vũ công đang chọn + chuỗi của họ (lưới nhịp bám theo đúng chuỗi này).
  const sel = dancers.find((d) => d.id === selectedId) ?? null;
  const segDurs = sel ? sequenceDurations(clips, sel.sequence) : [];

  // Lưới nhịp TRUNG THỰC: nối beatGrid riêng của từng clip trong chuỗi. Nếu không
  // dựng được (chưa chọn vũ công / clip thiếu beatGrid) mới lùi về lưới đều BPM
  // sân khấu để thanh thời gian không trống.
  let marks: BeatMark[] = sel
    ? sequenceBeatMarks(clips, sel.sequence, duration, bpm)
    : [];
  if (marks.length === 0 && duration > 0 && beatPeriod > 0) {
    marks = [];
    let k = 0;
    for (let t = 0; t <= duration + 1e-6; t += beatPeriod, k++)
      marks.push({ t, down: k % beatsPerBar === 0 });
  }
  // Số ô nhịp tuần tự: đánh số theo từng phách MẠNH thật (mỗi downbeat = 1 ô nhịp).
  let barCount = 0;
  const barLabels = marks.map((m) => (m.down ? ++barCount : 0));

  // Vị trí phách hiện tại theo LƯỚI THẬT (nhất quán với vạch đang vẽ): đếm số ô
  // nhịp đã qua và số phách kể từ phách mạnh gần nhất.
  let curBar = 0;
  let curBeat = 1;
  for (const m of marks) {
    if (m.t > time + 1e-3) break;
    if (m.down) {
      curBar += 1;
      curBeat = 1;
    } else {
      curBeat += 1;
    }
  }
  if (curBar === 0) curBar = 1; // trước phách mạnh đầu tiên
  // BPM của clip đang nằm dưới playhead — không còn áp cứng 120 sân khấu.
  const curBpm = sel
    ? Math.round(sequenceBpmAt(clips, sel.sequence, time, bpm))
    : bpm;
  const playPct = duration > 0 ? (time / duration) * 100 : 0;

  // Dải phân đoạn: một lượt chuỗi (0..tổng) của vũ công đang chọn.
  const clipLabel = (name: string) =>
    clipIndex.find((c) => c.name === name)?.label ?? name;
  let segAcc = 0;
  const segments =
    sel && duration > 0
      ? sel.sequence.map((name, i) => {
          const left = (segAcc / duration) * 100;
          const width = (segDurs[i] / duration) * 100;
          segAcc += segDurs[i];
          return { name, left, width, alt: i % 2 === 1 };
        })
      : [];

  return (
    <div className="timeline">
      <button
        className="play"
        onClick={togglePlay}
        title="Phát/Dừng (Space) · ←/→ tua 1 phách"
      >
        {playing ? "⏸" : "▶"}
      </button>

      <div className="track">
        {/* Dải chuỗi động tác của vũ công đang chọn: mỗi ô = một clip nối tiếp. */}
        {segments.length > 1 && (
          <div className="segstrip" title="Chuỗi động tác của vũ công đang chọn">
            {segments.map((s, i) => (
              <div
                key={i}
                className={"seg" + (s.alt ? " alt" : "")}
                style={{
                  left: `${s.left}%`,
                  width: `${s.width}%`,
                  background: sel ? sel.color : "var(--accent)",
                }}
              >
                <span>{clipLabel(s.name)}</span>
              </div>
            ))}
          </div>
        )}
        {/* Cờ mốc đội hình: vạch dọc + nhãn hình, cho thấy chỗ nhóm đổi đội hình. */}
        {duration > 0 &&
          formations.map((c) => {
            const t = (c.count - 1) * beatPeriod;
            const left = Math.min(100, (t / duration) * 100);
            return (
              <div
                key={c.id}
                className="fcue-mark"
                style={{ left: `${left}%` }}
                title={`Đội hình: ${formationLabel(c.shape)} (count ${c.count})`}
              >
                <span className="fcue-tag">{formationLabel(c.shape)}</span>
              </div>
            );
          })}
        <div className="beats">
          {marks.map((m, i) => {
            const left = duration > 0 ? (m.t / duration) * 100 : 0;
            return (
              <div key={i}>
                <div
                  className={"beat" + (m.down ? " down" : "")}
                  style={{ left: `${left}%` }}
                />
                {/* Số ô nhịp trên mỗi phách mạnh THẬT — giúp đọc cấu trúc ô nhịp. */}
                {m.down && (
                  <span className="barnum" style={{ left: `${left}%` }}>
                    {barLabels[i]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Vạch playhead theo thời gian hiện tại (rõ hơn nút trượt). */}
        <div className="playhead" style={{ left: `${playPct}%` }} />
        <input
          className="scrub"
          type="range"
          min={0}
          max={duration || 1}
          step={0.001}
          value={time}
          onChange={(e) => setTime(parseFloat(e.target.value))}
        />
      </div>

      {/* Tốc độ phát — làm chậm để tập từng động tác (chuẩn của app học nhảy). */}
      <div className="speed" title="Tốc độ xem trước (không đổi video xuất)">
        {[0.25, 0.5, 1].map((r) => (
          <button
            key={r}
            className={"spd" + (speed === r ? " active" : "")}
            onClick={() => setSpeed(r)}
          >
            {r === 1 ? "1×" : `${r}×`}
          </button>
        ))}
      </div>

      <div className="readout">
        <span className="count" title="Ô nhịp · phách (theo nhịp thật của clip)">
          {curBar}·{curBeat}
        </span>
        <span className="secs">
          {time.toFixed(2)} / {duration.toFixed(2)}s
        </span>
        <span className="bpm" title="BPM của clip đang phát dưới playhead">
          {curBpm} BPM
        </span>
      </div>
    </div>
  );
}
