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

// ---- Chuỗi động tác (sequencer): nhiều clip phát NỐI TIẾP, lặp cả chuỗi ----

/** Thời lượng từng đoạn trong chuỗi (giây). Đoạn thiếu clip = 0. */
export function sequenceDurations(
  clips: Record<string, ClipData>,
  sequence: string[]
): number[] {
  return sequence.map((name) => {
    const c = clips[name];
    return c ? clipDuration(c) : 0;
  });
}

/** Tổng thời lượng chuỗi (giây) = tổng các đoạn hợp lệ. */
export function sequenceTotal(
  clips: Record<string, ClipData>,
  sequence: string[]
): number {
  let t = 0;
  for (const name of sequence) {
    const c = clips[name];
    if (c) t += clipDuration(c);
  }
  return t;
}

/** Một vạch nhịp trên thanh thời gian: thời điểm (giây) + có phải phách MẠNH. */
export interface BeatMark {
  t: number;
  down: boolean;
}

/**
 * Lưới nhịp TRUNG THỰC cho chuỗi clip của một vũ công: nối beatGrid RIÊNG của từng
 * clip theo mốc bắt đầu đoạn, rồi lặp cả lượt phủ hết `duration`. Nhờ vậy vạch nhịp
 * khớp ĐÚNG nhịp thật của clip đang phát (vd point 112 / bounce 128 BPM) thay vì áp
 * cứng một BPM sân khấu duy nhất — đây chính là chỗ trước đây "lưới nhịp nói dối".
 * Vạch mạnh lấy từ `downbeatTimes` thật của clip. Clip thiếu beatGrid -> suy lưới
 * đều từ `fallbackBpm`. Trả [] nếu chuỗi rỗng/không có clip hợp lệ (người gọi tự lo
 * lưới dự phòng).
 */
export function sequenceBeatMarks(
  clips: Record<string, ClipData>,
  sequence: string[],
  duration: number,
  fallbackBpm: number
): BeatMark[] {
  const durs = sequenceDurations(clips, sequence);
  let total = 0;
  for (const d of durs) total += d;
  if (total <= 0 || duration <= 0) return [];

  // Một LƯỢT chuỗi: gom vạch nhịp từng đoạn, dời theo mốc bắt đầu đoạn.
  const lap: BeatMark[] = [];
  let acc = 0;
  for (let i = 0; i < sequence.length; i++) {
    const c = clips[sequence[i]];
    const d = durs[i];
    if (!c || d <= 0) continue;
    const bg = c.beatGrid;
    if (bg && bg.beatTimes.length > 0) {
      // downbeatTimes là tập con của beatTimes -> so khớp gần đúng (sai số fps).
      const isDown = (bt: number) =>
        bg.downbeatTimes.some((db) => Math.abs(db - bt) < 1e-3);
      for (const bt of bg.beatTimes) {
        // Bỏ phách rơi đúng/vượt cuối đoạn để không đè phách 0 của đoạn kế tiếp.
        if (bt >= d - 1e-6) continue;
        lap.push({ t: acc + bt, down: isDown(bt) });
      }
    } else {
      // Không có beatGrid -> lưới đều theo fallbackBpm (mọi phách coi như thường).
      const p = 60 / Math.max(1, fallbackBpm);
      for (let t = 0; t + 1e-6 < d; t += p) lap.push({ t: acc + t, down: false });
    }
    acc += d;
  }
  if (lap.length === 0) return [];

  // Lặp cả LƯỢT tới khi phủ hết `duration` (chuỗi vũ công tự lặp khi phát).
  const marks: BeatMark[] = [];
  for (let base = 0; base < duration - 1e-6; base += total) {
    for (const m of lap) {
      const t = base + m.t;
      if (t > duration + 1e-6) break;
      marks.push({ t, down: m.down });
    }
  }
  return marks;
}

/**
 * BPM của clip đang nằm tại thời điểm `timeSec` trong chuỗi (lặp theo tổng chuỗi).
 * Trả `fallbackBpm` nếu không xác định được (chuỗi rỗng / clip thiếu beatGrid).
 */
export function sequenceBpmAt(
  clips: Record<string, ClipData>,
  sequence: string[],
  timeSec: number,
  fallbackBpm: number
): number {
  const durs = sequenceDurations(clips, sequence);
  let total = 0;
  for (const d of durs) total += d;
  if (total <= 0) return fallbackBpm;
  let tt = timeSec % total;
  if (tt < 0) tt += total;
  let acc = 0;
  for (let i = 0; i < sequence.length; i++) {
    if (durs[i] <= 0) continue;
    if (tt < acc + durs[i]) {
      return clips[sequence[i]]?.beatGrid?.bpm ?? fallbackBpm;
    }
    acc += durs[i];
  }
  return fallbackBpm;
}

/**
 * Lấy mẫu tư thế của một CHUỖI clip tại thời điểm `timeSec` (đã trừ timeOffset):
 * lặp vòng theo TỔNG thời lượng chuỗi, tìm đoạn chứa thời điểm rồi lấy mẫu clip
 * của đoạn đó (KHÔNG để clip con tự lặp — mỗi clip phát đúng một lần rồi sang clip
 * kế; chỉ cả chuỗi mới lặp). Trả về true nếu ghi được tư thế, false nếu chuỗi rỗng
 * / không có clip hợp lệ (khi đó `out` giữ nguyên, người gọi tự lo dự phòng).
 */
export function samplePoseSequence(
  clips: Record<string, ClipData>,
  sequence: string[],
  timeSec: number,
  out: Float32Array
): boolean {
  const durs = sequenceDurations(clips, sequence);
  let total = 0;
  for (const d of durs) total += d;
  if (total <= 0) return false;

  let tt = timeSec % total;
  if (tt < 0) tt += total;

  // Tìm đoạn chứa `tt`. Cộng dồn tới khi vượt; đoạn cuối nhận phần dư (an toàn
  // với sai số dấu phẩy động ở biên).
  let acc = 0;
  let idx = 0;
  for (; idx < durs.length; idx++) {
    if (durs[idx] <= 0) continue; // bỏ đoạn thiếu clip
    if (tt < acc + durs[idx]) break;
    acc += durs[idx];
  }
  if (idx >= durs.length) {
    // rơi vào đuôi do làm tròn: lùi về đoạn hợp lệ cuối cùng.
    idx = durs.length - 1;
    while (idx >= 0 && durs[idx] <= 0) idx--;
    acc = total - durs[idx];
  }
  const clip = clips[sequence[idx]];
  // `tt - acc` nằm trong [0, durClip) nên samplePose không lặp vòng.
  samplePose(clip, tt - acc, out);
  return true;
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
