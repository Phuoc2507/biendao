// THỰC NGHIỆM V41 (điểm sụp đổ): bộ phát hiện outlier hình dáng gộp-trung-vị chịu được
// BAO NHIÊU người sai ĐỒNG THỜI trước khi "tham chiếu đồng thuận" bị hỏng (masking/swamping)?
// ---------------------------------------------------------------------------
// formOutlierIndex nêu DUY NHẤT 1 người tệ nhất, tham chiếu là TRUNG VỊ residual từng-cặp.
// Lý thuyết robust: trung vị sụp ở ~50% nhiễm. Khi k người sai ĐỒNG THỜI:
//   - k nhỏ: người sai bị residual-cặp cao với đa số đúng → nêu ĐÚNG (hit).
//   - k vượt ~50%: người sai thành ĐA SỐ → trung vị của người ĐÚNG bị kéo cao (swamping),
//     của người sai tụt thấp (masking) → bộ dò chỉ NHẦM người đúng. Đây là điểm sụp.
// Đo 2 kịch bản đối lập:
//   (U) sai ĐỒNG DẠNG (k người cùng múa 1 động tác sai) — người sai KHỚP NHAU → củng cố
//       đa số giả → sụp SỚM, đúng ~50%.
//   (D) sai ĐA DẠNG (mỗi người sai một kiểu khác) — người sai KHÔNG khớp nhau → không dựng
//       nổi đa số → tham chiếu bền hơn.
// ĐỒNG THỜI đo formSync LIÊN TỤC: kỳ vọng nó GIẢM ĐƠN ĐIỆU theo k kể cả chỗ cờ rời rạc sụp
// ⇒ chứng minh thiết kế HAI TẦNG đúng: formSync = "đồng bộ tổng thể", cờ = "ai lạc" chỉ khi
// thiểu số lạc. (Sai hàng loạt k~N/2 KHÔNG còn là "outlier" — đúng ngữ nghĩa nên cờ im.)
//
// Tái lập (trong web/):
//   npx esbuild experiments/breakdown-point.ts --bundle --platform=node --format=cjs --outfile=bp.cjs && node bp.cjs

import type { ClipData } from "../src/clip";
import { phaseAlignAt, formOutlierIndex, DEFAULT_PHASE, type SyncDancer } from "../src/sync";

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

// Clip "đúng" A = vung tay phải. Các động tác SAI khác nhau (tập khớp khác nhau).
const A = buildClip([3, 4]);
const WRONG: ClipData[] = [
  buildClip([6, 7]),   // tay trái
  buildClip([9, 12]),  // hông
  buildClip([10, 13]), // gối
  buildClip([2, 5]),   // vai
  buildClip([4, 7]),   // khuỷu chéo
  buildClip([3, 6]),   // vai chéo
];

const N = 7; // lẻ → ranh giới 50% nằm giữa k=3 và k=4, thấy crossover rõ.
const T0 = 0.6, T1 = 7.4, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const pct = (x: number) => Math.round((100 * x) / NT);

// unison=true: k người sai CÙNG dùng WRONG[0]. false: mỗi người sai một WRONG khác nhau.
// Người 0..k-1 là "sai", k..N-1 là "đúng" (clip A).
function run(k: number, unison: boolean) {
  const clipMap: Record<string, ClipData> = { A };
  const dancers: SyncDancer[] = [];
  for (let d = 0; d < N; d++) {
    if (d < k) {
      const key = `W${unison ? 0 : d % WRONG.length}`;
      clipMap[key] = WRONG[unison ? 0 : d % WRONG.length];
      dancers.push({ sequence: [key], timeOffset: 0 });
    } else {
      dancers.push({ sequence: ["A"], timeOffset: 0 });
    }
  }
  let hit = 0, falseAcc = 0, miss = 0, fsSum = 0, nn = 0;
  for (const t of times) {
    const pa = phaseAlignAt(clipMap, A, dancers, t, DEFAULT_PHASE);
    if (!pa) continue;
    fsSum += pa.formSync; nn++;
    const idx = formOutlierIndex(pa);
    if (idx === null) miss++;
    else if (idx < k) hit++;      // nêu đúng 1 người sai
    else falseAcc++;              // nêu NHẦM người đúng (swamping)
  }
  return { hit: pct(hit), falseAcc: pct(falseAcc), miss: pct(miss), fs: (100 * fsSum) / nn };
}

for (const [label, unison] of [["(U) SAI ĐỒNG DẠNG — k người cùng 1 động tác sai", true],
                               ["(D) SAI ĐA DẠNG — mỗi người sai một kiểu", false]] as [string, boolean][]) {
  console.log(`# ${label}. N=${N}.`);
  console.log("# hit=nêu đúng người sai; nhầm=nêu người ĐÚNG (swamping); im=không nêu (mask nếu k>0).");
  console.log("k (sai) | k/N   | hit  | nhầm | im   | formSync");
  console.log("--------|-------|------|------|------|---------");
  for (let k = 0; k <= N - 1; k++) {
    const r = run(k, unison);
    const frac = (k / N).toFixed(2);
    console.log(
      `   ${k}    | ${frac} | ${String(r.hit).padStart(3)}% | ${String(r.falseAcc).padStart(3)}% | ${String(r.miss).padStart(3)}% |   ${r.fs.toFixed(0).padStart(3)}`
    );
  }
  console.log();
}

console.log("# Đọc: nhầm% bật lên đâu = điểm sụp của tham chiếu trung vị. Kỳ vọng (U) sụp quanh");
console.log("# k/N≈0.5 (người sai đồng dạng dựng được đa số giả), (D) bền hơn (sai đa dạng không");
console.log("# củng cố nhau). formSync GIẢM ĐƠN ĐIỆU theo k ở cả hai ⇒ tầng liên tục vẫn báo đúng");
console.log("# 'kém đồng bộ' kể cả khi cờ rời rạc mất nghĩa ⇒ thiết kế hai tầng hợp lý.");
