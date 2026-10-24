// Người 3D trên sân: nhân vật Quaternius (CC0) cử động theo tệp .motion.json
// (17 khớp, lấy từ video bằng choreo.pose3d). Giờ động tác trùng giờ video thẻ,
// nên đọc cùng công thức với thẻ: canonTime(t) - offsetSec.
//
// Nhóm ngoài (ở Card) đặt vị trí sân khấu; ở đây xoay theo hướng mặt đội hình và
// dời chậu theo động tác (rig đặt Hips ở (0, HIP_Y, 0)). Đối xứng gương = phản
// chiếu pose, không dùng scale âm.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { VDancer } from "../model";
import { canonTime } from "../timing";
import { facingAt } from "../facing";
import { st } from "../store";
import * as clock from "../clock";
import { JOINTS, type Motion, sampleMotion } from "../motion";
import { HIP_Y, buildRig, poseRig } from "../../rig/quaterniusRig";

const URLS = ["/models/woman.gltf", "/models/man.gltf"];

export function StageAvatar({ d, motion, index }: { d: VDancer; motion: Motion; index: number }) {
  const { scene } = useGLTF(URLS[index % 2]);
  const rig = useMemo(() => buildRig(scene, JOINTS), [scene]);
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const buf = useMemo(() => new Float32Array(JOINTS.length * 3), []);

  useFrame(() => {
    if (!rig || !outer.current || !inner.current) return;
    const p = st().project;
    const t = clock.now();
    outer.current.rotation.y = (-facingAt(p.formations, d.id, t) * Math.PI) / 180;
    sampleMotion(motion, canonTime(t, d.canon).t - d.offsetSec, buf);
    const sx = d.flip ? -1 : 1;
    inner.current.position.set(sx * buf[0], buf[1] - HIP_Y, buf[2]);
    poseRig(rig, buf, !!d.flip);
  });

  if (!rig) return null;
  return (
    <group ref={outer}>
      <group ref={inner}>
        <primitive object={rig.root} />
      </group>
    </group>
  );
}
