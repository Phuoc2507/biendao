// Sân khấu 3D: sàn lưới, đèn, và lưới marker 8-count trên sàn.

import { Grid } from "@react-three/drei";
import { useStore } from "../store";

export function Stage() {
  const showBeatGrid = useStore((s) => s.showBeatGrid);
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 5]} intensity={1.1} castShadow />
      <directionalLight position={[-4, 4, -3]} intensity={0.4} />

      {/* Sàn sân khấu */}
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#3a4250"
        sectionSize={2}
        sectionThickness={1.1}
        sectionColor="#5a6b82"
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
