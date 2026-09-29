// Kiểu dữ liệu clip + nạp JSON + lấy mẫu tư thế theo thời gian.
// JSON do choreo/io/export_web.py xuất ra — đây là ranh giới perception ↔ web.

export interface BeatGrid {
  bpm: number;
  beatTimes: number[];
  downbeatTimes: number[];
}

export interface ClipData {
  fps: number;
  numFrames: number;
  jointNames: string[];
  edges: [number, number][];
  mirrorPairs: [number, number][];
  frames: number[][][]; // [T][J][3] mét, Y-up, sàn tại Y=0
  meta: Record<string, unknown>;
  beatGrid?: BeatGrid;
  contacts?: number[][];
}

export interface ClipIndexEntry {
  name: string;
  label: string;
  file: string;
  bpm: number;
  frames: number;
}

export async function loadClip(url: string): Promise<ClipData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không nạp được clip: ${url} (${res.status})`);
  return (await res.json()) as ClipData;
}

/** Nạp danh mục clip + toàn bộ clip. Trả về (index, map tên->clip). */
export async function loadLibrary(
  base = "/clips"
): Promise<{ index: ClipIndexEntry[]; clips: Record<string, ClipData> }> {
  const res = await fetch(`${base}/index.json`);
  if (!res.ok) throw new Error(`Không nạp được index clip (${res.status})`);
  const index = ((await res.json()).clips ?? []) as ClipIndexEntry[];
  const clips: Record<string, ClipData> = {};
  await Promise.all(
    index.map(async (e) => {
      clips[e.name] = await loadClip(`${base}/${e.file}`);
    })
  );
  return { index, clips };
}

export function clipDuration(clip: ClipData): number {
  return clip.numFrames / clip.fps;
}

/**
 * Lấy mẫu tư thế tại thời điểm `timeSec` (đã trừ timeOffset), nội suy tuyến tính
 * giữa 2 frame, LẶP vòng theo độ dài clip. Ghi kết quả vào `out` (Float32Array,
 * dài J*3) để tránh cấp phát mỗi frame.
 */
export function samplePose(
  clip: ClipData,
  timeSec: number,
  out: Float32Array
): void {
  const dur = clipDuration(clip);
  let tt = timeSec % dur;
  if (tt < 0) tt += dur;

  const frame = tt * clip.fps;
  const i0 = Math.min(Math.floor(frame), clip.numFrames - 1);
  const i1 = Math.min(i0 + 1, clip.numFrames - 1);
  const a = frame - i0;

  const f0 = clip.frames[i0];
  const f1 = clip.frames[i1];
  const J = clip.jointNames.length;
  for (let j = 0; j < J; j++) {
    const p0 = f0[j];
    const p1 = f1[j];
    const o = j * 3;
    out[o] = p0[0] + (p1[0] - p0[0]) * a;
    out[o + 1] = p0[1] + (p1[1] - p0[1]) * a;
    out[o + 2] = p0[2] + (p1[2] - p0[2]) * a;
  }
}
