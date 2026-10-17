// Học động tác từ MỘT video cả đội (quay từ phía trước): soi gương, xem chậm,
// lặp A–B, đếm 5 6 7 8 rồi mới phát, bước từng khung, và "Bám theo tôi"
// (vẽ khung quanh mình vài lúc, app phóng to và dời theo). Video có tiếng nhạc
// riêng nên chạy bằng <video> của chế độ này, không dính đồng hồ dự án.

import { useEffect, useRef, useState } from "react";
import { st, useProject } from "../store";
import * as clock from "../clock";
import { loadKey, saveKey, isQuotaError } from "../db";
import { fmtTime, tapTempo } from "../timing";
import { countInBeat } from "../rehearse";
import { cancelCountIn, isCounting, startCountIn, useCountIn, useCounting } from "../countin";
import {
  type Key, type Loop, type Rect, FRAME, IDENTITY, NO_LOOP,
  boxAt, cleanKeys, cleanLoop, fitCss, fitView, frameRect, loopOn, loopWrap, mirrorRect,
  playStart, rectFromPoints, setA, setB, sourceToView, stepTime, upsertKey, viewToSource,
} from "../learn";
import { targetKind } from "./keys";
import { NumField } from "./NumField";
import { Icon } from "./icons";
import "./learn.css";

/** Mở chế độ Học động tác (dừng nhạc của bài cho khỏi chồng tiếng). */
export function openLearn() {
  clock.pause();
  st().setUI({ learning: true, presenting: false, help: false });
}

const VIDEO_KEY = "learn-video";
const STATE_KEY = "learn-state";
const HINT_KEY = "learn-hint-ok";
/** Video to hơn chừng này thì không nhớ cho lần sau (đỡ đầy bộ nhớ trình duyệt). */
const MAX_KEEP = 1024 ** 3;
const SPEEDS = [0.25, 0.5, 0.75, 1];
const MARGIN = 0.12;

interface SavedVideo { name: string; type: string; blob: Blob; key: string }
interface SavedState {
  key: string | null; keys: unknown; loop: unknown;
  mirror: boolean; rate: number; bpm: number; countIn: boolean; follow: boolean;
}

const isVideoFile = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(f.name);
const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

function readHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function pickVideo(cb: (f: File) => void) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "video/*,.mov,.mp4,.m4v,.webm";
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (f) cb(f);
  };
  inp.click();
}

export function Learn() {
  const projBpm = useProject().bpm;
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const seekBar = useRef<HTMLDivElement>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vkey, setVkey] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fa, setFa] = useState(0); // tỉ lệ khung hình video
  const [va, setVa] = useState(0); // tỉ lệ khung nhìn
  const [mirror, setMirror] = useState(true);
  const [rate, setRate] = useState(1);
  const [countIn, setCountIn] = useState(true);
  const [bpm, setBpm] = useState(projBpm && projBpm > 0 ? Math.round(projBpm * 10) / 10 : 120);
  const [loop, setLoop] = useState<Loop>(NO_LOOP);
  const [keys, setKeys] = useState<Key[]>([]);
  const [follow, setFollow] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [hintOk, setHintOk] = useState(readHint);
  const [over, setOver] = useState(false);
  const [ease, setEase] = useState(false);
  const [fs, setFs] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const label = useCountIn();
  const counting = useCounting();
  const saved = useRef<SavedState | null>(null);
  const srcRef = useRef<string | null>(null);
  const probing = useRef(false);

  // vòng rAF đọc giá trị mới nhất qua ref (khỏi đăng ký lại mỗi lần đổi)
  const live = useRef({ loop, keys, follow, drawing, mirror, fa, va });
  live.current = { loop, keys, follow, drawing, mirror, fa, va };

  // ---------- video ----------
  const loadVideo = (blob: Blob, nm: string, key: string, restore: SavedState | null) => {
    cancelCountIn();
    const url = URL.createObjectURL(blob);
    if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    srcRef.current = url;
    probing.current = false;
    setSrc(url);
    setName(nm);
    setVkey(key);
    setT(0);
    setDur(0);
    setDrawing(false);
    // cùng video với lần trước thì lấy lại các khung và đoạn lặp đã đặt
    if (restore && restore.key === key) {
      setKeys(cleanKeys(restore.keys));
      setLoop(cleanLoop(restore.loop));
    } else {
      setKeys([]);
      setLoop(NO_LOOP);
    }
  };

  const openFile = (f: File) => {
    if (!isVideoFile(f)) {
      st().notify("Hãy chọn một tệp video (mp4, mov, webm…)", { kind: "warn" });
      return;
    }
    const key = fileKey(f);
    if (key === vkey && srcRef.current) return; // mở lại đúng video đang xem: giữ nguyên mọi thứ
    loadVideo(f, f.name, key, saved.current);
    if (f.size > MAX_KEEP) {
      st().notify("Video lớn quá nên app không nhớ cho lần sau; lần sau mở lại tệp này là được.");
      return;
    }
    const rec: SavedVideo = { name: f.name, type: f.type, blob: f, key };
    saveKey(VIDEO_KEY, rec).catch((e) =>
      st().notify(
        isQuotaError(e)
          ? "Bộ nhớ trình duyệt đầy nên app không nhớ video này cho lần sau."
          : "Không nhớ được video cho lần sau; vẫn xem bình thường.",
        { kind: "warn" },
      ),
    );
  };

  // mở chế độ: lấy lại video và cách xem lần trước (nếu còn)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [v, s] = await Promise.all([loadKey(VIDEO_KEY), loadKey(STATE_KEY)]);
        if (!alive) return;
        const ss = s && typeof s === "object" ? (s as SavedState) : null;
        saved.current = ss;
        if (ss) {
          if (typeof ss.mirror === "boolean") setMirror(ss.mirror);
          if (SPEEDS.includes(ss.rate)) setRate(ss.rate);
          if (typeof ss.bpm === "number" && ss.bpm >= 40 && ss.bpm <= 240) setBpm(ss.bpm);
          if (typeof ss.countIn === "boolean") setCountIn(ss.countIn);
          if (typeof ss.follow === "boolean") setFollow(ss.follow);
        }
        const rec = v as SavedVideo | null;
        if (!srcRef.current && rec && rec.blob instanceof Blob && typeof rec.key === "string")
          loadVideo(rec.blob, String(rec.name ?? "video"), rec.key, ss);
      } catch {
        // không đọc được bộ nhớ: cứ mở video mới như thường
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
      cancelCountIn();
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    };
  }, []);

  // nhớ cách xem (gộp các lần đổi liền nhau)
  useEffect(() => {
    if (!loaded) return;
    const s: SavedState = { key: vkey, keys, loop, mirror, rate, bpm, countIn, follow };
    const id = window.setTimeout(() => {
      saved.current = s;
      saveKey(STATE_KEY, s).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [loaded, vkey, keys, loop, mirror, rate, bpm, countIn, follow]);

  // tốc độ: giữ cao độ nhạc khi phát chậm
  const applyRate = () => {
    const v = vid.current as (HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null;
    if (!v) return;
    v.preservesPitch = true;
    v.webkitPreservesPitch = true;
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  };
  useEffect(applyRate, [rate, src]);

  // cỡ khung nhìn
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const measure = () => setVa(el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 0);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);

  // mỗi khung hình: lặp A–B, phóng theo khung "Bám theo tôi", cập nhật thời gian
  useEffect(() => {
    let id = 0;
    let last = "";
    const frame = () => {
      id = requestAnimationFrame(frame);
      const v = vid.current;
      if (!v) return;
      const s = live.current;
      let ct = v.currentTime;
      if (!v.paused && !v.seeking) {
        const to = loopWrap(ct, s.loop);
        if (to !== null) {
          v.currentTime = to;
          ct = to;
        }
      }
      setT(ct);
      const z = zoom.current;
      if (!z) return;
      const box = s.follow && !s.drawing ? boxAt(s.keys, ct) : null;
      const f = box && s.fa > 0 && s.va > 0 ? fitView(s.mirror ? mirrorRect(box) : box, s.fa, s.va, MARGIN) : IDENTITY;
      const css = fitCss(f);
      if (css !== last) {
        last = css;
        z.style.transform = css;
      }
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, []);

  // đổi chế độ phóng thì lướt êm một nhịp, còn lúc bám theo thì đi liền
  const firstEase = useRef(true);
  useEffect(() => {
    if (firstEase.current) {
      firstEase.current = false;
      return;
    }
    setEase(true);
    const id = window.setTimeout(() => setEase(false), 420);
    return () => clearTimeout(id);
  }, [follow, drawing, mirror]);

  // toàn màn hình (tuỳ chọn, thoát toàn màn hình không đóng chế độ)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement && document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => st().notify("Trình duyệt này không cho toàn màn hình"));
  };

  // ---------- điều khiển ----------
  const ready = !!src && dur > 0;

  const seekTo = (x: number) => {
    const v = vid.current;
    if (!v) return;
    if (isCounting()) cancelCountIn();
    const to = stepTime(0, x, v.duration || dur);
    v.currentTime = to;
    setT(to);
  };

  const togglePlay = () => {
    const v = vid.current;
    if (!v || !src) return;
    if (isCounting()) {
      cancelCountIn();
      return;
    }
    if (!v.paused) {
      v.pause();
      return;
    }
    const start = playStart(v.currentTime, loop, v.duration || dur);
    if (Math.abs(start - v.currentTime) > 1e-3) v.currentTime = start;
    const go = () => {
      applyRate();
      v.play().catch(() => st().notify("Trình duyệt không phát được video này", { kind: "warn" }));
    };
    if (!countIn) return go();
    startCountIn({ beat: countInBeat(bpm, rate), lead: 0, onGo: go });
  };

  /** Bước từng khung: đang phát thì dừng trước. */
  const stepFrame = (d: 1 | -1) => {
    const v = vid.current;
    if (!v) return;
    if (!v.paused) v.pause();
    seekTo(v.currentTime + d * FRAME);
  };
  const jump = (d: number) => {
    const v = vid.current;
    if (v) seekTo(v.currentTime + d);
  };

  const now = () => vid.current?.currentTime ?? t;
  const markA = () => setLoop((l) => setA(l, now()));
  const markB = () => setLoop((l) => setB(l, now()));
  const clearLoop = () => setLoop(NO_LOOP);

  const startDraw = () => {
    const v = vid.current;
    if (!v || !src) return;
    cancelCountIn();
    if (!v.paused) v.pause();
    setDraft(null);
    setDrawing(true);
  };
  const stopDraw = () => {
    setDraft(null);
    setDrawing(false);
  };
  const onFollow = () => (keys.length ? setFollow(!follow) : startDraw());

  const tap = () => {
    const at = performance.now();
    const ts = [...taps.filter((x) => at - x < 2500), at].slice(-8);
    setTaps(ts);
    const b = tapTempo(ts);
    if (b) setBpm(Math.max(40, Math.min(240, Math.round(b))));
  };

  const exit = () => {
    cancelCountIn();
    vid.current?.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    st().setUI({ learning: false });
  };

  const dismissHint = () => {
    setHintOk(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // không nhớ được thì lần sau hiện lại, không sao
    }
  };

  // phím riêng của chế độ này, bắt trước shortcuts.ts (pha capture); shortcuts.ts cũng tự nhường khi learning
  const act = useRef({ togglePlay, stepFrame, jump, markA, markB, exit, stopDraw, drawing, ready });
  act.current = { togglePlay, stepFrame, jump, markA, markB, exit, stopDraw, drawing, ready };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = act.current;
      if (st().ui.help) {
        // bảng hướng dẫn đang mở: Esc hoặc ? để đóng, phím khác không làm gì
        if (e.key === "Escape" || e.key === "?") {
          e.preventDefault();
          e.stopPropagation();
          st().setUI({ help: false });
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return; // Ctrl S vẫn lưu bài
      if (targetKind(e.target) === "text") return; // đang gõ ô BPM
      let done = true;
      switch (e.key) {
        case " ":
          (document.activeElement as HTMLElement | null)?.blur?.();
          if (!e.repeat) a.togglePlay();
          break;
        case "ArrowLeft": a.jump(-2); break;
        case "ArrowRight": a.jump(2); break;
        case ",": a.stepFrame(-1); break;
        case ".": a.stepFrame(1); break;
        case "[": if (a.ready) a.markA(); break;
        case "]": if (a.ready) a.markB(); break;
        case "?": st().setUI({ help: true }); break;
        case "Escape":
          if (isCounting()) cancelCountIn();
          else if (a.drawing) a.stopDraw();
          else a.exit();
          break;
        default:
          if (e.key.toLowerCase() === "m" && !e.repeat) setMirror((m) => !m);
          else done = false;
      }
      if (done) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ---------- vẽ khung "Bám theo tôi" ----------
  const fr = frameRect(fa, va);
  const viewPt = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const drawDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = viewPt(e);
    setDraft({ a: p, b: p });
  };
  const drawMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    setDraft({ a: draft.a, b: viewPt(e) });
  };
  const drawUp = () => {
    if (!draft) return;
    const r = rectFromPoints(viewToSource(draft.a, fr, mirror), viewToSource(draft.b, fr, mirror));
    setDraft(null);
    if (r.w < 0.02 || r.h < 0.03) return; // bấm nhầm, chưa kéo: vẽ lại
    const was = keys.length;
    setKeys(upsertKey(keys, { t: now(), r }));
    setDrawing(false);
    setFollow(true);
    if (!was) st().notify("Đã có khung đầu tiên. Tua tới lúc bạn đổi chỗ rồi Thêm khung nữa, app tự nối giữa các khung.");
  };
  const curBox = boxAt(keys, t);
  const shownBox = drawing && curBox && fa > 0 ? sourceToView(curBox, fr, mirror) : null;
  const draftBox: Rect | null = draft ? rectFromPoints(draft.a, draft.b) : null;

  // ---------- thanh tua ----------
  const scrub = useRef(false);
  const seekAt = (e: React.PointerEvent) => {
    const el = seekBar.current;
    if (!el || !dur) return;
    const r = el.getBoundingClientRect();
    seekTo(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur);
  };

  // ---------- thả tệp ----------
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dnd = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setOver(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setOver(false);
      const fs = Array.from(e.dataTransfer.files);
      const f = fs.find(isVideoFile) ?? fs[0];
      if (f) openFile(f);
    },
  };

  const lp = loopOn(loop) ? loop : null;
  const hint = mirror
    ? "Gương đang bật: trái phải giống như bạn đứng sau lưng người múa."
    : "Bật Gương: trái phải giống như đứng sau lưng người múa.";

  return (
    <div className={`learn${fs ? " fs" : ""}`} ref={root} {...dnd} role="dialog" aria-label="Học động tác">
      <header className="lv-top">
        <div className="lv-title">
          <Icon name="learn" /> <b>Học động tác</b>
          {name && <span className="lv-name" title={name}>{name}</span>}
        </div>
        <div className="lv-grow" />
        <button className="btn" onClick={() => pickVideo(openFile)} title="Mở video cả đội múa (hoặc kéo thả vào đây)">
          <Icon name="upload" /> <span className="lv-lbl">{src ? "Đổi video" : "Mở video"}</span>
        </button>
        <button className={`btn icon${fs ? " on" : ""}`} onClick={toggleFs} title="Toàn màn hình" aria-label="Toàn màn hình" aria-pressed={fs}>
          <Icon name="fit" />
        </button>
        <button className="btn icon" onClick={() => st().setUI({ help: true })} title="Phím tắt (?)" aria-label="Phím tắt"><Icon name="help" /></button>
        <button className="btn" onClick={exit} title="Thoát (Esc)"><Icon name="close" /> <span className="lv-lbl">Thoát</span></button>
      </header>

      <div className={`lv-view${drawing ? " drawing" : ""}`} ref={view}>
        {src ? (
          <div className={`lv-zoom${ease ? " ease" : ""}`} ref={zoom}>
            <div className={`lv-flip${mirror ? " on" : ""}`}>
              <video
                ref={vid}
                src={src}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setDur(Number.isFinite(v.duration) ? v.duration : 0);
                  setFa(v.videoHeight > 0 ? v.videoWidth / v.videoHeight : 0);
                  applyRate();
                  // vài tệp webm không ghi độ dài: tua thật xa để trình duyệt tự đo, rồi về đầu
                  if (v.duration === Infinity) {
                    probing.current = true;
                    v.currentTime = 1e9;
                  }
                }}
                onDurationChange={(e) => {
                  const v = e.currentTarget;
                  if (!Number.isFinite(v.duration)) return;
                  setDur(v.duration);
                  if (probing.current) {
                    probing.current = false;
                    v.currentTime = 0;
                  }
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => st().notify("Trình duyệt không mở được video này. Thử đổi sang mp4 (H.264).", { kind: "error" })}
                onClick={() => !drawing && togglePlay()}
              />
            </div>
          </div>
        ) : (
          loaded && (
            <div className="lv-empty">
              <div className="lv-card">
                <h2>Mở video cả đội múa</h2>
                <p>
                  Video quay từ phía trước như thường lệ. App lật gương cho trái phải giống như bạn đứng sau lưng
                  người múa, xem chậm, lặp từng đoạn và phóng to theo chỗ bạn đứng.
                </p>
                <button className="btn primary" onClick={() => pickVideo(openFile)}><Icon name="upload" /> Chọn video…</button>
                <div className="dim lv-or">hoặc kéo thả video vào đây</div>
              </div>
            </div>
          )
        )}

        {src && !hintOk && !drawing && (
          <div className="lv-hint" role="note">
            <div>
              <b>{hint}</b> Người trong video nhìn về phía bạn; soi gương thì họ giơ tay phải, bạn thấy ở bên phải của
              mình, cứ thế làm theo, không phải đổi bên. Nhìn thật từ sau lưng (thấy lưng người múa) thì cần dựng lại
              tư thế 3D, app chưa làm được.
            </div>
            <button className="btn sm" onClick={dismissHint}>Đã hiểu</button>
          </div>
        )}

        {drawing && (
          <div
            className="lv-draw" onPointerDown={drawDown} onPointerMove={drawMove} onPointerUp={drawUp}
            onPointerCancel={() => setDraft(null)}
          >
            <div className="lv-draw-tip">
              Kéo một khung quanh bạn, từ đầu tới chân, chừa chỗ cho tay · Esc để huỷ
            </div>
            {shownBox && !draftBox && (
              <i className="lv-box old" style={{ left: pct(shownBox.x), top: pct(shownBox.y), width: pct(shownBox.w), height: pct(shownBox.h) }} />
            )}
            {draftBox && (
              <i className="lv-box" style={{ left: pct(draftBox.x), top: pct(draftBox.y), width: pct(draftBox.w), height: pct(draftBox.h) }} />
            )}
          </div>
        )}

        {label && (
          <div className="lv-countin" aria-live="assertive">
            <b key={label}>{label}</b>
            <span>Space hoặc Esc để huỷ</span>
          </div>
        )}

        {over && <div className="lv-drop">Thả video cả đội vào đây</div>}
      </div>

      {src && (
        <>
          <div className="lv-bar">
            <div
              className="lv-seek" ref={seekBar}
              role="slider" aria-label="Vị trí trong video" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
              aria-valuetext={fmtTime(t)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                scrub.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                seekAt(e);
              }}
              onPointerMove={(e) => scrub.current && seekAt(e)}
              onPointerUp={() => (scrub.current = false)}
              onPointerCancel={() => (scrub.current = false)}
            >
              <div className="lv-track">
                {lp && dur > 0 && <span className="lv-band" style={{ left: pct(lp.a / dur), width: pct((lp.b - lp.a) / dur) }} />}
                <i style={{ width: pct(dur ? Math.min(1, t / dur) : 0) }} />
              </div>
              {dur > 0 && keys.map((k) => <span key={k.t} className="lv-tick" style={{ left: pct(k.t / dur) }} />)}
              {dur > 0 && loop.a !== null && <span className="lv-mark" style={{ left: pct(loop.a / dur) }}>A</span>}
              {dur > 0 && loop.b !== null && <span className="lv-mark" style={{ left: pct(loop.b / dur) }}>B</span>}
              <span className="lv-head" style={{ left: pct(dur ? Math.min(1, t / dur) : 0) }} />
            </div>
            <span className="lv-time">{fmtTime(t)} <small>/ {fmtTime(dur)}</small></span>
          </div>

          <div className="lv-ctl">
            <div className="lv-group">
              <button className="btn sm" onClick={() => jump(-2)} disabled={!ready} title="Lùi 2 giây (←)">−2 s</button>
              <button className="btn icon" onClick={() => stepFrame(-1)} disabled={!ready} title="Lùi một khung hình (,)" aria-label="Lùi một khung hình"><Icon name="stepBack" /></button>
              <button className="play" onClick={togglePlay} disabled={!ready} title="Phát / dừng (Space)" aria-label={playing || counting ? "Dừng" : "Phát"}>
                <Icon name={playing || counting ? "pause" : "play"} />
              </button>
              <button className="btn icon" onClick={() => stepFrame(1)} disabled={!ready} title="Tới một khung hình (.)" aria-label="Tới một khung hình"><Icon name="stepFwd" /></button>
              <button className="btn sm" onClick={() => jump(2)} disabled={!ready} title="Tới 2 giây (→)">+2 s</button>
            </div>

            <div className="seg lv-speed" role="group" aria-label="Tốc độ">
              {SPEEDS.map((s) => (
                <button key={s} className={rate === s ? "on" : ""} onClick={() => setRate(s)} aria-pressed={rate === s} title={`Phát ${s}× (giữ cao độ nhạc)`}>
                  {String(s).replace(".", ",")}×
                </button>
              ))}
            </div>

            <button
              className={`btn${mirror ? " on" : ""}`} onClick={() => setMirror(!mirror)} aria-pressed={mirror}
              title="Lật trái phải như gương phòng tập: người trong video giơ tay phải thì hiện ở bên phải của bạn, làm theo không phải đổi bên (M)"
            >
              <Icon name="mirror" /> Gương
            </button>

            <div className="lv-group">
              <button
                className={`btn${countIn ? " on" : ""}`} onClick={() => setCountIn(!countIn)} aria-pressed={countIn}
                title="Đếm 5 · 6 · 7 · 8 (có tiếng tích) rồi mới phát"
              >
                5-6-7-8
              </button>
              <label className="lv-bpm" title="Nhịp của bài, để đếm vào đúng nhịp">
                <NumField value={bpm} min={40} max={240} quantum={0.1} step={1} onCommit={(v) => v !== null && setBpm(v)} aria-label="Nhịp (BPM)" />
                <span>BPM</span>
              </label>
              <button className="btn sm" onClick={tap} title="Bấm theo nhịp nhạc vài lần để đo BPM">
                Gõ nhịp{taps.length ? ` (${taps.length})` : ""}
              </button>
            </div>

            <div className="lv-group">
              <button className={`btn sm${loop.a !== null ? " on" : ""}`} onClick={markA} disabled={!ready} title="Đặt đầu đoạn lặp ở đây ([)">Đặt A</button>
              <button className={`btn sm${loop.b !== null ? " on" : ""}`} onClick={markB} disabled={!ready} title="Đặt cuối đoạn lặp ở đây (])">Đặt B</button>
              <button className="btn sm" onClick={clearLoop} disabled={loop.a === null && loop.b === null} title="Bỏ đoạn lặp">Bỏ lặp</button>
            </div>

            <div className="lv-group lv-follow">
              <button
                className={`btn${follow && keys.length ? " on" : ""}`} onClick={onFollow} disabled={!ready} aria-pressed={follow && keys.length > 0}
                title={keys.length ? "Phóng to và dời theo khung bạn đã vẽ" : "Vẽ khung quanh bạn để app phóng to theo bạn"}
              >
                <Icon name="user" /> Bám theo tôi
              </button>
              {drawing ? (
                <button className="btn sm" onClick={stopDraw}>Huỷ vẽ</button>
              ) : (
                <button className="btn sm" onClick={startDraw} disabled={!ready} title="Dừng ở đây và kéo một khung quanh bạn">
                  <Icon name="plus" /> Thêm khung ở đây
                </button>
              )}
              {keys.map((k, i) => (
                <span className="lv-chip" key={k.t}>
                  <button onClick={() => seekTo(k.t)} title="Tua tới khung này">{fmtTime(k.t)}</button>
                  <button onClick={() => setKeys(keys.filter((_, j) => j !== i))} aria-label={`Xoá khung lúc ${fmtTime(k.t)}`} title="Xoá khung">
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
