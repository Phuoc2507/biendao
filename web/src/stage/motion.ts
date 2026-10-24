// Tệp động tác 3D (<tên>.motion.json do choreo.pose3d ghi): 17 khớp mỗi khung,
// hệ sân khấu (Y lên, người nhìn khán giả +Z, sàn Y=0), thời gian tính từ đầu
// video gốc. Thẻ video không cắt nên giây video của thẻ dùng thẳng làm giây
// động tác. THUẦN, test bằng node --test.

export const JOINTS = [
  "pelvis", "l_hip", "r_hip", "spine", "l_knee", "r_knee", "neck", "l_ankle", "r_ankle",
  "head", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist", "root_floor",
] as const;
const J = JOINTS.length;

export interface Motion {
  name: string;
  fps: number;
  /** số khung */
  n: number;
  /** khung k khớp j trục c ở data[(k * J + j) * 3 + c] */
  data: Float32Array;
}

/** Bỏ đuôi .motion.json (hoa thường tuỳ), để ghép với tên người hay tên video. */
export const motionKey = (name: string): string => name.replace(/\.motion\.json$/i, "").replace(/\.card$/i, "").trim().toLowerCase();

export const isMotionName = (name: string): boolean => /\.motion\.json$/i.test(name);

/** Đọc tệp động tác. Sai định dạng, thiếu khớp hay có số hỏng: null. */
export function parseMotion(text: string): Motion | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || j.format !== "choreo-motion") return null;
  const fps = j.fps;
  if (typeof fps !== "number" || !(fps > 0) || !Number.isFinite(fps)) return null;
  const names = j.jointNames;
  if (!Array.isArray(names) || names.length !== J || names.some((x, i) => x !== JOINTS[i])) return null;
  const frames = j.frames;
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const data = new Float32Array(frames.length * J * 3);
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    if (!Array.isArray(f) || f.length !== J) return null;
    for (let i = 0; i < J; i++) {
      const p = f[i];
      if (!Array.isArray(p) || p.length !== 3) return null;
      for (let c = 0; c < 3; c++) {
        const v = p[c];
        if (typeof v !== "number" || !Number.isFinite(v)) return null;
        data[(k * J + i) * 3 + c] = v;
      }
    }
  }
  return { name: typeof j.name === "string" ? j.name : "", fps, n: frames.length, data };
}

export const motionDuration = (m: Motion): number => (m.n - 1) / m.fps;

/** Tư thế ở giây t (nội suy thẳng giữa hai khung, ngoài khoảng thì giữ khung đầu, cuối) ghi vào out (17·3). */
export function sampleMotion(m: Motion, t: number, out: Float32Array): Float32Array {
  const x = Math.min(Math.max(Number.isFinite(t) ? t * m.fps : 0, 0), m.n - 1);
  const k = Math.floor(x);
  const k2 = Math.min(k + 1, m.n - 1);
  const a = x - k;
  const o1 = k * J * 3, o2 = k2 * J * 3;
  for (let i = 0; i < J * 3; i++) out[i] = m.data[o1 + i] * (1 - a) + m.data[o2 + i] * a;
  return out;
}
