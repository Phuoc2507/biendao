// Trình chiếu toàn màn hình để tập: khung khán giả, số đếm to, tên đội hình,
// đội hình kế tiếp còn bao lâu. Điều khiển tự ẩn khi không rê chuột.
// Đang trình chiếu thì KHOÁ SỬA: không kéo được người, chỉ xem và tập.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Vec2, nextFormation, segmentAt } from "../model";
import { countAt } from "../timing";
import { type UI, st, useProject, useUI } from "../store";
import * as clock from "../clock";
import { usePlaying, useSpeed, useTime } from "../clock";
import { jumpFormation, projectEnd } from "../actions";
import { meCue, untilText } from "../rehearse";
import { cancelCountIn, isCounting, playWithCountIn, useCountIn, useCounting } from "../countin";
import { AudienceView } from "./AudienceView";
import { PlanView } from "./PlanView";
import { MePicker } from "./MePicker";
import { describePos } from "./hooks";
import { Icon } from "./icons";
import "./rehearse.css";

const play = () => {
  const p = st().project;
  playWithCountIn({ on: st().ui.countIn, bpm: p.bpm, downbeat: p.downbeat, end: projectEnd(p) });
};
/** điện thoại: "tall" dựng đứng (hẹp), "short" nằm ngang (thấp); đổi theo khi xoay máy */
function useNarrow(): "tall" | "short" | null {
  const q = (): "tall" | "short" | null => (window.innerWidth < 600 ? "tall" : window.innerHeight < 500 ? "short" : null);
  const [n, setN] = useState(q);
  useEffect(() => {
    const on = () => setN(q());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return n;
}
const resetCam = () => st().setUI({ camReset: st().ui.camReset + 1 });

function Overlay() {
  const p = useProject();
  const ui = useUI();
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
  const { width: W, depth: D } = p.stage;
  const me = p.dancers.some((d) => d.id === ui.me && !d.hidden) ? (ui.me as string) : null;
  // sau lưng: trái phải theo người múa (ngược khán giả); gương lật thêm lần nữa
  const flipX = ui.mirror !== ui.presentBack;
  const cue = me
    ? meCue(p.formations, me, t, p.bpm, (q: Vec2) => describePos(flipX ? -q[0] : q[0], q[1], W, D))
    : null;
  const label = useCountIn();
  return (
    <>
      <div className="ov fname">{cur}</div>
      {nxt && s.kind !== "gap" && until < 30 && (
        <div className="ov fnext">Tiếp: {nxt.name} · {untilText(Math.max(0, until), p.bpm)}</div>
      )}
      {cue && (
        <div className="ov rh-cue">
          {cue}
          <small>trái phải {flipX ? "theo hướng người múa" : "theo hướng khán giả nhìn"}</small>
        </div>
      )}
      {c && (
        <div className="ov bigcount">
          {c.beat}<span>lượt {c.eight}</span>
        </div>
      )}
      {label && (
        <div className="ov rh-countin">
          <b key={label}>{label}</b>
          <span>Space hoặc Esc để huỷ</span>
        </div>
      )}
      <div className="ov pbar"><i style={{ width: `${Math.min(100, (t / end) * 100)}%` }} /></div>
    </>
  );
}

export function Present() {
  const playing = usePlaying();
  const counting = useCounting();
  const speed = useSpeed();
  const ui = useUI();
  const bpm = useProject().bpm;
  const [show, setShow] = useState(true);
  // điện thoại dựng đứng: sơ đồ nhỏ tắt sẵn cho khung khán giả đủ chỗ
  const [mini, setMini] = useState(() => !(window.innerWidth < 600 && window.innerHeight > window.innerWidth));
  const timer = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  const exit = () => {
    cancelCountIn();
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

  // phím riêng của trình chiếu, bắt trước shortcuts.ts (pha capture)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        (document.activeElement as HTMLElement | null)?.blur?.();
        if (!e.repeat) play();
        return;
      }
      if (e.key === "Escape" && isCounting()) {
        e.preventDefault();
        e.stopPropagation();
        cancelCountIn();
        return;
      }
      if (e.key === "b" || e.key === "B") {
        e.stopPropagation();
        st().setUI({ presentBack: !st().ui.presentBack });
        return;
      }
      if (e.key === "c" || e.key === "C") {
        e.stopPropagation();
        resetCam();
        return;
      }
      // tua đội hình trong lúc đếm vào: bỏ đếm, để shortcuts.ts tua tiếp
      if (["PageUp", "PageDown", "ArrowLeft", "ArrowRight", "Home"].includes(e.key) && isCounting()) cancelCountIn();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      cancelCountIn();
    };
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

  const step = (d: 1 | -1) => {
    cancelCountIn();
    jumpFormation(d);
  };
  const toggle = (k: "countIn" | "mirror" | "bright" | "orbitFree" | "presentBack") => st().setUI({ [k]: !st().ui[k] } as Partial<UI>);
  const hasMe = !!ui.me;
  const ctlShown = show || !playing;
  const narrow = useNarrow();

  // thanh điều khiển rộng (màn 1024) đè lên nhãn Khoá sửa: nhấc nhãn lên trên thanh
  const ctl = useRef<HTMLDivElement>(null);
  const lock = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  const [ctlH, setCtlH] = useState(0);
  useLayoutEffect(() => {
    const c = ctl.current, l = lock.current;
    if (!c || !l) return;
    const measure = () => {
      const a = c.getBoundingClientRect(), b = l.getBoundingClientRect();
      const host = root.current?.getBoundingClientRect();
      const left = host ? b.left - host.left : b.left;
      const ctlLeft = host ? a.left - host.left : a.left;
      setLift(ctlLeft < left + b.width + 8 ? Math.round(a.height) + 8 : 0);
      setCtlH(Math.round(a.height));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(c);
    if (root.current) ro?.observe(root.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  return (
    <div
      className="present"
      ref={root}
      onPointerMove={poke}
      style={{ cursor: show ? "default" : "none", ["--ctl-h" as string]: `${ctlH}px` }}
    >
      <div className={`rh-stage${ui.mirror ? " mirror" : ""}`}>
        <AudienceView
          interactive={false}
          showTools={false}
          orbit={ui.orbitFree}
          bright={ui.bright}
          preset={ui.presentBack ? "back" : "front"}
          safe={narrow === "tall"
            ? { top: hasMe ? 230 : 110, bottom: (ctlH || 130) + 64 + (mini ? 212 : 0), side: 12 }
            : narrow === "short"
              ? { top: hasMe ? 130 : 70, bottom: (ctlH || 90) + 30, side: 12 }
              : { top: hasMe ? 150 : 110, bottom: 92, side: 16 }}
        />
      </div>
      <Overlay />
      {mini && (
        <div className={`mini rh-mini${bpm ? "" : " nobpm"}`}>
          <PlanView readOnly compact mirror={ui.mirror} fromStage={ui.presentBack} />
        </div>
      )}
      <div
        ref={lock}
        className="rh-lock"
        style={ctlShown && lift ? { bottom: 22 + lift } : undefined}
        title="Đang trình chiếu: không kéo hay sửa được người">
        <Icon name="lock" /> Khoá sửa{ui.orbitFree ? "" : " · khoá góc nhìn"}
      </div>
      <div ref={ctl} className={`ctl rh-ctl${ctlShown ? "" : " hide"}`}>
        <button className="btn icon" onClick={() => step(-1)} title="Đội hình trước (PageUp)"><Icon name="stepBack" /></button>
        <button className="play" onClick={play} title="Phát / dừng (Space)">
          <Icon name={playing || counting ? "pause" : "play"} />
        </button>
        <button className="btn icon" onClick={() => step(1)} title="Đội hình sau (PageDown)"><Icon name="stepFwd" /></button>
        <select
          className="btn"
          value={speed}
          onChange={(e) => {
            clock.setSpeed(Number(e.target.value));
            e.target.blur();
          }}
          title="Tốc độ"
        >
          {[0.5, 0.75, 1].map((v) => <option key={v} value={v}>{v}×</option>)}
        </select>
        <button className={`btn${ui.countIn ? " on" : ""}`} onClick={() => toggle("countIn")} title="Đếm 5 · 6 · 7 · 8 trước khi phát">
          5-6-7-8
        </button>
        <MePicker />
        <button className={`btn${ui.mirror ? " on" : ""}`} onClick={() => toggle("mirror")} title="Lật trái phải như soi gương">
          <Icon name="mirror" /> Gương
        </button>
        <button
          className={`btn${ui.presentBack ? " on" : ""}`}
          onClick={() => toggle("presentBack")}
          title="Nhìn từ sau lưng người múa ra khán giả: trái phải như người múa (B)"
        >
          <Icon name="turn" /> Sau lưng
        </button>
        <button className={`btn${ui.bright ? " on" : ""}`} onClick={() => toggle("bright")} title="Sân sáng hơn cho máy chiếu">
          <Icon name="sun" /> Sáng
        </button>
        <button
          className={`btn icon${ui.orbitFree ? " on" : ""}`}
          onClick={() => toggle("orbitFree")}
          title={ui.orbitFree ? "Khoá góc nhìn" : "Mở khoá góc nhìn (kéo chuột để xoay)"}
        >
          <Icon name={ui.orbitFree ? "unlock" : "lock"} />
        </button>
        <button className="btn icon" onClick={resetCam} title="Đặt lại góc nhìn (C)"><Icon name="camera" /></button>
        <button className={`btn${mini ? " on" : ""}`} onClick={() => setMini(!mini)} title="Sơ đồ nhỏ"><Icon name="plan" /> Sơ đồ</button>
        <button className="btn" onClick={exit} title="Thoát (Esc)"><Icon name="close" /> Thoát</button>
      </div>
    </div>
  );
}
