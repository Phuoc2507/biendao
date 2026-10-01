// Vũ công ảo "DA-THỊT" — THREE.SkinnedMesh thủ tục (V62 hướng C).
//
// Khác ma-nơ-canh khối (Mannequin.tsx) ở chỗ thân người là MỘT bề mặt liền biến
// dạng theo khớp: không còn đường nối giữa các đoạn chi, khớp uốn mượt như da.
// KHÔNG tải asset ngoài (GLTF/VRM) — dựng toàn bộ bằng code để chạy offline, không
// nhét nhị phân vào repo, không vướng license. Quy trình:
//   • Bake bộ vỏ (capsule mỗi xương + khối thân) ở TƯ THẾ NGHỈ thành 1 BufferGeometry.
//   • Mỗi đỉnh gán trọng số cho 2 xương GẦN NHẤT (point–segment distance) → ở khớp,
//     nơi hai đoạn gặp nhau, trọng số hoà → bề mặt uốn mượt (auto-skinning).
//   • Màu TRÁI/PHẢI + màu vũ công nướng thẳng vào vertex color (1 vật liệu skinned).
//   • Mỗi khung: tính biến đổi NHÓM G (vị trí/hướng/gương) rồi NƯỚNG vào từng xương
//     (mesh đứng yên ở gốc) → tránh lỗi tương tác bindMatrix × group transform của
//     skinning (nếu để mesh dưới group đang chuyển động, công thức skin sẽ trôi).
// Đầu/mũi/nhãn/vòng chọn/cảnh báo/khối-bấm giữ trong GROUP chuyển động như cũ, dùng
// CHUNG một bộ (vị trí, hướng, gương) nên khớp với thân skinned.

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ClipData } from "../clip";
import { samplePose, samplePoseSequence } from "../clip";
import { useStore, type Dancer } from "../store";
import { makeCurve, sampledPath } from "../path";
import { formationPose, waveDelayAt } from "../formation";
import { syncHighlight } from "../syncHighlight";

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vMid = new THREE.Vector3();
const vDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const quat = new THREE.Quaternion();
const mSeg = new THREE.Matrix4();
const mG = new THREE.Matrix4();
const mBone = new THREE.Matrix4();
const sScale = new THREE.Vector3();
const gQuat = new THREE.Quaternion();
const gPos = new THREE.Vector3();

// Bán kính capsule xương theo cặp khớp (giống Mannequin.tsx để dáng nhất quán).
function boneRadius(na: string, nb: string): number {
  const ends = (s: string) => na.endsWith(s) || nb.endsWith(s);
  const has = (s: string) => na === s || nb === s;
  if ((has("pelvis") && has("spine")) || (has("spine") && has("neck"))) return 0.085;
  if (has("pelvis") && ends("hip")) return 0.07;
  if (has("neck") && ends("shoulder")) return 0.058;
  if (has("neck") && has("head")) return 0.05;
  if (ends("hip") && ends("knee")) return 0.07;
  if (ends("knee") && ends("ankle")) return 0.056;
  if (ends("shoulder") && ends("elbow")) return 0.056;
  if (ends("elbow") && ends("wrist")) return 0.046;
  return 0.045;
}

// Khoảng cách điểm→đoạn thẳng (để auto-skin theo 2 xương gần nhất).
function pointSegDist(px: number, py: number, pz: number, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}

type Seg = { a: THREE.Vector3; b: THREE.Vector3; r: number; restLen: number; right: boolean };

export function SkinnedMannequin({
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
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const warnRef = useRef<THREE.Mesh>(null);

  const headIdx = useMemo(() => clip.jointNames.indexOf("head"), [clip]);
  const pose = useMemo(() => new Float32Array(J * 3), [J]);
  const curve = useMemo(() => makeCurve(dancer.waypoints), [dancer.waypoints]);

  // ── Dựng SkinnedMesh + xương + bộ đệm cập nhật, nướng từ tư thế nghỉ. Chỉ dựng
  //    lại khi clip/màu đổi. ────────────────────────────────────────────────────
  const built = useMemo(() => {
    const names = clip.jointNames;
    const buf = new Float32Array(J * 3);
    samplePose(clip, 0, buf);
    const P = (i: number) => new THREE.Vector3(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);

    // Danh sách đoạn xương = các cạnh + khối thân (chậu→cổ).
    const segs: Seg[] = clip.edges.map(([a, b]) => ({
      a: P(a), b: P(b), r: boneRadius(names[a], names[b]),
      restLen: P(a).distanceTo(P(b)),
      right: names[a].startsWith("r_") || names[b].startsWith("r_"),
    }));
    const pelvis = names.indexOf("pelvis"), neck = names.indexOf("neck");
    const lSho = names.indexOf("l_shoulder"), rSho = names.indexOf("r_shoulder");
    const lHip = names.indexOf("l_hip"), rHip = names.indexOf("r_hip");
    let torsoIdx = -1;
    if (pelvis >= 0 && neck >= 0) {
      const shoulderW = lSho >= 0 && rSho >= 0 ? P(lSho).distanceTo(P(rSho)) : 0.34;
      const hipW = lHip >= 0 && rHip >= 0 ? P(lHip).distanceTo(P(rHip)) : 0.28;
      const r = Math.min(0.17, Math.max(0.1, Math.max(shoulderW, hipW) * 0.5 * 0.9));
      torsoIdx = segs.length;
      segs.push({ a: P(pelvis), b: P(neck), r, restLen: P(pelvis).distanceTo(P(neck)), right: false });
    }

    const base = new THREE.Color(dancer.color);
    const dark = base.clone().multiplyScalar(0.62);

    // Gom vỏ: bake mỗi capsule theo biến đổi nghỉ (mid, UP→dir) vào mảng chung.
    const posArr: number[] = [], norArr: number[] = [], colArr: number[] = [], idxArr: number[] = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const restMats: THREE.Matrix4[] = [];
    for (const s of segs) {
      const dir = new THREE.Vector3().subVectors(s.b, s.a);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(s.a, s.b).multiplyScalar(0.5);
      const q = new THREE.Quaternion();
      if (len > 1e-5) q.setFromUnitVectors(UP, dir.clone().multiplyScalar(1 / len));
      const mat = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
      restMats.push(mat);
      const nm = new THREE.Matrix3().getNormalMatrix(mat);
      const col = s.right ? dark : base;
      const g = new THREE.CapsuleGeometry(s.r, Math.max(0.01, len - 2 * s.r), 6, 14);
      const gp = g.attributes.position, gn = g.attributes.normal, gi = g.index!;
      const vbase = posArr.length / 3;
      for (let i = 0; i < gp.count; i++) {
        v.set(gp.getX(i), gp.getY(i), gp.getZ(i)).applyMatrix4(mat);
        posArr.push(v.x, v.y, v.z);
        n.set(gn.getX(i), gn.getY(i), gn.getZ(i)).applyMatrix3(nm).normalize();
        norArr.push(n.x, n.y, n.z);
        colArr.push(col.r, col.g, col.b);
      }
      for (let i = 0; i < gi.count; i++) idxArr.push(vbase + gi.getX(i));
      g.dispose();
    }

    // Trọng số: mỗi đỉnh → 2 xương gần nhất theo khoảng cách điểm–đoạn, nghịch đảo
    // khoảng cách (xương gần hơn nặng hơn). Ở khớp hai đoạn gặp → hoà mượt.
    const nv = posArr.length / 3;
    const skinIdx = new Uint16Array(nv * 4);
    const skinWgt = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) {
      const px = posArr[i * 3], py = posArr[i * 3 + 1], pz = posArr[i * 3 + 2];
      let i0 = 0, d0 = Infinity, i1 = 0, d1 = Infinity;
      for (let s = 0; s < segs.length; s++) {
        const d = pointSegDist(px, py, pz, segs[s].a, segs[s].b);
        if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = s; }
        else if (d < d1) { d1 = d; i1 = s; }
      }
      const eps = 1e-4;
      const w0 = (d1 + eps) / (d0 + d1 + 2 * eps);
      skinIdx[i * 4] = i0; skinIdx[i * 4 + 1] = i1;
      skinWgt[i * 4] = w0; skinWgt[i * 4 + 1] = 1 - w0;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(norArr, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colArr, 3));
    geom.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
    geom.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
    geom.setIndex(idxArr);

    // Xương: đặt ở biến đổi nghỉ; Skeleton tính boneInverse từ đó (khớp vỏ đã bake).
    const bones: THREE.Bone[] = [];
    for (let s = 0; s < segs.length; s++) {
      const bone = new THREE.Bone();
      restMats[s].decompose(bone.position, bone.quaternion, bone.scale);
      bones.push(bone);
    }
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.4, metalness: 0.08, side: THREE.DoubleSide,
    });
    const mesh = new THREE.SkinnedMesh(geom, mat);
    mesh.castShadow = true;
    for (const b of bones) mesh.add(b);
    mesh.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    mesh.bind(skeleton);

    const restLens = segs.map((s) => s.restLen);
    const segJoints = [
      ...clip.edges.map(([a, b]) => [a, b] as [number, number]),
      ...(torsoIdx >= 0 ? [[pelvis, neck] as [number, number]] : []),
    ];
    return { mesh, bones, restLens, segJoints };
  }, [clip, J, dancer.color]);

  // Giải phóng GPU khi dựng lại / unmount.
  useEffect(() => {
    const m = built.mesh;
    return () => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.skeleton.dispose();
    };
  }, [built]);

  useFrame(() => {
    const { time, duration, formations, bpm, formationWave, formationWaveOrder } =
      useStore.getState();
    if (!samplePoseSequence(clips, dancer.sequence, time - dancer.timeOffset, pose))
      samplePose(clip, time - dancer.timeOffset, pose);

    // Biến đổi NHÓM (vị trí/hướng/gương) — CÙNG logic ưu tiên đội hình>đường>tĩnh.
    let gx = dancer.position[0], gy = dancer.position[1], gz = dancer.position[2];
    let gyaw = dancer.rotationY;
    const beatSec = 60 / bpm;
    const delay = waveDelayAt(formations, formationWave, formationWaveOrder, index, count, time, beatSec);
    const fpose = formations.length > 0 ? formationPose(formations, index, count, time - delay, beatSec) : null;
    if (fpose) {
      gx = fpose.x; gy = dancer.position[1]; gz = fpose.z; gyaw = fpose.yaw;
    } else if (curve) {
      const s = sampledPath(curve, time - dancer.timeOffset, duration);
      gx = s.x; gy = dancer.position[1]; gz = s.z; gyaw = dancer.faceAlongPath ? s.rotationY : dancer.rotationY;
    }
    const mir = dancer.mirror ? -1 : 1;

    // Nhóm chuyển động (đầu/nhãn/vòng) — đặt như Mannequin cũ.
    const g = groupRef.current;
    if (g) {
      g.position.set(gx, gy, gz);
      g.rotation.y = gyaw;
      g.scale.x = mir;
    }

    // Ma trận G để NƯỚNG vào xương (mesh skinned đứng ở gốc).
    gPos.set(gx, gy, gz);
    gQuat.setFromAxisAngle(UP, gyaw);
    mG.compose(gPos, gQuat, sScale.set(mir, 1, 1));

    // Mỗi xương: đoạn hiện tại trong không gian pose → nhân G → nạp vào bone.
    for (let s = 0; s < built.bones.length; s++) {
      const [ja, jb] = built.segJoints[s];
      vA.set(pose[ja * 3], pose[ja * 3 + 1], pose[ja * 3 + 2]);
      vB.set(pose[jb * 3], pose[jb * 3 + 1], pose[jb * 3 + 2]);
      vMid.addVectors(vA, vB).multiplyScalar(0.5);
      vDir.subVectors(vB, vA);
      const len = vDir.length();
      if (len > 1e-5) {
        vDir.multiplyScalar(1 / len);
        quat.setFromUnitVectors(UP, vDir);
      } else {
        quat.identity();
      }
      const rest = built.restLens[s];
      mSeg.compose(vMid, quat, sScale.set(1, rest > 1e-4 ? len / rest : 1, 1));
      mBone.multiplyMatrices(mG, mSeg);
      const bone = built.bones[s];
      mBone.decompose(bone.position, bone.quaternion, bone.scale);
    }

    const head = headRef.current;
    if (head && headIdx >= 0) {
      const o = headIdx * 3;
      head.position.set(pose[o], pose[o + 1], pose[o + 2]);
    }

    const warn = warnRef.current;
    if (warn) {
      const on = syncHighlight.worstId === dancer.id;
      warn.visible = on;
      if (on) warn.scale.setScalar(1 + 0.08 * Math.sin(time * 6));
    }
  });

  return (
    <>
      {/* Thân DA-THỊT: SkinnedMesh ở GỐC toạ độ, xương đã nướng biến đổi nhóm. */}
      <primitive object={built.mesh} />

      {/* Nhóm chuyển động: khối bấm-chọn, đầu/mũi, nhãn, vòng chọn/cảnh báo. */}
      <group ref={groupRef}>
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

        {headIdx >= 0 && (
          <group ref={headRef}>
            <mesh castShadow>
              <sphereGeometry args={[0.095, 24, 18]} />
              <meshStandardMaterial color={dancer.color} roughness={0.4} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0.01, 0.092]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.032, 0.07, 12]} />
              <meshBasicMaterial color="#f3f5f8" />
            </mesh>
          </group>
        )}

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
    </>
  );
}
