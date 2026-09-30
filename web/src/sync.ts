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

// ───────────────────────────────────────────────────────────────────────────
// ĐỒNG BỘ NHẬN BIẾT PHA (V35) — tách TRỄ NHỊP khỏi SAI ĐỘNG TÁC
// ───────────────────────────────────────────────────────────────────────────
// Vì sao cần: chỉ số tức thời ở trên KHÔNG phân biệt được "canon/echo cố ý" với
// "lệch nhịp thật" — cả hai chỉ là "một người ở pha khác" tại một khung. Đo thực
// nghiệm xác nhận không ngưỡng ratio nào tách sạch (canon4 max 2.11 chồng odd3 2.0).
// Cách tách chuẩn trong Functional Data Analysis là PHÂN RÃ PHA–BIÊN ĐỘ (phase–
// amplitude / curve registration, khung elastic Fisher–Rao/SRVF): PHA = phép căn
// thời gian (warping) = trễ có cấu trúc (canon); BIÊN ĐỘ = phần dư HÌNH DÁNG sau khi
// căn tối ưu = lỗi thật. Bản demo dùng trường hợp RIGID của warping: độ trễ HẰNG τ.
//
// Với mỗi CẶP vũ công, trên một cửa sổ quanh playhead, tìm τ làm khớp nhất quỹ đạo
// tư thế của người này với người kia. residual(τ*) = khác biệt HÌNH DÁNG còn lại
// (bất biến theo trễ → canon cho ~0); τ* = độ trễ/sớm nhịp (phản hồi tập luyện:
// "bạn vào chậm 120ms"). Gộp theo từng người bằng TRUNG VỊ tới người khác (bền với
// 1 người phá nhịp). Nhờ đó formSync (đồng bộ hình dáng) cao ngay cả trong canon,
// trong khi groupSync tức thời thấp — hiệu hai chỉ số CHÍNH LÀ phần do timing.

/** Cấu hình căn pha (giây). Mặc định hợp với clip tổng hợp ~8s, tuần hoàn dưới-giây. */
export interface PhaseCfg {
  halfWindow: number; // nửa bề rộng cửa sổ quanh playhead
  samples: number; // số mẫu trong cửa sổ (lẻ để có mẫu ngay playhead)
  maxLag: number; // biên tìm τ (±)
  lagStep: number; // bước quét τ (độ phân giải tinh)
  // Tìm thô→tinh: quét thô với bước coarseFactor·lagStep rồi tinh chỉnh quanh cực
  // tiểu thô ở bước lagStep. Cho phép NỚI maxLag mà KHÔNG tăng chi phí O(nτ).
  // =1 ⇒ quét vét cạn (tương thích ngược, dùng khi cần kết quả tham chiếu chính xác).
  coarseFactor?: number;
  // Warping AFFINE (V37): ngoài DỊCH τ còn tìm NHỊP ρ, map thời gian mov là
  // m(w)=t*+ρ(w−t*)+τ. Tách TRÔI TEMPO khỏi SAI HÌNH DÁNG (ket-qua-warp-affine-*).
  // maxRate=0/undef ⇒ chỉ-dịch (ρ=1, hành vi cũ y hệt). ρ quét trong 1±maxRate.
  maxRate?: number; // biên nhịp quanh 1 (vd 0.25 ⇒ ρ∈[0.75,1.25])
  rateStep?: number; // bước tinh ρ
  rateCoarseFactor?: number; // hệ số thô cho ρ (bước thô = rateCoarseFactor·rateStep)
}
// maxLag=1.0s: đo thực nghiệm (ket-qua-gioi-han-rigid-tau.md, Phần A) cho thấy biên
// cũ 0.5s để lọt dải gãy trễ-hằng 0.9–1.05s (FP 100%); nới lên 1.0s (≈2 phách
// @120BPM) đóng dải đó, vẫn dưới 1 chu kỳ clip nên KHÔNG alias. coarseFactor=4 giữ
// chi phí ~25 phép/cặp (thấp hơn cả vét-cạn 0.5s cũ = 31) — xem ket-qua-tho-tinh.md.
// maxRate=0 (AFFINE TẮT mặc định): warping affine giảm residual TRÔI TEMPO trên CẶP
// cô lập (−56…−85%, ket-qua-warp-affine-nguyen-mau.md) NHƯNG đo trên TOÀN pipeline
// (ket-qua-affine-toan-pipeline.md) thì KHÔNG đáng 7× chi phí: nới maxLag ở V36 đã đẩy
// residual trôi tempo xuống dưới ngưỡng gác, formSync hiển thị vẫn ≥95% tới g=30% khi
// CHỈ-DỊCH; affine còn hơi TỆ hơn ở g nhỏ (sàn lưới ρ). Giữ mã affine làm TUỲ CHỌN
// (đặt maxRate>0) — có thể cần cho mocap THẬT (trôi lớn/phi tuyến) hoặc gác chặt hơn.
export const DEFAULT_PHASE: PhaseCfg = {
  halfWindow: 0.5,
  samples: 13,
  maxLag: 1.0,
  lagStep: 1 / 30,
  coarseFactor: 4,
  maxRate: 0, // affine tắt — xem lý do đo ở trên
  rateStep: 0.02,
  rateCoarseFactor: 4,
};

/**
 * Kết quả căn pha cho cả nhóm tại một thời điểm.
 * - `formResidual[k]`: lỗi HÌNH DÁNG của vũ công k = trung vị khác biệt tư thế (sau
 *   căn trễ tối ưu) tới người khác, mét. Canon lý tưởng → ~0; người múa sai → lớn.
 * - `lag[k]`: độ trễ NHỊP của k so với nhóm (giây), đã canh để trung vị nhóm = 0;
 *   dương = vào CHẬM, âm = vào SỚM. Ý nghĩa yếu khi formResidual lớn (không căn nổi).
 * - `formSpread`: trung bình formResidual (mét).
 * - `formSync`: exp(-formSpread/SCALE) = đồng bộ HÌNH DÁNG, đã bỏ phần timing.
 * - `worst`: chỉ số người có formResidual lớn nhất (chưa lọc nổi bật — xem
 *   `formOutlierIndex`).
 */
export interface PhaseAlign {
  formResidual: number[];
  lag: number[];
  formSpread: number;
  formSync: number;
  worst: number;
}

// Lấy mẫu tư thế vũ công `d` tại thời điểm treo `ts` (tự trừ timeOffset, dự phòng
// clip layout khi chuỗi rỗng). Ghi vào `out`.
function samplePoseAt(
  clips: Record<string, ClipData>,
  layout: ClipData,
  d: SyncDancer,
  ts: number,
  out: Float32Array
): void {
  if (!samplePoseSequence(clips, d.sequence, ts - d.timeOffset, out)) {
    samplePose(layout, ts - d.timeOffset, out);
  }
}

// Căn MỘT CẶP: `ref` cố định, `mov` dịch theo τ. Trả residual nhỏ nhất (mét, RMS
// khớp trên cửa sổ) và τ tối ưu = độ trễ của `mov` so với `ref` (τ>0: mov phải TIẾN
// tới để khớp ⇒ mov đang chậm hơn ref). `refWin` là các mẫu ref dựng sẵn (K×J*3).
function alignPair(
  clips: Record<string, ClipData>,
  layout: ClipData,
  refWin: Float32Array[],
  mov: SyncDancer,
  t: number,
  cfg: PhaseCfg,
  J: number,
  scratch: Float32Array
): { residual: number; lag: number } {
  const K = refWin.length;
  // Phần dư RMS khớp khi map thời gian mov AFFINE: m(w)=t+ρ(w−t)+τ (ρ=1 ⇒ chỉ dịch τ).
  const evalTR = (tau: number, rho: number): number => {
    let sq = 0;
    for (let s = 0; s < K; s++) {
      const ws = K === 1 ? t : t + ((s / (K - 1)) * 2 - 1) * cfg.halfWindow;
      const mapped = t + rho * (ws - t) + tau;
      samplePoseAt(clips, layout, mov, mapped, scratch);
      const A = refWin[s];
      for (let j = 0; j < J; j++) {
        const o = j * 3;
        const dx = A[o] - scratch[o];
        const dy = A[o + 1] - scratch[o + 1];
        const dz = A[o + 2] - scratch[o + 2];
        sq += dx * dx + dy * dy + dz * dz;
      }
    }
    return Math.sqrt(sq / (K * J));
  };

  // Lưới NHỊP ρ (thô→tinh). maxRate=0/undef ⇒ chỉ một mức ρ=1 (chỉ-dịch, hành vi cũ).
  const maxRate = Math.max(0, cfg.maxRate ?? 0);
  const rateStep = cfg.rateStep ?? 0.02;
  const rcf = Math.max(1, Math.round(cfg.rateCoarseFactor ?? 1));
  const rhoCoarseStep = rcf * rateStep;
  const rhoCoarse: number[] = [];
  if (maxRate > 1e-9) {
    const nR = Math.round((2 * maxRate) / rhoCoarseStep);
    for (let ri = 0; ri <= nR; ri++) rhoCoarse.push(1 - maxRate + ri * rhoCoarseStep);
  } else {
    rhoCoarse.push(1);
  }

  const cf = Math.max(1, Math.round(cfg.coarseFactor ?? 1));
  const coarseStep = cf * cfg.lagStep;
  const nCoarse = Math.round((2 * cfg.maxLag) / coarseStep);

  // PASS THÔ (2D): quét τ×ρ. Bề mặt residual trơn nên lưới thô đủ tìm lòng chảo chính.
  let best = Infinity;
  let bestLag = 0;
  let bestRho = 1;
  for (const rho of rhoCoarse) {
    for (let ti = 0; ti <= nCoarse; ti++) {
      const tau = -cfg.maxLag + ti * coarseStep;
      const rms = evalTR(tau, rho);
      if (rms < best) {
        best = rms;
        bestLag = tau;
        bestRho = rho;
      }
    }
  }
  // PASS TINH (2D): tinh chỉnh trong hộp ±coarseStep×±rhoCoarseStep quanh cực tiểu thô.
  const fineTau = coarseStep > cfg.lagStep + 1e-9;
  const fineRho = maxRate > 1e-9 && rhoCoarseStep > rateStep + 1e-9;
  if (fineTau || fineRho) {
    const loT = fineTau ? Math.max(-cfg.maxLag, bestLag - coarseStep) : bestLag;
    const hiT = fineTau ? Math.min(cfg.maxLag, bestLag + coarseStep) : bestLag;
    const nFT = fineTau ? Math.round((hiT - loT) / cfg.lagStep) : 0;
    const loR = fineRho ? Math.max(1 - maxRate, bestRho - rhoCoarseStep) : bestRho;
    const hiR = fineRho ? Math.min(1 + maxRate, bestRho + rhoCoarseStep) : bestRho;
    const nFR = fineRho ? Math.round((hiR - loR) / rateStep) : 0;
    for (let ri = 0; ri <= nFR; ri++) {
      const rho = loR + ri * rateStep;
      for (let ti = 0; ti <= nFT; ti++) {
        const tau = loT + ti * cfg.lagStep;
        const rms = evalTR(tau, rho);
        if (rms < best) {
          best = rms;
          bestLag = tau;
          bestRho = rho;
        }
      }
    }
  }
  return { residual: best, lag: bestLag };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Căn pha cả nhóm tại `t`: phân rã mỗi vũ công thành lỗi HÌNH DÁNG (formResidual)
 * và độ TRỄ nhịp (lag), gộp theo trung vị từng-cặp. `null` nếu <2 vũ công.
 * Chi phí O(n²·nτ·K·J) — nhỏ với n≤~10; người gọi nên tiết lưu (không chạy 60fps).
 */
export function phaseAlignAt(
  clips: Record<string, ClipData>,
  layout: ClipData,
  dancers: SyncDancer[],
  t: number,
  cfg: PhaseCfg = DEFAULT_PHASE
): PhaseAlign | null {
  const n = dancers.length;
  if (n < 2) return null;
  const J = layout.jointNames.length;
  const K = Math.max(1, cfg.samples);

  // Cửa sổ tư thế dựng sẵn cho TỪNG người (mỗi người là `ref` một lần).
  const wins: Float32Array[][] = [];
  for (let i = 0; i < n; i++) {
    const w: Float32Array[] = [];
    for (let s = 0; s < K; s++) {
      const ws = K === 1 ? t : t + ((s / (K - 1)) * 2 - 1) * cfg.halfWindow;
      const p = new Float32Array(J * 3);
      samplePoseAt(clips, layout, dancers[i], ws, p);
      w.push(p);
    }
    wins.push(w);
  }

  const scratch = new Float32Array(J * 3);
  // res[i][j] = residual (đối xứng); lagRel[i][j] = trễ của i so với j (phản đối xứng).
  const res: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const lagRel: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0)
  );
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // ref = i, mov = j ⇒ lag = trễ của j so với i.
      const r = alignPair(clips, layout, wins[i], dancers[j], t, cfg, J, scratch);
      res[i][j] = r.residual;
      res[j][i] = r.residual;
      lagRel[j][i] = r.lag; // j so với i
      lagRel[i][j] = -r.lag; // i so với j
    }
  }

  // Gộp theo từng người: trung vị tới người khác.
  const formResidual = new Array(n).fill(0);
  const lagRaw = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    const rs: number[] = [];
    const ls: number[] = [];
    for (let j = 0; j < n; j++)
      if (j !== k) {
        rs.push(res[k][j]);
        ls.push(lagRel[k][j]);
      }
    formResidual[k] = median(rs);
    lagRaw[k] = median(ls);
  }
  // Canh trễ về trung vị nhóm = 0 (pha tuyệt đối của nhóm là tuỳ ý).
  const lagCenter = median(lagRaw);
  const lag = lagRaw.map((x) => x - lagCenter);

  let spreadSum = 0;
  let worst = 0;
  let worstV = -1;
  for (let k = 0; k < n; k++) {
    spreadSum += formResidual[k];
    if (formResidual[k] > worstV) {
      worstV = formResidual[k];
      worst = k;
    }
  }
  const formSpread = spreadSum / n;
  return {
    formResidual,
    lag,
    formSpread,
    formSync: Math.exp(-formSpread / SCALE),
    worst,
  };
}

/**
 * Người múa SAI ĐỘNG TÁC nổi bật nhất (lỗi hình dáng thật, không phải chỉ trễ nhịp),
 * hoặc `null` nếu không nên nêu ai. Cùng logic gác như `outlierIndex` nhưng trên
 * formResidual: nhờ vậy CANON (mọi formResidual ~0) KHÔNG gọi tên ai — khắc phục
 * đúng giới hạn V34 đã đo.
 */
export function formOutlierIndex(pa: PhaseAlign): number | null {
  if (pa.formSync >= OUTLIER_SYNC_GATE) return null;
  const n = pa.formResidual.length;
  if (n < 2) return null;
  const worst = pa.worst;
  const worstV = pa.formResidual[worst];
  if (worstV < OUTLIER_FLOOR) return null;
  let sumOthers = 0;
  for (let i = 0; i < n; i++) if (i !== worst) sumOthers += pa.formResidual[i];
  const meanOthers = sumOthers / (n - 1);
  if (worstV < meanOthers * OUTLIER_RATIO) return null;
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
