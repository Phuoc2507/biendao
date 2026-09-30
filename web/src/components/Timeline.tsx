// Thanh thời gian: play/pause, thanh trượt tua, hiển thị 8-count + nhịp hiện tại,
// và DẢI CHUỖI động tác của vũ công đang chọn (các clip xếp nối tiếp).

import { useStore } from "../store";
import { sequenceDurations } from "../clip";

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

  const beatPeriod = 60 / bpm;
  const beatIndex = duration > 0 ? Math.floor(time / beatPeriod) : 0;
  const bar = Math.floor(beatIndex / beatsPerBar) + 1;
  const countInBar = (beatIndex % beatsPerBar) + 1;

  // Sinh vạch nhịp phủ TOÀN BỘ thời lượng (chuỗi có thể dài hơn một clip nên
  // không dùng beatGrid của clip chuẩn nữa — dựng thẳng từ bpm).
  const beatTimes: number[] = [];
  if (duration > 0 && beatPeriod > 0) {
    for (let t = 0; t <= duration + 1e-6; t += beatPeriod) beatTimes.push(t);
  }
  const playPct = duration > 0 ? (time / duration) * 100 : 0;

  // Dải phân đoạn: một lượt chuỗi (0..tổng) của vũ công đang chọn.
  const sel = dancers.find((d) => d.id === selectedId) ?? null;
  const segDurs = sel ? sequenceDurations(clips, sel.sequence) : [];
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
        <div className="beats">
          {beatTimes.map((bt, i) => {
            const down = i % beatsPerBar === 0;
            const left = duration > 0 ? (bt / duration) * 100 : 0;
            return (
              <div key={i}>
                <div
                  className={"beat" + (down ? " down" : "")}
                  style={{ left: `${left}%` }}
                />
                {/* Số ô nhịp trên mỗi phách mạnh — giúp đọc cấu trúc 8-count. */}
                {down && (
                  <span className="barnum" style={{ left: `${left}%` }}>
                    {i / beatsPerBar + 1}
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
        <span className="count">
          {bar}·{countInBar}
        </span>
        <span className="secs">
          {time.toFixed(2)} / {duration.toFixed(2)}s
        </span>
        <span className="bpm">{bpm} BPM</span>
      </div>
    </div>
  );
}
