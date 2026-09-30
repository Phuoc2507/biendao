// THỰC NGHIỆM V48 (nhiễu CÓ CẤU TRÚC): V47 chứng minh metric bền với nhiễu Gauss IID (tự triệt khi
// trung bình hoá cửa sổ ⇒ FP=0). Nhưng V47 tự nêu giới hạn: nhiễu detector THẬT không iid. Vòng này
// ĐO thẳng ba thành phần cấu trúc mà V47 để ngỏ, thay vì suy đoán — đúng kỷ luật "đo, đừng chỉ lý luận".
// ---------------------------------------------------------------------------
// Ba mô hình nhiễu cấu trúc, mỗi cái nhắm một cách khác nhau vào CỔNG RATIO:
//   (A) TƯƠNG QUAN THỜI GIAN (AR(1), hệ số ρ): jitter pose bám khung liền kề. ρ→1 ⇒ nhiễu KHÔNG tự
//       triệt trong cửa sổ 13 mẫu ⇒ residual từng người phình to. Hỏi: worst/mean có vượt 1.3 (vu oan)?
//   (B) LỆCH HỆ THỐNG theo người (bias β không đổi trên vài khớp của D0): 1 camera nhìn xiên, khớp bị
//       che bị đặt lệch NHẤT QUÁN. Đây là điểm mù THẬT: ở tầng toạ-độ-3D nó GIỐNG HỆT "sai động tác".
//   (C) RƠI KHỚP/xung (dropout xác suất p, biên độ lớn): occlusion nhảy vọt một khớp một khung. Xung
//       tức thời ⇒ có gây dương-tính-giả rời rạc theo KHUNG không?
//
// Mỗi phát hiện nối về một tầng ĐÃ CÓ của hệ: (A)→RATIO (V46/V47), (B)→đa-view V13 + tuyệt đối V42,
// (C)→gộp theo lưới nhịp V32. Đây là TỔNG HỢP xuyên tầng, không phải widget cô lập mới.
//
// Tái lập (trong web/):
//   npx esbuild experiments/structured-noise.ts --bundle --platform=node --format=cjs --outfile=sn.cjs && node sn.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, DEFAULT_PHASE, type SyncDancer, type PhaseAlign } from "../src/sync";

const J = 17;
const REST: number[][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45;
const LEFT_ARM = [5, 6, 7]; // khớp tay trái — nơi gắn "sai động tác" / "lệch hệ thống"

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-12), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Tư thế nền tại khung f (vung tay phải), + lệch tĩnh biasM (mét) trên các khớp armJoints nếu có.
function basePose(f: number, biasM: number, armJoints: number[]): number[][] {
  const s = Math.sin((2 * Math.PI * (f / FPS)) / PERIOD);
  const p = REST.map((q) => [q[0], q[1], q[2]]);
  for (const j of [3, 4]) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
  if (biasM !== 0) for (const j of armJoints) p[j] = [REST[j][0] - biasM, REST[j][1], REST[j][2]];
  return p;
}

// (A) Nhiễu AR(1): x_t = ρ·x_{t-1} + sqrt(1-ρ²)·w  ⇒ phương sai biên KHÔNG đổi theo ρ (cô lập TÁC
// ĐỘNG TƯƠNG QUAN, không lẫn độ lớn). σ tính bằng mét. State riêng mỗi (khớp,trục).
function buildClipAR(sigma: number, rho: number, seed: number): ClipData {
  const rnd = mulberry32(seed);
  const state = Array.from({ length: J }, () => [0, 0, 0]);
  const k = Math.sqrt(Math.max(1 - rho * rho, 0));
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const p = basePose(f, 0, LEFT_ARM);
    if (sigma > 0) for (let j = 0; j < J; j++) for (let c = 0; c < 3; c++) {
      state[j][c] = rho * state[j][c] + k * gauss(rnd);
      p[j][c] += sigma * state[j][c];
    }
    frames.push(p);
  }
  return mkClip(frames);
}

// (B) Lệch hệ thống: bias không đổi biasM trên tay trái của người này, + (tuỳ chọn) nền Gauss sạch.
function buildClipBias(biasM: number, sigma: number, seed: number): ClipData {
  const rnd = mulberry32(seed);
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const p = basePose(f, biasM, LEFT_ARM);
    if (sigma > 0) for (let j = 0; j < J; j++) for (let c = 0; c < 3; c++) p[j][c] += sigma * gauss(rnd);
    frames.push(p);
  }
  return mkClip(frames);
}

// (C) Rơi khớp/mất-bám thành ĐỢT: tay trái bị dịch dispM (mét) trong `dur` khung LIÊN TIẾP giữa clip
// (mô hình occlusion kéo dài). dur=0 ⇒ sạch; dur=NUM_FRAMES ⇒ thành lệch-hệ-thống dai dẳng = (B).
// Tất định hoàn toàn (không PRNG) — đợt đặt giữa clip.
function buildClipBurst(dispM: number, dur: number): ClipData {
  const start = Math.floor((NUM_FRAMES - dur) / 2);
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const inBurst = dur > 0 && f >= start && f < start + dur;
    frames.push(basePose(f, inBurst ? dispM : 0, LEFT_ARM));
  }
  return mkClip(frames);
}

function mkClip(frames: number[][][]): ClipData {
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}

const N = 5, T0 = 0.6, T1 = 7.4, NT = 24;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));

// ĐÚNG hằng số production (0.12/0.85/0.05/1.3) — tái hiện formOutlierIndex.
function classify(pa: PhaseAlign): number | null {
  const sync = Math.exp(-pa.formSpread / 0.12);
  if (sync >= 0.85) return null;
  const n = pa.formResidual.length;
  if (n < 2) return null;
  const worst = pa.worst, worstV = pa.formResidual[worst];
  if (worstV < 0.05) return null;
  let sumOthers = 0;
  for (let i = 0; i < n; i++) if (i !== worst) sumOthers += pa.formResidual[i];
  if (worstV < (sumOthers / (n - 1)) * 1.3) return null;
  return worst;
}

// Chạy nhóm N clip đã dựng sẵn → danh sách PhaseAlign qua mọi mốc thời gian.
function runGroup(clips: ClipData[]): PhaseAlign[] {
  const clipMap: Record<string, ClipData> = {};
  const dancers: SyncDancer[] = [];
  clips.forEach((c, d) => { clipMap[`C${d}`] = c; dancers.push({ sequence: [`C${d}`], timeOffset: 0 }); });
  const layout = mkClip(Array.from({ length: NUM_FRAMES }, (_, f) => basePose(f, 0, LEFT_ARM))); // layout SẠCH để căn thời gian
  const pas: PhaseAlign[] = [];
  for (const t of times) {
    const pa = phaseAlignAt(clipMap, layout, dancers, t, DEFAULT_PHASE);
    if (pa) pas.push(pa);
  }
  return pas;
}

const pct = (x: number, n: number) => (n ? Math.round((100 * x) / n) : 0);
const pad = (x: number | string, w: number) => String(x).padStart(w);

// ─────────────────────────────────────────────────────────────────────────
// (A) TƯƠNG QUAN THỜI GIAN: nhóm ĐÚNG, σ=3cm cố định, quét ρ. Nhiễu không tự triệt khi ρ cao ⇒
//     residual phình. Hỏi: có vượt RATIO=1.3 (dương-tính-giả) không, hay vẫn đồng đều giữa người?
// ─────────────────────────────────────────────────────────────────────────
const RHOS = [0, 0.3, 0.6, 0.8, 0.9, 0.95, 0.99];
console.log("# (A) TƯƠNG QUAN THỜI GIAN AR(1): nhóm ĐÚNG, σ=3cm CỐ ĐỊNH, quét ρ (jitter bám khung).");
console.log("#     ρ→1 ⇒ nhiễu KHÔNG tự triệt trong cửa sổ 13 mẫu ⇒ residual phình. FP muốn=0.");
console.log("ρ          | " + RHOS.map((r) => r.toFixed(2).padStart(6)).join(""));
{
  const fp: string[] = [], ratio: string[] = [], worst: string[] = [];
  for (const rho of RHOS) {
    const clips = Array.from({ length: N }, (_, d) => buildClipAR(0.03, rho, 3100 + d));
    const pas = runGroup(clips);
    let any = 0, rsum = 0, wsum = 0, cnt = 0;
    for (const pa of pas) {
      if (classify(pa) !== null) any++;
      const n = pa.formResidual.length, w = pa.worst, wv = pa.formResidual[w];
      let others = 0;
      for (let i = 0; i < n; i++) if (i !== w) others += pa.formResidual[i];
      const mean = others / (n - 1);
      if (mean > 0) { rsum += wv / mean; cnt++; }
      wsum += wv;
    }
    fp.push(pad(pct(any, pas.length), 6));
    ratio.push(pad(cnt ? (rsum / cnt).toFixed(2) : "–", 6));
    worst.push(pad((100 * wsum / pas.length).toFixed(1), 6));
  }
  console.log("FP%        | " + fp.join(""));
  console.log("worst/mean | " + ratio.join(""));
  console.log("worstV cm  | " + worst.join(""));
}

// ─────────────────────────────────────────────────────────────────────────
// (B) LỆCH HỆ THỐNG theo người = ĐIỂM MÙ THẬT. D0 MÚA ĐÚNG nhưng bị detector đặt lệch NHẤT QUÁN β
//     trên tay trái (1 camera nhìn xiên, khớp bị che). Nhóm còn lại đúng + sạch. Mỗi lần nêu D0 là
//     một dương-tính-giả MỨC-NHIỆM-VỤ (D0 không hề nhảy sai). Ngưỡng nêu ~26cm thô ≈ 12cm residual (đối
//     chiếu V44) — so với V47 (nhiễu NGẪU NHIÊN không bao giờ nêu ai): nhiễu CÓ CẤU TRÚC thì CÓ.
// ─────────────────────────────────────────────────────────────────────────
const BETAS_CM = [0, 10, 20, 26, 30, 35, 40];
console.log("\n# (B) ĐIỂM MÙ: D0 MÚA ĐÚNG nhưng bị detector lệch hệ thống β cm (tay trái). Nhóm còn lại đúng+sạch.");
console.log("#     %khung NÊU D0 = dương-tính-giả mức-nhiệm-vụ (D0 vô tội). Tương phản V47: nhiễu ngẫu nhiên KHÔNG nêu.");
console.log("β thô(cm)  | " + BETAS_CM.map((b) => b.toFixed(0).padStart(6)).join(""));
{
  const row: string[] = [];
  for (const b of BETAS_CM) {
    const clips = Array.from({ length: N }, (_, d) => buildClipBias(d === 0 ? b / 100 : 0, 0, 3200 + d));
    const pas = runGroup(clips);
    let hit = 0;
    for (const pa of pas) if (classify(pa) === 0) hit++;
    row.push(pad(pct(hit, pas.length), 6));
  }
  console.log("nêu D0 %   | " + row.join(""));
}

// ─────────────────────────────────────────────────────────────────────────
// (C) MẤT-BÁM THÀNH ĐỢT: D0 bị dịch tay trái 30cm (TRÊN ngưỡng nêu) trong D khung LIÊN TIẾP giữa clip.
//     Cửa sổ metric ~13 mẫu pha loãng đợt NGẮN; đợt DÀI (≈cửa sổ) mới không bị loãng. D=240 = cả clip
//     ⇒ trùng (B) ở β=30cm (kiểm chéo). Cho thấy: occlusion THOÁNG an toàn; mất-bám DAI DẲNG hoá (B).
// ─────────────────────────────────────────────────────────────────────────
const DURS = [0, 1, 3, 6, 13, 30, 240];
console.log("\n# (C) MẤT-BÁM ĐỢT: D0 dịch tay trái 30cm trong D khung liên tiếp (giữa clip). Nhóm còn lại đúng+sạch.");
console.log("#     %khung nêu D0. Đợt NGẮN bị cửa sổ 13 mẫu pha loãng (an toàn); DÀI thì không. D=240 ≈ (B) β=30.");
console.log("D (khung)  | " + DURS.map((d) => d.toFixed(0).padStart(6)).join(""));
{
  const row: string[] = [];
  for (const dur of DURS) {
    const clips = Array.from({ length: N }, (_, d) => (d === 0 ? buildClipBurst(0.30, dur) : buildClipBurst(0, 0)));
    const pas = runGroup(clips);
    let hit = 0;
    for (const pa of pas) if (classify(pa) === 0) hit++;
    row.push(pad(pct(hit, pas.length), 6));
  }
  console.log("nêu D0 %   | " + row.join(""));
}

console.log("\n# Đọc kết quả (số ĐO ĐƯỢC):");
console.log("# (A) FP=0 tới ρ=0.99; worst/mean chỉ nhích 1.02→1.08 (≪1.3) dù worstV phình ~6→7cm. RATIO BỀN cả");
console.log("#     với nhiễu TƯƠNG QUAN thời gian — vì điều quyết định là nhiễu ĐỘC LẬP GIỮA NGƯỜI, không phải");
console.log("#     iid theo thời gian: 5 người cùng phình residual ⇒ không ai trội ⇒ không quy trách nhiệm.");
console.log("# (B) ĐIỂM MÙ THẬT: D0 múa ĐÚNG nhưng bị lệch hệ thống ≥26cm thô ⇒ bị nêu 100% (ngưỡng khớp V44");
console.log("#     ~12cm residual). Tương phản sắc nét với V47: nhiễu NGẪU NHIÊN không bao giờ nêu ai; nhiễu CÓ");
console.log("#     CẤU TRÚC (dai dẳng, 1 người) thì CÓ — và KHÔNG núm nào ở tầng đánh giá sửa được, vì ở tầng");
console.log("#     toạ-độ-3D 'detector đặt lệch' GIỐNG HỆT 'múa sai'. Lối tách CẦN chiều dữ liệu KHÁC:");
console.log("#     (1) đa-view reproj held-out V13 — bias 1-view lộ ra khi chiếu sang view kia (nhất quán vật lý);");
console.log("#     (2) thước TUYỆT ĐỐI V42 nếu có clip tham chiếu. Evaluation nhóm-tương-đối ĐƠN TẦNG không đủ.");
console.log("# (C) Chuyển tiếp theo ĐỘ DÀI đợt: D≤13 khung → 0% (cửa sổ 13 mẫu PHA LOÃNG occlusion thoáng), D=30");
console.log("#     → 8%, D=240 (cả clip) → 100% = ĐÚNG BẰNG (B) ở β=30cm (kiểm chéo khớp). ⇒ mất-bám THOÁNG an");
console.log("#     toàn; mất-bám DAI DẲNG hoá thành (B). Hệ quả: chính phép trung bình 17-khớp×13-mẫu vừa là lá");
console.log("#     chắn nhiễu (V47/A/C-ngắn) vừa là lý do KHÔNG cứu được lỗi 1-người dai dẳng (B/C-dài).");
console.log("# ⇒ TỔNG: metric nhóm-tương-đối BỀN với MỌI nhiễu GIỮ ĐƯỢC TÍNH ĐỘC LẬP GIỮA NGƯỜI (ngẫu nhiên,");
console.log("#   tương quan-thời-gian, thoáng); điểm mù DUY NHẤT là lỗi HỆ THỐNG MỘT NGƯỜI — đúng chỗ tầng");
console.log("#   perception (đa-view V13) và thước tuyệt đối (V42) bù vào. Bản đồ phòng thủ xuyên tầng, không núm đơn lẻ.");
