// Đăng ký <canvas> và hàm advance() của R3F cho module ghi video (record.ts).
// Phải nằm bên trong <Canvas> để dùng useThree. advance() cho phép bơm khung tất
// định khi ghi, không phụ thuộc requestAnimationFrame (bị đóng băng khi tab ẩn).

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { setCanvas, setAdvance } from "../record";

export function CanvasCapture() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    setCanvas(gl.domElement);
    setAdvance((t: number) => advance(t));
    return () => {
      setCanvas(null);
      setAdvance(null);
    };
  }, [gl, advance]);
  return null;
}
