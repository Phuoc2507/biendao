// THỰC NGHIỆM GIỚI HẠN: rigid-τ (trễ HẰNG) gãy ở đâu? — đo để định biên demo V35.
// ---------------------------------------------------------------------------
// V35 dùng trường hợp RIGID của warping: một độ trễ HẰNG τ trong biên ±maxLag. Thực
// nghiệm này ĐO ĐỊNH LƯỢNG hai chỗ nó phải gãy, để (a) ghi biên hợp lệ trung thực và
// (b) có bằng chứng cân nhắc warping đàn hồi (SRVF/DTW) cho V36.
//
//   PHẦN A — TRỄ VƯỢT CỬA SỔ: 1 người echo trễ τ HẰNG, quét τ qua cả mốc maxLag=0.5s.
//     Bộ quét τ chỉ tới ±0.5s → khi τ>0.5s KHÔNG căn nổi → phần dư phồng → báo giả.
//     Kỳ vọng: phase sạch 0 tới ~maxLag rồi leo. Đây là ranh giới "canon tối đa" demo đỡ được.
//   PHẦN B — TRỄ BIẾN THIÊN (trôi nhịp/đổi tempo): 1 người múa A nhưng TEMPO lệch (1+g)×,
//     nên độ trễ THAY ĐỔI trong cửa sổ → không một τ HẰNG nào căn khớp → phần dư sàn>0.
//     Sự thật nền: người đó KHÔNG sai HÌNH DÁNG (cùng pose, chỉ tái tham số thời gian) →
//     mọi lần bị gọi "sai động tác" là do xấp xỉ rigid thất bại (elastic warping sẽ đỡ được).
//
// Tái lập (trong web/):
//   npx esbuild experiments/phase-limits.ts --bundle --platform=node --format=cjs --outfile=lim.cjs && node lim.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, formOutlierIndex, DEFAULT_PHASE, type SyncDancer } from "../src/sync";

const J = 17;
const REST: [number, number, number][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45;

// Pose giải tích của động tác A (vung tay phải) tại thời điểm bất kỳ (giây).
function poseA(t: number): number[][] {
  const s = Math.sin((2 * Math.PI * t) / PERIOD);
  const p = REST.map((q) => [q[0], q[1], q[2]]);
  for (const j of [3, 4]) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
  return p;
}
// Clip A chuẩn (tempo 1). `warp` = hệ số tempo: frame f lấy pose tại t·warp (trôi nhịp).
function buildA(warp = 1): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) frames.push(poseA((f / FPS) * warp));
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}

const N = 5, T0 = 0.6, T1 = 7.4, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const pct = (x: number) => Math.round((100 * x) / NT);

// ── PHẦN A — TRỄ HẰNG VƯỢT CỬA SỔ ────────────────────────────────────────────
console.log("# PHẦN A — trễ canon HẰNG τ vượt cửa sổ (maxLag=%ss)", DEFAULT_PHASE.maxLag);
console.log("# 1 người echo trễ τ, N=5, KHÔNG ai sai → mọi lần gọi tên = báo giả (FP).");
console.log("τ(s) | FP_phase | formResid_echo(cm) | lag_đo_được(ms)");
console.log("-----|----------|--------------------|-----------------");
const clipsA = { A: buildA(1) };
const A_TAUS = [0.2, 0.35, 0.45, 0.5, 0.6, 0.75, 0.9, 1.05, 1.2];
for (const tau of A_TAUS) {
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: ["A"], timeOffset: k === 0 ? tau : 0,
  }));
  let fp = 0, residSum = 0, lagSum = 0, nn = 0;
  for (const t of times) {
    const pa = phaseAlignAt(clipsA, clipsA.A, dancers, t);
    if (!pa) continue;
    if (formOutlierIndex(pa) !== null) fp++;
    residSum += pa.formResidual[0];
    lagSum += pa.lag[0];
    nn++;
  }
  console.log(
    `${tau.toFixed(2)} |   ${String(pct(fp)).padStart(3)}%   |       ${(
      (100 * residSum) / nn
    ).toFixed(1).padStart(5)}        |   ${((1000 * lagSum) / nn).toFixed(0).padStart(5)}`
  );
}

// ── PHẦN B — TRỄ BIẾN THIÊN (trôi tempo) ─────────────────────────────────────
console.log("");
console.log("# PHẦN B — 1 người trôi TEMPO (1+g)×: độ trễ biến thiên trong cửa sổ.");
console.log("# Sự thật: KHÔNG sai hình dáng (cùng pose, chỉ đổi tham số thời gian).");
console.log("# Mọi FP = xấp xỉ rigid-τ thất bại (elastic warping sẽ đỡ).");
console.log("g (%/s) | FP_phase | formResid_drift(cm) | formSync nhóm(%)");
console.log("--------|----------|---------------------|-----------------");
const B_GS = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3];
for (const g of B_GS) {
  const clips = { A: buildA(1), D: buildA(1 + g) };
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: [k === 0 ? "D" : "A"], timeOffset: 0,
  }));
  let fp = 0, residSum = 0, fsSum = 0, nn = 0;
  for (const t of times) {
    const pa = phaseAlignAt(clips, clips.A, dancers, t);
    if (!pa) continue;
    if (formOutlierIndex(pa) !== null) fp++;
    residSum += pa.formResidual[0];
    fsSum += pa.formSync;
    nn++;
  }
  console.log(
    `  ${(100 * g).toFixed(0).padStart(3)}   |   ${String(pct(fp)).padStart(3)}%   |       ${(
      (100 * residSum) / nn
    ).toFixed(1).padStart(5)}         |      ${((100 * fsSum) / nn).toFixed(0).padStart(3)}`
  );
}
