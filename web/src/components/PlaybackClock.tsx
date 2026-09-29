// Đồng hồ phát: chạy trong Canvas, đẩy store.time theo thời gian thực khi playing.
// Đặt trong Canvas để dùng useFrame (đồng bộ với vòng render).

import { useFrame } from "@react-three/fiber";
import { useStore } from "../store";

export function PlaybackClock() {
  useFrame((_, dt) => {
    const s = useStore.getState();
    if (!s.playing || s.duration <= 0) return;
    let t = s.time + dt;
    if (t >= s.duration) t -= s.duration; // lặp vòng
    s.setTime(t);
  });
  return null;
}
