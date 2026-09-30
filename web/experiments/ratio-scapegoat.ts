// THỰC NGHIỆM V46 (độ nhạy OUTLIER_RATIO — chống "đổ oan"): V44 đã quét 3/4 hằng số của bộ chấm
// nhưng CHỪA RATIO=1.3, vì RATIO chỉ RÀNG khi có NHIỀU người cùng lệch (cảnh 1-người-lạc của V44
// không kích hoạt nó). Vòng này ĐO đúng cảnh đó: nhiều vũ công cùng làm SAI GIỐNG HỆT nhau — có
// nên gọi tên MỘT người trong số họ không? RATIO là núm quyết định ranh giới IM↔NÊU khi số người
// cùng lệch tăng dần.
// ---------------------------------------------------------------------------
// Cổng RATIO: chỉ nêu người lệch nhất nếu worstV ≥ RATIO · (lệch TB của người còn lại). Vì worstV
// là MAX nên luôn ≥ meanOthers; RATIO=1.0 ⇒ nêu ngay khi có bất kỳ chênh (đổ oan tối đa), RATIO→∞
// ⇒ không bao giờ nêu. 1.3 nằm giữa. Câu hỏi hội đồng: 1.3 có biện minh được không?
//
// Ba phát hiện muốn rút ra:
//   (I)  Cảnh "k người cùng lệch GIỐNG HỆT / N=5" (k=1..4), quét RATIO. Đo: %khung NÊU ai đó, và
//        người bị nêu là NGƯỜI-CÓ-LỖI hay NGƯỜI-THIỂU-SỐ-ĐÚNG (đổ oan). Lộ ranh giới IM↔NÊU.
//   (II) So với luật lý tưởng (residual đều nhau): nêu ⟺ (N-1)/(k-1) ≥ RATIO. Đo lệch thực tế do
//        gộp TRUNG VỊ — chỗ lệch chính là tương tác với TRẦN THÔNG TIN V41.
//   (III) LỀ an toàn cho 1-người-lạc: 1 người sai rõ M + (k-1) người lệch NHẸ αM quanh đó. Quét α:
//        RATIO cao bảo vệ chống đổ oan sớm hơn nhưng ĂN MÒN lề bắt người lạc thật. Đánh đổi.
//
// Tái lập (trong web/):
//   npx esbuild experiments/ratio-scapegoat.ts --bundle --platform=node --format=cjs --outfile=rs.cjs && node rs.cjs

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

// Giống V44: nền = vung tay phải [3,4]; SAI ε = dời ngang TĨNH cánh tay trái [5,6,7] một khoảng
// CỐ ĐỊNH ε·DISP. Sai TĨNH ⇒ τ-search không hấp thụ ⇒ residual phản ánh đúng sai hình. Mọi người
// cùng ε nghĩa là làm SAI GIỐNG HỆT nhau (cùng hướng, cùng độ) — ca "đổ oan" gắt nhất: không có cơ
// sở nào để chọn ai trong số họ.
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

const N = 5, T0 = 0.6, T1 = 7.4, NT = 24;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const M = 0.7; // độ lớn sai "rõ" — ở V44, ε=0.7 ⇒ residual ~11.8cm, 1 người lạc bị nêu chắc.

interface Gates { scale: number; gate: number; floor: number; ratio: number }
const DEF: Gates = { scale: 0.12, gate: 0.85, floor: 0.05, ratio: 1.3 };

// classify() tái hiện ĐÚNG formOutlierIndex, tham số hoá (tính lại formSync từ formSpread).
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

// Tính pa theo thời gian cho một VECTOR eps (mỗi vũ công 1 clip riêng). Người có eps>0 = "có lỗi".
function pasForVec(eps: number[]): PhaseAlign[] {
  const clipMap: Record<string, ClipData> = {};
  const dancers: SyncDancer[] = [];
  for (let d = 0; d < eps.length; d++) {
    const key = `C${d}`;
    clipMap[key] = buildClipEps(eps[d]);
    dancers.push({ sequence: [key], timeOffset: 0 });
  }
  const layout = buildClipEps(0);
  const pas: PhaseAlign[] = [];
  for (const t of times) {
    const pa = phaseAlignAt(clipMap, layout, dancers, t, DEFAULT_PHASE);
    if (pa) pas.push(pa);
  }
  return pas;
}

// Vector k người cùng lệch GIỐNG HỆT (chỉ số 0..k-1 = lỗi), N-k người đúng.
const vecK = (k: number, m: number) => Array.from({ length: N }, (_, i) => (i < k ? m : 0));

const RATIOS = [1.0, 1.15, 1.3, 1.5, 2.0];
const pct = (x: number, n: number) => (n ? Math.round((100 * x) / n) : 0);
const pad = (x: number | string, w: number) => String(x).padStart(w);

// Với một cảnh (vector eps + tập chỉ số có-lỗi), đo dưới RATIO g.ratio:
//   any%   = %khung NÊU ai đó
//   onDev% = trong số khung nêu, %nêu trúng NGƯỜI-CÓ-LỖI
//   onInno%= %nêu trúng NGƯỜI-ĐÚNG (đổ oan — thất bại kiểu V41 khi đa số lệch)
function measure(pas: PhaseAlign[], culprits: Set<number>, ratio: number) {
  let any = 0, onDev = 0, onInno = 0;
  for (const pa of pas) {
    const idx = classify(pa, { ...DEF, ratio });
    if (idx === null) continue;
    any++;
    if (culprits.has(idx)) onDev++; else onInno++;
  }
  return { any: pct(any, pas.length), onDev: pct(onDev, any), onInno: pct(onInno, any) };
}

// ── (0) Kiểm residual: cảnh 1-người-lạc M=0.7 phải cho người 0 trội hẳn, còn lại ~0 ──
{
  const pas = pasForVec(vecK(1, M));
  const acc = new Array(N).fill(0);
  for (const pa of pas) for (let i = 0; i < N; i++) acc[i] += pa.formResidual[i];
  console.log("# (0) Kiểm tra: 1 người lạc (M=0.7). formResidual TB mỗi vũ công (cm) — người 0 phải TRỘI.");
  console.log("  " + acc.map((v, i) => `d${i}=${(100 * v / pas.length).toFixed(1)}`).join("  "));
}

// ── (I) k người cùng lệch GIỐNG HỆT, N=5. Quét RATIO. Ranh giới IM↔NÊU + đổ oan ──
console.log("\n# (I) k người cùng lệch GIỐNG HỆT (M=0.7) / N=5. any=%khung nêu ai đó; dev/inno=trong đó %");
console.log("#     nêu trúng NGƯỜI-CÓ-LỖI / NGƯỜI-ĐÚNG. Cột theo RATIO. (* = mặc định 1.3)");
const header = "k(lệch) | " + RATIOS.map((r) => (r === 1.3 ? `${r.toFixed(2)}*` : r.toFixed(2)).padStart(16)).join(" ");
console.log(header);
console.log("        | " + RATIOS.map(() => "any  dev  inno".padStart(16)).join(" "));
for (let k = 1; k <= 4; k++) {
  const pas = pasForVec(vecK(k, M));
  const culprits = new Set(Array.from({ length: k }, (_, i) => i));
  const cells = RATIOS.map((r) => {
    const m = measure(pas, culprits, r);
    return `${pad(m.any, 3)} ${pad(m.onDev, 4)} ${pad(m.onInno, 4)}`.padStart(16);
  });
  console.log(`  k=${k}   | ` + cells.join(" "));
}

// ── (II) VÌ SAO k≥3 nêu trúng NGƯỜI ĐÚNG? In cấu trúc residual THẬT theo k. Gộp TRUNG VỊ tới
//         người khác ĐẢO thứ hạng khi phe-lệch thành ĐA SỐ: người-đúng thiểu số hoá thành "lạc". ──
console.log("\n# (II) Cấu trúc formResidual TB (cm) theo k — VÌ SAO (I) đổi nạn nhân. [d0..d{k-1}=lỗi | còn lại=đúng]");
console.log("#     Naïve tưởng residual ~ độ lệch (phe-lệch cao). ĐO cho thấy TRUNG VỊ đảo: k≥3, phe-lệch");
console.log("#     thành đa số ⇒ 'đồng thuận' ngả theo họ ⇒ NGƯỜI ĐÚNG (thiểu số) mới có residual cao.");
for (let k = 1; k <= 4; k++) {
  const pas = pasForVec(vecK(k, M));
  const acc = new Array(N).fill(0);
  for (const pa of pas) for (let i = 0; i < N; i++) acc[i] += pa.formResidual[i];
  const cells = acc.map((v, i) => {
    const tag = i < k ? "L" : "Đ"; // L=Lỗi, Đ=Đúng
    return `${tag}${(100 * v / pas.length).toFixed(1).padStart(5)}`;
  });
  console.log(`  k=${k} | ` + cells.join(" ") + `  → worst=${pas.length ? (pas[0].worst < k ? "phe-lỗi" : "phe-đúng") : "?"}`);
}
console.log("# (Naïve '1+floor((N-1)/RATIO)' CHỈ đúng khi residual monotone theo lệch — sai từ k≥3 do đảo");
console.log("#  trung vị. Đo phủ định dự đoán giải-tích của chính mình: đây là lý do phải ĐO, không chỉ suy.)");

// ── (III) Lề an toàn 1-người-lạc: 1 người sai rõ M + (k-1) người lệch NHẸ αM. Quét α ──
//   Người 0 là thủ phạm THẬT (M=0.7). 2 người kia lệch αM (nhiễu/biến thể nhỏ). Tăng α tới khi
//   RATIO không còn tách được người 0 khỏi đám → LỀ. RATIO cao = lề hẹp (dễ bỏ sót người lạc thật).
console.log("\n# (III) LỀ 1-người-lạc: d0 sai rõ M=0.7; d1,d2 lệch NHẸ αM; d3,d4 đúng. %khung NÊU ĐÚNG d0.");
console.log("#     α = độ lệch-nền của đám so với thủ phạm. RATIO cao bảo vệ đổ oan nhưng lề bắt d0 hẹp hơn.");
const ALPHAS = [0.0, 0.2, 0.4, 0.6, 0.8];
console.log("α\\RATIO | " + RATIOS.map((r) => (r === 1.3 ? `${r.toFixed(2)}*` : r.toFixed(2)).padStart(6)).join(""));
for (const a of ALPHAS) {
  const eps = [M, a * M, a * M, 0, 0];
  const pas = pasForVec(eps);
  const cells = RATIOS.map((r) => {
    let hit = 0;
    for (const pa of pas) if (classify(pa, { ...DEF, ratio: r }) === 0) hit++;
    return pad(pct(hit, pas.length), 6);
  });
  console.log(`  ${a.toFixed(1)}   | ` + cells.join(""));
}

console.log("\n# Đọc kết quả:");
console.log("# (I) Ba chế độ TÁCH BẠCH theo số người cùng lệch, KHÔNG phải một đường trơn:");
console.log("#   • k=1 (1 thủ phạm): mọi RATIO nêu ĐÚNG d0 (dev=100). RATIO không ăn mòn độ nhạy lỗi đơn.");
console.log("#   • k=2 (thiểu số cùng lỗi): nêu 1 trong 2 NGƯỜI-CÓ-LỖI (inno=0) — không vu oan người đúng,");
console.log("#     chỉ 'không nêu hết'; RATIO=2.0 mới IM. Chấp nhận được: người bị tô sáng THẬT SỰ sai.");
console.log("#   • k≥3 (ĐA SỐ cùng lỗi): nêu trúng NGƯỜI ĐÚNG (inno=100). Vì gộp TRUNG VỊ ngả theo đa số");
console.log("#     ⇒ thiểu số đúng hoá 'lạc' (xem II). RATIO=1.3 KHÔNG cứu được; k=4 thì RATIO nào cũng vu oan.");
console.log("# (II) Đây CHÍNH LÀ trần thông tin V41 hiện nguyên hình: chấm NHÓM-TƯƠNG-ĐỐI không cần nhãn thì");
console.log("#     khi ≥50% cùng sai, 'đồng thuận' sai theo — không núm nào trong sync.ts sửa nổi. Lối ra DUY");
console.log("#     NHẤT là thước TUYỆT ĐỐI theo nhãn tham chiếu (V42), dùng ở DAW clip-gán & Gate-0 held-out.");
console.log("# (III) LỀ lỗi-đơn: RATIO=1.3 giữ d0 bị nêu tới khi đám nhiễu-nền lên ~0.4·M, rồi IM ở 0.6·M");
console.log("#     (hỏng AN TOÀN — thà câm còn hơn vu oan). RATIO cao hơn thu hẹp lề này. ⇒ 1.3 là điểm vận");
console.log("#     hành BIỆN MINH ĐƯỢC cho giả định demonstrator 'lỗi hiếm, 1 người'; ca đa-số-lệch thuộc V42.");
