// Vũ công "NGƯỜI" — mesh người GLTF có rig Mixamo-chuẩn (Quaternius, CC0), được
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
// của chuỗi xương). Màu áo = màu vũ công (để phân biệt), quần/giày/da cố định.
//
// KHÔNG tải asset lúc chạy: file .glb nằm sẵn trong public/models (CC0). Muốn đổi
// sang đúng nhân vật khác chỉ cần thay đường dẫn GLB — pipeline giữ nguyên.

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { ClipData } from "../clip";
import { samplePose, samplePoseSequence } from "../clip";
import { useStore, type Dancer } from "../store";
import { makeCurve, sampledPath } from "../path";
import { formationPose, waveDelayAt } from "../formation";
import { syncHighlight } from "../syncHighlight";

const MODEL_URL = "/models/animated_human.glb";
useGLTF.preload(MODEL_URL);

// Chiều cao mục tiêu từ hông tới gót (m) để co giãn model cho khớp tầm vóc ta
// (chậu nghỉ ~0.95, gót ~0.05 → ~0.90).
const HIP_TO_FOOT = 0.9;
const HIP_Y = 0.95; // đặt Hips ở cao độ chậu nghỉ

// Đặc tả xương dẫn động: tên-xương → {xương-con để lấy hướng nghỉ, cặp khớp ta để
// lấy hướng đích}. Hướng bone→con (bind) ↔ hướng khớp A→B (đích) phải cùng nghĩa
// giải phẫu. Các xương không liệt kê (bàn tay/ngón/bàn chân/ngón chân, chóp đầu)
// giữ tư thế nghỉ, đi theo cha.
type AimSpec = { child: string; a: string; b: string };
const AIM: Record<string, AimSpec> = {
  Spine: { child: "Spine1", a: "pelvis", b: "neck" },
  Spine1: { child: "Spine2", a: "pelvis", b: "neck" },
  Spine2: { child: "Neck", a: "pelvis", b: "neck" },
  Neck: { child: "Head", a: "neck", b: "head" },
  LeftShoulder: { child: "LeftArm", a: "neck", b: "l_shoulder" },
  LeftArm: { child: "LeftForeArm", a: "l_shoulder", b: "l_elbow" },
  LeftForeArm: { child: "LeftHand", a: "l_elbow", b: "l_wrist" },
  RightShoulder: { child: "RightArm", a: "neck", b: "r_shoulder" },
  RightArm: { child: "RightForeArm", a: "r_shoulder", b: "r_elbow" },
  RightForeArm: { child: "RightHand", a: "r_elbow", b: "r_wrist" },
  LeftUpLeg: { child: "LeftLeg", a: "l_hip", b: "l_knee" },
  LeftLeg: { child: "LeftFoot", a: "l_knee", b: "l_ankle" },
  RightUpLeg: { child: "RightLeg", a: "r_hip", b: "r_knee" },
  RightLeg: { child: "RightFoot", a: "r_knee", b: "r_ankle" },
};

// Phân vùng cơ thể theo TÊN xương để tô màu "quần áo".
function region(boneName: string): "skin" | "shoes" | "pants" | "shirt" {
  const n = boneName;
  if (n.includes("Foot") || n.includes("Toe")) return "shoes";
  if (n.includes("Hand") || n.includes("Thumb") || n.includes("Index")) return "skin";
  if (n.includes("Head")) return "skin";
  if (n.includes("UpLeg") || n.includes("Leg") || n === "Hips") return "pants";
  return "shirt"; // Spine*, Neck, Shoulder, Arm, ForeArm
}

const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const _left = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _delta = new THREE.Quaternion();
const _rbody = new THREE.Quaternion();
const _new = new THREE.Quaternion();
const _pinv = new THREE.Quaternion();
const UPv = new THREE.Vector3(0, 1, 0);

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

  const { scene } = useGLTF(MODEL_URL);

  // Chỉ số khớp ta theo tên (ổn định giữa các clip).
  const jidx = useMemo(() => {
    const m: Record<string, number> = {};
    clip.jointNames.forEach((n, i) => (m[n] = i));
    return m;
  }, [clip]);

  // ── Dựng 1 bản sao rig cho vũ công này: clone skeleton, chuẩn-hoá hướng về hệ
  //    ta (Y-lên, X-trái, Z-trước), co giãn & dời Hips về (0, HIP_Y, 0), nướng màu
  //    quần áo theo vùng, và CHỤP tư thế nghỉ (bind) để retarget. ────────────────
  const built = useMemo(() => {
    const root = SkeletonUtils.clone(scene) as THREE.Object3D;

    // Tìm SkinnedMesh + skeleton.
    let skinned: THREE.SkinnedMesh | null = null;
    root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    });
    if (!skinned) return null;
    const mesh = skinned as THREE.SkinnedMesh;
    const skeleton = mesh.skeleton;

    // Bone theo thứ tự PHẢ HỆ (traverse = tiền-tự: cha trước con).
    const ordered: THREE.Bone[] = [];
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) ordered.push(o as THREE.Bone);
    });
    const idxOf = new Map<THREE.Bone, number>();
    ordered.forEach((b, i) => idxOf.set(b, i));
    const byName: Record<string, THREE.Bone> = {};
    for (const b of ordered) byName[b.name] = b;

    // Chuẩn-hoá hướng: đo khung thân thô (world) rồi xoay cả scene về canonical.
    root.updateMatrixWorld(true);
    const hips = byName["Hips"];
    const head = byName["Head"] ?? byName["Neck"];
    const la = byName["LeftArm"] ?? byName["LeftUpLeg"];
    const ra = byName["RightArm"] ?? byName["RightUpLeg"];
    if (!hips || !head || !la || !ra) return null;
    const pHips = hips.getWorldPosition(new THREE.Vector3());
    const pHead = head.getWorldPosition(new THREE.Vector3());
    const pLA = la.getWorldPosition(new THREE.Vector3());
    const pRA = ra.getWorldPosition(new THREE.Vector3());
    _up.subVectors(pHead, pHips).normalize();
    _left.subVectors(pLA, pRA).normalize();
    _fwd.crossVectors(_left, _up).normalize();
    _left.crossVectors(_up, _fwd).normalize(); // trực giao hoá
    const rawBasis = new THREE.Matrix4().makeBasis(_left, _up, _fwd);
    const qNorm = new THREE.Quaternion()
      .setFromRotationMatrix(rawBasis)
      .invert(); // raw → canonical
    root.quaternion.premultiply(qNorm);
    root.updateMatrixWorld(true);

    // Co giãn theo chiều hông→gót.
    const footNames = ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"];
    let footY = Infinity;
    for (const fn of footNames) {
      const bf = byName[fn];
      if (bf) footY = Math.min(footY, bf.getWorldPosition(new THREE.Vector3()).y);
    }
    const hipY = hips.getWorldPosition(new THREE.Vector3()).y;
    const span = hipY - footY;
    const s = span > 1e-4 ? HIP_TO_FOOT / span : 1;
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);

    // Dời Hips về (0, HIP_Y, 0).
    const hw = hips.getWorldPosition(new THREE.Vector3());
    root.position.x -= hw.x;
    root.position.y += HIP_Y - hw.y;
    root.position.z -= hw.z;
    root.updateMatrixWorld(true);

    // CHỤP bind (hệ vũ công, chưa có G vì root đang rời khỏi group sân khấu).
    const bindWorldQ = ordered.map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    const bindWorldP = ordered.map((b) => b.getWorldPosition(new THREE.Vector3()));
    const bindLocalQ = ordered.map((b) => b.quaternion.clone());
    const parentIdx = ordered.map((b) => {
      const p = b.parent;
      return p && (p as THREE.Bone).isBone ? idxOf.get(p as THREE.Bone)! : -1;
    });
    const seedQ = ordered.map((b) => {
      const p = b.parent;
      return p && !(p as THREE.Bone).isBone
        ? p.getWorldQuaternion(new THREE.Quaternion())
        : null;
    });

    // Dẫn động: mỗi xwương → kiểu + dữ liệu.
    type Drive =
      | { kind: "none" }
      | { kind: "hips" }
      | { kind: "aim"; ja: number; jb: number; aimBind: THREE.Vector3 };
    const drive: Drive[] = ordered.map((b) => {
      if (b.name === "Hips") return { kind: "hips" };
      const spec = AIM[b.name];
      if (!spec) return { kind: "none" };
      const childB = byName[spec.child];
      const ja = jidx[spec.a];
      const jb = jidx[spec.b];
      if (!childB || ja === undefined || jb === undefined) return { kind: "none" };
      const ci = idxOf.get(childB)!;
      const aimBind = new THREE.Vector3()
        .subVectors(bindWorldP[ci], bindWorldP[idxOf.get(b)!])
        .normalize();
      return { kind: "aim", ja, jb, aimBind };
    });
    const hipsIdx = idxOf.get(hips)!;
    const neckJ = jidx["neck"], pelvJ = jidx["pelvis"];
    const lHipJ = jidx["l_hip"], rHipJ = jidx["r_hip"];

    // ── Màu quần áo: clone geometry, nướng COLOR_0 theo vùng xương trội mỗi đỉnh.
    const geom = mesh.geometry.clone();
    const si = geom.attributes.skinIndex as THREE.BufferAttribute;
    const sw = geom.attributes.skinWeight as THREE.BufferAttribute;
    const nv = geom.attributes.position.count;
    const shirt = new THREE.Color(dancer.color);
    const skin = new THREE.Color("#e8b696");
    const pants = new THREE.Color("#2b2f3a");
    const shoes = new THREE.Color("#1d2026");
    const colAttr = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      // xương trội = trọng số lớn nhất trong 4.
      let bi = si.getX(i),
        bw = sw.getX(i);
      const cand: [number, number][] = [
        [si.getY(i), sw.getY(i)],
        [si.getZ(i), sw.getZ(i)],
        [si.getW(i), sw.getW(i)],
      ];
      for (const [ii, ww] of cand) if (ww > bw) ((bi = ii), (bw = ww));
      const bone = skeleton.bones[bi];
      const r = bone ? region(bone.name) : "shirt";
      const c = r === "skin" ? skin : r === "pants" ? pants : r === "shoes" ? shoes : shirt;
      colAttr[i * 3] = c.r;
      colAttr[i * 3 + 1] = c.g;
      colAttr[i * 3 + 2] = c.b;
    }
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colAttr, 3));
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.0,
    });
    mesh.geometry = geom;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.frustumCulled = false; // bbox bind nhỏ, tránh bị cull sai khi pose

    return {
      root,
      mesh,
      geom,
      material,
      ordered,
      bindWorldQ,
      bindLocalQ,
      parentIdx,
      seedQ,
      drive,
      hipsIdx,
      neckJ,
      pelvJ,
      lHipJ,
      rHipJ,
      // bộ đệm world-quat/khung dùng lại
      worldQ: ordered.map(() => new THREE.Quaternion()),
    };
  }, [scene, dancer.color, jidx]);

  useEffect(() => {
    if (!built) return;
    return () => {
      built.geom.dispose();
      built.material.dispose();
    };
  }, [built]);

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

    // Gương = phản chiếu pose theo x (KHÔNG scale âm). sx áp cho mọi toạ độ x đọc ra.
    const sx = dancer.mirror ? -1 : 1;
    const px = (j: number) => sx * pose[j * 3];
    const py = (j: number) => pose[j * 3 + 1];
    const pz = (j: number) => pose[j * 3 + 2];

    const { ordered, drive, bindWorldQ, bindLocalQ, parentIdx, seedQ, worldQ } = built;

    for (let i = 0; i < ordered.length; i++) {
      const bone = ordered[i];
      const pi = parentIdx[i];
      const parentWQ = pi >= 0 ? worldQ[pi] : seedQ[i]!;
      const d = drive[i];

      if (d.kind === "none") {
        worldQ[i].copy(parentWQ).multiply(bindLocalQ[i]);
        continue; // giữ nguyên bone.quaternion = bind
      }

      if (d.kind === "hips") {
        // Khung thân: up = chậu→cổ, trái = hông T→P, trước = trái×up.
        _up.set(px(built.neckJ) - px(built.pelvJ), py(built.neckJ) - py(built.pelvJ), pz(built.neckJ) - pz(built.pelvJ)).normalize();
        _left.set(px(built.lHipJ) - px(built.rHipJ), py(built.lHipJ) - py(built.rHipJ), pz(built.lHipJ) - pz(built.rHipJ)).normalize();
        _fwd.crossVectors(_left, _up).normalize();
        _left.crossVectors(_up, _fwd).normalize();
        _m.makeBasis(_left, _up, _fwd);
        _rbody.setFromRotationMatrix(_m); // Rbody (bind thân = canonical)
        _new.copy(_rbody).multiply(bindWorldQ[i]); // = Rbody * Qbind
      } else {
        // aim: xoay hướng-nghỉ-world của xương về hướng-đích-world (twist tối thiểu).
        _a.set(px(d.ja), py(d.ja), pz(d.ja));
        _b.set(px(d.jb), py(d.jb), pz(d.jb));
        _dir.subVectors(_b, _a);
        if (_dir.lengthSq() < 1e-10) {
          worldQ[i].copy(parentWQ).multiply(bindLocalQ[i]);
          bone.quaternion.copy(bindLocalQ[i]);
          continue;
        }
        _dir.normalize();
        _delta.setFromUnitVectors(d.aimBind, _dir);
        _new.copy(_delta).multiply(bindWorldQ[i]);
      }

      // local = parentWQ⁻¹ * worldMới ; lưu worldMới cho con.
      _pinv.copy(parentWQ).invert();
      bone.quaternion.copy(_pinv).multiply(_new);
      worldQ[i].copy(_new);
    }

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
