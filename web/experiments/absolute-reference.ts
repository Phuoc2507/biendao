// THỰC NGHIỆM V42 (capstone đánh giá): chấm TUYỆT ĐỐI theo tham chiếu có PHÁ được trần
// nhận dạng 50% của chấm nhóm-tương-đối (V41) không — và có GIỮ bất biến pha (canon) không?
// ---------------------------------------------------------------------------
// V41 chứng minh: chấm NHÓM-TƯƠNG-ĐỐI (formOutlierIndex, tham chiếu = trung vị đồng thuận)
// sụp ở 50% — quá đó không tham chiếu NGOÀI thì bài toán không nhận dạng. Lối thoát nguyên
// lý: THAM CHIẾU TUYỆT ĐỐI. Trong DAW, "vũ đạo dự định" = clip được gán; ở mocap THẬT,
// tham chiếu = chính clip vũ đạo, quan sát = tái dựng mocap. Chấm tuyệt đối = căn PHA mỗi
// vũ công vào clip THAM CHIẾU (khử canon bằng cùng bộ tìm τ) rồi lấy residual = lỗi HÌNH DÁNG.
// Không đồng thuận → KHÔNG có điểm sụp: đúng/sai đo độc lập từng người, bất kể bao nhiêu
// người sai. Đo 3 điều: (1) KHÔNG sụp (bắt đủ k người sai, k=1..N−1); (2) BẤT BIẾN PHA
// (vũ công múa ĐÚNG nhưng trễ canon τ → residual ~0, không bị buộc tội); (3) tương phản
// trực tiếp với cờ nhóm-tương-đối ở cùng k.
//
// Tái lập (trong web/):
//   npx esbuild experiments/absolute-reference.ts --bundle --platform=node --format=cjs --outfile=ar.cjs && node ar.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, formOutlierIndex, DEFAULT_PHASE, type SyncDancer } from "../src/sync";
import { samplePoseSequence } from "../src/clip";

const J = 17;
const REST: number[][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45;

function buildClip(movers: number[]): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const s = Math.sin((2 * Math.PI * (f / FPS)) / PERIOD);
    const p = REST.map((q) => [q[0], q[1], q[2]]);
    for (const j of movers) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    frames.push(p);
  }
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}

const REF = buildClip([3, 4]); // clip vũ đạo (tham chiếu tuyệt đối)
const WRONG: ClipData[] = [
  buildClip([6, 7]), buildClip([9, 12]), buildClip([10, 13]),
  buildClip([2, 5]), buildClip([4, 7]), buildClip([3, 6]),
];

// Cấu hình căn pha (khớp DEFAULT_PHASE để so sánh công bằng).
const HALF = DEFAULT_PHASE.halfWindow, K = DEFAULT_PHASE.samples;
const MAXLAG = DEFAULT_PHASE.maxLag, LSTEP = DEFAULT_PHASE.lagStep;
const FLOOR = 0.05; // 5cm — cùng ngưỡng OUTLIER_FLOOR của bộ nhóm-tương-đối.

// Residual hình dáng TUYỆT ĐỐI: căn pha clip vũ công vào REF quanh playhead t (quét τ),
// trả RMS tối thiểu (mét). Bất biến canon vì tối thiểu theo τ.
function absResidual(dancerClip: ClipData, offset: number, t: number): number {
  const ref: Float32Array[] = [];
  const obs: Float32Array[] = [];
  for (let s = 0; s < K; s++) {
    const ws = t + ((s / (K - 1)) * 2 - 1) * HALF;
    const pr = new Float32Array(J * 3);
    samplePoseSequence({ R: REF }, ["R"], ws, pr); // pha tham chiếu
    ref.push(pr);
  }
  let best = Infinity;
  for (let tau = -MAXLAG; tau <= MAXLAG + 1e-9; tau += LSTEP) {
    let sq = 0;
    for (let s = 0; s < K; s++) {
      const ws = t + ((s / (K - 1)) * 2 - 1) * HALF;
      const po = new Float32Array(J * 3);
      samplePoseSequence({ D: dancerClip }, ["D"], ws + tau - offset, po);
      for (let j = 0; j < J; j++) {
        const o = j * 3;
        const dx = ref[s][o] - po[o], dy = ref[s][o + 1] - po[o + 1], dz = ref[s][o + 2] - po[o + 2];
        sq += dx * dx + dy * dy + dz * dz;
      }
    }
    const rms = Math.sqrt(sq / (K * J));
    if (rms < best) best = rms;
  }
  return best;
}

const N = 7, T0 = 0.6, T1 = 7.4, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const pct = (x: number) => Math.round((100 * x) / NT);

// ── (1)+(3) KHÔNG SỤP + tương phản với nhóm-tương-đối. k người sai ĐỒNG DẠNG (ca V41 vu oan). ──
console.log("# (1)+(3) k người sai ĐỒNG DẠNG (WRONG[0]), N=7. TUYỆT ĐỐI vs NHÓM-TƯƠNG-ĐỐI.");
console.log("# abs: TB số người bị cờ tuyệt đối bắt đúng/khung. rel: cờ nhóm nêu đúng(hit)/vu oan.");
console.log("k | k/N  | abs bắt đúng (TB/khung) | abs vu oan | rel hit | rel vu oan");
console.log("--|------|-------------------------|------------|---------|----------");
for (let k = 0; k <= N - 1; k++) {
  const clipMap: Record<string, ClipData> = { A: REF };
  const dancers: SyncDancer[] = [];
  for (let d = 0; d < N; d++) {
    if (d < k) { clipMap["W0"] = WRONG[0]; dancers.push({ sequence: ["W0"], timeOffset: 0 }); }
    else dancers.push({ sequence: ["A"], timeOffset: 0 });
  }
  let absHitSum = 0, absFalse = 0, relHit = 0, relFalse = 0;
  for (const t of times) {
    // chấm tuyệt đối từng người
    let hits = 0, falses = 0;
    for (let d = 0; d < N; d++) {
      const clip = d < k ? WRONG[0] : REF;
      const r = absResidual(clip, 0, t);
      const flagged = r >= FLOOR;
      if (flagged && d < k) hits++;
      if (flagged && d >= k) falses++;
    }
    absHitSum += hits;
    if (falses > 0) absFalse++;
    // chấm nhóm-tương-đối (cùng dữ liệu)
    const pa = phaseAlignAt(clipMap, REF, dancers, t, DEFAULT_PHASE);
    if (pa) {
      const idx = formOutlierIndex(pa);
      if (idx !== null && idx < k) relHit++;
      else if (idx !== null) relFalse++;
    }
  }
  console.log(
    `${k} | ${(k / N).toFixed(2)} |          ${(absHitSum / NT).toFixed(2)} / ${k}` +
    `${k < 10 ? "  " : " "}          |    ${String(pct(absFalse)).padStart(3)}%    |  ${String(pct(relHit)).padStart(3)}%  |   ${String(pct(relFalse)).padStart(3)}%`
  );
}

// ── (2) BẤT BIẾN PHA: 1 vũ công múa ĐÚNG (REF) nhưng trễ canon τ. abs residual phải ~0. ──
console.log("\n# (2) BẤT BIẾN PHA — vũ công múa ĐÚNG nhưng trễ canon τ. abs residual (cm) phải ~0.");
console.log("τ(s)  | abs residual TB (cm) | bị cờ tuyệt đối?");
console.log("------|----------------------|------------------");
for (const tau of [0, 0.2, 0.4, 0.6, 0.8]) {
  let sum = 0, flagged = 0;
  for (const t of times) {
    const r = absResidual(REF, tau, t);
    sum += r;
    if (r >= FLOOR) flagged++;
  }
  console.log(`${tau.toFixed(1)}  |        ${(100 * sum / NT).toFixed(2).padStart(5)}         |     ${pct(flagged)}%`);
}

console.log("\n# Đọc: (1) abs bắt ĐỦ k người sai ở MỌI k (không sụp ở 50%), vu oan 0% — vì đo độc");
console.log("# lập từng người với clip vũ đạo, không đồng thuận. (2) trễ canon → residual ~0 nhờ");
console.log("# tối thiểu theo τ → không buộc tội người đúng-mà-trễ. ⇒ chấm tuyệt đối phá trần 50%");
console.log("# KHI có clip tham chiếu; bù cho chấm nhóm-tương-đối (dành cho mocap thật không nhãn).");
