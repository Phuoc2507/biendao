// Thanh trên: tên bài, tệp, hoàn tác, điều khiển phát, đếm nhịp, chế độ xem.

import { useEffect, useRef, useState } from "react";
import { countAt, fmtTime } from "../timing";
import { st, useProject, useStore, useUI, type View } from "../store";
import * as clock from "../clock";
import { usePlaying, useTime } from "../clock";
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

function FileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", f);
    return () => window.removeEventListener("pointerdown", f);
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const openJson = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        await openProjectFile(f);
        st().notify("Đã mở dự án. Nếu thiếu video, thả các tệp video vào để gắn lại.");
      } catch (e) {
        st().notify(`Không mở được: ${(e as Error).message}`, { kind: "error" });
      }
    };
    inp.click();
  };
  return (
    <div className="menu" ref={ref}>
      <button className={`btn${open ? " on" : ""}`} onClick={() => setOpen(!open)}>
        <Icon name="folder" /> Tệp <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="pop">
          <button onClick={run(pickAnyFiles)}><Icon name="upload" size={16} /> Nạp video và nhạc…</button>
          <button onClick={run(openJson)}><Icon name="file" size={16} /> Mở tệp dự án (.choreo.json)…</button>
          <button onClick={run(exportProject)}><Icon name="download" size={16} /> Lưu ra tệp <kbd>Ctrl S</kbd></button>
          <hr />
          <button
            onClick={run(() => {
              if (confirm("Bắt đầu bài mới? Bài hiện tại sẽ bị thay (có thể Hoàn tác).")) newProject();
            })}
          >
            <Icon name="plus" size={16} /> Bài mới
          </button>
          <hr />
          <button onClick={run(() => window.open("./3d.html", "_blank"))}><Icon name="cube" size={16} /> Mở app nhân vật 3D cũ</button>
          <div className="hint">Dự án tự lưu trong trình duyệt này. Lưu ra tệp để chép sang máy khác.</div>
        </div>
      )}
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
        <button className="btn icon ghost" onClick={() => stepBeat(-1)} title="Lùi một phách (←)"><Icon name="stepBack" /></button>
        <button className="play" onClick={clock.toggle} title="Phát / dừng (Space)">
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button className="btn icon ghost" onClick={() => stepBeat(1)} title="Tới một phách (→)"><Icon name="stepFwd" /></button>
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
              <Icon name={ic} size={14} /> {label}
            </span>
          </button>
        ))}
      </div>
      <button className="btn primary" onClick={() => st().setUI({ presenting: true })} disabled={!p.dancers.length} title="Trình chiếu toàn màn hình để tập (F)">
        <Icon name="present" /> Trình chiếu
      </button>
      <button className="btn icon ghost" onClick={() => st().setUI({ help: true })} title="Phím tắt và hướng dẫn (?)"><Icon name="help" /></button>
    </header>
  );
}
