// Bảng ĐÁNH GIÁ NHẬN BIẾT PHA (V35): với mỗi vũ công, tách và hiện HAI TRỤC riêng
//   1) SAI ĐỘNG TÁC = formResidual (cm) — khác biệt hình dáng sau khi đã căn trễ tối
//      ưu; thanh tỉ lệ + cờ ⚠ cho người nổi bật (đồng bộ với vòng đỏ 3D).
//   2) TRỄ NHỊP = lag (ms, ± so với trung vị nhóm) — chip "chậm/sớm"; đây là timing,
//      KHÔNG phải lỗi động tác, nên hiện màu khác và không gắn cờ ⚠.
// Nhờ tách vậy, canon/echo cố ý (formResidual ~0, lag ≠ 0) KHÔNG bị coi là múa sai.
//
// Dữ liệu lấy từ singleton `syncHighlight` (SyncHighlighter tính tiết lưu ~8Hz). Bảng
// subscribe `time`+`dancers` chỉ để RE-RENDER theo nhịp phát; là component riêng nên
// không kéo cả Panel render. Chỉ hiện khi ≥2 vũ công và đã có kết quả căn pha.

import { useStore } from "../store";
import { syncHighlight } from "../syncHighlight";

const DEAD_LAG = 0.04; // |lag| dưới ~40ms (≈ 1 bước quét) coi như đúng nhịp

export function SyncBreakdown() {
  const time = useStore((s) => s.time); // nhịp re-render (đọc singleton mới nhất)
  const dancers = useStore((s) => s.dancers);
  const bpm = useStore((s) => s.bpm);
  void time;

  const pa = syncHighlight.phase;
  const ids = syncHighlight.dancerIds;
  if (dancers.length < 2 || !pa || ids.length !== pa.formResidual.length)
    return null;

  const byId = new Map(dancers.map((d) => [d.id, d]));
  const maxRes = Math.max(0.01, ...pa.formResidual);
  const beat = 60 / Math.max(1, bpm);

  return (
    <div className="syncbox">
      <div
        className="camlabel"
        title="Độ đồng bộ HÌNH DÁNG sau khi đã căn trễ nhịp tối ưu — bỏ qua phần lệch do canon/vào chậm, chỉ còn khác biệt động tác thật"
      >
        Đồng bộ động tác {Math.round(pa.formSync * 100)}%
        <span className="sub"> · đã bỏ trễ nhịp</span>
      </div>
      {ids.map((id, i) => {
        const d = byId.get(id);
        if (!d) return null;
        const res = pa.formResidual[i];
        const lag = pa.lag[i];
        const off = syncHighlight.worstId === id;
        const pct = Math.min(100, (res / maxRes) * 100);

        // Chip trễ nhịp: hướng bằng màu (chậm=hổ phách, sớm=lam), độ lớn ms + phách.
        let lagCls = "lag";
        let lagTxt = "đúng nhịp";
        if (Math.abs(lag) >= DEAD_LAG) {
          const late = lag > 0;
          lagCls += late ? " late" : " early";
          const ms = Math.round(Math.abs(lag) * 1000);
          const beats = Math.abs(lag) / beat;
          lagTxt =
            (late ? "chậm " : "sớm ") +
            ms +
            "ms" +
            (beats >= 0.05 ? ` · ${beats.toFixed(2)} phách` : "");
        }

        return (
          <div className={"syncrow" + (off ? " off" : "")} key={id}>
            <div className="sr-top">
              <span className="dot" style={{ background: d.color }} />
              <span className="nm">{d.name}</span>
              <span className={lagCls}>{lagTxt}</span>
            </div>
            <div className="sr-bot">
              <span className="bar">
                <i style={{ width: `${pct}%`, background: d.color }} />
              </span>
              <span className="cm">
                {Math.round(res * 100)}cm{off ? " ⚠" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
