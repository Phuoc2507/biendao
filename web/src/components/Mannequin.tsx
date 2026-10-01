// Một vũ công ảo — "MA-NƠ-CANH NGHỆ THUẬT" (V61 hướng B).
//
// Trước đây thân người là cầu + TRỤ rời rạc, cụt ở cổ tay/cổ chân, không có khối
// thân → nhìn "chưa đẹp". Nay dựng kiểu ma-nơ-canh vẽ:
//   • XƯƠNG = capsule (trụ bo hai đầu) — nối liền mạch, không còn khe hở ở khớp;
//     bán kính theo BỘ PHẬN (đùi/thân dày, cẳng tay/cổ mảnh) → có cảm giác cơ thể.
//   • KHỚP = cầu to/nhỏ theo vai trò (chậu/ngực to, cổ tay nhỏ) → khớp bi mềm mại.
//   • KHỐI THÂN = một capsule dọc sống lưng (chậu→cổ) lấp đầy phần thân rỗng.
//   • BÀN CHÂN = khối hộp bo chỉ về trước (hết cụt ở cổ chân) → đứng vững thị giác.
//   • BÀN TAY = khối bầu dục nối dài theo cẳng tay (hết cụt ở cổ tay).
// Độ dài capsule bake 1 lần từ tư thế nghỉ (frame 0) rồi chỉ co giãn Y theo tỉ lệ
// mỗi khung (≈1) → bán kính KHÔNG méo, vẫn luôn bám khớp. Tất cả vẫn drive bằng
// useFrame đọc getState (không re-render). Chi PHẢI tô đậm, gương/đường đi/đội hình
// /vòng cảnh báo giữ NGUYÊN hành vi cũ. Bóng tiếp đất nay do <ContactShadows> ở
// Stage lo chung (bỏ đĩa đen bẹt từng người).

import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ClipData } from "../clip";
import { samplePose, samplePoseSequence } from "../clip";
import { useStore, type Dancer } from "../store";
import { makeCurve, sampledPath } from "../path";
import { formationPose, waveDelayAt } from "../formation";
import { syncHighlight } from "../syncHighlight";

// Bộ đệm tái dùng ở cấp module (mọi vũ công dùng chung, không cấp phát mỗi khung).
const dummy = new THREE.Object3D();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vMid = new THREE.Vector3();
const vDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const quat = new THREE.Quaternion();

// Bán kính cầu KHỚP theo tên (bộ phận). head/root_floor = 0 (head vẽ riêng, mốc
// sàn không vẽ). Mặc định 0.05 cho tên lạ.
function jointRadius(name: string): number {
  if (name === "head" || name === "root_floor") return 0;
  if (name === "pelvis") return 0.072;
  if (name === "spine") return 0.074;
  if (name === "neck") return 0.052;
  if (name.endsWith("hip")) return 0.062;
  if (name.endsWith("shoulder")) return 0.056;
  if (name.endsWith("knee")) return 0.052;
  if (name.endsWith("elbow")) return 0.046;
  if (name.endsWith("ankle")) return 0.046;
  if (name.endsWith("wrist")) return 0.044;
  return 0.05;
}

// Bán kính capsule XƯƠNG theo cặp khớp đầu-cuối → thuôn đúng giải phẫu.
function boneRadius(na: string, nb: string): number {
  const ends = (s: string) => na.endsWith(s) || nb.endsWith(s);
  const has = (s: string) => na === s || nb === s;
  if ((has("pelvis") && has("spine")) || (has("spine") && has("neck"))) return 0.078; // lõi thân
  if (has("pelvis") && ends("hip")) return 0.06; // bề ngang chậu
  if (has("neck") && ends("shoulder")) return 0.052; // nhánh vai
  if (has("neck") && has("head")) return 0.045; // cổ
  if (ends("hip") && ends("knee")) return 0.062; // đùi
  if (ends("knee") && ends("ankle")) return 0.052; // cẳng chân
  if (ends("shoulder") && ends("elbow")) return 0.05; // cánh tay trên
  if (ends("elbow") && ends("wrist")) return 0.042; // cẳng tay
  return 0.04;
}

export function Mannequin({
  clips,
  fallback,
  dancer,
  index,
  count,
  selected,
  showLabel,
}: {
  clips: Record<string, ClipData>;
  fallback: ClipData; // clip dự phòng khi chuỗi rỗng / thiếu clip
  dancer: Dancer;
  index: number; // thứ tự trong nhóm (khớp thứ tự formationPositions)
  count: number; // tổng số vũ công (để tính đội hình)
  selected: boolean;
  showLabel: boolean;
}) {
  // Clip "bố cục": lấy khớp/xương/đầu từ clip đầu chuỗi (mọi clip cùng layout 17
  // khớp nên dùng clip nào cũng được); dự phòng khi chuỗi rỗng.
  const clip = clips[dancer.sequence[0]] ?? fallback;
  const J = clip.jointNames.length;
  const E = clip.edges.length;
  const groupRef = useRef<THREE.Group>(null);
  const jointsRef = useRef<THREE.InstancedMesh>(null);
  const boneRefs = useRef<THREE.Mesh[]>([]);
  const torsoRef = useRef<THREE.Mesh>(null);
  const footRefs = useRef<THREE.Mesh[]>([]);
  const handRefs = useRef<THREE.Mesh[]>([]);
  const headRef = useRef<THREE.Group>(null);
  const warnRef = useRef<THREE.Mesh>(null); // vòng cảnh báo "lệch nhịp nhất"

  // Chỉ số khớp "head" để đặt đầu/mũi; -1 nếu clip không có (khi đó bỏ qua).
  const headIdx = useMemo(() => clip.jointNames.indexOf("head"), [clip]);

  // Bộ đệm tái dùng: tránh cấp phát mỗi khung.
  const pose = useMemo(() => new Float32Array(J * 3), [J]);

  // Đường cong (chỉ dựng lại khi waypoint đổi).
  const curve = useMemo(() => makeCurve(dancer.waypoints), [dancer.waypoints]);

  // Phân biệt TRÁI/PHẢI: khớp/xương bên phải (tên "r_") tô sắc ĐẬM hơn để người
  // học đọc được đang cử động bên nào — quan trọng khi tập soi gương/POV.
  const rightJoint = useMemo(
    () => clip.jointNames.map((n) => n.startsWith("r_")),
    [clip]
  );
  const rightBone = useMemo(
    () =>
      clip.edges.map(
        ([a, b]) =>
          clip.jointNames[a].startsWith("r_") ||
          clip.jointNames[b].startsWith("r_")
      ),
    [clip]
  );

  // ── Kích thước bake từ tư thế NGHỈ (frame 0): bán kính khớp/xương, ĐỘ DÀI xương
  //    nghỉ (để co giãn Y theo tỉ lệ), và giải phẫu thân/chân/tay. Chỉ tính lại khi
  //    clip đổi. ──────────────────────────────────────────────────────────────────
  const anat = useMemo(() => {
    const buf = new Float32Array(J * 3);
    samplePose(clip, 0, buf);
    const pos = (i: number) => new THREE.Vector3(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);

    const jointR = clip.jointNames.map(jointRadius);
    const boneR = clip.edges.map(([a, b]) => boneRadius(clip.jointNames[a], clip.jointNames[b]));
    const restLen = clip.edges.map(([a, b]) => pos(a).distanceTo(pos(b)));

    const idx = (n: string) => clip.jointNames.indexOf(n);
    const pelvis = idx("pelvis"), neck = idx("neck");
    const lSho = idx("l_shoulder"), rSho = idx("r_shoulder");
    const lHip = idx("l_hip"), rHip = idx("r_hip");

    // Khối thân: capsule dọc chậu→cổ. Bán kính từ bề ngang vai/chậu (đối xứng quanh
    // trục để không bị "xoắn" khi hướng mặt đổi); dài = khoảng chậu→cổ.
    let torso: { len: number; radius: number } | null = null;
    if (pelvis >= 0 && neck >= 0) {
      const len = pos(pelvis).distanceTo(pos(neck));
      const shoulderW = lSho >= 0 && rSho >= 0 ? pos(lSho).distanceTo(pos(rSho)) : 0.34;
      const hipW = lHip >= 0 && rHip >= 0 ? pos(lHip).distanceTo(pos(rHip)) : 0.28;
      const radius = Math.min(0.16, Math.max(0.09, Math.max(shoulderW, hipW) * 0.5 * 0.82));
      torso = { len, radius };
    }

    // Bàn chân/bàn tay: chỉ dựng khi có đủ khớp.
    const feet = [
      { ankle: idx("l_ankle"), right: false },
      { ankle: idx("r_ankle"), right: true },
    ].filter((f) => f.ankle >= 0);
    const hands = [
      { wrist: idx("l_wrist"), elbow: idx("l_elbow"), right: false },
      { wrist: idx("r_wrist"), elbow: idx("r_elbow"), right: true },
    ].filter((h) => h.wrist >= 0 && h.elbow >= 0);

    return { jointR, boneR, restLen, torso, feet, hands };
  }, [clip, J]);

  // Vật liệu dùng chung: màu gốc + bản ĐẬM cho chi phải. meshStandard có chút ánh
  // kim (metalness) để bắt phản xạ từ <Environment> → "có da", không nhựa trơn.
  const [baseMat, darkMat, headMat] = useMemo(() => {
    const base = new THREE.Color(dancer.color);
    const dark = base.clone().multiplyScalar(0.6);
    const mk = (c: THREE.Color) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.08 });
    return [mk(base), mk(dark), mk(base.clone())];
  }, [dancer.color]);

  // Tô màu instance KHỚP một lần (vật liệu trắng, instanceColor mang màu thật).
  useLayoutEffect(() => {
    const base = new THREE.Color(dancer.color);
    const dark = base.clone().multiplyScalar(0.6);
    const joints = jointsRef.current;
    if (joints) {
      for (let j = 0; j < J; j++) joints.setColorAt(j, rightJoint[j] ? dark : base);
      if (joints.instanceColor) joints.instanceColor.needsUpdate = true;
    }
  }, [dancer.color, rightJoint, J]);

  // Giải phóng vật liệu khi màu đổi / unmount (tránh rò GPU).
  useLayoutEffect(() => {
    return () => {
      baseMat.dispose();
      darkMat.dispose();
      headMat.dispose();
    };
  }, [baseMat, darkMat, headMat]);

  useFrame(() => {
    const { time, duration, formations, bpm, formationWave, formationWaveOrder } =
      useStore.getState();
    // Lấy mẫu theo CHUỖI clip (phát nối tiếp, lặp cả chuỗi). Nếu chuỗi rỗng/thiếu
    // clip thì dùng clip bố cục làm dự phòng.
    if (!samplePoseSequence(clips, dancer.sequence, time - dancer.timeOffset, pose))
      samplePose(clip, time - dancer.timeOffset, pose);

    // Vị trí/hướng của cả nhóm. ƯU TIÊN: đội hình > đường đi > vị trí tĩnh.
    const g = groupRef.current;
    if (g) {
      const beatSec = 60 / bpm;
      const delay = waveDelayAt(
        formations,
        formationWave,
        formationWaveOrder,
        index,
        count,
        time,
        beatSec
      );
      const fpose =
        formations.length > 0
          ? formationPose(formations, index, count, time - delay, beatSec)
          : null;
      if (fpose) {
        g.position.set(fpose.x, dancer.position[1], fpose.z);
        g.rotation.y = fpose.yaw;
      } else if (curve) {
        const s = sampledPath(curve, time - dancer.timeOffset, duration);
        g.position.set(s.x, dancer.position[1], s.z);
        g.rotation.y = dancer.faceAlongPath ? s.rotationY : dancer.rotationY;
      } else {
        g.position.set(dancer.position[0], dancer.position[1], dancer.position[2]);
        g.rotation.y = dancer.rotationY;
      }
      g.scale.x = dancer.mirror ? -1 : 1;
    }

    // Khớp (instanced spheres) — cầu đơn vị, co theo bán kính từng khớp (đồng đều
    // → vẫn là cầu, không méo). Khớp bán kính 0 (head/sàn) co về 0 = tàng hình.
    const inst = jointsRef.current;
    if (inst) {
      for (let j = 0; j < J; j++) {
        const o = j * 3;
        dummy.position.set(pose[o], pose[o + 1], pose[o + 2]);
        dummy.quaternion.identity();
        dummy.scale.setScalar(anat.jointR[j]);
        dummy.updateMatrix();
        inst.setMatrixAt(j, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    }

    // Xương (capsule rời): đặt ở trung điểm, xoay Y sang hướng a→b, co giãn Y theo
    // tỉ lệ dài-hiện/dài-nghỉ (≈1) để luôn bám khớp mà bán kính KHÔNG méo.
    for (let e = 0; e < E; e++) {
      const m = boneRefs.current[e];
      if (!m) continue;
      const [a, b] = clip.edges[e];
      vA.set(pose[a * 3], pose[a * 3 + 1], pose[a * 3 + 2]);
      vB.set(pose[b * 3], pose[b * 3 + 1], pose[b * 3 + 2]);
      vMid.addVectors(vA, vB).multiplyScalar(0.5);
      vDir.subVectors(vB, vA);
      const len = vDir.length();
      m.position.copy(vMid);
      if (len > 1e-5) {
        vDir.multiplyScalar(1 / len);
        quat.setFromUnitVectors(UP, vDir);
        m.quaternion.copy(quat);
      } else {
        m.quaternion.identity();
      }
      const rest = anat.restLen[e];
      m.scale.set(1, rest > 1e-4 ? len / rest : 1, 1);
    }

    // Khối thân: capsule dọc chậu→cổ, cùng cách co giãn Y.
    const torsoM = torsoRef.current;
    if (torsoM && anat.torso) {
      const pelvis = clip.jointNames.indexOf("pelvis");
      const neck = clip.jointNames.indexOf("neck");
      vA.set(pose[pelvis * 3], pose[pelvis * 3 + 1], pose[pelvis * 3 + 2]);
      vB.set(pose[neck * 3], pose[neck * 3 + 1], pose[neck * 3 + 2]);
      vMid.addVectors(vA, vB).multiplyScalar(0.5);
      vDir.subVectors(vB, vA);
      const len = vDir.length();
      torsoM.position.copy(vMid);
      if (len > 1e-5) {
        vDir.multiplyScalar(1 / len);
        quat.setFromUnitVectors(UP, vDir);
        torsoM.quaternion.copy(quat);
      }
      torsoM.scale.set(1, anat.torso.len > 1e-4 ? len / anat.torso.len : 1, 1);
    }

    // Bàn chân: khối hộp đặt tại cổ chân, chỉ về +Z cục bộ (hướng mặt), hạ sát sàn.
    for (let i = 0; i < anat.feet.length; i++) {
      const m = footRefs.current[i];
      if (!m) continue;
      const o = anat.feet[i].ankle * 3;
      m.position.set(pose[o], Math.max(0.025, pose[o + 1] - 0.03), pose[o + 2] + 0.06);
      m.quaternion.identity();
    }

    // Bàn tay: khối bầu dục nối dài theo cẳng tay (cổ tay→xa khỏi khuỷu).
    for (let i = 0; i < anat.hands.length; i++) {
      const m = handRefs.current[i];
      if (!m) continue;
      const w = anat.hands[i].wrist * 3;
      const el = anat.hands[i].elbow * 3;
      vA.set(pose[el], pose[el + 1], pose[el + 2]); // khuỷu
      vB.set(pose[w], pose[w + 1], pose[w + 2]); // cổ tay
      vDir.subVectors(vB, vA);
      const len = vDir.length();
      if (len > 1e-5) {
        vDir.multiplyScalar(1 / len);
        quat.setFromUnitVectors(UP, vDir);
        m.quaternion.copy(quat);
        // đặt hơi ra ngoài cổ tay theo hướng cẳng tay
        m.position.set(vB.x + vDir.x * 0.03, vB.y + vDir.y * 0.03, vB.z + vDir.z * 0.03);
      } else {
        m.quaternion.identity();
        m.position.set(vB.x, vB.y, vB.z);
      }
    }

    // Đầu + mũi bám khớp head (mũi là con, lệch +Z cục bộ -> tự quay theo group).
    const head = headRef.current;
    if (head && headIdx >= 0) {
      const o = headIdx * 3;
      head.position.set(pose[o], pose[o + 1], pose[o + 2]);
    }

    // Vòng cảnh báo "lệch nhịp nhất": bật khi bộ điều phối chỉ đích danh vũ công
    // này (đọc kênh chia sẻ imperative -> không re-render React).
    const warn = warnRef.current;
    if (warn) {
      const on = syncHighlight.worstId === dancer.id;
      warn.visible = on;
      if (on) warn.scale.setScalar(1 + 0.08 * Math.sin(time * 6));
    }
  });

  return (
    <group ref={groupRef}>
      {/* Khối bắt sự kiện trong suốt: bấm để chọn vũ công ngay trong cảnh 3D. */}
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

      {/* KHỚP: cầu đơn vị (bán kính 1) co theo từng khớp trong useFrame. Vật liệu
          trắng để instanceColor mang màu thật (trái/phải). */}
      <instancedMesh ref={jointsRef} args={[undefined, undefined, J]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.42} metalness={0.08} />
      </instancedMesh>

      {/* XƯƠNG: mỗi cạnh một capsule riêng, bán kính + độ dài nghỉ bake theo giải
          phẫu; vật liệu base/đậm theo bên. */}
      {clip.edges.map((_, e) => (
        <mesh
          key={e}
          ref={(el) => {
            if (el) boneRefs.current[e] = el;
          }}
          material={rightBone[e] ? darkMat : baseMat}
          castShadow
        >
          <capsuleGeometry args={[anat.boneR[e], Math.max(0.01, anat.restLen[e] - 2 * anat.boneR[e]), 4, 12]} />
        </mesh>
      ))}

      {/* KHỐI THÂN: capsule dọc sống lưng lấp phần thân rỗng. */}
      {anat.torso && (
        <mesh ref={torsoRef} material={baseMat} castShadow>
          <capsuleGeometry args={[anat.torso.radius, Math.max(0.01, anat.torso.len - 2 * anat.torso.radius), 6, 16]} />
        </mesh>
      )}

      {/* BÀN CHÂN: khối hộp bo nhẹ, chỉ về trước. */}
      {anat.feet.map((f, i) => (
        <mesh
          key={`foot-${i}`}
          ref={(el) => {
            if (el) footRefs.current[i] = el;
          }}
          material={f.right ? darkMat : baseMat}
          castShadow
        >
          <boxGeometry args={[0.085, 0.05, 0.19]} />
        </mesh>
      ))}

      {/* BÀN TAY: bầu dục nối dài theo cẳng tay (cầu đơn vị co không đều → ellipsoid). */}
      {anat.hands.map((h, i) => (
        <mesh
          key={`hand-${i}`}
          ref={(el) => {
            if (el) handRefs.current[i] = el;
          }}
          material={h.right ? darkMat : baseMat}
          scale={[0.045, 0.072, 0.045]}
          castShadow
        >
          <sphereGeometry args={[1, 12, 10]} />
        </mesh>
      ))}

      {/* Đầu (to hơn khớp thường) + mũi trắng chỉ hướng mặt (+Z cục bộ). */}
      {headIdx >= 0 && (
        <group ref={headRef}>
          <mesh material={headMat} castShadow>
            <sphereGeometry args={[0.088, 24, 18]} />
          </mesh>
          <mesh position={[0, 0.01, 0.085]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.032, 0.07, 12]} />
            {/* basic (không chịu sáng) để mũi luôn trắng rõ dù đứng trong bóng */}
            <meshBasicMaterial color="#f3f5f8" />
          </mesh>
        </group>
      )}

      {/* Nhãn tên nổi trên đầu — chỉ khi có nhiều vũ công. Html (DOM overlay) nên
          KHÔNG lọt vào video xuất; x=0 nên không bị lật khi bật gương. */}
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

      {/* Vòng chọn dưới chân (bóng tiếp đất nay do ContactShadows ở Stage lo chung). */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.36, 0.42, 40]} />
          <meshBasicMaterial color={dancer.color} transparent opacity={0.9} />
        </mesh>
      )}
      {/* Vòng cảnh báo "lệch nhịp nhất" — đỏ, nằm NGOÀI vòng chọn để không đè. */}
      <mesh
        ref={warnRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.014, 0]}
      >
        <ringGeometry args={[0.46, 0.56, 44]} />
        <meshBasicMaterial color="#f85149" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
