// Vũ công "NGƯỜI" — mesh người GLTF (Quaternius "Ultimate Modular", CC0), được
// RETARGET từ 17 khớp vị trí của ta sang GÓC XOAY xương mỗi khung.
//
// Vì sao cần: mocap của ta cho VỊ TRÍ 17 khớp/khung; rig GLTF cử động bằng GÓC
// XOAY xương (và có cột sống/ngón/ngón chân ta không có dữ liệu). Nên đây là bài
// retarget vị-trí→góc-xoay: mỗi xương "nhắm" (aim) tới khớp con tương ứng, Hips
// lấy hướng từ khung thân (up = chậu→cổ, trái = hông T→P). Twist của chi không
// xác định được từ vị trí nên để tối thiểu (fromUnitVectors) — chấp nhận cho
// demonstrator; độ trung thực động tác vẫn bị CHẶN bởi 17 khớp (đã nêu rõ).
//
// Mẹo đúng để skinning không trôi: KHÔNG nhét biến đổi NHÓM (G: vị trí/hướng sân
// khấu) vào toán xương. Góc xoay LOCAL của xương BẤT BIẾN với G, nên ta tính local
// trong "hệ vũ công" (bỏ qua G) rồi để group ngoài áp G khi render. Gương làm bằng
// PHẢN CHIẾU pose (đổi dấu x mọi khớp) — KHÔNG dùng scale.x âm (sẽ phá quaternion
// của chuỗi xương).
//
// Bộ xương Quaternius KHÁC chuẩn Mixamo: Hips/Abdomen/Torso/Chest/Neck/Head,
// Shoulder.L/UpperArm.L/LowerArm.L/Wrist.L, UpperLeg.L/LowerLeg.L/Foot.L/PT.L.
// Điểm BẪY: Foot.* và PT.* (ngón/đế) là con của Root — KHÔNG nằm trong chuỗi
// UpperLeg→LowerLeg. Nếu để nguyên, bàn chân sẽ không theo cẳng chân khi co gối.
// Nên lúc nạp ta GẮN LẠI (attach, giữ world) Foot vào LowerLeg và PT vào Foot để
// bàn chân theo đúng chuỗi động học; attach bảo toàn world nên bind (rest) không đổi.
//
// Màu sắc: GIỮ NGUYÊN vật liệu gốc của nhân vật (đúng diện mạo bạn chọn). Phân
// biệt vũ công bằng nhãn + vòng chọn (không nhuộm lại mesh). Hai nhân vật (nữ =
// woman.gltf, nam = man.gltf) gán xen kẽ theo chỉ số vũ công.
//
// KHÔNG tải asset lúc chạy: file .gltf TỰ CHỨA (buffer nhúng base64) nằm sẵn trong
// public/models (CC0 Quaternius). Muốn đổi nhân vật chỉ cần thay đường dẫn.

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ClipData } from "../clip";
import { samplePose, samplePoseSequence } from "../clip";
import { useStore, type Dancer } from "../store";
import { makeCurve, sampledPath } from "../path";
import { formationPose, waveDelayAt } from "../formation";
import { syncHighlight } from "../syncHighlight";
import { buildRig, poseRig } from "../rig/quaterniusRig";

const WOMAN_URL = "/models/woman.gltf";
const MAN_URL = "/models/man.gltf";
useGLTF.preload(WOMAN_URL);
useGLTF.preload(MAN_URL);

export function GltfDancer({
  clips,
  fallback,
  dancer,
  index,
  count,
  selected,
  showLabel,
}: {
  clips: Record<string, ClipData>;
  fallback: ClipData;
  dancer: Dancer;
  index: number;
  count: number;
  selected: boolean;
  showLabel: boolean;
}) {
  const clip = clips[dancer.sequence[0]] ?? fallback;
  const J = clip.jointNames.length;
  const rootRef = useRef<THREE.Group>(null);
  const warnRef = useRef<THREE.Mesh>(null);
  const pose = useMemo(() => new Float32Array(J * 3), [J]);
  const curve = useMemo(() => makeCurve(dancer.waypoints), [dancer.waypoints]);

  // Nữ/nam xen kẽ theo chỉ số vũ công — hai diện mạo khác nhau cho dễ nhìn.
  const modelUrl = index % 2 === 0 ? WOMAN_URL : MAN_URL;
  const { scene } = useGLTF(modelUrl);

  // Rig dựng sẵn (xem rig/quaterniusRig.ts).
  const built = useMemo(() => buildRig(scene, clip.jointNames), [scene, clip]);

  useFrame(() => {
    if (!built) return;
    const { time, duration, formations, bpm, formationWave, formationWaveOrder } =
      useStore.getState();
    if (!samplePoseSequence(clips, dancer.sequence, time - dancer.timeOffset, pose))
      samplePose(clip, time - dancer.timeOffset, pose);

    // Biến đổi NHÓM G (đội hình > đường đi > tĩnh) — y như SkinnedMannequin.
    let gx = dancer.position[0], gy = dancer.position[1], gz = dancer.position[2];
    let gyaw = dancer.rotationY;
    const beatSec = 60 / bpm;
    const delay = waveDelayAt(formations, formationWave, formationWaveOrder, index, count, time, beatSec);
    const fpose = formations.length > 0 ? formationPose(formations, index, count, time - delay, beatSec) : null;
    if (fpose) {
      gx = fpose.x; gy = dancer.position[1]; gz = fpose.z; gyaw = fpose.yaw;
    } else if (curve) {
      const sp = sampledPath(curve, time - dancer.timeOffset, duration);
      gx = sp.x; gy = dancer.position[1]; gz = sp.z; gyaw = dancer.faceAlongPath ? sp.rotationY : dancer.rotationY;
    }
    const g = rootRef.current;
    if (g) {
      g.position.set(gx, gy, gz);
      g.rotation.y = gyaw;
    }

    poseRig(built, pose, dancer.mirror);

    const warn = warnRef.current;
    if (warn) {
      const on = syncHighlight.worstId === dancer.id;
      warn.visible = on;
      if (on) warn.scale.setScalar(1 + 0.08 * Math.sin(time * 6));
    }
  });

  if (!built) return null;

  return (
    <group ref={rootRef}>
      <primitive object={built.root} />

      {/* Khối bấm-chọn (ẩn). */}
      <mesh
        position={[0, 1, 0]}
        onClick={(e) => {
          e.stopPropagation();
          const st = useStore.getState();
          if (!st.editingPath) st.select(dancer.id);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <boxGeometry args={[0.8, 2, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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
              whiteSpace: "nowrap", fontSize: 11, fontWeight: 600, color: "#fff",
              background: "rgba(18,22,28,0.82)", border: `1px solid ${dancer.color}`,
              borderRadius: 6, padding: "2px 7px", transform: selected ? "scale(1.08)" : "none",
            }}
          >
            {dancer.name}
          </div>
        </Html>
      )}

      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.36, 0.42, 40]} />
          <meshBasicMaterial color={dancer.color} transparent opacity={0.9} />
        </mesh>
      )}
      <mesh ref={warnRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <ringGeometry args={[0.46, 0.56, 44]} />
        <meshBasicMaterial color="#f85149" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
