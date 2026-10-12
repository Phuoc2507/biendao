// Tệp ▸ Xuất video…: chọn khung nhìn, đoạn, độ phân giải rồi ghi theo thời gian thật.

import { useEffect, useRef, useState } from "react";
import { st, useProject } from "../store";
import * as clock from "../clock";
import { projectEnd } from "../actions";
import { fmtTime } from "../timing";
import { type VideoView, type RangeKind, type Res, rangeFor, extFor, fmtDuration } from "../export/videoOpts";
import { type Progress, type RecordJob, canRecord, recordMime, startRecording } from "../export/recordVideo";
import { Icon } from "./icons";
import "../export/export.css";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const [view, setView] = useState<VideoView>("audience");
  const [range, setRange] = useState<RangeKind>(() => (clock.getLoop() ? "loop" : "all"));
  const [res, setRes] = useState<Res>(720);
  const [who, setWho] = useState<string>("");
  const [prog, setProg] = useState<Progress | null>(null);
  const job = useRef<RecordJob | null>(null);

  const why = canRecord();
  const mime = recordMime();
  const r = rangeFor(range, { end: projectEnd(p), loop: clock.getLoop(), t: clock.now() });

  // Esc: đóng hộp hoặc hủy ghi; khi đang ghi thì chặn mọi phím tắt khác
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (job.current) job.current.cancel();
        else onClose();
      } else if (job.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [onClose]);
  useEffect(() => () => job.current?.cancel(), []);

  const start = async () => {
    if ("error" in r || why) return;
    const j = startRecording({ view, range, res, highlightId: view === "plan" && who ? who : null }, setProg);
    job.current = j;
    setProg({ t: r.a, a: r.a, b: r.b, fraction: 0, note: "" });
    try {
      const name = await j.done;
      if (name) st().notify(`Đã xuất video ${name} (xem trong thư mục Tải xuống).`);
      else st().notify("Đã hủy xuất video.");
      onClose();
    } catch (e) {
      st().notify(`Không xuất được video: ${(e as Error).message}`, { kind: "error" });
      job.current = null;
      setProg(null);
    } finally {
      job.current = null;
    }
  };

  if (prog) {
    return (
      <div className="xv-rec" role="dialog" aria-label="Đang xuất video">
        <div className="xv-card">
          <div className="xv-row">
            <span className="xv-dot" /> <b>Đang ghi video</b>
            <span className="grow" />
            <span className="xv-time">{fmtTime(prog.t)} / {fmtTime(prog.b)}</span>
          </div>
          <div className="xv-bar"><i style={{ width: `${Math.round(prog.fraction * 100)}%` }} /></div>
          <div className="xv-note">
            {prog.note || "Bài đang phát theo thời gian thật. Giữ tab này mở, không chuyển cửa sổ."}
          </div>
          <div className="xv-row">
            <span className="grow" />
            <button className="btn" onClick={() => job.current?.cancel()}><Icon name="close" size={14} /> Hủy <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>
    );
  }

  const seg = <T extends string | number>(v: T, set: (x: T) => void, opts: [T, string][]) => (
    <div className="seg">
      {opts.map(([k, label]) => (
        <button key={String(k)} className={v === k ? "on" : ""} onClick={() => set(k)}>{label}</button>
      ))}
    </div>
  );
  const people = p.dancers.filter((d) => !d.hidden);

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal xv" role="dialog" aria-label="Xuất video">
        <h2>Xuất video <span className="grow" /><button className="btn icon ghost" onClick={onClose} title="Đóng (Esc)"><Icon name="close" /></button></h2>
        <div className="xv-grid">
          <label>Khung nhìn</label>
          <div>
            {seg(view, setView, [["audience", "Khán giả 3D"], ["plan", "Sơ đồ từ trên"]])}
            {view === "plan" && (
              <select className="xv-sel" value={who} onChange={(e) => setWho(e.target.value)} title="Tô đậm một người để gửi riêng cho họ tập">
                <option value="">Cả đội</option>
                {people.map((d) => <option key={d.id} value={d.id}>Video riêng cho {d.name}</option>)}
              </select>
            )}
          </div>
          <label>Đoạn</label>
          <div>
            {seg(range, setRange, [["all", "Cả bài"], ["loop", "Đoạn lặp"], ["playhead", "Từ vạch phát"]])}
            <div className="xv-hint">
              {"error" in r ? <span className="xv-err">{r.error}</span> : <>{fmtTime(r.a)} – {fmtTime(r.b)} · mất khoảng {fmtDuration(r.b - r.a)} để ghi</>}
            </div>
          </div>
          <label>Độ nét</label>
          <div>{seg(res, setRes, [[480, "480p"], [720, "720p"], [1080, "1080p"]])}</div>
        </div>
        <p className="xv-hint">
          {why ? <span className="xv-err">{why}</span> : (
            <>Ra tệp .{extFor(mime!)}{extFor(mime!) === "webm" ? " (trình duyệt này không ghi được MP4; Zalo/điện thoại có thể cần đổi định dạng)" : ""}.
              {" "}Bài sẽ phát từ đầu đoạn tới cuối đoạn theo thời gian thật, kèm nhạc. Giữ tab này mở cho tới khi xong.</>
          )}
        </p>
        <div className="xv-row">
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Đóng</button>
          <button className="btn primary" disabled={!!why || "error" in r} onClick={start}>
            <Icon name="video" size={16} /> Bắt đầu ghi
          </button>
        </div>
      </div>
    </div>
  );
}
