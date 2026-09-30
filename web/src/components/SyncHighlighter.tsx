// Bộ điều phối tầng đánh giá NHẬN BIẾT PHA — chạy MỘT useFrame cho cả sân khấu (không
// render gì). Mỗi ~120ms (tiết lưu vì phaseAlignAt là O(n²)): căn pha cả nhóm tại
// playhead, tách lỗi HÌNH DÁNG khỏi trễ nhịp, rồi ghi vào kênh `syncHighlight`:
//   - `worstId` = người múa SAI ĐỘNG TÁC nổi bật (formOutlierIndex) → Mannequin bật
//     vòng đỏ. Canon/echo cố ý cho formResidual ~0 nên KHÔNG ai bị nêu (khác V34).
//   - `phase` + `dancerIds` → bảng SyncBreakdown đọc để hiện residual & lag từng người.
// Tách riêng khỏi Mannequin vì căn pha cần quỹ đạo của CẢ nhóm.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../store";
import { phaseAlignAt, formOutlierIndex } from "../sync";
import { syncHighlight } from "../syncHighlight";

export function SyncHighlighter() {
  const lastRef = useRef(0);
  useFrame(() => {
    const { clips, clip, dancers, time } = useStore.getState();
    if (dancers.length < 2 || !clip) {
      syncHighlight.worstId = null;
      syncHighlight.phase = null;
      syncHighlight.dancerIds = [];
      return;
    }
    const now = performance.now();
    if (now - lastRef.current < 120) return; // tiết lưu ~8Hz
    lastRef.current = now;

    const pa = phaseAlignAt(clips, clip, dancers, time);
    syncHighlight.phase = pa;
    syncHighlight.dancerIds = dancers.map((d) => d.id);
    const oi = pa ? formOutlierIndex(pa) : null;
    syncHighlight.worstId = oi === null ? null : dancers[oi].id;
  });
  return null;
}
