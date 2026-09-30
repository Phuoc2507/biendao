// Chỉ số ĐỒNG BỘ NHÓM (tầng đánh giá): đọc chuyển động đã dàn dựng và chấm điểm
// xem nhóm vũ công có đang "cùng động tác" tại mỗi thời điểm hay không.
//
// Đo cái gì — nói thẳng để không overclaim: đây là ĐỒNG BỘ TỨC THỜI (instantaneous
// unison). Tại mỗi thời điểm treo t, mỗi vũ công lấy mẫu tư thế THÂN NGƯỜI đúng như
// Mannequin render (samplePoseSequence tại t − timeOffset). Tư thế nằm trong
// KHÔNG-GIAN-CLIP nên đã bỏ vị trí & hướng đội hình (chúng áp ở scene, là spread có
// chủ đích, không tính là lệch). GƯƠNG cũng là scale.x=-1 ở scene, KHÔNG nằm trong
// mảng pose → hai người cùng clip/offset dù một người soi gương vẫn cho pose y hệt
// (unison đối xứng = đồng bộ). DELAY sóng/canon chỉ dịch đội hình chứ không dịch
// thân, nên không ảnh hưởng chỉ số này — chỉ `timeOffset` (lệch pha có chủ đích) mới
// làm thân lệch. Vì so tại CÙNG t treo, đoạn canon/lệch pha sẽ đọc ra thấp đúng như
// mắt thấy trên sân khấu; đoạn unison đọc ra cao. Người dùng tự biết chỗ nào cố ý
// lệch (canon) thì thấp là bình thường, chỗ định unison mà thấp mới là vấn đề.

import type { ClipData } from "./clip";
import { samplePose, samplePoseSequence } from "./clip";

// Hình dạng tối thiểu cần từ một vũ công (Dancer khớp cấu trúc — tránh phụ thuộc store).
export interface SyncDancer {
  sequence: string[];
  timeOffset: number;
}

// Neo vật lý: RMS lệch khớp trung bình ~0.12m (một bàn tay của hai người cách nhau
// ~24cm) là mức nhóm trông đã RÕ RÀNG không cùng nhau. exp(-spread/SCALE): 0m→1.0
// (unison), 0.12m→~0.37, ~0.28m→~0.1. Hiệu chỉnh bằng đo thực trên clip của app
// (V33): cùng clip→spread 0→1.0; khác clip (chỉ tay/nhún) ~0.06–0.13m→~0.36–0.6.
// Lưu ý: clip TỔNG HỢP biên độ nhỏ & tuần hoàn dưới-giây nên lệch PHA (timeOffset)
// ít tác động ở đây; chỉ số chủ yếu phân biệt CHỌN CLIP khác nhau. Trên mocap THẬT
// (biên độ lớn hơn) lệch pha sẽ hạ điểm mạnh hơn — bản chất chỉ số không đổi.
const SCALE = 0.12;

/**
 * Kết quả chấm đồng bộ CÓ PHÂN RÃ theo từng vũ công tại một thời điểm.
 * - `sync`: điểm nhóm 0..1 (như `groupSyncAt`).
 * - `deviations`: độ lệch RIÊNG của từng vũ công = RMS khoảng cách khớp tới tư thế
 *   TRUNG BÌNH nhóm (mét), 1:1 theo thứ tự `dancers` truyền vào (luôn đủ phần tử vì
 *   chuỗi rỗng vẫn lấy mẫu clip dự phòng).
 * - `worst`: chỉ số vũ công lệch NHẤT trong `dancers` (chưa lọc "có nổi bật không" —
 *   xem `outlierIndex`).
 */
export interface GroupDeviation {
  sync: number;
  deviations: number[];
  worst: number;
}

/**
 * Chấm đồng bộ nhóm tại `t` VÀ phân rã độ lệch từng vũ công. `null` nếu <2 vũ công.
 * Đây là lõi dùng chung: `groupSyncAt` chỉ lấy trường `sync` của kết quả này.
 * `layout` là một clip bất kỳ dùng lấy số khớp J + dự phòng khi chuỗi rỗng.
 */
export function groupDeviationAt(
  clips: Record<string, ClipData>,
  layout: ClipData,
  dancers: SyncDancer[],
  t: number
): GroupDeviation | null {
  const J = layout.jointNames.length;
  // Lấy mẫu tư thế (không-gian-clip) từng vũ công tại t − timeOffset, đúng công thức
  // Mannequin. Chuỗi rỗng/thiếu clip -> lấy mẫu clip dự phòng (vẫn có tư thế) để
  // `deviations` khớp 1:1 với `dancers`.
  const poses: Float32Array[] = [];
  for (const d of dancers) {
    const p = new Float32Array(J * 3);
    if (!samplePoseSequence(clips, d.sequence, t - d.timeOffset, p)) {
      samplePose(layout, t - d.timeOffset, p);
    }
    poses.push(p);
  }
  const n = poses.length;
  if (n < 2) return null;

  // Tư thế TRUNG BÌNH nhóm (theo từng toạ độ khớp).
  const mean = new Float32Array(J * 3);
  for (const p of poses) for (let k = 0; k < J * 3; k++) mean[k] += p[k];
  for (let k = 0; k < J * 3; k++) mean[k] /= n;

  // Độ lệch RIÊNG từng vũ công (RMS khoảng cách khớp tới trung bình, mét). Độ TẢN
  // của nhóm = trung bình các độ lệch này -> điểm = exp(-spread/SCALE).
  const deviations: number[] = new Array(n);
  let spreadSum = 0;
  let worst = 0;
  let worstDev = -1;
  for (let di = 0; di < n; di++) {
    const p = poses[di];
    let sq = 0;
    for (let j = 0; j < J; j++) {
      const o = j * 3;
      const dx = p[o] - mean[o];
      const dy = p[o + 1] - mean[o + 1];
      const dz = p[o + 2] - mean[o + 2];
      sq += dx * dx + dy * dy + dz * dz;
    }
    const dev = Math.sqrt(sq / J);
    deviations[di] = dev;
    spreadSum += dev;
    if (dev > worstDev) {
      worstDev = dev;
      worst = di;
    }
  }
  const spread = spreadSum / n;
  return { sync: Math.exp(-spread / SCALE), deviations, worst };
}

/**
 * Điểm đồng bộ của nhóm tại thời điểm `t` (giây, thời gian treo). Trả 1 = unison
 * hoàn hảo, tiến 0 khi càng rời rạc; `null` nếu <2 vũ công (chỉ số vô nghĩa với
 * 0/1 người). Uỷ thác cho `groupDeviationAt` để dùng CHUNG một phép chấm.
 */
export function groupSyncAt(
  clips: Record<string, ClipData>,
  layout: ClipData,
  dancers: SyncDancer[],
  t: number
): number | null {
  const g = groupDeviationAt(clips, layout, dancers, t);
  return g ? g.sync : null;
}

// Ngưỡng "gọi tên người lệch": chỉ chỉ đích danh vũ công lệch nhất khi (a) nhóm
// THẬT SỰ đang lệch (sync dưới ngưỡng) VÀ (b) người đó lệch TRỘI hơn phần còn lại.
// Nhờ vậy: unison (mọi lệch ~0) không ai bị nêu; canon/lệch-pha có chủ đích (mọi
// người lệch ĐỀU nhau) cũng không nêu ai — chỉ khi có MỘT người phá nhịp mới nổi.
const OUTLIER_SYNC_GATE = 0.85; // sync ≥ mức này coi như nhóm còn khớp -> không nêu
const OUTLIER_FLOOR = 0.05; // 5cm: dưới mức này độ lệch không đáng kể
const OUTLIER_RATIO = 1.3; // phải lệch ≥1.3× lệch TRUNG BÌNH của người còn lại

/**
 * Chỉ số vũ công lệch nhịp NỔI BẬT nhất (để tô sáng), hoặc `null` nếu không nên
 * gọi tên ai (nhóm còn khớp, hoặc mọi người lệch đều nhau như trong canon).
 */
export function outlierIndex(g: GroupDeviation): number | null {
  if (g.sync >= OUTLIER_SYNC_GATE) return null;
  const n = g.deviations.length;
  if (n < 2) return null;
  const worst = g.worst;
  const worstDev = g.deviations[worst];
  if (worstDev < OUTLIER_FLOOR) return null;
  // Lệch trung bình của NHỮNG NGƯỜI CÒN LẠI (không tính người lệch nhất).
  let sumOthers = 0;
  for (let i = 0; i < n; i++) if (i !== worst) sumOthers += g.deviations[i];
  const meanOthers = sumOthers / (n - 1);
  if (worstDev < meanOthers * OUTLIER_RATIO) return null;
  return worst;
}

/** Một mẫu điểm đồng bộ theo thời gian (cho dải nhiệt dưới thanh thời gian). */
export interface SyncSample {
  t: number;
  sync: number; // 0..1
}

/**
 * Chuỗi điểm đồng bộ trên toàn `duration`, lấy `n` mẫu đều nhau (cho dải nhiệt).
 * Mẫu nào <2 vũ công (null) bị bỏ. Trả [] nếu duration<=0.
 */
export function groupSyncSeries(
  clips: Record<string, ClipData>,
  layout: ClipData,
  dancers: SyncDancer[],
  duration: number,
  n: number
): SyncSample[] {
  if (duration <= 0 || n <= 1) return [];
  const out: SyncSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * duration;
    const s = groupSyncAt(clips, layout, dancers, t);
    if (s !== null) out.push({ t, sync: s });
  }
  return out;
}

/** Điểm đồng bộ trung bình trên toàn chuỗi (chỉ báo tổng thể); null nếu không có mẫu. */
export function meanSync(series: SyncSample[]): number | null {
  if (series.length === 0) return null;
  let s = 0;
  for (const x of series) s += x.sync;
  return s / series.length;
}
