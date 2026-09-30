// Đồng hồ phát: chạy trong Canvas, đẩy store.time theo thời gian thực khi playing.
// Đặt trong Canvas để dùng useFrame (đồng bộ với vòng render).

import { useFrame } from "@react-three/fiber";
import { useStore } from "../store";

export function PlaybackClock() {
  useFrame((_, dt) => {
    const s = useStore.getState();
    if (!s.playing || s.duration <= 0) return;
    // Nhân tốc độ: <1 = phát chậm để tập từng động tác. Xuất video vẫn ghi theo
    // thời gian thật (record.ts tự bơm khung), nên slow-mo chỉ ảnh hưởng xem trước.
    let t = s.time + dt * s.speed;
    if (t >= s.duration) t -= s.duration; // lặp vòng
    s.setTime(t);
  });
  return null;
}
