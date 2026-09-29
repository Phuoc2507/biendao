// Một vũ công ảo: vẽ khung xương (spheres ở khớp + lineSegments ở xương) và
// cập nhật tư thế mỗi khung bằng useFrame (đọc time qua getState -> không re-render).

import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ClipData } from "../clip";
import { samplePose } from "../clip";
import { useStore, type Dancer } from "../store";

const dummy = new THREE.Object3D();

export function Mannequin({ clip, dancer }: { clip: ClipData; dancer: Dancer }) {
  const J = clip.jointNames.length;
  const groupRef = useRef<THREE.Group>(null);
  const jointsRef = useRef<THREE.InstancedMesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);

  // Bộ đệm tái dùng: tránh cấp phát mỗi khung.
  const pose = useMemo(() => new Float32Array(J * 3), [J]);
  const linePositions = useMemo(
    () => new Float32Array(clip.edges.length * 2 * 3),
    [clip.edges.length]
  );

  useLayoutEffect(() => {
    if (geomRef.current) {
      geomRef.current.setAttribute(
        "position",
        new THREE.BufferAttribute(linePositions, 3)
      );
    }
  }, [linePositions]);

  useFrame(() => {
    const { time } = useStore.getState();
    samplePose(clip, time - dancer.timeOffset, pose);

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

    // Cập nhật các đoạn xương.
    const geom = geomRef.current;
    if (geom) {
      const arr = linePositions;
      for (let e = 0; e < clip.edges.length; e++) {
        const [a, b] = clip.edges[e];
        const oa = a * 3;
        const ob = b * 3;
        const k = e * 6;
        arr[k] = pose[oa]; arr[k + 1] = pose[oa + 1]; arr[k + 2] = pose[oa + 2];
        arr[k + 3] = pose[ob]; arr[k + 4] = pose[ob + 1]; arr[k + 5] = pose[ob + 2];
      }
      (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      geom.computeBoundingSphere();
    }
  });

  return (
    <group
      ref={groupRef}
      position={dancer.position}
      rotation={[0, dancer.rotationY, 0]}
      scale={[dancer.mirror ? -1 : 1, 1, 1]}
    >
      <instancedMesh ref={jointsRef} args={[undefined, undefined, J]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial color={dancer.color} roughness={0.5} />
      </instancedMesh>
      <lineSegments>
        <bufferGeometry ref={geomRef} />
        <lineBasicMaterial color={dancer.color} linewidth={2} />
      </lineSegments>
    </group>
  );
}
