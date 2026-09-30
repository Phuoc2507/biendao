// Kênh chia sẻ IMPERATIVE cho việc tô sáng "vũ công lệch nhịp nhất".
//
// `SyncHighlighter` (trong Canvas) ghi `worstId` mỗi khung; `Mannequin` đọc mỗi
// khung để bật/tắt vòng cảnh báo dưới chân. CỐ Ý không dùng zustand: đây là giá
// trị đổi ~60fps, để trong store sẽ khiến React re-render mỗi khung — thay vào đó
// dùng một ô nhớ chia sẻ ở cấp module, đọc/ghi thẳng trong useFrame (không state).
export const syncHighlight: { worstId: string | null } = { worstId: null };
