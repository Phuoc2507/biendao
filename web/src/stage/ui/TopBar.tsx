// Thanh trên: tên bài, tệp, hoàn tác, điều khiển phát, đếm nhịp, chế độ xem.

import { useEffect, useRef, useState } from "react";
import { countAt, fmtTime } from "../timing";
import { st, useProject, useStore, useUI, type View } from "../store";
import * as clock from "../clock";
import { usePlaying, useTime } from "../clock";
import { createPortal } from "react-dom";
import { saveAs, saveBundle, saveTargetName, forgetSaveTarget, watchMusic, openBundleFile, isBlankProject } from "../export/save";
import { printFormations } from "../export/print";
import { ExportDialog } from "./ExportDialog";
import { exportProject, newProject, openProjectFile, setTitle, stepBeat, projectEnd } from "../actions";
import { pickAnyFiles } from "./SidePanel";
import { Icon } from "./icons";

function Clock() {
  const t = useTime();
  const p = useProject();
  const c = p.bpm ? countAt(t, p.bpm, p.downbeat) : null;
  return (
    <>
      <div className="clock" title="Thời gian / tổng">
        {fmtTime(t)}
        <small>/ {fmtTime(projectEnd(p))}</small>
      </div>
      <div className="count" title={p.bpm ? "Lượt 8 · phách" : "Đặt nhịp (BPM) ở thẻ Vũ công để đếm phách"}>
        {c ? (
          <>
            <b>{c.beat}</b>
            <span>/8 · lượt {c.eight}</span>
          </>
        ) : (
          <span>chưa có nhịp</span>
        )}
      </div>
    </>
  );
}

const DEV = typeof location !== "undefined" && new URLSearchParams(location.search).has("dev");

function FileMenu() {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    // Esc đóng menu (bắt trước phím tắt chung)
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", f);
    window.addEventListener("keydown", k, true);
    return () => {
      window.removeEventListener("pointerdown", f);
      window.removeEventListener("keydown", k, true);
    };
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const openFile = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,.zip,application/json,application/zip";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (/\.zip$/i.test(f.name)) return void openBundleFile(f);
      if (!isBlankProject(st().project) && !confirm(`Mở "${f.name}"? Bài hiện tại sẽ bị thay (có thể Hoàn tác).`)) return;
      try {
        const missing = await openProjectFile(f);
        st().notify(
          missing.length
            ? `Đã mở dự án. Thiếu ${missing.length} tệp nhạc/video: thả chúng vào để gắn lại.`
            : "Đã mở dự án.",
          { undo: true, kind: missing.length ? "warn" : "info" },
        );
      } catch (e) {
        st().notify(`Không mở được: ${(e as Error).message}`, { kind: "error" });
      }
    };
    inp.click();
  };
  const target = open ? saveTargetName() : null;
  return (
    <div className="menu" ref={ref}>
      <button className={`btn${open ? " on" : ""}`} onClick={() => setOpen(!open)}>
        <Icon name="folder" /> <span className="lbl">Tệp</span> <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="pop">
          <button onClick={run(pickAnyFiles)}><Icon name="upload" size={16} /> Nạp video và nhạc…</button>
          <button onClick={run(openFile)}><Icon name="file" size={16} /> Mở… (.choreo.json, .zip)</button>
          <hr />
          <button onClick={run(exportProject)} title="Tệp dự án .choreo.json, không kèm video">
            <Icon name="download" size={16} /> {target ? `Lưu vào ${target}` : "Lưu ra tệp"} <kbd>Ctrl S</kbd>
          </button>
          <button onClick={run(saveAs)}><Icon name="copy" size={16} /> Lưu thành tệp khác…</button>
          <button onClick={run(saveBundle)} title="Một tệp có dự án, nhạc và mọi video, để chép sang máy khác">
            <Icon name="folder" size={16} /> Đóng gói cả video (.zip)…
          </button>
          <hr />
          <button onClick={run(printFormations)}><Icon name="print" size={16} /> In tờ đội hình…</button>
          <button onClick={run(() => setExporting(true))}><Icon name="video" size={16} /> Xuất video…</button>
          <hr />
          <button
            onClick={run(() => {
              if (!confirm("Bắt đầu bài mới? Bài hiện tại sẽ bị thay (có thể Hoàn tác).")) return;
              forgetSaveTarget();
              watchMusic();
              newProject();
            })}
          >
            <Icon name="plus" size={16} /> Bài mới
          </button>
          {DEV && (
            <button onClick={run(() => window.open("./3d.html", "_blank"))}><Icon name="cube" size={16} /> Mở app nhân vật 3D cũ</button>
          )}
          <div className="hint">
            Bài tự lưu trong trình duyệt này. Ctrl S lưu tệp dự án (.choreo.json, không kèm video). Chép sang máy khác cho đủ video: Đóng gói (.zip).
          </div>
        </div>
      )}
      {exporting && createPortal(<ExportDialog onClose={() => setExporting(false)} />, document.body)}
    </div>
  );
}

function SaveState() {
  const s = useUI().saveState;
  return (
    <span className={`save${s === "error" ? " error" : ""}`} title="Tự lưu trong trình duyệt">
      {s === "saving" ? "Đang lưu…" : s === "error" ? "Lỗi lưu!" : "✓ Đã lưu"}
    </span>
  );
}

export function TopBar() {
  const p = useProject();
  const ui = useUI();
  const playing = usePlaying();
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const views: [View, string, string][] = [
    ["plan", "plan", "Sơ đồ"],
    ["split", "split", "Cả hai"],
    ["audience", "cube", "Khán giả"],
  ];
  return (
    <header className="top">
      <div className="brand">
        <div className="logo">♪</div>
        <input
          className="title-input" key={p.title} defaultValue={p.title} title="Tên bài múa"
          onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== p.title && setTitle(e.currentTarget.value.trim())}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <SaveState />
      </div>
      <FileMenu />
      <div className="row" style={{ gap: 2 }}>
        <button className="btn icon ghost" disabled={!canUndo} onClick={() => st().undo()} title="Hoàn tác (Ctrl Z)"><Icon name="undo" /></button>
        <button className="btn icon ghost" disabled={!canRedo} onClick={() => st().redo()} title="Làm lại (Ctrl Y)"><Icon name="redo" /></button>
      </div>
      <div className="grow" />
      <div className="transport">
        <button className="btn icon ghost" onClick={() => clock.seek(0)} title="Về đầu (Home)"><Icon name="home" /></button>
        <button className="btn icon ghost step-btn" onClick={() => stepBeat(-1)} title="Lùi một phách (←)"><Icon name="stepBack" /></button>
        <button className="play" onClick={clock.toggle} title="Phát / dừng (Space)">
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button className="btn icon ghost step-btn" onClick={() => stepBeat(1)} title="Tới một phách (→)"><Icon name="stepFwd" /></button>
      </div>
      <Clock />
      <div className="grow" />
      <button className={`btn icon${ui.snap ? " on" : ""}`} onClick={() => st().setUI({ snap: !ui.snap })} title="Bám lưới và phách (N)">
        <Icon name="magnet" />
      </button>
      <div className="seg" role="group" aria-label="Chế độ xem">
        {views.map(([v, ic, label]) => (
          <button key={v} className={ui.view === v ? "on" : ""} onClick={() => st().setUI({ view: v })} title={`${label} (V để đổi)`}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name={ic} size={14} /> <span className="lbl">{label}</span>
            </span>
          </button>
        ))}
      </div>
      <button className="btn primary" onClick={() => st().setUI({ presenting: true })} disabled={!p.dancers.length} title="Trình chiếu toàn màn hình để tập (F)">
        <Icon name="present" /> <span className="lbl">Trình chiếu</span>
      </button>
      <button className="btn icon ghost" onClick={() => st().setUI({ help: true })} title="Phím tắt và hướng dẫn (?)"><Icon name="help" /></button>
    </header>
  );
}
