// Dòng thời gian: thước (giây + lượt 8), sóng âm, dải ĐỘI HÌNH (khối đứng kéo
// được, mép kéo đổi độ dài, phần gạch chéo là lúc chuyển), mỗi vũ công một dải
// video (kéo ngang để căn nhạc bằng tay), vạch phát.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Formation, type SongMark, moveBlock, setBlockTimes } from "../model";
import { fmtCounts, fmtTime, snapTime } from "../timing";
import { st, useProject, useUI } from "../store";
import * as clock from "../clock";
import { useLoop, usePlaying, useSpeed, useTime } from "../clock";
import { music, PEAK_RATE } from "../media";
import {
  addFormation, liveDancer, projectEnd, renameBlock, addMarkNow, moveMarkTo, removeMarkById, renameMarkTo, suggestMarks,
} from "../actions";
import { markAt } from "../marks";
import { rowKeys, useHoldIndex, useMediaVersion, useWarnings } from "./hooks";
import { commaDec, fmtSigned } from "./num";
import { Icon } from "./icons";
import { tlHeight } from "../layout";

const RULER = 26;
const MARKS = 24;
const WAVE = 40;
const FORMS = 40;
const VID = 22;
const NAMES_W = 132;

function loadHeight(): number {
  try {
    const v = Number(localStorage.getItem("stage.tlHeight"));
    if (v >= 120 && v <= 600) return v;
  } catch {
    /* bỏ qua */
  }
  return 0;
}

/** Chiều cao cửa sổ, đổi theo khi kéo cửa sổ. */
function useWinH(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

export function Timeline() {
  const p = useProject();
  const ui = useUI();
  const pps = ui.pxPerSec;
  const end = projectEnd(p);
  const scroll = useRef<HTMLDivElement>(null);
  const names = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const auto = 34 + RULER + MARKS + WAVE + FORMS + p.dancers.length * VID + 14;
  const [hUser, setHUser] = useState(loadHeight);
  const winH = useWinH();
  const height = tlHeight(auto, hUser, winH);
  const innerW = Math.ceil(end * pps) + 240;
  const warnings = useWarnings();

  const snapT = (t: number, alt: boolean) => (st().ui.snap && !alt ? snapTime(t, p.bpm, p.downbeat) : t);
  const xToT = (clientX: number) => {
    const el = scroll.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft) / pps);
  };

  // ---------- tua bằng thước / sóng ----------
  const onScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    clock.seek(snapT(xToT(e.clientX), e.altKey));
    const move = (ev: PointerEvent) => clock.seek(snapT(xToT(ev.clientX), ev.altKey));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------- phóng to ----------
  const zoomTo = (next: number, anchorClientX?: number) => {
    const el = scroll.current;
    const z = Math.max(8, Math.min(400, next));
    if (!el) return st().setUI({ pxPerSec: z });
    const r = el.getBoundingClientRect();
    const ax = anchorClientX !== undefined ? anchorClientX - r.left : clock.now() * pps - el.scrollLeft;
    const tAnchor = (ax + el.scrollLeft) / pps;
    st().setUI({ pxPerSec: z });
    requestAnimationFrame(() => {
      if (scroll.current) scroll.current.scrollLeft = tAnchor * z - ax;
    });
  };
  const fit = () => {
    const el = scroll.current;
    if (!el) return;
    st().setUI({ pxPerSec: Math.max(8, Math.min(400, (el.clientWidth - 40) / end)) });
    requestAnimationFrame(() => scroll.current && (scroll.current.scrollLeft = 0));
  };
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomTo(st().ui.pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX);
      } else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0 && el.scrollHeight <= el.clientHeight + 2) {
        // không có gì để cuộn dọc: lăn chuột cuộn ngang
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });
  useEffect(() => {
    const f = () => fit();
    window.addEventListener("stage:fit", f);
    return () => window.removeEventListener("stage:fit", f);
  });

  // ---------- kéo đổi chiều cao ----------
  const onResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = height;
    // nhớ chiều cao mới nhất (biến `height` trong closure là số cũ lúc bắt đầu kéo)
    let last = h0;
    let moved = false;
    const move = (ev: PointerEvent) => {
      last = Math.max(120, Math.min(600, h0 - (ev.clientY - y0)));
      moved = true;
      setHUser(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) return;
      try {
        localStorage.setItem("stage.tlHeight", String(Math.round(last)));
      } catch {
        /* bỏ qua */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onScroll = () => {
    if (names.current && scroll.current) names.current.scrollTop = scroll.current.scrollTop;
  };

  const sel = ui.selectedBlock ? p.formations.find((f) => f.id === ui.selectedBlock) : null;

  return (
    <div className="tl" style={{ height }}>
      <div className="tl-resize" onPointerDown={onResize} title="Kéo để đổi chiều cao" />
      <div className="tl-head">
        <button className="btn sm primary" onClick={addFormation} title="Chép đội hình đang đứng thành đội hình mới ngay sau (Enter)">
          <Icon name="plus" /> Đội hình
        </button>
        <LoopButton sel={sel} fs={p.formations} />
        <SpeedSelect />
        <span className="dim" style={{ marginLeft: 6 }}>
          {sel ? `${sel.name}: ${fmtTime(sel.start)} → ${fmtTime(sel.end)} (${commaDec(fmtCounts(sel.end - sel.start, p.bpm))})` :"Bấm khối đội hình để chọn · kéo mép để đổi độ dài · Alt để bỏ bám phách"}
        </span>
        <div className="grow" />
        <button className={`btn sm${follow ? " on" : ""}`} onClick={() => setFollow(!follow)} title="Tự cuộn theo vạch phát" aria-pressed={follow}>
          <Icon name="follow" /> Tự cuộn
        </button>
        <button className="btn sm icon" onClick={() => zoomTo(pps / 1.4)} title="Thu nhỏ (Ctrl + lăn chuột)" aria-label="Thu nhỏ"><Icon name="zoomOut" /></button>
        <button className="btn sm icon" onClick={() => zoomTo(pps * 1.4)} title="Phóng to (Ctrl + lăn chuột)" aria-label="Phóng to"><Icon name="zoomIn" /></button>
        <button className="btn sm icon" onClick={fit} title="Vừa khung (Shift+Z)" aria-label="Vừa khung"><Icon name="fit" /></button>
      </div>
      <div className="tl-body">
        <div className="tl-names" ref={names}>
          <div style={{ height: RULER, borderBottom: "1px solid var(--line)" }} />
          <div className="nm mk-row" style={{ height: MARKS }}>
            <span className="mk-title">Mốc</span>
            <button className="mk-btn" onClick={() => addMarkNow()} title="Thêm mốc đoạn nhạc ở vạch phát (B)" aria-label="Thêm mốc ở vạch phát">
              <Icon name="plus" size={13} />
            </button>
            <button
              className="mk-btn" onClick={suggestMarks} disabled={!p.musicId}
              title="Gợi ý mốc từ nhạc: đặt mốc Đoạn 1, Đoạn 2... ở chỗ nhạc đổi mạnh (không đè mốc đã có)" aria-label="Gợi ý mốc từ nhạc"
            >
              <Icon name="sync" size={13} />
            </button>
          </div>
          <div className="nm big" style={{ height: WAVE }}><Icon name="music" size={14} /> {p.musicName ? "Nhạc" : "Chưa có nhạc"}</div>
          <div className="nm big" style={{ height: FORMS }}>Đội hình</div>
          {p.dancers.map((d) => (
            <div key={d.id} className="nm" style={{ opacity: d.hidden ? 0.4 : 1 }}>
              <i style={{ background: d.color }} />
              {d.name}
              {d.mediaId && !d.alignConfident && <span title="Khớp nhạc chưa chắc" style={{ color: "var(--yellow)" }}>⚠</span>}
            </div>
          ))}
        </div>
        <div className="tl-scroll" ref={scroll} onScroll={onScroll}>
          <div className="tl-inner" style={{ width: innerW }}>
            <Ruler end={end} pps={pps} bpm={p.bpm} downbeat={p.downbeat} onScrub={onScrub} />
            <MarkLane marks={p.marks ?? []} pps={pps} snapT={snapT} xToT={xToT} />
            <Wave pps={pps} width={innerW} onScrub={onScrub} />
            <FormLane fs={p.formations} pps={pps} snapT={snapT} xToT={xToT} warnTimes={warnings} bpm={p.bpm} />
            {p.dancers.map((d) => (
              <VidLane key={d.id} d={d} pps={pps} xToT={xToT} />
            ))}
            <MarkLines marks={p.marks ?? []} pps={pps} />
            <Playhead pps={pps} scroll={scroll} follow={follow} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeedSelect() {
  const s = useSpeed();
  return (
    <select
      className="btn sm" value={s} onChange={(e) => clock.setSpeed(Number(e.target.value))}
      title="Tốc độ phát (tập chậm)" aria-label="Tốc độ phát" style={{ paddingRight: 4 }}
    >
      {[0.5, 0.75, 1].map((v) => (
        <option key={v} value={v}>{v === 1 ? "1×" : `${v}×`}</option>
      ))}
    </select>
  );
}

function LoopButton({ sel, fs }: { sel: Formation | null | undefined; fs: Formation[] }) {
  const loop = useLoop();
  return (
    <button className={`btn sm${loop ? " on" : ""}`} onClick={toggleLoop} title="Lặp đoạn chuyển vào đội hình đang chọn (L)" disabled={!loop && !sel && fs.length === 0} aria-pressed={!!loop}>
      <Icon name="loop" /> Lặp
    </button>
  );
}

/** Đoạn lặp: từ cuối khối trước (hoặc 2 s trước) tới cuối khối chọn. */
export function loopRangeFor(fs: Formation[], id: string | null, t: number): { a: number; b: number } | null {
  let i = id ? fs.findIndex((f) => f.id === id) : -1;
  if (i < 0) i = fs.findIndex((f) => f.end >= t);
  if (i < 0) return null;
  const f = fs[i];
  const a = i > 0 ? Math.max(0, fs[i - 1].end - 1) : Math.max(0, f.start - 2);
  return { a, b: f.end + 0.5 };
}

/** Bật/tắt lặp đoạn chuyển vào đội hình đang chọn (hoặc đang tới). */
export function toggleLoop() {
  if (clock.getLoop()) return clock.setLoop(null);
  const r = loopRangeFor(st().project.formations, st().ui.selectedBlock, clock.now());
  if (!r) return st().notify("Chưa có đội hình nào để lặp");
  clock.setLoop(r);
  clock.seek(r.a);
  if (!clock.isPlaying()) clock.play();
}

function Ruler({ end, pps, bpm, downbeat, onScrub }: { end: number; pps: number; bpm: number | null; downbeat: number; onScrub: (e: React.PointerEvent) => void }) {
  const loop = useLoop();
  const ticks = useMemo(() => {
    const out: JSX.Element[] = [];
    if (bpm) {
      const beat = 60 / bpm;
      const pxBeat = beat * pps;
      const total = Math.ceil((end - downbeat) / beat) + 8;
      for (let b = 0; b < total; b++) {
        const t = downbeat + b * beat;
        if (t < 0) continue;
        const x = t * pps;
        const bar = b % 8 === 0;
        if (!bar && pxBeat < 7) continue;
        out.push(
          <div key={`b${b}`} style={{ position: "absolute", left: x, bottom: 0, width: 1, height: bar ? 12 : 5, background: bar ? "#6b768a" : "#3a4250" }} />,
        );
        if (bar && pxBeat * 8 > 28)
          out.push(
            <div key={`l${b}`} style={{ position: "absolute", left: x + 3, top: 2, fontSize: 10, color: "#ffb86b", fontWeight: 700 }}>
              {b / 8 + 1}
            </div>,
          );
      }
    }
    const step = pps >= 60 ? 1 : pps >= 25 ? 2 : pps >= 12 ? 5 : 10;
    for (let s = 0; s <= end + 5; s += step) {
      out.push(
        <div key={`s${s}`} style={{ position: "absolute", left: s * pps, top: bpm ? 14 : 2, fontSize: 10, color: "#6b768a", paddingLeft: 3, borderLeft: bpm ? undefined : "1px solid #3a4250", height: bpm ? undefined : 22 }}>
          {fmtTime(s).replace(/\.\d$/, "")}
        </div>,
      );
    }
    return out;
  }, [end, pps, bpm, downbeat]);
  return (
    <div className="ruler" onPointerDown={onScrub} title="Bấm hoặc kéo để tua">
      {ticks}
      {loop && <div className="loopband" style={{ left: loop.a * pps, width: (loop.b - loop.a) * pps }} />}
    </div>
  );
}

/** Mốc của đoạn đang phát; chỉ vẽ lại khi sang đoạn khác chứ không mỗi khung hình. */
function useMarkAt(marks: SongMark[]): string | null {
  const [id, setId] = useState(() => markAt(marks, clock.now())?.id ?? null);
  useEffect(() => {
    const f = () => setId(markAt(marks, clock.now())?.id ?? null);
    f();
    return clock.subscribeClock(f);
  }, [marks]);
  return id;
}

/**
 * Dải mốc đoạn nhạc dưới thước: mỗi mốc một vạch và nhãn. Bấm nhãn để nhảy tới,
 * kéo để dời (bám phách như khối đội hình, Alt để bỏ bám), bấm đúp để đổi tên,
 * chuột phải hoặc Delete để xoá; bấm đúp vào chỗ trống để thêm mốc ở đó.
 */
function MarkLane(props: {
  marks: SongMark[]; pps: number;
  snapT: (t: number, alt: boolean) => number;
  xToT: (x: number) => number;
}) {
  const { marks, pps, snapT, xToT } = props;
  const cur = useMarkAt(marks);
  const [sel, setSel] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const startDrag = (e: React.PointerEvent, m: SongMark) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSel(m.id);
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    const t0 = xToT(e.clientX);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dt = xToT(ev.clientX) - t0;
      if (!moved && Math.abs(dt * pps) < 3) return;
      if (!moved) {
        moved = true;
        st().beginGesture();
      }
      moveMarkTo(m.id, snapT(m.t + dt, ev.altKey), true);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved) st().endGesture();
      else clock.seek(m.t + 0.001);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      className="lane marks"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        clock.seek(snapT(xToT(e.clientX), e.altKey));
        setSel(null);
      }}
      onDoubleClick={(e) => {
        clock.seek(snapT(xToT(e.clientX), e.altKey));
        const id = addMarkNow();
        if (id) setRenaming(id);
      }}
      title="Mốc đoạn nhạc · bấm đúp để thêm mốc (hoặc phím B ở vạch phát)"
    >
      {marks.map((m, k) => {
        const next = marks[k + 1];
        // nhãn không lấn sang mốc sau
        const room = next ? Math.max(14, (next.t - m.t) * pps - 4) : 220;
        const on = sel === m.id;
        return (
          <div
            key={m.id}
            className={`mk${on ? " sel" : ""}${cur === m.id ? " cur" : ""}`}
            style={{ left: m.t * pps, maxWidth: renaming === m.id ? undefined : room }}
            role="button"
            tabIndex={0}
            aria-label={`Mốc ${m.label} ở ${fmtTime(m.t)}`}
            title={`${m.label} · ${fmtTime(m.t)}\nBấm để nhảy tới · kéo để dời · bấm đúp để đổi tên · chuột phải để xoá`}
            onMouseDown={(e) => {
              if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
            }}
            onPointerDown={(e) => startDrag(e, m)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(m.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              removeMarkById(m.id);
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                removeMarkById(m.id);
              } else if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault();
                setRenaming(m.id);
              }
            }}
          >
            {renaming === m.id ? (
              <input
                autoFocus
                defaultValue={m.label}
                className="title-input"
                maxLength={40}
                aria-label="Tên mốc"
                onPointerDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  renameMarkTo(m.id, e.currentTarget.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    e.currentTarget.value = m.label;
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <span className="mk-label">{m.label}</span>
            )}
            {on && renaming !== m.id && (
              <button
                className="mk-x" aria-label={`Xoá mốc ${m.label}`} title="Xoá mốc"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSel(null);
                  removeMarkById(m.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Vạch mốc mờ kéo dọc qua sóng nhạc, dải đội hình và các dải video. */
function MarkLines({ marks, pps }: { marks: SongMark[]; pps: number }) {
  return (
    <>
      {marks.map((m) => (
        <div key={m.id} className="mkline" style={{ left: m.t * pps, top: RULER }} aria-hidden="true" />
      ))}
    </>
  );
}

function Wave({ pps, width, onScrub }: { pps: number; width: number; onScrub: (e: React.PointerEvent) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const mv = useMediaVersion();
  const p = useProject();
  const cw = Math.min(width, 16000);
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c) return;
    c.width = cw;
    c.height = WAVE;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, cw, WAVE);
    const peaks = music.peaks;
    if (!peaks) return;
    const scale = cw / width; // canvas có thể hẹp hơn chiều rộng thật
    const n = peaks.length / 2;
    g.fillStyle = "#3b5f8f";
    const mid = WAVE / 2;
    for (let x = 0; x < cw; x++) {
      const t0 = x / scale / pps;
      const t1 = (x + 1) / scale / pps;
      const i0 = Math.floor(t0 * PEAK_RATE);
      const i1 = Math.max(i0 + 1, Math.floor(t1 * PEAK_RATE));
      if (i0 >= n) break;
      let lo = 0, hi = 0;
      for (let i = i0; i < Math.min(n, i1); i++) {
        lo = Math.min(lo, peaks[2 * i]);
        hi = Math.max(hi, peaks[2 * i + 1]);
      }
      g.fillRect(x, mid - hi * (mid - 2), 1, Math.max(1, (hi - lo) * (mid - 2)));
    }
  }, [pps, width, cw, mv, p.musicId]);
  return (
    <div className="lane wave" onPointerDown={onScrub}>
      <canvas ref={cv} style={{ width, height: WAVE, display: "block" }} />
    </div>
  );
}

function FormLane(props: {
  fs: Formation[]; pps: number; bpm: number | null;
  snapT: (t: number, alt: boolean) => number;
  xToT: (x: number) => number;
  warnTimes: { kind: string; formation: string; t: number; msg: string }[];
}) {
  const { fs, pps, snapT, xToT } = props;
  const ui = useUI();
  const hk = useHoldIndex(fs);
  const [renaming, setRenaming] = useState<string | null>(null);
  // bị che (blocked) là cảnh báo nhẹ trong lúc giữ đội hình: không tô đỏ khoảng chuyển hay khối
  const badTrans = new Set(props.warnTimes.filter((w) => w.kind !== "overlap" && w.kind !== "blocked" && w.kind !== "prop").map((w) => w.formation));
  const badBlock = new Set(props.warnTimes.filter((w) => w.kind === "overlap").map((w) => w.formation));

  const startDrag = (e: React.PointerEvent, f: Formation, mode: "move" | "l" | "r") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const t0 = xToT(e.clientX);
    const s0 = f.start, e0 = f.end;
    let moved = false;
    st().setUI({ selectedBlock: f.id });
    // giữ tiêu điểm ở khối để Delete xoá đúng khối vừa bấm
    (e.currentTarget as HTMLElement).closest<HTMLElement>(".block")?.focus({ preventScroll: true });
    const move = (ev: PointerEvent) => {
      const dt = xToT(ev.clientX) - t0;
      if (!moved && Math.abs(dt * pps) < 3) return;
      if (!moved) {
        moved = true;
        st().beginGesture();
      }
      st().live((q) => {
        let next = q.formations;
        if (mode === "move") next = moveBlock(q.formations, f.id, snapT(s0 + dt, ev.altKey));
        else if (mode === "l") next = setBlockTimes(q.formations, f.id, snapT(s0 + dt, ev.altKey), e0);
        else next = setBlockTimes(q.formations, f.id, s0, snapT(e0 + dt, ev.altKey));
        return { ...q, formations: next };
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved) st().endGesture();
      else if (mode === "move") {
        const cur = clock.now();
        if (cur < f.start || cur > f.end) clock.seek(f.start + 0.001);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const pick = (f: Formation) => {
    st().setUI({ selectedBlock: f.id });
    const cur = clock.now();
    if (cur < f.start || cur > f.end) clock.seek(f.start + 0.001);
  };

  return (
    <div
      className="lane forms"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        clock.seek(snapT(xToT(e.clientX), e.altKey));
        st().setUI({ selectedBlock: null });
      }}
      onDoubleClick={(e) => {
        clock.seek(snapT(xToT(e.clientX), e.altKey));
        addFormation();
      }}
      title="Bấm để tua · bấm đúp để thêm đội hình"
    >
      {fs.map((f, k) => {
        const g = fs[k + 1];
        return g ? (
          <div
            key={`tr${f.id}`}
            className={`trans${badTrans.has(g.id) ? " bad" : ""}`}
            style={{ left: f.end * pps, width: Math.max(0, (g.start - f.end) * pps) }}
          />
        ) : null;
      })}
      {fs.map((f, k) => {
        const cur = k === hk;
        const w = (f.end - f.start) * pps;
        const on = ui.selectedBlock === f.id;
        return (
          <div
            key={f.id}
            className={`block${on ? " sel" : ""}${cur ? " cur" : ""}`}
            style={{ left: f.start * pps, width: Math.max(6, w), borderColor: badBlock.has(f.id) ? "var(--red)" : undefined }}
            data-formation={f.id}
            role="button"
            aria-pressed={on}
            aria-label={`${f.name}, ${fmtTime(f.start)} đến ${fmtTime(f.end)}`}
            {...rowKeys(() => pick(f))}
            onMouseDown={(e) => {
              // không để trình duyệt tự cuộn tới khối khi bấm; tiêu điểm đặt trong startDrag
              if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
            }}
            onPointerDown={(e) => startDrag(e, f, "move")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(f.id);
            }}
            title={`${f.name}${f.note ? `\nGhi chú: ${f.note}` : ""}\nBấm đúp để đổi tên`}
          >
            {renaming === f.id ? (
              <input
                autoFocus
                defaultValue={f.name}
                className="title-input"
                style={{ width: "100%", height: 22, fontSize: 12 }}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  renameBlock(f.id, e.currentTarget.value.trim() || f.name);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              w > 30 && (
                <>
                  <span className="bn">{f.note && <span className="bnote" aria-label="có ghi chú">✎ </span>}{f.name}</span>
                  {w > 110 && <span className="bd">{commaDec(fmtCounts(f.end - f.start, props.bpm))}</span>}
                </>
              )
            )}
            <div className="edge l" onPointerDown={(e) => startDrag(e, f, "l")} />
            <div className="edge r" onPointerDown={(e) => startDrag(e, f, "r")} />
          </div>
        );
      })}
    </div>
  );
}

function VidLane({ d, pps, xToT }: { d: import("../model").VDancer; pps: number; xToT: (x: number) => number }) {
  const sel = useUI().selected.includes(d.id);
  if (!d.mediaId)
    return (
      <div className="lane vid" style={{ background: sel ? "rgba(255,159,67,.06)" : undefined }}>
        <span className="dim" style={{ position: "sticky", left: 8, fontSize: 11, lineHeight: "22px" }}>chưa có video: chọn người rồi bấm Gắn video</span>
      </div>
    );
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    st().setUI({ selected: [d.id] });
    const t0 = xToT(e.clientX);
    const o0 = d.offsetSec;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dt = xToT(ev.clientX) - t0;
      if (!moved && Math.abs(dt * pps) < 3) return;
      if (!moved) {
        moved = true;
        st().beginGesture();
      }
      const fine = ev.shiftKey ? 0.001 : 0.01;
      liveDancer(d.id, { offsetSec: Math.round((o0 + dt) / fine) * fine, alignConfident: true });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) st().endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="lane vid" style={{ background: sel ? "rgba(255,159,67,.06)" : undefined }}>
      <div
        className={`vbar${d.alignConfident ? "" : " warn"}`}
        style={{ left: d.offsetSec * pps, width: Math.max(4, d.durationSec * pps), background: d.color, opacity: d.hidden ? 0.3 : undefined }}
        onPointerDown={onDown}
        title={`${d.name}: video bắt đầu ở ${fmtSigned(d.offsetSec)} s · kéo ngang để căn với nhạc (Shift: tinh)`}
      >
        {d.name} {fmtSigned(d.offsetSec)} s{!d.alignConfident && " ⚠ chưa chắc"}
      </div>
      {d.canon?.map((c) => (
        <div
          key={c.start} className="canonmark" aria-hidden="true"
          style={{ left: c.start * pps, width: Math.max(4, (c.end - c.start) * pps) }}
          title={`${d.name}: canon, vào trễ ${fmtSigned(c.lag)} s trong đoạn này`}
        >
          <i style={{ width: Math.min(c.lag, c.end - c.start) * pps }} />
          canon {fmtSigned(c.lag)} s
        </div>
      ))}
    </div>
  );
}

function Playhead({ pps, scroll, follow }: { pps: number; scroll: React.RefObject<HTMLDivElement>; follow: boolean }) {
  const t = useTime();
  const playing = usePlaying();
  const x = t * pps;
  useEffect(() => {
    const el = scroll.current;
    if (!el || !follow) return;
    const left = el.scrollLeft;
    const w = el.clientWidth;
    if (x < left + 20 || x > left + w - 60) {
      el.scrollLeft = playing ? x - 40 : x - w / 2;
    }
  }, [x, follow, playing, scroll]);
  return <div className="playhead" style={{ left: x }} />;
}

export const TL_NAMES_W = NAMES_W;
