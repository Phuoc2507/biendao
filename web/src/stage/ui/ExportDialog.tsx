// Tệp ▸ Xuất video…: chọn khung nhìn, khoảng Từ / Tới, độ phân giải rồi ghi.
// Sơ đồ có WebCodecs thì dựng nhanh hơn thời gian thực; cảnh 3D ghi theo thời gian thật.

import { useEffect, useRef, useState } from "react";
import { st, useProject } from "../store";
import * as clock from "../clock";
import { projectEnd } from "../actions";
import { fmtTime } from "../timing";
import { type VideoView, type Res, extFor, fmtDuration } from "../export/videoOpts";
import { type Span, type SpanKind, type SpanCtx, presetSpan, customSpan, parseClock } from "../export/videoRange";
import { type Progress, type RecordJob, canRecord, canFastPlan, recordMime, startRecording } from "../export/recordVideo";
import { Icon } from "./icons";
import "../export/export.css";

type Preset = Exclude<SpanKind, "custom">;

/** Ô giờ: gõ "1:05.5" hoặc "65", Enter hay rời ô thì nhận; sai thì trả lại giờ cũ. */
function TimeBox({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(fmtTime(value));
  useEffect(() => setText(fmtTime(value)), [value]);
  const commit = () => {
    const v = parseClock(text);
    if (v === null) setText(fmtTime(value));
    else if (Math.abs(v - value) > 1e-3) onCommit(v);
    else setText(fmtTime(value));
  };
  return (
    <input
      className="xv-time-in" value={text} aria-label={label} inputMode="decimal" spellCheck={false}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const [view, setView] = useState<VideoView>("audience");
  const [res, setRes] = useState<Res>(720);
  const [who, setWho] = useState<string>("");
  const [prog, setProg] = useState<Progress | null>(null);
  const job = useRef<RecordJob | null>(null);
  const t0 = useRef(0);

  const end = projectEnd(p);
  const ctx: SpanCtx = { end, loop: clock.getLoop(), t: clock.now(), formations: p.formations, marks: p.marks };
  const presets: [Preset, string][] = [["all", "Cả bài"]];
  if (ctx.loop) presets.push(["loop", "Vùng lặp"]);
  if (p.formations.length) presets.push(["formation", "Đội hình tại vạch phát"]);
  if (p.marks?.length) presets.push(["mark", "Mốc đoạn nhạc"]);

  const [span, setSpan] = useState<Span | { error: string }>(() => presetSpan(ctx.loop ? "loop" : "all", ctx));
  const choose = (k: Preset) => setSpan(presetSpan(k, ctx));
  const kind: Preset | null = "error" in span || span.kind === "custom" ? null : span.kind;
  const ok = "error" in span ? null : span;
  const setFrom = (a: number) => setSpan(customSpan(a, ok ? ok.b : end, end));
  const setTo = (b: number) => setSpan(customSpan(ok ? ok.a : 0, b, end));

  const fast = view === "plan" && canFastPlan();
  const why = canRecord(view);
  const mime = recordMime();
  const ext = fast ? "webm" : mime ? extFor(mime) : "webm";

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
    if (!ok || why) return;
    const j = startRecording(
      { view, a: ok.a, b: ok.b, tag: ok.tag, res, highlightId: view === "plan" && who ? who : null },
      setProg,
    );
    job.current = j;
    t0.current = performance.now();
    setProg({ t: ok.a, a: ok.a, b: ok.b, fraction: 0, note: "", mode: fast ? "fast" : "live" });
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
    const live = prog.mode === "live";
    const secs = (performance.now() - t0.current) / 1000;
    const speed = !live && secs > 1 && prog.fraction > 0 ? ((prog.b - prog.a) * prog.fraction) / secs : 0;
    return (
      <div className="xv-rec" role="dialog" aria-label="Đang xuất video">
        <div className="xv-card">
          <div className="xv-row">
            <span className={live ? "xv-dot" : "xv-dot fast"} /> <b>{live ? "Đang ghi video" : "Đang dựng video"}</b>
            <span className="grow" />
            <span className="xv-time">{fmtTime(prog.t)} / {fmtTime(prog.b)}</span>
          </div>
          <div className="xv-bar"><i style={{ width: `${Math.round(prog.fraction * 100)}%` }} /></div>
          <div className="xv-note">
            {prog.note || (live
              ? "Bài đang phát theo thời gian thật. Giữ tab này mở, không chuyển cửa sổ."
              : `Đang vẽ từng khung, không cần chờ bài phát hết${speed >= 1.2 ? `, nhanh gấp khoảng ${speed.toFixed(1).replace(".", ",")} lần` : ""}. ${Math.round(prog.fraction * 100)}%.`)}
          </div>
          <div className="xv-row">
            <span className="grow" />
            <button className="btn" onClick={() => job.current?.cancel()}><Icon name="close" size={14} /> Hủy <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>
    );
  }

  const seg = <T extends string | number>(v: T | null, set: (x: T) => void, opts: [T, string][]) => (
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
            {seg(kind, choose, presets)}
            <div className="xv-span">
              <span>Từ</span>
              <TimeBox value={ok ? ok.a : 0} onCommit={setFrom} label="Từ (phút:giây)" />
              <span>tới</span>
              <TimeBox value={ok ? ok.b : end} onCommit={setTo} label="Tới (phút:giây)" />
            </div>
            <div className="xv-hint">
              {"error" in span ? <span className="xv-err">{span.error}</span> : (
                <>{span.label} · dài {fmtDuration(span.b - span.a)}
                  {fast ? " · dựng nhanh, không phải chờ bài phát" : ` · mất khoảng ${fmtDuration(span.b - span.a)} để ghi`}</>
              )}
            </div>
          </div>
          <label>Độ nét</label>
          <div>{seg(res, setRes, [[480, "480p"], [720, "720p"], [1080, "1080p"]])}</div>
        </div>
        <p className="xv-hint">
          {why ? <span className="xv-err">{why}</span> : fast ? (
            <>Ra tệp .webm kèm nhạc. Sơ đồ được vẽ từng khung nên xong nhanh hơn thời lượng đoạn; nếu trình duyệt thiếu bộ mã thì tự chuyển sang ghi theo thời gian thật.</>
          ) : (
            <>Ra tệp .{ext}{ext === "webm" ? " (trình duyệt này không ghi được MP4; Zalo/điện thoại có thể cần đổi định dạng)" : ""}.
              {" "}Bài sẽ phát từ đầu đoạn tới cuối đoạn theo thời gian thật, kèm nhạc. Giữ tab này mở cho tới khi xong.</>
          )}
        </p>
        <div className="xv-row">
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Đóng</button>
          <button className="btn primary" disabled={!!why || !ok} onClick={start}>
            <Icon name="video" size={16} /> {fast ? "Bắt đầu dựng" : "Bắt đầu ghi"}
          </button>
        </div>
      </div>
    </div>
  );
}
