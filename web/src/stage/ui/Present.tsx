// Trình chiếu toàn màn hình để tập: khung khán giả, số đếm to, tên đội hình,
// đội hình kế tiếp còn bao lâu. Điều khiển tự ẩn khi không rê chuột.

import { useEffect, useRef, useState } from "react";
import { nextFormation, segmentAt } from "../model";
import { countAt } from "../timing";
import { st, useProject } from "../store";
import * as clock from "../clock";
import { usePlaying, useSpeed, useTime } from "../clock";
import { jumpFormation, projectEnd } from "../actions";
import { AudienceView } from "./AudienceView";
import { PlanView } from "./PlanView";
import { Icon } from "./icons";

function Overlay() {
  const p = useProject();
  const t = useTime();
  const s = segmentAt(p.formations, t);
  const c = p.bpm ? countAt(t, p.bpm, p.downbeat) : null;
  const nxt = nextFormation(p.formations, t);
  const cur =
    s.kind === "hold" || s.kind === "after" ? p.formations[s.k].name
      : s.kind === "gap" ? `→ ${p.formations[s.k + 1].name}`
        : s.kind === "before" ? "Chuẩn bị" : "";
  const until = nxt ? nxt.start - t : 0;
  const end = projectEnd(p);
  return (
    <>
      <div className="ov fname">{cur}</div>
      {nxt && s.kind !== "gap" && until < 30 && (
        <div className="ov fnext">Tiếp: {nxt.name} trong {Math.max(0, until).toFixed(1)} s</div>
      )}
      {c && (
        <div className="ov bigcount">
          {c.beat}<span>lượt {c.eight}</span>
        </div>
      )}
      <div className="ov pbar"><i style={{ width: `${Math.min(100, (t / end) * 100)}%` }} /></div>
    </>
  );
}

export function Present() {
  const playing = usePlaying();
  const speed = useSpeed();
  const [show, setShow] = useState(true);
  const [mini, setMini] = useState(true);
  const timer = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    st().setUI({ presenting: false });
  };

  useEffect(() => {
    root.current?.requestFullscreen?.().catch(() => {});
    const onFs = () => {
      if (!document.fullscreenElement) st().setUI({ presenting: false });
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const poke = () => {
    setShow(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2500);
  };
  useEffect(() => {
    poke();
    return () => clearTimeout(timer.current);
  }, []);

  return (
    <div className="present" ref={root} onPointerMove={poke} style={{ cursor: show ? "default" : "none" }}>
      <AudienceView interactive={false} showTools={false} />
      <Overlay />
      {mini && (
        <div className="mini">
          <PlanView readOnly compact />
        </div>
      )}
      <div className={`ctl${show || !playing ? "" : " hide"}`}>
        <button className="btn icon" onClick={() => jumpFormation(-1)} title="Đội hình trước (PageUp)"><Icon name="stepBack" /></button>
        <button className="play" onClick={clock.toggle} title="Phát / dừng (Space)"><Icon name={playing ? "pause" : "play"} /></button>
        <button className="btn icon" onClick={() => jumpFormation(1)} title="Đội hình sau (PageDown)"><Icon name="stepFwd" /></button>
        <select className="btn" value={speed} onChange={(e) => clock.setSpeed(Number(e.target.value))} title="Tốc độ">
          {[0.5, 0.75, 1].map((v) => <option key={v} value={v}>{v}×</option>)}
        </select>
        <button className={`btn${mini ? " on" : ""}`} onClick={() => setMini(!mini)} title="Sơ đồ nhỏ"><Icon name="plan" /> Sơ đồ</button>
        <button className="btn" onClick={exit} title="Thoát (Esc)"><Icon name="close" /> Thoát</button>
      </div>
    </div>
  );
}
