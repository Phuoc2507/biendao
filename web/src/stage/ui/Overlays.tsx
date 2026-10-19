// Lớp phủ: thông báo (có Hoàn tác), đang xử lý, khung thả tệp, bảng phím tắt.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { st, useStore, useUI } from "../store";
import { importFiles, cancelBusy } from "../actions";
import { Icon } from "./icons";

const subFull = (f: () => void) => {
  document.addEventListener("fullscreenchange", f);
  return () => document.removeEventListener("fullscreenchange", f);
};
const fullEl = () => document.fullscreenElement;

/** Tối đa 3 thông báo xếp chồng; vẫn hiện khi đang toàn màn hình. */
export function ToastView() {
  const list = useStore((s) => s.toasts);
  const project = useStore((s) => s.project);
  const fs = useSyncExternalStore(subFull, fullEl);
  if (!list.length) return null;
  return createPortal(
    <div className="toasts">
      {list.map((t) => (
        <div className={`toast ${t.kind ?? ""}`} key={t.id} role={t.kind === "error" ? "alert" : "status"}>
          <span>{t.msg}</span>
          {/* chỉ hoàn tác được khi chưa có sửa nào khác sau thông báo này */}
          {t.undo && t.at === project && (
            <button className="btn sm" onClick={() => { st().undo(); st().clearToast(t.id); }}>
              <Icon name="undo" /> Hoàn tác
            </button>
          )}
          {t.action && (!t.undo || t.at === project) && (
            <button className="btn sm" onClick={() => { st().clearToast(t.id); t.action!.run(); }}>{t.action.label}</button>
          )}
          <button className="btn sm icon ghost" onClick={() => st().clearToast(t.id)} aria-label="Đóng thông báo"><Icon name="close" /></button>
        </div>
      ))}
    </div>,
    fs ?? document.body,
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
        {b.cancel && <button className="btn sm" style={{ marginTop: 10 }} onClick={cancelBusy}>Dừng</button>}
      </div>
    </div>
  );
}

/** Đọc đệ quy các mục thả vào (tệp lẫn thư mục) thành danh sách tệp. */
async function collectFiles(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const walk = async (en: FileSystemEntry): Promise<void> => {
    if (en.isFile) {
      if (/^\.|^(desktop\.ini|thumbs\.db)$/i.test(en.name)) return; // tệp ẩn của hệ điều hành
      out.push(await new Promise<File>((ok, bad) => (en as FileSystemFileEntry).file(ok, bad)));
    } else if (en.isDirectory) {
      const rd = (en as FileSystemDirectoryEntry).createReader();
      // readEntries trả từng đợt, đọc tới khi rỗng
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, bad) => rd.readEntries(ok, bad));
        if (!batch.length) break;
        for (const b of batch) await walk(b);
      }
    }
  };
  for (const en of entries) await walk(en).catch(() => {});
  return out;
}

/** Kéo tệp (hoặc cả thư mục thẻ) vào bất kỳ đâu trong cửa sổ. */
export function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    // đang Học động tác thì chế độ đó tự nhận video thả vào, không nạp vào bài
    const hasFiles = (e: DragEvent) =>
      !st().ui.learning && !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
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
      const entries = Array.from(e.dataTransfer?.items ?? [])
        .map((it) => it.webkitGetAsEntry?.())
        .filter((x): x is FileSystemEntry => !!x);
      const plain = Array.from(e.dataTransfer?.files ?? []);
      // thư mục (vd. the/) phải đọc lúc này, sau sự kiện drop items hết hiệu lực
      if (entries.some((x) => x.isDirectory)) collectFiles(entries).then((fs) => void importFiles(fs));
      else if (plain.length) importFiles(plain);
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
        <small>nhạc, thư mục thẻ hoặc video từng người (.card.mp4 kèm .card.json), hoặc tệp dự án .choreo.json</small>
      </div>
    </div>
  );
}

const KEYS: [string, [string, string][]][] = [
  ["Phát", [
    ["Phát / dừng", "Space"],
    ["Về đầu / về cuối", "Home / End"],
    ["Lùi / tới một phách", "← →"],
    ["Lùi / tới một lượt 8", "Shift ← →"],
    ["Đội hình trước / sau", "[  ]"],
    ["Mốc đoạn nhạc trước / sau", "Shift [  ]"],
    ["Thêm mốc đoạn ở vạch phát", "B"],
    ["Lặp đoạn chuyển vào đội hình chọn", "L"],
  ]],
  ["Xếp người", [
    ["Dịch người đang chọn 25 cm", "← → ↑ ↓"],
    ["Dịch 1 m", "Shift + mũi tên"],
    ["Chọn thêm / bớt", "Shift + bấm"],
    ["Chọn bằng khung", "kéo ở nền sơ đồ"],
    ["Chọn tất cả", "Ctrl A"],
    ["Chép chỗ đứng / dán vào đội hình đang đứng", "Ctrl C / Ctrl V"],
    ["Bỏ chọn", "Esc"],
    ["Lật trái phải", "M"],
    ["Hai người đang chọn đổi chỗ", "X"],
    ["Xoay nhóm một phần tư vòng (ngược chiều: Shift R)", "R"],
    ["Kéo không bám lưới", "giữ Alt"],
  ]],
  ["Đội hình", [
    ["Thêm đội hình sau vạch phát", "Enter"],
    ["Xoá đội hình vừa bấm chọn", "Delete"],
    ["Đổi tên", "bấm đúp vào khối"],
    ["Đổi độ dài", "kéo mép khối"],
  ]],
  ["Khác", [
    ["Hoàn tác / làm lại", "Ctrl Z / Ctrl Y"],
    ["Lưu ra tệp", "Ctrl S"],
    ["Đổi chế độ xem", "V"],
    ["Bám lưới bật/tắt", "N"],
    ["Sơ đồ nhìn từ khán giả / từ sân khấu", "O"],
    ["Trình chiếu", "F"],
    ["Vừa khung dòng thời gian", "Shift Z"],
    ["Bảng này", "?"],
  ]],
  ["Khi trình chiếu", [
    ["Phát / dừng", "Space"],
    ["Đội hình trước / sau", "← →  hoặc  PageUp PageDown"],
    ["Mốc đoạn nhạc trước / sau", "Shift [  ]"],
    ["Về đầu / về cuối", "Home / End"],
    ["Góc sau lưng người múa", "B"],
    ["Đặt lại góc nhìn", "C"],
    ["Thoát trình chiếu", "Esc / F"],
  ]],
  ["Khi học động tác", [
    ["Phát / dừng (có đếm 5 6 7 8)", "Space"],
    ["Lùi / tới 2 giây", "← →"],
    ["Lùi / tới một khung hình", ",  ."],
    ["Đặt A / đặt B (lặp đoạn)", "[  ]"],
    ["Bật tắt gương", "M"],
    ["Thoát", "Esc"],
  ]],
];

export function Help() {
  const open = useUI().help;
  if (!open) return null;
  return <HelpDialog />;
}

function HelpDialog() {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => st().setUI({ help: false });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    return () => prev?.focus?.();
  }, []);
  // Tab chỉ đi vòng trong hộp
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !box.current) return;
    const els = box.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Hướng dẫn" ref={box} onKeyDown={trap}>
        <h2>Cách dùng <span className="grow" /><button ref={closeBtn} className="btn icon ghost" onClick={close} aria-label="Đóng hướng dẫn"><Icon name="close" /></button></h2>
        <ol style={{ margin: "0 0 12px", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.7 }}>
          <li>Thả bài nhạc và video từng người vào cửa sổ. App tự khớp mỗi video với nhạc bằng tiếng.</li>
          <li>Tua tới lúc cần đổi đội hình, kéo các chấm trên <b>sơ đồ</b> (hoặc kéo thẳng thẻ trong khung khán giả).</li>
          <li>Bấm <kbd>Enter</kbd> để thêm đội hình kế tiếp, kéo người sang chỗ mới. Khoảng giữa hai khối là lúc mọi người trượt.</li>
          <li>Kéo khối trên dòng thời gian để dời, kéo mép để đổi độ dài. Xem thẻ <b>Cảnh báo</b> nếu có người va nhau.</li>
          <li>Bấm <b>Trình chiếu</b> để chiếu lên máy chiếu khi tập.</li>
          <li>Đã có video cả đội múa? Bấm <b>Học động tác</b> để xem chậm, lặp đoạn, soi gương và phóng to theo bạn.</li>
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
        <p className="dim" style={{ margin: "12px 0 0", lineHeight: 1.6 }}>
          Khi đang gõ trong ô, phím tắt tạm nghỉ (trừ Ctrl S). Ô số: gõ xong bấm Enter hoặc bấm ra ngoài để chốt, Esc để huỷ; số lẻ gõ "1,5" hay "1.5" đều được.
        </p>
      </div>
    </div>
  );
}
