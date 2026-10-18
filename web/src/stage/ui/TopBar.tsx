// Thanh trên: tên bài, tệp, hoàn tác, điều khiển phát, đếm nhịp, chế độ xem.

import { useEffect, useRef, useState } from "react";
import { countAt, fmtTime } from "../timing";
import { st, useProject, useStore, useUI, type View } from "../store";
import * as clock from "../clock";
import { usePlaying, useTime } from "../clock";
import { createPortal } from "react-dom";
import { saveAs, saveBundle, saveTargetName, forgetSaveTarget, watchMusic, openBundleFile, isBlankProject } from "../export/save";
import { printFormations } from "../export/print";
import { exportCurrentImage, exportAllImages } from "../export/image";
import { ExportDialog } from "./ExportDialog";
import { exportProject, newProject, openProjectFile, setTitle, stepBeat, projectEnd } from "../actions";
import { saveProject } from "../db";
import { errText, storageInfo } from "../storage";
import { pickAnyFiles } from "./SidePanel";
import { Icon } from "./icons";
import { toggleSide } from "./useLayout";
import { openLearn } from "./Learn";

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
          <button onClick={run(exportCurrentImage)} title="Ảnh PNG dọc của đội hình tại vạch phát, để gửi Zalo, Messenger">
            <Icon name="image" size={16} /> Xuất ảnh đội hình này (.png)
          </button>
          <button onClick={run(exportAllImages)} title="Mỗi đội hình một ảnh PNG, gói trong một tệp .zip">
            <Icon name="image" size={16} /> Xuất ảnh tất cả đội hình (.zip)
          </button>
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

/** Ô tự lưu: bấm để xem chỗ lưu và Lưu ra tệp. Lỗi thì luôn hiện, ở mọi cỡ màn. */
function SaveState() {
  const ui = useUI();
  const s = ui.saveState;
  const err = s === "error";
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    storageInfo().then((t) => live && setInfo(t));
    const away = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      live = false;
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const retry = () => {
    st().setUI({ saveState: "saving" });
    saveProject(st().project)
      .then(() => st().setUI({ saveState: "saved", saveError: null }))
      .catch((e) => st().setUI({ saveState: "error", saveError: errText(e, "Trình duyệt báo lỗi") }));
  };
  const label = err ? "Không lưu được" : s === "saving" ? "Đang lưu…" : "Đã lưu";
  const tip = err
    ? `Không lưu được vào trình duyệt.${ui.saveError ? ` ${ui.saveError.replace(/[.\s]+$/, "")}.` : ""} Bấm để xem cách giữ bài.`
    : "Bài tự lưu trong trình duyệt này. Bấm để xem chỗ lưu.";
  return (
    <div className={`menu save-menu${err ? " err" : ""}`} ref={ref}>
      <button
        className={`save${err ? " error" : s === "saving" ? " busy" : ""}`} onClick={() => setOpen(!open)}
        title={tip} aria-haspopup="dialog" aria-expanded={open}
      >
        {err ? <Icon name="warn" /> : <span className="ok" aria-hidden="true">✓</span>}
        <span className="txt">{label}</span>
      </button>
      {open && (
        <div className="pop save-pop" role="dialog" aria-label="Lưu bài">
          {err ? (
            <>
              <p className="save-head">Không lưu được vào trình duyệt</p>
              {ui.saveError && <p className="save-why">{ui.saveError}</p>}
              <p>Bài vẫn còn trên màn hình. Để khỏi mất, bấm Lưu ra tệp ngay, rồi xoá bớt video không dùng.</p>
            </>
          ) : (
            <p>Bài tự lưu trong trình duyệt này, mở lại vẫn còn. Lưu ra tệp để chép sang máy khác hoặc cất dự phòng.</p>
          )}
          <button onClick={() => { setOpen(false); exportProject(); }}><Icon name="download" size={16} /> Lưu ra tệp <kbd>Ctrl S</kbd></button>
          {err && <button onClick={retry}><Icon name="sync" size={16} /> Thử lưu lại</button>}
          {info && <div className="hint">{info}</div>}
        </div>
      )}
    </div>
  );
}

export function TopBar({ phone = false }: { phone?: boolean }) {
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
  const sideTip = phone ? "Danh sách vũ công và đội hình" : ui.sideOpen ? "Ẩn cột trái" : "Hiện cột trái";
  // thứ tự trong DOM là thứ tự trên máy tính; điện thoại dựng đứng xếp lại thành 2 hàng bằng CSS
  return (
    <header className="top">
      <button
        className={`btn icon ghost side-btn${phone && ui.sideOpen ? " on" : ""}`} onClick={toggleSide}
        title={sideTip} aria-label={phone ? sideTip : "Cột trái"} aria-pressed={ui.sideOpen}
      >
        <Icon name="sidebar" />
      </button>
      <div className="brand">
        <div className="logo" aria-hidden="true">♪</div>
        <input
          className="title-input" key={p.title} defaultValue={p.title} title="Tên bài múa" aria-label="Tên bài múa"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== p.title) setTitle(v);
            else e.currentTarget.value = p.title; // xoá trắng thì trả lại tên cũ
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              e.currentTarget.value = p.title;
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <SaveState />
      <FileMenu />
      <div className="row" style={{ gap: 2 }}>
        <button className="btn icon ghost" disabled={!canUndo} onClick={() => st().undo()} title="Hoàn tác (Ctrl Z)" aria-label="Hoàn tác"><Icon name="undo" /></button>
        <button className="btn icon ghost" disabled={!canRedo} onClick={() => st().redo()} title="Làm lại (Ctrl Y)" aria-label="Làm lại"><Icon name="redo" /></button>
      </div>
      <i className="top-brk" aria-hidden="true" />
      <div className="grow" />
      <div className="transport">
        <button className="btn icon ghost" onClick={() => clock.seek(0)} title="Về đầu (Home)" aria-label="Về đầu"><Icon name="home" /></button>
        <button className="btn icon ghost step-btn" onClick={() => stepBeat(-1)} title="Lùi một phách (←)" aria-label="Lùi một phách"><Icon name="stepBack" /></button>
        <button className="play" onClick={clock.toggle} title="Phát / dừng (Space)" aria-label={playing ? "Dừng" : "Phát"}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button className="btn icon ghost step-btn" onClick={() => stepBeat(1)} title="Tới một phách (→)" aria-label="Tới một phách"><Icon name="stepFwd" /></button>
      </div>
      <Clock />
      <div className="grow" />
      <button
        className={`btn icon snap-btn${ui.snap ? " on" : ""}`} onClick={() => st().setUI({ snap: !ui.snap })}
        title="Bám lưới và phách (N)" aria-label="Bám lưới và phách" aria-pressed={ui.snap}
      >
        <Icon name="magnet" />
      </button>
      <div className="seg" role="group" aria-label="Chế độ xem">
        {views.map(([v, ic, label]) => (
          <button key={v} className={ui.view === v ? "on" : ""} onClick={() => st().setUI({ view: v })} title={`${label} (V để đổi)`} aria-pressed={ui.view === v}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name={ic} size={14} /> <span className="lbl">{label}</span>
            </span>
          </button>
        ))}
      </div>
      <button className="btn learn-btn" onClick={openLearn} title="Học động tác từ video cả đội: soi gương, xem chậm, lặp đoạn">
        <Icon name="learn" /> <span className="lbl">Học động tác</span>
      </button>
      <button className="btn primary present-btn" onClick={() => st().setUI({ presenting: true })} disabled={!p.dancers.length} title="Trình chiếu toàn màn hình để tập (F)">
        <Icon name="present" /> <span className="lbl">Trình chiếu</span>
      </button>
      <button className="btn icon ghost help-btn" onClick={() => st().setUI({ help: true })} title="Phím tắt và hướng dẫn (?)" aria-label="Phím tắt và hướng dẫn"><Icon name="help" /></button>
    </header>
  );
}
