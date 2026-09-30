// Kênh chia sẻ IMPERATIVE cho tầng đánh giá đồng bộ NHẬN BIẾT PHA (V35).
//
// Vì sao không dùng zustand: căn pha (phaseAlignAt) là O(n²) nên chỉ tính TIẾT LƯU
// ~8Hz trong một useFrame của Canvas (SyncHighlighter), rồi ghi thẳng vào đây. Vòng
// cảnh báo đỏ trên mỗi Mannequin đọc `worstId` mỗi khung (không re-render React), còn
// bảng SyncBreakdown đọc `phase`/`dancerIds` khi nó re-render theo `time`. Một nguồn
// sự thật, tính một lần.
//
// Ý nghĩa MỚI so với V34: `worstId` giờ là người múa SAI ĐỘNG TÁC (formOutlierIndex)
// — đã bỏ phần trễ nhịp — nên CANON/echo cố ý KHÔNG còn làm sáng vòng đỏ oan.

import type { PhaseAlign } from "./sync";

export const syncHighlight: {
  worstId: string | null; // id người múa sai động tác nổi bật (cho vòng đỏ 3D); null = không nêu ai
  phase: PhaseAlign | null; // kết quả căn pha mới nhất (cho bảng SyncBreakdown)
  dancerIds: string[]; // thứ tự id khớp với các mảng trong `phase` tại lúc tính
} = { worstId: null, phase: null, dancerIds: [] };
