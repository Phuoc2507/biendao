// Sân khấu 3D: sàn lưới, ÁNH SÁNG STUDIO, bóng tiếp đất mềm, và vạch mốc mặt tiền.
//
// Nâng cấp thẩm mỹ (V61 hướng A): thay 3 đèn phẳng bằng bộ chiếu sáng studio —
//   • hemisphere (trời/đất) cho ambient có màu, dịu hơn ambientLight trắng bẹt;
//   • key directional có đổ bóng (shadow map) = nguồn chính tạo khối;
//   • fill + rim để tách vũ công khỏi nền, hết cảm giác "dẹp".
//   • <Environment> dựng từ <Lightformer> (KHÔNG tải HDRI ngoài → chạy offline)
//     cấp phản xạ specular để chất liệu "có da", không còn nhựa trơn.
//   • <ContactShadows> = bóng mềm chung dưới chân mọi vũ công (thay đĩa đen bẹt
//     từng người ở Mannequin). Tất cả dùng drei sẵn có, không thêm dependency/asset.

import { Grid, Environment, Lightformer, ContactShadows } from "@react-three/drei";
import { useStore } from "../store";

export function Stage() {
  const showBeatGrid = useStore((s) => s.showBeatGrid);
  return (
    <>
      {/* Sương mờ xa: khối gần rõ, lưới xa tan dần → chiều sâu, nền bớt phẳng. */}
      <fog attach="fog" args={["#0e1218", 16, 42]} />

      {/* Ambient có màu: ánh trời xanh nhạt trên, dội đất xám ấm dưới. */}
      <hemisphereLight args={["#cfe0ff", "#2a2f3a", 0.55]} />
      {/* Đèn CHÍNH tạo khối + đổ bóng mềm (PCFSoft qua Canvas shadows). */}
      <directionalLight
        position={[5, 9, 6]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      />
      {/* Fill lạnh làm dịu vùng tối, không phá khối của đèn chính. */}
      <directionalLight position={[-5, 4, -4]} intensity={0.5} color="#8ea2c8" />
      {/* Rim sau-trên: viền sáng mép vai/đầu → tách khỏi nền. */}
      <directionalLight position={[0, 6, -7]} intensity={0.8} color="#ffffff" />

      {/* Môi trường phản xạ dựng bằng tấm sáng (bake 1 lần) — không tải file. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.3} position={[0, 5, -5]} scale={[12, 6, 1]} color="#ffffff" />
        <Lightformer intensity={0.7} position={[-6, 2, 2]} scale={[6, 6, 1]} color="#aecbff" rotation-y={Math.PI / 2} />
        <Lightformer intensity={0.7} position={[6, 2, 2]} scale={[6, 6, 1]} color="#ffd9c2" rotation-y={-Math.PI / 2} />
        <Lightformer intensity={0.5} position={[0, 7, 4]} scale={[10, 4, 1]} color="#ffffff" rotation-x={Math.PI / 2} />
      </Environment>

      {/* Bóng tiếp đất mềm CHUNG cho mọi vũ công (thay đĩa đen bẹt từng người). */}
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.55}
        scale={22}
        blur={2.4}
        far={6}
        resolution={1024}
        color="#05070a"
      />

      {/* Sàn sân khấu — tông dịu hơn để không chọi với vũ công. */}
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#2f3744"
        sectionSize={2}
        sectionThickness={1.1}
        sectionColor="#4a5a72"
        fadeDistance={30}
        fadeStrength={1}
        infiniteGrid
        position={[0, 0, 0]}
      />

      {showBeatGrid && <FrontMarker />}
    </>
  );
}

// Vạch mốc "mặt tiền sân khấu" (hướng khán giả) để định hướng dàn hình.
function FrontMarker() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 3.2]}>
      <planeGeometry args={[6, 0.06]} />
      <meshBasicMaterial color="#ffb020" />
    </mesh>
  );
}
