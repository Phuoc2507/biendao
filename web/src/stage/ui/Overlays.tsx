// Lớp phủ: thông báo (có Hoàn tác), đang xử lý, khung thả tệp, bảng phím tắt.

import { useEffect, useState } from "react";
import { st, useStore, useUI } from "../store";
import { importFiles } from "../actions";
import { Icon } from "./icons";

export function ToastView() {
  const t = useStore((s) => s.toast);
  if (!t) return null;
  return (
    <div className={`toast ${t.kind ?? ""}`} key={t.id} role="status">
      <span>{t.msg}</span>
      {t.undo && (
        <button className="btn sm" onClick={() => { st().undo(); st().clearToast(t.id); }}>
          <Icon name="undo" /> Hoàn tác
        </button>
      )}
      <button className="btn sm icon ghost" onClick={() => st().clearToast(t.id)} aria-label="Đóng"><Icon name="close" /></button>
    </div>
  );
}

export function Busy() {
  const b = useUI().busy;
  if (!b) return null;
  const indet = b.progress < 0;
  return (
    <div className="busy">
      <div className="box">
        <div>{b.msg}</div>
        <div className={`bar${indet ? " indet" : ""}`}>
          <i style={{ width: `${Math.round(Math.max(0, Math.min(1, b.progress)) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Kéo tệp vào bất kỳ đâu trong cửa sổ. */
export function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const over_ = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) importFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over_);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over_);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="dropzone">
      <div>
        Thả để nạp
        <small>nhạc, video từng người (.card.mp4 kèm .card.json), hoặc tệp dự án .choreo.json</small>
      </div>
    </div>
  );
}

const KEYS: [string, [string, string][]][] = [
  ["Phát", [
    ["Phát / dừng", "Space"],
    ["Về đầu", "Home"],
    ["Lùi / tới một phách", "← →"],
    ["Lùi / tới một lượt 8", "Shift ← →"],
    ["Đội hình trước / sau", "[  ]"],
    ["Lặp đoạn chuyển vào đội hình chọn", "L"],
  ]],
  ["Xếp người", [
    ["Dịch người đang chọn 25 cm", "← → ↑ ↓"],
    ["Dịch 1 m", "Shift + mũi tên"],
    ["Chọn thêm / bớt", "Shift + bấm"],
    ["Chọn bằng khung", "kéo ở nền sơ đồ"],
    ["Chọn tất cả", "Ctrl A"],
    ["Bỏ chọn", "Esc"],
    ["Lật trái phải", "M"],
    ["Kéo không bám lưới", "giữ Alt"],
  ]],
  ["Đội hình", [
    ["Thêm đội hình sau vạch phát", "Enter"],
    ["Xoá đội hình đang chọn", "Delete"],
    ["Đổi tên", "bấm đúp vào khối"],
    ["Đổi độ dài", "kéo mép khối"],
  ]],
  ["Khác", [
    ["Hoàn tác / làm lại", "Ctrl Z / Ctrl Y"],
    ["Lưu ra tệp", "Ctrl S"],
    ["Đổi chế độ xem", "V"],
    ["Bám lưới bật/tắt", "N"],
    ["Trình chiếu", "F"],
    ["Vừa khung dòng thời gian", "Shift Z"],
    ["Bảng này", "?"],
  ]],
];

export function Help() {
  const open = useUI().help;
  if (!open) return null;
  const close = () => st().setUI({ help: false });
  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Hướng dẫn">
        <h2>Cách dùng <span className="grow" /><button className="btn icon ghost" onClick={close}><Icon name="close" /></button></h2>
        <ol style={{ margin: "0 0 12px", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.7 }}>
          <li>Thả bài nhạc và video từng người vào cửa sổ. App tự khớp mỗi video với nhạc bằng tiếng.</li>
          <li>Tua tới lúc cần đổi đội hình, kéo các chấm trên <b>sơ đồ</b> (hoặc kéo thẳng thẻ trong khung khán giả).</li>
          <li>Bấm <kbd>Enter</kbd> để thêm đội hình kế tiếp, kéo người sang chỗ mới. Khoảng giữa hai khối là lúc mọi người trượt.</li>
          <li>Kéo khối trên dòng thời gian để dời, kéo mép để đổi độ dài. Xem thẻ <b>Cảnh báo</b> nếu có người va nhau.</li>
          <li>Bấm <b>Trình chiếu</b> để chiếu lên máy chiếu khi tập.</li>
        </ol>
        <div className="keys">
          {KEYS.map(([h, rows]) => (
            <div key={h} style={{ display: "contents" }}>
              <h5>{h}</h5>
              {rows.map(([a, b]) => (
                <div key={a}><span>{a}</span><kbd>{b}</kbd></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
