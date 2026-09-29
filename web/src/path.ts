// Toán đường đi trên sàn (dùng chung cho Mannequin, PathEditor, CameraRig).
// Waypoint là [x, z] trên mặt sàn Y=0; nội suy Catmull-Rom khép kín để đi lặp
// mượt theo vòng lặp clip.

import * as THREE from "three";

export interface PathSample {
  x: number;
  z: number;
  rotationY: number; // hướng mặt theo tiếp tuyến (radian)
}

/** Dựng đường cong từ waypoint. Trả về null nếu < 2 điểm. */
export function makeCurve(
  waypoints: [number, number][]
): THREE.CatmullRomCurve3 | null {
  if (waypoints.length < 2) return null;
  const pts = waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
}

/** Tham số u ∈ [0,1) theo thời gian, lặp theo `duration`. */
export function pathU(time: number, duration: number): number {
  if (duration <= 0) return 0;
  let u = (time / duration) % 1;
  if (u < 0) u += 1;
  return u;
}

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Lấy mẫu vị trí + hướng mặt trên đường đi tại thời điểm `time`. */
export function sampledPath(
  curve: THREE.CatmullRomCurve3,
  time: number,
  duration: number
): PathSample {
  const u = pathU(time, duration);
  curve.getPointAt(u, _p);
  curve.getTangentAt(u, _t);
  return { x: _p.x, z: _p.z, rotationY: Math.atan2(_t.x, _t.z) };
}
