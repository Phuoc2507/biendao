// THỰC NGHIỆM V36: tìm τ THÔ→TINH + nới maxLag đóng dải gãy trễ-hằng.
// ---------------------------------------------------------------------------
// Bằng chứng động cơ: ket-qua-gioi-han-rigid-tau.md Phần A cho thấy biên cũ maxLag=0.5s
// để lọt dải gãy τ∈[0.9,1.05]s (FP 100%). Nới maxLag lên 1.0s đóng dải đó, nhưng quét
// vét cạn tăng chi phí gấp đôi (O(nτ)). Giải: quét THÔ (bước 4·lagStep) cả biên rồi
// TINH chỉnh quanh cực tiểu thô. Thực nghiệm này ĐO 4 điều:
//   1. Dải gãy 0.9–1.05s có ĐÓNG khi maxLag=1.0 không?
//   2. Thô→tinh có KHỚP vét-cạn (không mất chính xác do làm thô) không?
//   3. Chi phí (số phép/cặp + thời gian thực) có KHÔNG vượt vét-cạn 0.5s cũ không?
//   4. Có HỒI QUY phát hiện lỗi thật (TP) không?
//   + Biên gãy MỚI nằm đâu (nới tới đâu thì alias)?
//
// Tái lập (trong web/):
//   npx esbuild experiments/coarse-to-fine.ts --bundle --platform=node --format=cjs --outfile=c2f.cjs && node c2f.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, formOutlierIndex, type SyncDancer, type PhaseCfg } from "../src/sync";

const J = 17;
const REST: [number, number, number][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45;

// Clip múa: `movers` = khớp dao động Y theo sin (A=[3,4] tay phải, B=[6,7] tay trái).
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
const clips = { A: buildClip([3, 4]), B: buildClip([6, 7]) };

const BASE = { halfWindow: 0.5, samples: 13, lagStep: 1 / 30 };
const CFGS: Record<string, PhaseCfg> = {
  "cũ  vét-cạn 0.5s": { ...BASE, maxLag: 0.5, coarseFactor: 1 },
  "vét-cạn 1.0s   ": { ...BASE, maxLag: 1.0, coarseFactor: 1 },
  "THÔ→TINH 1.0s  ": { ...BASE, maxLag: 1.0, coarseFactor: 4 },
};
// Số phép đánh giá residual / mỗi HƯỚNG cặp (nội suy, vùng trong biên).
function evalCount(cfg: PhaseCfg): number {
  const cf = Math.max(1, Math.round(cfg.coarseFactor ?? 1));
  const coarse = Math.round((2 * cfg.maxLag) / (cf * cfg.lagStep)) + 1;
  if (cf === 1) return coarse;
  const fine = Math.round((2 * cf * cfg.lagStep) / cfg.lagStep) + 1; // ±coarseStep
  return coarse + fine;
}

const N = 5, T0 = 0.6, T1 = 7.4, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const pct = (x: number) => Math.round((100 * x) / NT);

// ── PHẦN 1 — ĐÓNG DẢI GÃY: echo trễ τ HẰNG, KHÔNG ai sai → mọi FP = báo giả ──
console.log("# PHẦN 1 — FP_phase (%) theo τ echo, 3 cấu hình. KHÔNG ai sai → FP mong muốn = 0.");
const TAUS = [0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.5, 1.7];
const names = Object.keys(CFGS);
console.log(`τ(s) | ${names.join(" | ")}`);
console.log(`-----|-${names.map((n) => "-".repeat(n.length)).join("-|-")}-`);
for (const tau of TAUS) {
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: ["A"], timeOffset: k === 0 ? tau : 0,
  }));
  const cells = names.map((nm) => {
    let fp = 0;
    for (const t of times) {
      const pa = phaseAlignAt({ A: clips.A }, clips.A, dancers, t, CFGS[nm]);
      if (pa && formOutlierIndex(pa) !== null) fp++;
    }
    return String(pct(fp)).padStart(Math.max(4, nm.length)) + "%";
  });
  console.log(`${tau.toFixed(2)} | ${cells.join(" | ")}`);
}

// ── PHẦN 2 — CHI PHÍ: số phép/hướng-cặp + thời gian thực 1 lượt phaseAlignAt ──
console.log("\n# PHẦN 2 — chi phí mỗi cấu hình (thấp hơn = nhanh hơn).");
console.log("cấu hình         | phép/cặp | thời-gian-tương-đối");
console.log("-----------------|----------|--------------------");
const warm: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
  sequence: ["A"], timeOffset: k === 0 ? 0.3 : 0,
}));
for (const nm of names) {
  // đo thời gian: lặp nhiều lượt cho ổn định
  const REP = 400;
  const t0 = performance.now();
  for (let r = 0; r < REP; r++)
    for (const t of times) phaseAlignAt({ A: clips.A }, clips.A, warm, t, CFGS[nm]);
  const ms = performance.now() - t0;
  console.log(`${nm} |   ${String(evalCount(CFGS[nm])).padStart(4)}   |   ${ms.toFixed(0).padStart(5)} ms (×${REP})`);
}

// ── PHẦN 3 — KHỚP vét-cạn? So từng-thời-điểm formResidual thô→tinh vs vét-cạn 1.0 ──
console.log("\n# PHẦN 3 — thô→tinh có khớp vét-cạn 1.0s? (sai khác formResidual, mm)");
let maxDiff = 0, sumDiff = 0, cnt = 0;
for (const tau of [0.3, 0.6, 0.9, 1.05]) {
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: ["A"], timeOffset: k === 0 ? tau : 0,
  }));
  for (const t of times) {
    const a = phaseAlignAt({ A: clips.A }, clips.A, dancers, t, CFGS["vét-cạn 1.0s   "]);
    const b = phaseAlignAt({ A: clips.A }, clips.A, dancers, t, CFGS["THÔ→TINH 1.0s  "]);
    if (!a || !b) continue;
    for (let k = 0; k < N; k++) {
      const d = Math.abs(a.formResidual[k] - b.formResidual[k]) * 1000;
      maxDiff = Math.max(maxDiff, d);
      sumDiff += d; cnt++;
    }
  }
}
console.log(`sai khác lớn nhất = ${maxDiff.toFixed(2)} mm | trung bình = ${(sumDiff / cnt).toFixed(3)} mm`);

// ── PHẦN 4 — KHÔNG hồi quy bắt lỗi THẬT: 1 người múa B (sai hình dáng thật) ──
console.log("\n# PHẦN 4 — lỗi THẬT (người 0 múa B): TP=gọi đúng người 0, misID=gọi nhầm.");
console.log("cấu hình         | TP(%) | misID(%)");
console.log("-----------------|-------|---------");
for (const nm of names) {
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: [k === 0 ? "B" : "A"], timeOffset: 0,
  }));
  let tp = 0, mis = 0;
  for (const t of times) {
    const pa = phaseAlignAt(clips, clips.A, dancers, t, CFGS[nm]);
    if (!pa) continue;
    const idx = formOutlierIndex(pa);
    if (idx === 0) tp++;
    else if (idx !== null) mis++;
  }
  console.log(`${nm} |  ${String(pct(tp)).padStart(3)}  |   ${String(pct(mis)).padStart(3)}`);
}
