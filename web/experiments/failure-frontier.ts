// THỰC NGHIỆM V40 (bản đồ BIÊN GÃY): đo chỗ metric tách-pha ĐÃ SHIP (V36 chỉ-dịch)
// còn GÃY, để QUYẾT ĐỊNH có đáng xây nấc warping kế tiếp (SRVF/DTW đàn hồi) hay KHÔNG.
// ---------------------------------------------------------------------------
// Bài học V37–39: nấc affine τ×ρ đẹp trên cặp cô lập nhưng KHÔNG chuyển thành lợi ích ở
// TOÀN pipeline (V36 nới cửa sổ đã hấp thụ trôi tempo tuyến tính). Trước khi xây SRVF/DTW
// (đắt hơn nhiều), phải ĐO: sau V36, CÒN chế độ nào metric chỉ-dịch thật sự gãy ở mức
// pipeline không? Lý thuyết warping nói constant-τ (và cả constant-ρ affine) KHÔNG xử được:
//   (A) TRÔI TEMPO PHI TUYẾN trong cửa sổ (gia/giảm tốc) — nhịp biến thiên NGAY trong 1s.
//   (B) Lỗi KÉP: vừa lệch thời gian (canon) VỪA sai hình dáng — nguyên mẫu affine đã ghi
//       "chưa tách riêng". Metric phải GỠ được timing mà VẪN bắt lỗi form (TP), không lẫn.
//   (C) Canon τ VƯỢT maxLag (trễ rất lớn) — gộp trung vị có cứu khỏi báo giả không?
//
// So 2 cấu hình để biết affine có cứu (A) không hay THẬT SỰ cần SRVF:
//   CHỈ-DỊCH = DEFAULT_PHASE đã ship (maxRate:0).   AFFINE = maxRate:0.25.
// Nếu CHỈ-DỊCH gãy ở (A) mà AFFINE cũng gãy ⇒ chỉ SRVF/DTW mới giải ⇒ có cơ sở xây tiếp.
// Nếu CHỈ-DỊCH KHÔNG gãy ở đâu ⇒ metric đã đủ, DỪNG (kết luận có giá trị, khỏi thêm phức tạp).
//
// Tái lập (trong web/):
//   npx esbuild experiments/failure-frontier.ts --bundle --platform=node --format=cjs --outfile=ff.cjs && node ff.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, formOutlierIndex, DEFAULT_PHASE, type SyncDancer, type PhaseCfg } from "../src/sync";

const J = 17;
const REST: number[][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45;

// Clip tổng quát: khớp `movers` dao động Y sin theo PHA nội tại phi(t) (t = giây trong clip).
// phi = identity ⇒ nhịp đều (tham chiếu). phi phi tuyến ⇒ nhịp biến thiên.
function buildClipPhi(movers: number[], phi: (t: number) => number): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const s = Math.sin((2 * Math.PI * phi(f / FPS)) / PERIOD);
    const p = REST.map((q) => [q[0], q[1], q[2]]);
    for (const j of movers) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    frames.push(p);
  }
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}
const linear = (t: number) => t;

const CFG_SHIFT: PhaseCfg = { ...DEFAULT_PHASE, maxRate: 0 }; // đã ship
const CFG_AFFINE: PhaseCfg = { ...DEFAULT_PHASE, maxRate: 0.25, rateStep: 0.02, rateCoarseFactor: 4 };

const N = 5, T0 = 0.8, T1 = 7.2, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const pct = (x: number) => Math.round((100 * x) / NT);

// Chạy 1 kịch bản: clip mover cho người 0, còn lại tham chiếu tuyến tính. Trả FP & formSync TB.
function scan(movA: ClipData, movD: ClipData, offset0: number, cfg: PhaseCfg) {
  const clips = { A: movA, D: movD };
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: [k === 0 ? "D" : "A"], timeOffset: k === 0 ? offset0 : 0,
  }));
  let fp = 0, fsSum = 0, nn = 0, tp = 0;
  for (const t of times) {
    const pa = phaseAlignAt(clips, clips.A, dancers, t, cfg);
    if (!pa) continue;
    const idx = formOutlierIndex(pa);
    if (idx !== null) fp++;
    if (idx === 0) tp++;
    fsSum += pa.formSync; nn++;
  }
  return { fp: pct(fp), tp: pct(tp), fs: (100 * fsSum) / nn };
}

const refA = buildClipPhi([3, 4], linear);

// ── (A) TRÔI TEMPO PHI TUYẾN trong cửa sổ: phi(t)=t + A·sin(2π t/Tosc), Tosc=2.0s ≈ cỡ
// cửa sổ ±0.5s → nhịp tức thời DAO ĐỘNG NGAY trong cửa sổ khớp. Không sai hình dáng (cùng
// khớp [3,4]) → FP mong muốn 0. Constant-τ và constant-ρ đều KHÔNG cancel được; chỉ SRVF. ──
console.log("# (A) TRÔI TEMPO PHI TUYẾN (nhịp dao động trong cửa sổ) — người 0, KHÔNG sai hình dáng.");
console.log("# phi(t)=t+A·sin(2π t/2.0). FP phải 0; formSync cao=đúng. So CHỈ-DỊCH vs AFFINE.");
console.log("A(m) | FP dịch | FP affine | fSync dịch | fSync affine");
console.log("-----|---------|-----------|------------|-------------");
for (const A of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
  const movD = buildClipPhi([3, 4], (t) => t + A * Math.sin((2 * Math.PI * t) / 2.0));
  const s = scan(refA, movD, 0, CFG_SHIFT);
  const a = scan(refA, movD, 0, CFG_AFFINE);
  console.log(
    `${A.toFixed(1)}  |   ${String(s.fp).padStart(3)}%  |    ${String(a.fp).padStart(3)}%   |     ${s.fs.toFixed(0).padStart(3)}    |     ${a.fs.toFixed(0).padStart(3)}`
  );
}

// ── (B) LỖI KÉP: người 0 vừa CANON trễ τ VỪA múa động tác khác (khớp B=[6,7]). Metric phải
// GỠ timing (tìm lag) mà VẪN bắt lỗi form → TP cao. Nếu TP tụt khi τ tăng ⇒ timing che form. ──
console.log("\n# (B) LỖI KÉP — người 0 trễ τ HẰNG + múa B (sai hình dáng). TP phải giữ ~100.");
console.log("τ(s)  | TP dịch | TP affine | fSync dịch | fSync affine");
console.log("------|---------|-----------|------------|-------------");
const movB = buildClipPhi([6, 7], linear);
for (const tau of [0, 0.2, 0.4, 0.6, 0.8]) {
  const s = scan(refA, movB, tau, CFG_SHIFT);
  const a = scan(refA, movB, tau, CFG_AFFINE);
  console.log(
    `${tau.toFixed(1)}  |   ${String(s.tp).padStart(3)}%  |    ${String(a.tp).padStart(3)}%   |     ${s.fs.toFixed(0).padStart(3)}    |     ${a.fs.toFixed(0).padStart(3)}`
  );
}

// ── (C) CANON τ VƯỢT maxLag: người 0 trễ HẰNG τ từ 0.5→1.6s (maxLag=1.0). KHÔNG sai hình
// dáng → FP mong muốn 0. Quá maxLag, lag bão hoà → residual dư → có báo giả không? Gộp trung
// vị 5 người có cứu (chỉ 1 người lệch) không? ──
console.log("\n# (C) CANON τ VƯỢT maxLag (=1.0s) — người 0 trễ τ HẰNG, KHÔNG sai hình dáng. FP phải 0.");
console.log("τ(s)  | FP dịch | fSync dịch | ghi chú");
console.log("------|---------|------------|--------");
for (const tau of [0.5, 0.8, 1.0, 1.2, 1.4, 1.6]) {
  const s = scan(refA, buildClipPhi([3, 4], linear), tau, CFG_SHIFT);
  const note = tau <= 1.0 ? "trong biên" : "VƯỢT biên";
  console.log(`${tau.toFixed(1)}  |   ${String(s.fp).padStart(3)}%  |     ${s.fs.toFixed(0).padStart(3)}    | ${note}`);
}

console.log("\n# Đọc: (A) nếu CHỈ-DỊCH & AFFINE cùng gãy (FP>0 / fSync tụt) ⇒ SRVF/DTW có cơ sở.");
console.log("# (B) TP giữ 100 ⇒ metric gỡ được timing mà vẫn bắt lỗi form (không lẫn). (C) FP 0");
console.log("# kể cả quá maxLag ⇒ gộp trung vị + clip tuần hoàn tự cứu, không cần nới thêm.");
