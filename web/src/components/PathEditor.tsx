// Đường đi trên sàn: vẽ tuyến của mọi vũ công; khi bật "sửa đường" cho vũ công
// đang chọn thì cho phép click sàn để thêm waypoint và kéo handle để dời.
// OrbitControls được App tắt trong lúc sửa (tránh xoay camera khi kéo).

import { useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useStore, type Dancer } from "../store";
import { makeCurve } from "../path";

// Tuyến đường (line) của một vũ công.
function PathLine({ dancer, dim }: { dancer: Dancer; dim: boolean }) {
  const points = useMemo(() => {
    const curve = makeCurve(dancer.waypoints);
    if (!curve) return null;
    return curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0.02, p.z));
  }, [dancer.waypoints]);

  const geom = useMemo(() => {
    if (!points) return null;
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  if (!geom) return null;
  return (
    <lineLoop geometry={geom}>
      <lineBasicMaterial color={dancer.color} transparent opacity={dim ? 0.35 : 0.9} />
    </lineLoop>
  );
}

// Các handle waypoint có thể kéo (chỉ cho vũ công đang chọn khi đang sửa).
function Handles({ dancer }: { dancer: Dancer }) {
  const { updateWaypoint, removeWaypoint } = useStore.getState();
  const dragging = useRef<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <>
      {/* Mặt phẳng bắt sự kiện: thêm điểm khi click nền, dời điểm khi kéo. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          // Click nền trống -> thêm waypoint tại điểm chạm.
          if (dragging.current === null) {
            e.stopPropagation();
            useStore.getState().addWaypoint(dancer.id, [e.point.x, e.point.z]);
          }
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (dragging.current !== null) {
            e.stopPropagation();
            updateWaypoint(dancer.id, dragging.current, [e.point.x, e.point.z]);
          }
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {dancer.waypoints.map((w, i) => (
        <mesh
          key={i}
          position={[w[0], 0.06, w[1]]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            dragging.current = i;
          }}
          onPointerUp={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            dragging.current = null;
          }}
          onContextMenu={(e: ThreeEvent<MouseEvent>) => {
            // Chuột phải -> xoá waypoint.
            e.stopPropagation();
            removeWaypoint(dancer.id, i);
          }}
          onPointerOver={() => setHover(i)}
          onPointerOut={() => setHover((h) => (h === i ? null : h))}
        >
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial
            color={hover === i ? "#ffffff" : dancer.color}
            emissive={dancer.color}
            emissiveIntensity={0.4}
          />
        </mesh>
      ))}
    </>
  );
}

export function PathEditor() {
  const dancers = useStore((s) => s.dancers);
  const selectedId = useStore((s) => s.selectedId);
  const editingPath = useStore((s) => s.editingPath);
  const sel = dancers.find((d) => d.id === selectedId) ?? null;

  return (
    <>
      {dancers.map((d) => (
        <PathLine key={d.id} dancer={d} dim={d.id !== selectedId} />
      ))}
      {editingPath && sel && <Handles dancer={sel} />}
    </>
  );
}
