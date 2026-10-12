// Ô số: gõ thoải mái (cả dấu phẩy "1,5"), chỉ chốt khi Enter hoặc bấm ra ngoài; Esc huỷ.

import { type CSSProperties, useRef, useState } from "react";
import { type NumOpts, clampNum, fmtNum, readNum } from "./num";

interface Props {
  value: number | null;
  min: number;
  max: number;
  /** Làm tròn tới bước này khi chốt (mặc định 0,01). */
  quantum?: number;
  /** Mũi tên lên/xuống đổi số nháp bấy nhiêu (Shift: gấp 10), vẫn chờ Enter mới chốt. */
  step?: number;
  /** Cho xoá trống (ra null), ví dụ ô nhịp. */
  allowEmpty?: boolean;
  onCommit(v: number | null): void;
  placeholder?: string;
  title?: string;
  style?: CSSProperties;
  disabled?: boolean;
  "aria-label"?: string;
}

export function NumField(p: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  const opts: NumOpts = { min: p.min, max: p.max, quantum: p.quantum ?? 0.01, allowEmpty: p.allowEmpty };
  const commit = () => {
    const d = draft;
    setDraft(null);
    if (cancel.current) {
      cancel.current = false;
      return;
    }
    if (d === null) return;
    const v = readNum(d, opts);
    if (v === undefined) return; // gõ sai: trả lại số cũ
    if (v !== p.value) p.onCommit(v);
  };
  return (
    <input
      type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      value={draft ?? fmtNum(p.value)}
      placeholder={p.placeholder} title={p.title} style={p.style} disabled={p.disabled}
      aria-label={p["aria-label"]}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel.current = true;
          e.currentTarget.blur();
        } else if (p.step && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          const base = readNum(draft ?? fmtNum(p.value), opts) ?? p.value;
          const d = (e.key === "ArrowUp" ? 1 : -1) * p.step * (e.shiftKey ? 10 : 1);
          setDraft(fmtNum(clampNum(base === null ? p.min : base + d, opts)));
        }
      }}
    />
  );
}
