// Bộ điều phối tô sáng "ai lệch nhịp" — chạy MỘT useFrame cho cả sân khấu (không
// render gì). Mỗi khung: chấm độ lệch riêng từng vũ công so với tư thế TRUNG BÌNH
// nhóm tại playhead, chọn người lệch NHẤT nếu họ thật sự nổi bật (outlierIndex lo
// phần lọc unison/canon), rồi ghi id vào kênh chia sẻ `syncHighlight`. Mannequin
// đọc kênh này để bật vòng cảnh báo. Tách riêng khỏi Mannequin vì việc chọn "người
// lệch nhất" cần tư thế của CẢ nhóm, còn mỗi Mannequin chỉ biết tư thế của mình.

import { useFrame } from "@react-three/fiber";
import { useStore } from "../store";
import { groupDeviationAt, outlierIndex } from "../sync";
import { syncHighlight } from "../syncHighlight";

export function SyncHighlighter() {
  useFrame(() => {
    const { clips, clip, dancers, time } = useStore.getState();
    if (dancers.length < 2 || !clip) {
      syncHighlight.worstId = null;
      return;
    }
    const g = groupDeviationAt(clips, clip, dancers, time);
    if (!g) {
      syncHighlight.worstId = null;
      return;
    }
    const oi = outlierIndex(g);
    syncHighlight.worstId = oi === null ? null : dancers[oi].id;
  });
  return null;
}
