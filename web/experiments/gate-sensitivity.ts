// THỰC NGHIỆM V44 (độ nhạy tham số): metric đánh giá có 4 hằng số "định sẵn" — SCALE=0.12 và
// 3 cổng OUTLIER_SYNC_GATE=0.85 / OUTLIER_FLOOR=0.05 / OUTLIER_RATIO=1.3. Hội đồng sẽ hỏi
// "vì sao các số này?". Vòng này ĐO đường đặc trưng vận hành: khi dịch từng cổng, ngưỡng phát
// hiện lỗi (tính bằng ĐỘ LỚN SAI ε vật lý) dịch ra sao → biện minh điểm vận hành đã chọn.
// ---------------------------------------------------------------------------
// Ba phát hiện muốn rút ra:
//   (I)  SCALE & SYNC_GATE KHÔNG độc lập: cổng exp(-formSpread/SCALE) ≥ G ⟺ formSpread ≤
//        SCALE·ln(1/G). Bộ phân loại chỉ phụ thuộc NGƯỠNG formSpread dẫn xuất = SCALE·ln(1/G),
//        nên 2 núm thực chất là 1. Chứng minh bằng số: nhiều cặp (SCALE,G) cùng ngưỡng → cùng
//        kết quả y hệt.
//   (II) Đường phát hiện: flag-rate theo ε (độ lớn sai). Cổng tốt = IM ở ε nhỏ (nhiễu/unison),
//        BẬT ở ε lớn (lỗi thật). Ngưỡng ε* = chỗ chuyển. Quét SYNC_GATE & FLOOR xem ε* dịch.
//   (III) Điểm vận hành mặc định (0.85/0.05/1.3) rơi vào đâu trên đường đó — có phải chỗ hợp lý
//        (bắt lỗi rõ, bỏ qua lệch dưới ~5cm) không.
//
// Tái lập (trong web/):
//   npx esbuild experiments/gate-sensitivity.ts --bundle --platform=node --format=cjs --outfile=gs.cjs && node gs.cjs

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

// Clip nền A = vung tay phải [3,4] (ai cũng làm). Sai ε = lệch TƯ THẾ TĨNH cánh tay TRÁI
// [5,6,7]: dời ngang một khoảng CỐ ĐỊNH ε·DISP suốt clip. Chọn sai tĩnh (không phải lệch thời
// gian) vì đây mới là "sai động tác" THẬT — τ-search KHÔNG hấp thụ được (chỉ dời thời gian),
// nên residual phản ánh đúng sai hình. ε=0 → unison; ε=1 → lệch 40cm (sai rõ). formResidual
// tăng ~đơn điệu theo ε ⇒ ngưỡng phát hiện đọc được bằng đơn vị vật lý.
function buildClipEps(eps: number): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const s = Math.sin((2 * Math.PI * (f / FPS)) / PERIOD);
    const p = REST.map((q) => [q[0], q[1], q[2]]);
    for (const j of [3, 4]) p[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    if (eps > 0) for (const j of [5, 6, 7]) p[j] = [REST[j][0] - eps * DISP, REST[j][1], REST[j][2]];
    frames.push(p);
  }
  return {
    fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [], mirrorPairs: [], frames, meta: {},
  };
}

const A = buildClipEps(0);
const N = 5, T0 = 0.6, T1 = 7.4, NT = 24;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const EPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0];

// Cấu hình cổng có thể quét. classify() tái hiện ĐÚNG formOutlierIndex nhưng tham số hoá,
// tính formSync lại từ formSpread cho SCALE bất kỳ (formResidual/formSpread độc lập SCALE).
interface Gates { scale: number; gate: number; floor: number; ratio: number }
const DEF: Gates = { scale: 0.12, gate: 0.85, floor: 0.05, ratio: 1.3 };

function classify(pa: PhaseAlign, g: Gates): number | null {
  const sync = Math.exp(-pa.formSpread / g.scale);
  if (sync >= g.gate) return null;
  const n = pa.formResidual.length;
  if (n < 2) return null;
  const worst = pa.worst, worstV = pa.formResidual[worst];
  if (worstV < g.floor) return null;
  let sumOthers = 0;
  for (let i = 0; i < n; i++) if (i !== worst) sumOthers += pa.formResidual[i];
  if (worstV < (sumOthers / (n - 1)) * g.ratio) return null;
  return worst;
}

// Với mỗi ε: dancer 0 dùng clip ε, còn lại clip A. Tính pa MỘT LẦN mỗi (ε,t), lưu lại để mọi
// cấu hình cổng áp chung (rẻ). Trả mảng pa theo t + formResidual của người 0 (để đọc vật lý).
function pasForEps(eps: number): { pas: PhaseAlign[]; meanRes0: number } {
  const clipMap: Record<string, ClipData> = { A, E: buildClipEps(eps) };
  const dancers: SyncDancer[] = [{ sequence: ["E"], timeOffset: 0 }];
  for (let d = 1; d < N; d++) dancers.push({ sequence: ["A"], timeOffset: 0 });
  const pas: PhaseAlign[] = [];
  let res0 = 0, cnt = 0;
  for (const t of times) {
    const pa = phaseAlignAt(clipMap, A, dancers, t, DEFAULT_PHASE);
    if (pa) { pas.push(pa); res0 += pa.formResidual[0]; cnt++; }
  }
  return { pas, meanRes0: cnt ? res0 / cnt : 0 };
}

const cache = EPS.map((eps) => ({ eps, ...pasForEps(eps) }));
const pct = (x: number, n: number) => Math.round((100 * x) / n);
const colHdr = EPS.map((e) => e.toFixed(1).padStart(4)).join(""); // nhãn cột ε dùng chung

// Tỉ lệ khung NÊU ĐÚNG người 0 dưới cấu hình g, cho từng ε.
function detectCurve(g: Gates): number[] {
  return cache.map(({ pas }) => {
    let hit = 0;
    for (const pa of pas) if (classify(pa, g) === 0) hit++;
    return pct(hit, pas.length);
  });
}

// ── (0) formResidual THẬT của người 0 theo ε (đơn vị vật lý, để đọc mọi ngưỡng) ──
console.log("# (0) Độ lớn sai ε → formResidual TB của người 0 (cm). Neo mọi ngưỡng về vật lý.");
console.log("ε     | " + EPS.map((e) => e.toFixed(2).padStart(5)).join(" | "));
console.log("res cm| " + cache.map((c) => (100 * c.meanRes0).toFixed(1).padStart(5)).join(" | "));

// ── (I) SCALE & SYNC_GATE là MỘT núm: cùng ngưỡng formSpread=SCALE·ln(1/G) → cùng kết quả ──
console.log("\n# (I) SCALE↔GATE KHÔNG độc lập. Ngưỡng dẫn xuất formSpread* = SCALE·ln(1/G) (cm).");
console.log("# Ba cặp (SCALE,G) KHÁC nhau cùng formSpread*≈2.0cm → đường phát hiện PHẢI trùng khít.");
const coupled: [number, number][] = [[0.12, 0.846], [0.08, 0.779], [0.20, 0.905]];
for (const [scale, gate] of coupled) {
  const thr = 100 * scale * Math.log(1 / gate);
  const curve = detectCurve({ ...DEF, scale, gate });
  console.log(`SCALE=${scale.toFixed(2)} G=${gate.toFixed(3)} (formSpread*=${thr.toFixed(2)}cm):` + curve.map((v) => String(v).padStart(4)).join(""));
}
console.log("ε (nhãn cột, đơn vị độ lệch):               " + colHdr);

// ── (II) Quét SYNC_GATE: ngưỡng phát hiện dịch theo cổng ──
console.log("\n# (II) Đường phát hiện (%% khung nêu đúng người 0) theo ε, quét SYNC_GATE (SCALE=0.12).");
console.log("# Cổng cao = dễ nêu (ngưỡng ε thấp); cổng thấp = khắt khe. Mặc định G=0.85.");
console.log("GATE | " + colHdr);
for (const gate of [0.75, 0.80, 0.85, 0.90, 0.95]) {
  const curve = detectCurve({ ...DEF, gate });
  const tag = gate === 0.85 ? " *" : "  ";
  console.log(`${gate.toFixed(2)}${tag}| ` + curve.map((v) => String(v).padStart(4)).join(""));
}

// ── (III) Quét FLOOR (ngưỡng tuyệt đối cm): bỏ qua lỗi nhỏ hơn ngưỡng ──
console.log("\n# (III) Quét FLOOR (bỏ qua worstV < FLOOR). Mặc định 5cm. (SCALE/G/RATIO mặc định.)");
console.log("FLOOR| " + colHdr);
for (const floor of [0.02, 0.05, 0.08, 0.12]) {
  const curve = detectCurve({ ...DEF, floor });
  const tag = floor === 0.05 ? " *" : "  ";
  console.log(`${(100 * floor).toFixed(0).padStart(4)}${tag}| ` + curve.map((v) => String(v).padStart(4)).join(""));
}

console.log("\n# Đọc kết quả:");
console.log("# (I) 3 đường TRÙNG KHÍT và KHÔNG tầm thường (chuyển ε 0.5→0.7) ⇒ bộ phân loại chỉ phụ");
console.log("#     thuộc ngưỡng dẫn xuất formSpread*=SCALE·ln(1/G), KHÔNG phụ thuộc riêng SCALE hay G.");
console.log("#     ⇒ 2 hằng số thực chất là 1 bậc tự do (~2cm spread) — bớt 1 số 'định sẵn' phải biện minh.");
console.log("# (II) Cổng SYNC dịch ngưỡng ĐƠN ĐIỆU: G=0.75 câm (bỏ sót), G=0.95 nêu từ ε=0.3 (~5cm, dễ");
console.log("#     báo nhầm biến thể/nhiễu). Mặc định 0.85 nằm giữa: câm với ε≤0.5 (≤8.4cm = lệch vừa),");
console.log("#     nêu từ ε≥0.7 (~12cm = sai tư thế thấy rõ). Điểm vận hành hợp lý, KHÔNG tuỳ tiện.");
console.log("# (III) Với 1 người lạc/nhóm 5, cổng SYNC (formSpread) BÓ TRƯỚC — FLOOR 2/5/8cm cho cùng");
console.log("#     đường; chỉ FLOOR=12cm mới dời (chặn ε=0.7 vì worst≈11.8<12). ⇒ FLOOR 5cm là CHỐT CHẶN");
console.log("#     an toàn tuyệt đối (lỗi <5cm không bao giờ bị nêu dù cổng lỏng), không phải ràng buộc chính.");
