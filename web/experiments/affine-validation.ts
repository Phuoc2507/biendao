// THỰC NGHIỆM V37 (xác nhận sản xuất): warping affine trên TOÀN pipeline gộp-cặp+gác.
// ---------------------------------------------------------------------------
// Nguyên mẫu (ket-qua-warp-affine-nguyen-mau.md) đo trên CẶP cô lập. Ở đây xác nhận trên
// mã đã ship phaseAlignAt+formOutlierIndex (gộp trung vị 5 người + logic gác), cô lập
// đúng tác dụng của NHỊP ρ bằng cách chỉ đổi maxRate (mọi tham số khác giữ nguyên):
//   CHỈ-DỊCH  = {...DEFAULT, maxRate:0}  (ρ=1, rigid-τ thô→tinh 1.0s)
//   AFFINE    = DEFAULT                  (ρ∈[0.75,1.25])
// Kiểm 4 điều: (1) affine DẬP báo giả TRÔI TEMPO, (2) KHÔNG hồi quy echo (FP vẫn 0),
// (3) KHÔNG hồi quy lỗi thật (TP 100, misID 0), (4) chi phí còn hợp thời-gian-thực.
//
// Tái lập (trong web/):
//   npx esbuild experiments/affine-validation.ts --bundle --platform=node --format=cjs --outfile=av.cjs && node av.cjs

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

// Clip: `movers` dao động Y sin; `warp` = hệ số tempo (frame f lấy pose tại t·warp).
function buildClip(movers: number[], warp = 1): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const s = Math.sin((2 * Math.PI * ((f / FPS) * warp)) / PERIOD);
    const p = REST.map((q) => [q[0], q[1], q[2]]);
    for (const j of movers) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    frames.push(p);
  }
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}

// Cô lập đúng tác dụng của NHỊP ρ: chỉ khác maxRate. DEFAULT_PHASE hiện maxRate:0
// (affine tắt) nên CHỈ-DỊCH = DEFAULT; AFFINE bật ρ∈[0.75,1.25].
const CFG_SHIFT: PhaseCfg = { ...DEFAULT_PHASE, maxRate: 0 };
const CFG_AFFINE: PhaseCfg = { ...DEFAULT_PHASE, maxRate: 0.25, rateStep: 0.02, rateCoarseFactor: 4 };

const N = 5, T0 = 0.6, T1 = 7.4, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const pct = (x: number) => Math.round((100 * x) / NT);

// ── (1) TRÔI TEMPO: người 0 múa A nhưng tempo (1+g)×; KHÔNG ai sai.
// Đo CẢ cờ FP LẪN chỉ số formSync HIỂN THỊ (app show %). Cờ có thể đã 0 nhờ V36 nới
// cửa sổ, nhưng formSync là thứ NGƯỜI DÙNG đọc — affine phải cho formSync ĐÚNG hơn
// (cao hơn: trôi tempo KHÔNG phải lỗi hình dáng) mới đáng 7× chi phí. ──
console.log("# (1) TRÔI TEMPO — người 0 tempo (1+g)×, N=5, KHÔNG sai hình dáng.");
console.log("# FP_phase (%) và formSync HIỂN THỊ (%, cao=đúng: 'hình dáng vẫn khớp').");
console.log("g(%/s) | FP dịch | FP affine | formSync dịch | formSync affine");
console.log("-------|---------|-----------|---------------|----------------");
for (const g of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
  const clips = { A: buildClip([3, 4]), D: buildClip([3, 4], 1 + g) };
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: [k === 0 ? "D" : "A"], timeOffset: 0,
  }));
  const run = (cfg: PhaseCfg) => {
    let fp = 0, fsSum = 0, nn = 0;
    for (const t of times) {
      const pa = phaseAlignAt(clips, clips.A, dancers, t, cfg);
      if (!pa) continue;
      if (formOutlierIndex(pa) !== null) fp++;
      fsSum += pa.formSync; nn++;
    }
    return { fp: pct(fp), fs: (100 * fsSum) / nn };
  };
  const s = run(CFG_SHIFT), a = run(CFG_AFFINE);
  console.log(
    `  ${(100 * g).toFixed(0).padStart(3)}  |   ${String(s.fp).padStart(3)}%  |    ${String(a.fp).padStart(3)}%   |      ${s.fs.toFixed(0).padStart(3)}       |      ${a.fs.toFixed(0).padStart(3)}`
  );
}

// ── (2) ECHO canon: người 0 trễ τ HẰNG; KHÔNG ai sai → FP mong muốn 0 (không hồi quy) ──
console.log("\n# (2) ECHO canon — người 0 trễ τ HẰNG. FP_phase (%) (phải vẫn 0).");
console.log("τ(s)  | CHỈ-DỊCH | AFFINE");
console.log("------|----------|-------");
const clipA = { A: buildClip([3, 4]) };
for (const tau of [0.3, 0.6, 0.9]) {
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: ["A"], timeOffset: k === 0 ? tau : 0,
  }));
  const run = (cfg: PhaseCfg) => {
    let fp = 0;
    for (const t of times) {
      const pa = phaseAlignAt(clipA, clipA.A, dancers, t, cfg);
      if (pa && formOutlierIndex(pa) !== null) fp++;
    }
    return pct(fp);
  };
  console.log(`${tau.toFixed(2)}  |   ${String(run(CFG_SHIFT)).padStart(3)}%   |  ${String(run(CFG_AFFINE)).padStart(3)}%`);
}

// ── (3) LỖI THẬT: người 0 múa B → TP phải giữ 100, misID 0 (không bị over-warp giấu) ──
console.log("\n# (3) LỖI THẬT — người 0 múa B. TP / misID (%) (phải giữ 100 / 0).");
console.log("cấu hình  | TP    | misID");
console.log("----------|-------|------");
{
  const clips = { A: buildClip([3, 4]), B: buildClip([6, 7]) };
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: [k === 0 ? "B" : "A"], timeOffset: 0,
  }));
  for (const [nm, cfg] of [["CHỈ-DỊCH ", CFG_SHIFT], ["AFFINE   ", CFG_AFFINE]] as [string, PhaseCfg][]) {
    let tp = 0, mis = 0;
    for (const t of times) {
      const pa = phaseAlignAt(clips, clips.A, dancers, t, cfg);
      if (!pa) continue;
      const idx = formOutlierIndex(pa);
      if (idx === 0) tp++;
      else if (idx !== null) mis++;
    }
    console.log(`${nm} |  ${String(pct(tp)).padStart(3)}  |  ${String(pct(mis)).padStart(3)}`);
  }
}

// ── (4) CHI PHÍ: thời gian thực 1 lượt phaseAlignAt, 2 cấu hình ──
console.log("\n# (4) CHI PHÍ — thời gian (×200 lượt × 40 mốc). Ngân sách app: tiết lưu ~120ms/lượt.");
{
  const clips = { A: buildClip([3, 4]) };
  const dancers: SyncDancer[] = Array.from({ length: N }, (_, k) => ({
    sequence: ["A"], timeOffset: k === 0 ? 0.3 : 0,
  }));
  for (const [nm, cfg] of [["CHỈ-DỊCH ", CFG_SHIFT], ["AFFINE   ", CFG_AFFINE]] as [string, PhaseCfg][]) {
    const REP = 200;
    const t0 = performance.now();
    for (let r = 0; r < REP; r++) for (const t of times) phaseAlignAt(clips, clips.A, dancers, t, cfg);
    const ms = performance.now() - t0;
    console.log(`${nm} | ${ms.toFixed(0).padStart(6)} ms → ${(ms / (REP * NT)).toFixed(3)} ms/lượt`);
  }
}
