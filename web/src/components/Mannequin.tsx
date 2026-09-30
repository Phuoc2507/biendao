// Một vũ công ảo: vẽ thân người dạng khối — cầu ở khớp + trụ 3D ở xương (cả hai
// instanced để nhẹ), cập nhật tư thế mỗi khung bằng useFrame (đọc time qua
// getState -> không re-render). Trụ có độ dày giúp đọc tư thế rõ trong video tập,
// hơn hẳn đường mảnh. Thêm một "đầu" to hơn ở khớp head và một "mũi" nhỏ chỉ về
// +Z cục bộ để nhìn rõ vũ công đang quay mặt hướng nào (quan trọng cho bài tập
// soi gương / POV). Nếu vũ công có đường đi (>=2 waypoint) thì vị trí/hướng bám
// theo đường; ngược lại dùng vị trí/hướng tĩnh trong store.

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ClipData } from "../clip";
import { samplePose } from "../clip";
import { useStore, type Dancer } from "../store";
import { makeCurve, sampledPath } from "../path";

// Bộ đệm tái dùng ở cấp module (mọi vũ công dùng chung, không cấp phát mỗi khung).
const dummy = new THREE.Object3D();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vMid = new THREE.Vector3();
const vDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const quat = new THREE.Quaternion();

export function Mannequin({
  clip,
  dancer,
  selected,
  showLabel,
}: {
  clip: ClipData;
  dancer: Dancer;
  selected: boolean;
  showLabel: boolean;
}) {
  const J = clip.jointNames.length;
  const E = clip.edges.length;
  const groupRef = useRef<THREE.Group>(null);
  const jointsRef = useRef<THREE.InstancedMesh>(null);
  const bonesRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.Group>(null);

  // Chỉ số khớp "head" để đặt đầu/mũi; -1 nếu clip không có (khi đó bỏ qua).
  const headIdx = useMemo(() => clip.jointNames.indexOf("head"), [clip]);

  // Bộ đệm tái dùng: tránh cấp phát mỗi khung.
  const pose = useMemo(() => new Float32Array(J * 3), [J]);

  // Đường cong (chỉ dựng lại khi waypoint đổi).
  const curve = useMemo(() => makeCurve(dancer.waypoints), [dancer.waypoints]);

  useFrame(() => {
    const { time, duration } = useStore.getState();
    samplePose(clip, time - dancer.timeOffset, pose);

    // Vị trí/hướng của cả nhóm: bám đường đi nếu có, ngược lại tĩnh.
    const g = groupRef.current;
    if (g) {
      if (curve) {
        const s = sampledPath(curve, time - dancer.timeOffset, duration);
        g.position.set(s.x, dancer.position[1], s.z);
        g.rotation.y = dancer.faceAlongPath ? s.rotationY : dancer.rotationY;
      } else {
        g.position.set(dancer.position[0], dancer.position[1], dancer.position[2]);
        g.rotation.y = dancer.rotationY;
      }
      g.scale.x = dancer.mirror ? -1 : 1;
    }

    // Cập nhật vị trí các khớp (instanced spheres).
    const inst = jointsRef.current;
    if (inst) {
      for (let j = 0; j < J; j++) {
        const o = j * 3;
        dummy.position.set(pose[o], pose[o + 1], pose[o + 2]);
        dummy.updateMatrix();
        inst.setMatrixAt(j, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    }

    // Cập nhật các trụ xương: mỗi trụ đặt ở trung điểm, xoay trục Y sang hướng
    // khớp a->b, kéo dài theo độ dài xương.
    const bones = bonesRef.current;
    if (bones) {
      for (let e = 0; e < E; e++) {
        const [a, b] = clip.edges[e];
        vA.set(pose[a * 3], pose[a * 3 + 1], pose[a * 3 + 2]);
        vB.set(pose[b * 3], pose[b * 3 + 1], pose[b * 3 + 2]);
        vMid.addVectors(vA, vB).multiplyScalar(0.5);
        vDir.subVectors(vB, vA);
        const len = vDir.length();
        dummy.position.copy(vMid);
        if (len > 1e-5) {
          vDir.multiplyScalar(1 / len);
          quat.setFromUnitVectors(UP, vDir);
          dummy.quaternion.copy(quat);
        } else {
          dummy.quaternion.identity();
        }
        dummy.scale.set(1, len, 1);
        dummy.updateMatrix();
        bones.setMatrixAt(e, dummy.matrix);
      }
      bones.instanceMatrix.needsUpdate = true;
    }

    // Đầu + mũi bám khớp head (mũi là con, lệch +Z cục bộ -> tự quay theo group).
    const head = headRef.current;
    if (head && headIdx >= 0) {
      const o = headIdx * 3;
      head.position.set(pose[o], pose[o + 1], pose[o + 2]);
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={jointsRef} args={[undefined, undefined, J]}>
        <sphereGeometry args={[0.038, 12, 12]} />
        <meshStandardMaterial color={dancer.color} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={bonesRef} args={[undefined, undefined, E]}>
        <cylinderGeometry args={[0.024, 0.024, 1, 10]} />
        <meshStandardMaterial color={dancer.color} roughness={0.55} />
      </instancedMesh>

      {/* Đầu (to hơn khớp thường) + mũi trắng chỉ hướng mặt (+Z cục bộ). Group
          này được đặt vào vị trí khớp head mỗi khung; mũi là con nên tự xoay
          theo hướng mặt của cả vũ công. */}
      {headIdx >= 0 && (
        <group ref={headRef}>
          <mesh>
            <sphereGeometry args={[0.085, 20, 16]} />
            <meshStandardMaterial color={dancer.color} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.01, 0.085]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.032, 0.07, 12]} />
            {/* basic (không chịu sáng) để mũi luôn trắng rõ dù đứng trong bóng */}
            <meshBasicMaterial color="#f3f5f8" />
          </mesh>
        </group>
      )}

      {/* Nhãn tên nổi trên đầu — chỉ khi có nhiều vũ công (đội hình nhóm). Dùng
          Html (DOM overlay) nên KHÔNG lọt vào video xuất; vị trí x=0 nên không bị
          lật khi bật gương. */}
      {showLabel && (
        <Html
          position={[0, 2.05, 0]}
          center
          pointerEvents="none"
          style={{ pointerEvents: "none", userSelect: "none" }}
          zIndexRange={[10, 0]}
        >
          <div
            style={{
              whiteSpace: "nowrap",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              background: "rgba(18,22,28,0.82)",
              border: `1px solid ${dancer.color}`,
              borderRadius: 6,
              padding: "2px 7px",
              transform: selected ? "scale(1.08)" : "none",
            }}
          >
            {dancer.name}
          </div>
        </Html>
      )}

      {/* Bóng tiếp đất + vòng chọn dưới chân */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.34, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.36, 0.42, 40]} />
          <meshBasicMaterial color={dancer.color} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
