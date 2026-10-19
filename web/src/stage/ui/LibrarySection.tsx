// Mục "Thư viện" trong thẻ Đội hình: các hình dựng sẵn theo số người (kim cương, tam giác, so le...).

import { useMemo, useState } from "react";
import { useProject, useUI } from "../store";
import { applyLibraryShape, saveLibraryShape, shapeGroupSize } from "../actions";
import { LIB_MAX, LIB_MIN, libraryFor } from "../library";
import type { Vec2 } from "../model";
import { Icon } from "./icons";

const COUNTS = Array.from({ length: LIB_MAX - LIB_MIN + 1 }, (_, i) => LIB_MIN + i);

/** Ảnh nhỏ của một hình, khán giả ở phía dưới ảnh, cùng tỉ lệ cho mọi hình trong lưới. */
function LibMini({ pts, scale }: { pts: Vec2[]; scale: number }) {
  const r = pts.length > 12 ? 1.3 : 1.7;
  return (
    <svg viewBox="-20 -11 40 22" aria-hidden="true">
      <line x1={-18} x2={18} y1={10.4} y2={10.4} className="lib-front" />
      {pts.map((q, i) => (
        <circle key={i} cx={q[0] * scale} cy={q[1] * scale} r={r} fill="currentColor" />
      ))}
    </svg>
  );
}

export function LibrarySection() {
  const p = useProject();
  useUI(); // vẽ lại khi đổi người đang chọn
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const group = open ? shapeGroupSize() : 0;
  const auto = Math.min(LIB_MAX, Math.max(LIB_MIN, group || LIB_MIN));
  const n = pick ?? auto;
  const lib = useMemo(() => (open ? libraryFor(n, p.stage) : []), [open, n, p.stage.width, p.stage.depth]);
  // một tỉ lệ chung để hình rộng trông rộng, hình gọn trông gọn
  const scale = useMemo(() => {
    let w = 1, d = 1;
    for (const s of lib)
      for (const q of s.pts) {
        w = Math.max(w, Math.abs(q[0]));
        d = Math.max(d, Math.abs(q[1]));
      }
    return Math.min(17 / w, 8.5 / d);
  }, [lib]);
  const mismatch = group > 0 && group !== n;
  return (
    <>
      <h4 style={{ marginTop: 10 }}>
        <button
          className="lib-toggle" aria-expanded={open} onClick={() => setOpen(!open)}
          title="Các hình dựng sẵn theo số người: kim cương, tam giác, chữ V, so le, vòng cung..."
        >
          <Icon name="chevron" /> Thư viện
        </button>
        <span className="grow" />
        {open && (
          <label className="field lib-count">
            <select
              value={n} aria-label="Số người của hình"
              onChange={(e) => setPick(Number(e.target.value) === auto ? null : Number(e.target.value))}
            >
              {COUNTS.map((k) => <option key={k} value={k}>{k} người</option>)}
            </select>
          </label>
        )}
      </h4>
      {open && (
        <>
          {group === 0 && <div className="dim">Chưa có ai trên sân để xếp. Vẫn xem được hình, bấm vào thì chưa xếp được.</div>}
          {group > 0 && (group < LIB_MIN || group > LIB_MAX) && (
            <div className="dim">Nhóm có {group} người, thư viện chỉ có hình cho {LIB_MIN} tới {LIB_MAX} người.</div>
          )}
          {mismatch && group >= LIB_MIN && group <= LIB_MAX && (
            <div className="dim">
              Đang xem hình {n} người mà nhóm có {group} người.{" "}
              <button className="linklike" onClick={() => setPick(null)}>Xem hình {group} người</button>
            </div>
          )}
          <div className="lib-grid">
            {lib.map((s) => (
              <div key={s.id} className="lib-item">
                <button onClick={() => applyLibraryShape(s)} title={`Xếp theo hình "${s.name}" (${n} chỗ) tại vạch phát`}>
                  <LibMini pts={s.pts} scale={scale} />
                  <span className="nm">{s.name}</span>
                </button>
                <button
                  className="lib-save" onClick={() => saveLibraryShape(s)}
                  title={`Lưu vào Hình của tôi: "${s.name}"`} aria-label={`Lưu ${s.name} vào Hình của tôi`}
                >
                  <Icon name="bookmark" />
                </button>
              </div>
            ))}
          </div>
          <div className="dim" style={{ marginTop: 4 }}>Khán giả ở phía vạch dưới mỗi ảnh. Hình so le, tam giác, kim cương đã xếp để không ai bị che.</div>
        </>
      )}
    </>
  );
}
