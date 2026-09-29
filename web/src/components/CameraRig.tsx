// Điều khiển camera theo chế độ:
//  - 'orbit'  : không can thiệp (OrbitControls lo).
//  - 'follow' : bám sau lưng vũ công đang chọn (góc nhìn tập/đội hình).
//  - 'front'  : nhìn thẳng mặt vũ công từ phía khán giả (bài tập soi gương).
// Vị trí/hướng vũ công lấy đúng như Mannequin (đường đi nếu có, ngược lại tĩnh).

import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";
import { makeCurve, sampledPath } from "../path";

const desired = new THREE.Vector3();
const look = new THREE.Vector3();

export function CameraRig() {
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const st = useStore.getState();
    if (st.cameraMode === "orbit") return;

    const d =
      st.dancers.find((x) => x.id === st.selectedId) ?? st.dancers[0];
    if (!d) return;

    // Vị trí + hướng mặt hiện tại của vũ công.
    let px = d.position[0];
    let pz = d.position[2];
    let yaw = d.rotationY;
    // Tâm sân khấu của vũ công (để đặt "gương" cố định): trọng tâm đường đi
    // nếu có, ngược lại chính vị trí đứng.
    let cx = d.position[0];
    let cz = d.position[2];
    const curve = makeCurve(d.waypoints);
    if (curve) {
      const s = sampledPath(curve, st.time - d.timeOffset, st.duration);
      px = s.x;
      pz = s.z;
      if (d.faceAlongPath) yaw = s.rotationY;
      cx = 0; cz = 0;
      for (const [wx, wz] of d.waypoints) { cx += wx; cz += wz; }
      cx /= d.waypoints.length;
      cz /= d.waypoints.length;
    }

    const chest = 1.05;
    if (st.cameraMode === "follow") {
      // Sau lưng, hơi cao, nhìn theo hướng vũ công (bám di chuyển).
      const back = 2.6;
      const height = 1.8;
      desired.set(px - Math.sin(yaw) * back, height, pz - Math.cos(yaw) * back);
      look.set(px + Math.sin(yaw) * 1.5, chest, pz + Math.cos(yaw) * 1.5);
    } else {
      // 'front': GƯƠNG CỐ ĐỊNH phía khán giả (+Z), đứng yên theo tâm sân khấu,
      // chỉ xoay để giữ vũ công trong khung — không dí sát khi vũ công đi lại gần.
      desired.set(cx, 1.4, cz + 4.2);
      look.set(px, chest, pz);
    }

    // Lerp đủ nhanh để giữ khoảng cách kể cả khi vũ công đi về phía camera
    // (chế độ 'front'); vẫn mượt hơn set cứng khi tiếp tuyến đổi hướng.
    camera.position.lerp(desired, 0.3);
    camera.lookAt(look);
  });

  return null;
}
