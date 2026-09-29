// Thanh thời gian: play/pause, thanh trượt tua, hiển thị 8-count + nhịp hiện tại.

import { useStore } from "../store";

export function Timeline() {
  const { time, duration, playing, bpm, beatsPerBar, clip } = useStore((s) => ({
    time: s.time,
    duration: s.duration,
    playing: s.playing,
    bpm: s.bpm,
    beatsPerBar: s.beatsPerBar,
    clip: s.clip,
  }));
  const setTime = useStore((s) => s.setTime);
  const togglePlay = useStore((s) => s.togglePlay);

  const beatPeriod = 60 / bpm;
  const beatIndex = duration > 0 ? Math.floor(time / beatPeriod) : 0;
  const bar = Math.floor(beatIndex / beatsPerBar) + 1;
  const countInBar = (beatIndex % beatsPerBar) + 1;

  const beatTimes = clip?.beatGrid?.beatTimes ?? [];

  return (
    <div className="timeline">
      <button className="play" onClick={togglePlay}>
        {playing ? "⏸" : "▶"}
      </button>

      <div className="track">
        <div className="beats">
          {beatTimes.map((bt, i) => (
            <div
              key={i}
              className={"beat" + (i % beatsPerBar === 0 ? " down" : "")}
              style={{ left: `${duration > 0 ? (bt / duration) * 100 : 0}%` }}
            />
          ))}
        </div>
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
