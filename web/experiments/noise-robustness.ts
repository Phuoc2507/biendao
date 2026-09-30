// THỰC NGHIỆM V47 (bền với nhiễu detector): TOÀN BỘ mạch đánh giá V33–V46 chạy trên tư thế tổng
// hợp SẠCH. Câu hỏi hội đồng gắt nhất về bước sang Gate 0 là: "còn sống nổi khi có nhiễu detector
// thật không?". Mocap 2D→3D tốt thường sai khớp ~1–3cm. Vòng này BƠM nhiễu Gauss/khớp/khung (PRNG
// gieo hạt = tất định) vào clip tổng hợp rồi đo đường phát hiện suy giảm ra sao — bắc cầu hiện
// thực TRƯỚC khi có dữ liệu thật, KHÔNG cần GPU lab.
// ---------------------------------------------------------------------------
// Giả thuyết cần kiểm (nối V46): nhiễu iid làm formSpread TĂNG (mở cổng SYNC) nhưng giữ MỌI người
// lệch ĐỀU nhau → cổng RATIO (phải có 1 người trội) VẪN đóng → KHÔNG vu oan. Nếu đúng, hai cổng
// BÙ nhau cả trước nhiễu: SYNC bắt "nhóm lệch", RATIO lọc "lệch đó có quy về 1 người không".
//
// Ba đo:
//   (I)  Dương-tính-GIẢ: mọi người ĐÚNG (ε=0) + nhiễu σ. %khung nêu bất kỳ ai. Lý tưởng = 0 ở σ thật.
//   (II) Dương-tính-THẬT dưới nhiễu: 1 người sai ε=0.7 (~12cm) + nhiễu σ. %nêu đúng người đó (giữ
//        được không) và %nêu nhầm người khác (nhiễu có che lỗi/tạo nạn nhân giả không).
//   (III) formSpread TB theo σ (cm) — xem cổng SYNC (~2cm) bị nhiễu đẩy qua ngưỡng ở mức nào.
//
// Tái lập (trong web/):
//   npx esbuild experiments/noise-robustness.ts --bundle --platform=node --format=cjs --outfile=nr.cjs && node nr.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, DEFAULT_PHASE, type SyncDancer, type PhaseAlign } from "../src/sync";

const J = 17;
const REST: number[][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45, DISP = 0.40;

// PRNG gieo hạt (mulberry32) + Box–Muller → nhiễu Gauss TẤT ĐỊNH (không dùng Math.random để runner
// chạy 2 lần cho kết quả y hệt). Mỗi vũ công 1 hạt riêng ⇒ nhiễu ĐỘC LẬP (không phải common-mode
// tự triệt trong so sánh tương đối — đúng bản chất nhiễu detector từng camera/người).
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

// Clip nền + sai tĩnh ε (như V44/V46) + nhiễu Gauss σ (mét) mỗi toạ độ mỗi khớp mỗi khung.
function buildClip(eps: number, sigma: number, seed: number): ClipData {
  const rnd = mulberry32(seed);
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const s = Math.sin((2 * Math.PI * (f / FPS)) / PERIOD);
    const p = REST.map((q) => [q[0], q[1], q[2]]);
    for (const j of [3, 4]) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    if (eps > 0) for (const j of [5, 6, 7]) p[j] = [REST[j][0] - eps * DISP, REST[j][1], REST[j][2]];
    if (sigma > 0) for (let j = 0; j < J; j++) for (let c = 0; c < 3; c++) p[j][c] += sigma * gauss(rnd);
    frames.push(p);
  }
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}

const N = 5, T0 = 0.6, T1 = 7.4, NT = 24;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
// SCALE=0.12, GATE=0.85, FLOOR=0.05, RATIO=1.3 — ĐÚNG hằng số production; tái hiện formOutlierIndex.
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

// σ tính bằng cm ở nhãn; nội bộ mét. Dải detector thật (1–3cm) + đẩy xa (5,8,12,20) để TÌM điểm gãy.
const SIGMAS_CM = [0, 0.5, 1, 2, 3, 5, 8, 12, 20];
const pct = (x: number, n: number) => (n ? Math.round((100 * x) / n) : 0);
const pad = (x: number | string, w: number) => String(x).padStart(w);

// Dựng nhóm: vector eps + σ chung; mỗi vũ công hạt = seedBase + index (nhiễu độc lập, tất định).
function pasFor(eps: number[], sigmaCm: number, seedBase: number): PhaseAlign[] {
  const sigma = sigmaCm / 100;
  const clipMap: Record<string, ClipData> = {};
  const dancers: SyncDancer[] = [];
  for (let d = 0; d < eps.length; d++) {
    const key = `C${d}`;
    clipMap[key] = buildClip(eps[d], sigma, seedBase + d);
    dancers.push({ sequence: [key], timeOffset: 0 });
  }
  const layout = buildClip(0, 0, 999); // layout tham chiếu SẠCH (chỉ để căn thời gian)
  const pas: PhaseAlign[] = [];
  for (const t of times) {
    const pa = phaseAlignAt(clipMap, layout, dancers, t, DEFAULT_PHASE);
    if (pa) pas.push(pa);
  }
  return pas;
}

const zeros = new Array(N).fill(0);
const oneErr = [0.7, 0, 0, 0, 0];

// ── (I) DƯƠNG-TÍNH-GIẢ: mọi người đúng + nhiễu. %khung nêu bất kỳ ai (lý tưởng 0) ──
console.log("# (I) Dương-tính-GIẢ: cả nhóm ĐÚNG (ε=0), chỉ có nhiễu σ. %khung NÊU bất kỳ ai (muốn = 0).");
console.log("σ(cm) | " + SIGMAS_CM.map((s) => s.toFixed(1).padStart(5)).join(""));
{
  const row = SIGMAS_CM.map((s) => {
    const pas = pasFor(zeros, s, 1000);
    let any = 0;
    for (const pa of pas) if (classify(pa) !== null) any++;
    return pad(pct(any, pas.length), 5);
  });
  console.log("FP%   | " + row.join(""));
}

// ── (II) DƯƠNG-TÍNH-THẬT dưới nhiễu: 1 người sai ε=0.7 (~12cm) + nhiễu ──
console.log("\n# (II) 1 người sai rõ (d0, ~12cm) + nhiễu σ. TP%=nêu ĐÚNG d0; FP%=nêu nhầm người khác.");
console.log("σ(cm) | " + SIGMAS_CM.map((s) => s.toFixed(1).padStart(5)).join(""));
{
  const tp: string[] = [], fp: string[] = [];
  for (const s of SIGMAS_CM) {
    const pas = pasFor(oneErr, s, 2000);
    let hit = 0, wrong = 0;
    for (const pa of pas) {
      const idx = classify(pa);
      if (idx === 0) hit++;
      else if (idx !== null) wrong++;
    }
    tp.push(pad(pct(hit, pas.length), 5));
    fp.push(pad(pct(wrong, pas.length), 5));
  }
  console.log("TP%   | " + tp.join(""));
  console.log("FP%   | " + fp.join(""));
}

// ── (III) formSpread TB (cm) theo σ, nhóm ĐÚNG — xem cổng SYNC (~2cm) bị nhiễu đẩy qua đâu ──
console.log("\n# (III) formSpread TB (cm) khi cả nhóm ĐÚNG — cổng SYNC mở khi formSpread > SCALE·ln(1/0.85)≈1.95cm.");
console.log("σ(cm)     | " + SIGMAS_CM.map((s) => s.toFixed(1).padStart(6)).join(""));
{
  const row = SIGMAS_CM.map((s) => {
    const pas = pasFor(zeros, s, 1000);
    let sum = 0;
    for (const pa of pas) sum += pa.formSpread;
    return pad((100 * sum / pas.length).toFixed(2), 6);
  });
  console.log("spread cm | " + row.join(""));
  const thr = 100 * 0.12 * Math.log(1 / 0.85);
  console.log(`(ngưỡng mở cổng SYNC ≈ ${thr.toFixed(2)}cm)`);
}

// ── (IV) VÌ SAO (I) = 0? Đo tỉ số worst/meanOthers TB khi nhóm ĐÚNG — RATIO=1.3 là cổng chặn ──
console.log("\n# (IV) Nhóm ĐÚNG + nhiễu: tỉ số worst/meanOthers TB (cổng RATIO cắt ở 1.3) & worstV TB (cm).");
console.log("#     Nhiễu iid qua 17 khớp × cửa sổ 13 mẫu bị TRUNG BÌNH HOÁ mạnh ⇒ 5 người sát nhau ⇒ tỉ số ~1.");
console.log("σ(cm)      | " + SIGMAS_CM.map((s) => s.toFixed(1).padStart(6)).join(""));
{
  const ratioRow: string[] = [], worstRow: string[] = [];
  for (const s of SIGMAS_CM) {
    const pas = pasFor(zeros, s, 1000);
    let rsum = 0, wsum = 0, cnt = 0;
    for (const pa of pas) {
      const n = pa.formResidual.length, worst = pa.worst, worstV = pa.formResidual[worst];
      let others = 0;
      for (let i = 0; i < n; i++) if (i !== worst) others += pa.formResidual[i];
      const mean = others / (n - 1);
      if (mean > 0) { rsum += worstV / mean; cnt++; }
      wsum += worstV;
    }
    ratioRow.push(pad(cnt ? (rsum / cnt).toFixed(2) : "–", 6));
    worstRow.push(pad((100 * wsum / pas.length).toFixed(1), 6));
  }
  console.log("worst/mean | " + ratioRow.join(""));
  console.log("worstV cm  | " + worstRow.join(""));
  console.log("(RATIO=1.3: nêu chỉ khi worst/mean ≥ 1.3. Nếu dòng trên ở DƯỚI 1.3 tới σ lớn ⇒ RATIO là lá chắn nhiễu.)");
}

console.log("\n# Đọc kết quả (số ĐO ĐƯỢC):");
console.log("# (I) FP% = 0 ở MỌI σ tới 20cm — nhiễu iid KHÔNG BAO GIỜ gây vu oan. Dù formSpread lên 39cm");
console.log("#     (cổng SYNC mở toang), không ai bị nêu. Cơ chế ở (IV): RATIO là lá chắn BẤT BIẾN TỈ LỆ.");
console.log("# (II) TP% trụ 100 tới σ=5cm (nhiễu ≈0.4× lỗi 12cm — thừa biên so với detector thật 1–3cm), rồi");
console.log("#     SỤP xuống 0 ở σ≥8cm. NHƯNG FP vẫn 0: khi nhiễu át lỗi, metric đi CÂM (hỏng AN TOÀN), KHÔNG");
console.log("#     đổ cho người khác. Suy giảm lý tưởng: mất độ nhạy trước, không bao giờ nói dối.");
console.log("# (III) formSpread ≈ 2σ (tuyến tính): cổng SYNC (1.95cm) mở ngay từ σ≈1cm. Nhưng (I) cho thấy");
console.log("#     mở cổng SYNC một mình VÔ HẠI — nó chỉ nói 'nhóm đang lệch', chưa quy trách nhiệm.");
console.log("# (IV) worst/mean = 1.02 PHẲNG LÌ qua mọi σ (worstV tăng tuyến tính nhưng tỉ số bất biến vì");
console.log("#     nhiễu iid qua 17 khớp×13 mẫu bị trung bình hoá ⇒ 5 người sát nhau). 1.02 << 1.3 ⇒ RATIO");
console.log("#     có biên KHỔNG LỒ trước nhiễu iid. Đây là VAI TRÒ THỨ HAI của RATIO (ngoài chống đổ-oan V46).");
console.log("# ⇒ KẾT: ở dải detector thật (1–3cm), metric VỪA nhạy (TP=100) VỪA an toàn (FP=0). Cặp cổng");
console.log("#   SYNC+RATIO bù nhau cả trước nhiễu: SYNC bắt 'nhóm lệch', RATIO lọc 'có quy về 1 người không'.");
console.log("# GIỚI HẠN: nhiễu Gauss iid là mô hình LẠC QUAN; nhiễu detector thật có tương quan thời gian, lệch");
console.log("#   hệ thống theo góc nhìn, rơi khớp (không iid — không tự triệt khi trung bình hoá). Đây là CHẶN");
console.log("#   TRÊN độ bền (best-case); Gate 0 (GPU lab) phải đo nhiễu THẬT, nơi tương quan có thể phá biên RATIO.");
