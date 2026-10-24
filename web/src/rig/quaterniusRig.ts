// Bộ xương nhân vật Quaternius (CC0) dẫn động bằng 17 khớp vị trí của ta.
// Tách từ components/GltfDancer.tsx để app sân khấu thẻ video dùng lại; giải thích
// cách retarget (aim, twist, bàn chân, gắn lại Foot/PT) xem đầu tệp GltfDancer.tsx.

import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

// Chiều cao mục tiêu từ hông tới gót (m) để co giãn model cho khớp tầm vóc ta
// (chậu nghỉ ~0.95, gót ~0.05 → ~0.90).
const HIP_TO_FOOT = 0.9;
export const HIP_Y = 0.95; // đặt Hips ở cao độ chậu nghỉ

// Đặc tả xương dẫn động: tên-xương → {xương-con để lấy hướng nghỉ, cặp khớp ta để
// lấy hướng đích}. Hướng bone→con (bind) ↔ hướng khớp A→B (đích) phải cùng nghĩa
// giải phẫu. Các xương không liệt kê (bàn tay/ngón/ngón chân, Body/Root) giữ tư
// thế nghỉ, đi theo cha. Tên theo chuẩn Quaternius "Ultimate Modular".
// THREE.GLTFLoader đặt object.name = PropertyBinding.sanitizeNodeName(tên gốc),
// loại bỏ các ký tự dành riêng cho animation-binding ([ ] . : /) và đổi khoảng
// trắng → "_". Nên tên trong scene SỐNG khác tên trong file .gltf: "UpperArm.L"
// → "UpperArmL". Mọi tra cứu theo tên PHẢI đi qua san() để khớp. (Tên gốc còn
// giữ ở userData.name nhưng SkeletonUtils.clone không đảm bảo mọi phiên bản sao
// y, nên ta chuẩn-hoá bằng chính quy tắc THREE cho chắc.)
const san = (n: string) => n.replace(/\s/g, "_").replace(/[[\].:/]/g, "");

// a→b = hướng đích của xương (khớp đầu→khớp cuối). `c` (tuỳ chọn) = khớp CHÁU,
// để dựng mặt phẳng chi (a,b,c) → khôi phục TWIST (xoay quanh trục xương) mà phép
// "nhắm tối thiểu" bỏ mất: pháp tuyến n=(b-a)×(c-b) cố định hướng khuỷu/gối, nên
// cẳng tay/ống chân xoay có lý thay vì tuỳ tiện. Chỉ đặt `c` cho xương GẦN gốc của
// chi (vai-trên, đùi) nơi khớp cháu tồn tại trong 17 khớp ta.
type AimSpec = { child: string; a: string; b: string; c?: string };
const AIM: Record<string, AimSpec> = {
  Abdomen: { child: "Torso", a: "pelvis", b: "neck" },
  Torso: { child: "Chest", a: "pelvis", b: "neck" },
  Chest: { child: "Neck", a: "pelvis", b: "neck" },
  Neck: { child: "Head", a: "neck", b: "head" },
  "Shoulder.L": { child: "UpperArm.L", a: "neck", b: "l_shoulder" },
  "UpperArm.L": { child: "LowerArm.L", a: "l_shoulder", b: "l_elbow", c: "l_wrist" },
  "LowerArm.L": { child: "Wrist.L", a: "l_elbow", b: "l_wrist" },
  "Shoulder.R": { child: "UpperArm.R", a: "neck", b: "r_shoulder" },
  "UpperArm.R": { child: "LowerArm.R", a: "r_shoulder", b: "r_elbow", c: "r_wrist" },
  "LowerArm.R": { child: "Wrist.R", a: "r_elbow", b: "r_wrist" },
  "UpperLeg.L": { child: "LowerLeg.L", a: "l_hip", b: "l_knee", c: "l_ankle" },
  "LowerLeg.L": { child: "Foot.L", a: "l_knee", b: "l_ankle" },
  "UpperLeg.R": { child: "LowerLeg.R", a: "r_hip", b: "r_knee", c: "r_ankle" },
  "LowerLeg.R": { child: "Foot.R", a: "r_knee", b: "r_ankle" },
};

// Gập ngón tay lúc nghỉ (rad) cho bàn tay THẢ LỎNG thay vì xoè phẳng như mái chèo.
// Xương ngón (chuẩn Blender) dài theo local Y, gập quanh local X. Không có dữ liệu
// ngón trong 17 khớp → đây là tư thế TĨNH tự nhiên, không phải động tác.
const FINGER_CURL = 0.28; // mỗi đốt ngón thường
const THUMB_CURL = 0.12; // ngón cái gập nhẹ hơn
const CURL_AXIS = new THREE.Vector3(1, 0, 0); // local X
// Bản AIM keyed theo tên ĐÃ sanitize, để tra theo bone.name (tên scene sống).
const AIM_SAN: Record<string, AimSpec> = {};
for (const k in AIM) AIM_SAN[san(k)] = AIM[k];

const _up = new THREE.Vector3();
const _left = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _delta = new THREE.Quaternion();
const _rbody = new THREE.Quaternion();
const _new = new THREE.Quaternion();
const _pinv = new THREE.Quaternion();
const _qR = new THREE.Quaternion();
const _bUp = new THREE.Vector3();
const _bLeft = new THREE.Vector3();
const _bFwd = new THREE.Vector3();
const _YUP = new THREE.Vector3(0, 1, 0);
// temps riêng cho helper dựng basis (không lồng nhau nên dùng chung an toàn).
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _mb = new THREE.Matrix4();

// Quaternion của một hệ trực chuẩn từ trục CHÍNH x (giữ nguyên) và pháp tuyến z.
function basisFromXZ(x: THREE.Vector3, z: THREE.Vector3, out: THREE.Quaternion) {
  _bx.copy(x).normalize();
  _bz.copy(z).normalize();
  _by.crossVectors(_bz, _bx).normalize();
  _bz.crossVectors(_bx, _by).normalize();
  _mb.makeBasis(_bx, _by, _bz);
  out.setFromRotationMatrix(_mb);
}
// Quaternion của hệ từ trục TRƯỚC z (chiếu ngang) và trục LÊN y (giữ nguyên = +Y).
// Dùng cho bàn chân: sole phẳng theo sàn, mũi hướng theo thân.
function basisFromZY(z: THREE.Vector3, y: THREE.Vector3, out: THREE.Quaternion) {
  _bz.copy(z).normalize();
  _by.copy(y).normalize();
  _bx.crossVectors(_by, _bz).normalize();
  _bz.crossVectors(_bx, _by).normalize();
  _mb.makeBasis(_bx, _by, _bz);
  out.setFromRotationMatrix(_mb);
}

export type Rig = NonNullable<ReturnType<typeof buildRig>>;

// Dựng 1 bản sao rig: clone skeleton, gắn lại bàn chân vào chuỗi chân, chuẩn-hoá
// hướng về hệ ta (Y-lên, X-trái, Z-trước), co giãn & dời Hips về (0, HIP_Y, 0),
// CHỤP tư thế nghỉ (bind) để retarget. Vật liệu gốc giữ nguyên.
export function buildRig(scene: THREE.Object3D, jointNames: readonly string[]) {
  const jidx: Record<string, number> = {};
  jointNames.forEach((n, i) => (jidx[n] = i));
  const root = SkeletonUtils.clone(scene) as THREE.Object3D;
  root.updateMatrixWorld(true);

  // Thu thập xương + mesh (một skeleton dùng chung cho mọi SkinnedMesh).
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  if (meshes.length === 0) return null;

  const byName: Record<string, THREE.Bone> = {};
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) byName[(o as THREE.Bone).name] = o as THREE.Bone;
  });

  // Gắn lại bàn chân/ngón vào chuỗi chân (attach giữ world → bind không đổi).
  for (const [fn, ln, tn] of [
    ["Foot.L", "LowerLeg.L", "PT.L"],
    ["Foot.R", "LowerLeg.R", "PT.R"],
  ]) {
    const f = byName[san(fn)], l = byName[san(ln)], t = byName[san(tn)];
    if (f && l) l.attach(f);
    if (f && t) f.attach(t);
  }
  root.updateMatrixWorld(true);

  // Bone theo thứ tự PHẢ HỆ SAU khi gắn lại (traverse = tiền-tự: cha trước con).
  const ordered: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) ordered.push(o as THREE.Bone);
  });
  const idxOf = new Map<THREE.Bone, number>();
  ordered.forEach((b, i) => idxOf.set(b, i));

  // Chuẩn-hoá hướng: đo khung thân thô (world) rồi xoay cả scene về canonical.
  const hips = byName[san("Hips")];
  const head = byName[san("Head")] ?? byName[san("Neck")];
  const la = byName[san("UpperArm.L")] ?? byName[san("UpperLeg.L")];
  const ra = byName[san("UpperArm.R")] ?? byName[san("UpperLeg.R")];
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
  const footNames = ["Foot.L", "Foot.R", "PT.L", "PT.R"];
  let footY = Infinity;
  for (const fn of footNames) {
    const bf = byName[san(fn)];
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

  // Bake GẬP NGÓN (tư thế nghỉ) trước khi chụp bindLocalQ: ngón không có dữ liệu
  // nên là xương "none" giữ bindLocalQ suốt — gập sẵn ở đây cho bàn tay thả lỏng.
  for (const b of ordered) {
    const nm = b.name;
    let ang = 0;
    if (/^(Index|Middle|Ring|Pinky)[1-4][LR]$/.test(nm)) ang = FINGER_CURL;
    else if (/^Thumb[1-3][LR]$/.test(nm)) ang = THUMB_CURL;
    if (ang) {
      _qR.setFromAxisAngle(CURL_AXIS, ang);
      b.quaternion.multiply(_qR);
    }
  }
  root.updateMatrixWorld(true);

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

  // Dẫn động: mỗi xương → kiểu + dữ liệu.
  //  none  = giữ tư thế nghỉ (ngón, Body/Root).
  //  hips  = lấy hướng từ khung thân.
  //  aim   = nhắm tối thiểu bone→con (twist tuỳ tiện quanh trục xương).
  //  twist = nhắm CÓ twist: dựng mặt phẳng chi (a,b,c) nên khuỷu/gối không xoay
  //          bừa; dùng cho xương gần gốc chi (vai-trên, đùi) có khớp cháu.
  //  foot  = giữ đế bàn chân phẳng theo sàn (+Y) và mũi hướng theo thân, thay vì
  //          duỗi thẳng theo cẳng chân (trước đây là "none" → bàn chân chĩa kỳ cục).
  type Drive =
    | { kind: "none" }
    | { kind: "hips" }
    | { kind: "aim"; ja: number; jb: number; aimBind: THREE.Vector3 }
    | { kind: "twist"; ja: number; jb: number; jc: number; aimBind: THREE.Vector3; qBindInv: THREE.Quaternion }
    | { kind: "foot"; qFootBindInv: THREE.Quaternion };
  const drive: Drive[] = ordered.map((b) => {
    if (b.name === san("Hips")) return { kind: "hips" };

    // Bàn chân: dựng qBindInv từ hướng (gót→mũi) nghỉ, lên = +Y.
    if (b.name === san("Foot.L") || b.name === san("Foot.R")) {
      const si = idxOf.get(b)!;
      const ptB = byName[b.name === san("Foot.L") ? san("PT.L") : san("PT.R")];
      const pi = ptB ? idxOf.get(ptB) : undefined;
      const fwd = new THREE.Vector3();
      if (pi !== undefined) fwd.subVectors(bindWorldP[pi], bindWorldP[si]);
      if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);
      const qB = new THREE.Quaternion();
      basisFromZY(fwd, _YUP, qB);
      return { kind: "foot", qFootBindInv: qB.invert() };
    }

    const spec = AIM_SAN[b.name];
    if (!spec) return { kind: "none" };
    const childB = byName[san(spec.child)];
    const ja = jidx[spec.a];
    const jb = jidx[spec.b];
    if (!childB || ja === undefined || jb === undefined) return { kind: "none" };
    const ci = idxOf.get(childB);
    if (ci === undefined) return { kind: "none" };
    const si = idxOf.get(b)!;
    const aimBind = new THREE.Vector3()
      .subVectors(bindWorldP[ci], bindWorldP[si])
      .normalize();

    // Có khớp cháu → thử dựng drive "twist" (mặt phẳng chi). Cần cả xương cháu
    // trong rig (để biết local→world sau) và khớp cháu `c` trong 17 khớp ta.
    if (spec.c !== undefined) {
      const jc = jidx[spec.c];
      const childSpec = AIM_SAN[childB.name];
      const grandB = childSpec ? byName[san(childSpec.child)] : undefined;
      const gi = grandB ? idxOf.get(grandB) : undefined;
      if (jc !== undefined && gi !== undefined) {
        const seg = new THREE.Vector3().subVectors(bindWorldP[ci], bindWorldP[si]);
        const e2 = new THREE.Vector3().subVectors(bindWorldP[gi], bindWorldP[ci]);
        const nb = new THREE.Vector3().crossVectors(seg, e2);
        if (seg.lengthSq() > 1e-8 && nb.lengthSq() > 1e-8) {
          const qB = new THREE.Quaternion();
          basisFromXZ(seg, nb, qB); // hệ chi NGHỈ (x=dọc xương, z=pháp tuyến)
          return { kind: "twist", ja, jb, jc, aimBind, qBindInv: qB.invert() };
        }
      }
    }
    return { kind: "aim", ja, jb, aimBind };
  });
  const hipsIdx = idxOf.get(hips)!;
  const neckJ = jidx["neck"], pelvJ = jidx["pelvis"];
  const lHipJ = jidx["l_hip"], rHipJ = jidx["r_hip"];

  // Giữ vật liệu gốc; chỉ bật đổ bóng + tắt frustum-cull (bbox bind nhỏ, tránh
  // bị cull sai khi pose kéo xa).
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  }

  return {
    root,
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
}

// Đặt tư thế rig theo một khung 17 khớp (hệ vũ công, mét). mirror = phản chiếu
// pose theo x (KHÔNG scale âm).
export function poseRig(built: Rig, pose: ArrayLike<number>, mirror: boolean) {
  const sx = mirror ? -1 : 1;
  const px = (j: number) => sx * pose[j * 3];
  const py = (j: number) => pose[j * 3 + 1];
  const pz = (j: number) => pose[j * 3 + 2];

  const { ordered, drive, bindWorldQ, bindLocalQ, parentIdx, seedQ, worldQ } = built;

  // Khung THÂN (hệ vũ công, đã phản chiếu nếu gương) — tính 1 lần, dùng cho Hips
  // và cho trục "trước" của bàn chân. up = chậu→cổ, trái = hông T→P, trước = trái×up.
  _bUp.set(px(built.neckJ) - px(built.pelvJ), py(built.neckJ) - py(built.pelvJ), pz(built.neckJ) - pz(built.pelvJ)).normalize();
  _bLeft.set(px(built.lHipJ) - px(built.rHipJ), py(built.lHipJ) - py(built.rHipJ), pz(built.lHipJ) - pz(built.rHipJ)).normalize();
  _bFwd.crossVectors(_bLeft, _bUp).normalize();
  _bLeft.crossVectors(_bUp, _bFwd).normalize();

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
      _m.makeBasis(_bLeft, _bUp, _bFwd);
      _rbody.setFromRotationMatrix(_m); // Rbody (bind thân = canonical)
      _new.copy(_rbody).multiply(bindWorldQ[i]); // = Rbody * Qbind
    } else if (d.kind === "foot") {
      // Bàn chân: đế phẳng theo sàn (+Y), mũi chiếu theo hướng-trước của thân.
      _dir.copy(_bFwd);
      _dir.y = 0;
      if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
      basisFromZY(_dir, _YUP, _qR); // hệ chân LIVE
      _new.copy(_qR).multiply(d.qFootBindInv).multiply(bindWorldQ[i]); // R*Qbind
    } else if (d.kind === "twist") {
      // Nhắm CÓ twist: R = (hệ chi live)·(hệ chi nghỉ)⁻¹ rồi áp lên Qbind. Khi chi
      // gần thẳng (pháp tuyến suy biến) thì lùi về nhắm tối thiểu như "aim".
      _a.set(px(d.ja), py(d.ja), pz(d.ja));
      _b.set(px(d.jb), py(d.jb), pz(d.jb));
      _c.set(px(d.jc), py(d.jc), pz(d.jc));
      _dir.subVectors(_b, _a); // đoạn a→b (dọc xương)
      if (_dir.lengthSq() < 1e-10) {
        worldQ[i].copy(parentWQ).multiply(bindLocalQ[i]);
        bone.quaternion.copy(bindLocalQ[i]);
        continue;
      }
      _n.crossVectors(_dir, _c.sub(_b)); // (b-a)×(c-b) = pháp tuyến mặt phẳng chi
      if (_n.lengthSq() < 1e-8) {
        _dir.normalize();
        _delta.setFromUnitVectors(d.aimBind, _dir);
        _new.copy(_delta).multiply(bindWorldQ[i]);
      } else {
        basisFromXZ(_dir, _n, _qR); // hệ chi LIVE (x=dọc xương, z=pháp tuyến)
        _new.copy(_qR).multiply(d.qBindInv).multiply(bindWorldQ[i]);
      }
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
}
