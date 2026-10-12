// Dải cảnh báo lưu bài: mở ở hai thẻ, hoặc bài đã lưu không đọc được.

import type { CSSProperties } from "react";
import { useGuard, takeOver, dismissProblem } from "../guard";

const bar: CSSProperties = {
  position: "fixed", left: "50%", top: 56, transform: "translateX(-50%)", zIndex: 60,
  maxWidth: "min(640px, calc(100vw - 32px))", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
  background: "var(--panel)", border: "1px solid var(--yellow)", borderRadius: "var(--radius)",
  padding: "8px 12px", color: "var(--text)", boxShadow: "0 6px 24px rgba(0,0,0,.4)", fontSize: 13,
};

function saveRaw(raw: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }));
  a.download = "ban-luu-cu.choreo.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function SaveGuard() {
  const g = useGuard();
  const reload = () => location.reload();
  if (g.role === "secondary" || g.role === "taken") {
    return (
      <div style={bar} role="alert">
        <span style={{ flex: "1 1 260px" }}>
          {g.role === "taken"
            ? "Thẻ khác vừa nhận bài này. Thẻ này ngừng tự lưu để tránh ghi đè."
            : "Bài này đang mở ở một thẻ khác. Thẻ này tạm không tự lưu để tránh ghi đè."}
        </span>
        <button className="btn sm" onClick={reload} title="Mở lại bản mới nhất đã lưu">Tải lại</button>
        <button className="btn sm primary" onClick={() => void takeOver()} title="Lưu bài ở thẻ này, thẻ kia ngừng lưu">
          Dùng thẻ này
        </button>
      </div>
    );
  }
  if (g.problem === "unreadable" || (g.problem === "invalid" && !g.backedUp)) {
    return (
      <div style={bar} role="alert">
        <span style={{ flex: "1 1 260px" }}>
          Không đọc được bài đã lưu, nên app tạm không tự lưu để khỏi mất bài. Hãy tải lại trang; nếu vẫn lỗi,
          chọn Vẫn tự lưu để làm bài mới.
        </span>
        {g.raw != null && <button className="btn sm" onClick={() => saveRaw(g.raw)}>Tải bản cũ về máy</button>}
        <button className="btn sm" onClick={reload}>Tải lại</button>
        <button className="btn sm" onClick={dismissProblem}>Vẫn tự lưu</button>
      </div>
    );
  }
  if (g.problem === "invalid") {
    return (
      <div style={bar} role="status">
        <span style={{ flex: "1 1 260px" }}>
          Bài đã lưu bị hỏng nên mở bài trống. Bản cũ đã được cất riêng, có thể tải về để gửi người sửa.
        </span>
        <button className="btn sm" onClick={() => saveRaw(g.raw)}>Tải bản cũ về máy</button>
        <button className="btn sm" onClick={dismissProblem}>Đóng</button>
      </div>
    );
  }
  return null;
}
