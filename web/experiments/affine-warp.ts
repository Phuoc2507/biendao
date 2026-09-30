// THỰC NGHIỆM V37 (nguyên mẫu, CHƯA ship): warping AFFINE (dịch+nhịp) có tách được
// TRÔI TEMPO khỏi SAI HÌNH DÁNG không — hay nó "giải thích mất" cả lỗi thật?
// ---------------------------------------------------------------------------
// Bằng chứng động cơ: ket-qua-gioi-han-rigid-tau.md Phần B — rigid-τ (chỉ DỊCH) báo giả
// từ trôi tempo ≥15%/s vì một độ trễ HẰNG không căn nổi độ trễ BIẾN THIÊN trong cửa sổ.
// Nấc tiếp theo trên thang warping: cho phép map thời gian AFFINE m(w)=t*+ρ(w−t*)+τ
// (thêm NHỊP ρ ngoài DỊCH τ). Trôi tempo (1+g)× có nghiệm chính xác ρ*=1/(1+g) → kỳ vọng
// residual→0. NHƯNG rủi ro kinh điển của elastic registration là OVER-WARPING: bậc tự do
// nhịp có thể kéo khớp một động tác SAI về gần đúng → hạ độ nhạy (TP). Nên ĐO tradeoff
// TRƯỚC khi ship: affine phải hạ residual TRÔI TEMPO mà KHÔNG hạ residual LỖI HÌNH DÁNG.
//
// Đo trực tiếp trên tư thế giải tích (không qua app) để cô lập đúng câu hỏi: với mỗi CẶP
// (ref A tempo-1, mov X), residual cực tiểu dưới (a) chỉ-dịch vs (b) affine.
//
// Tái lập (trong web/):
//   npx esbuild experiments/affine-warp.ts --bundle --platform=node --format=cjs --outfile=aff.cjs && node aff.cjs

const J = 17;
const REST: number[][] = [
  [0.0, 1.7, 0.0], [0.0, 1.5, 0.0], [0.18, 1.45, 0.0], [0.3, 1.2, 0.0], [0.34, 0.95, 0.0],
  [-0.18, 1.45, 0.0], [-0.3, 1.2, 0.0], [-0.34, 0.95, 0.0], [0.0, 1.3, 0.0], [0.12, 1.0, 0.0],
  [0.14, 0.55, 0.0], [0.15, 0.08, 0.0], [-0.12, 1.0, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0],
  [0.0, 1.0, 0.0], [0.0, 0.9, 0.0],
];
const PERIOD = 2.0, AMP = 0.45;

// Tư thế động tác với tập khớp `movers` dao động Y theo sin, tại thời-điểm-nội-tại τi.
function pose(movers: number[], ti: number): Float32Array {
  const s = Math.sin((2 * Math.PI * ti) / PERIOD);
  const out = new Float32Array(J * 3);
  for (let j = 0; j < J; j++) {
    out[j * 3] = REST[j][0];
    out[j * 3 + 1] = REST[j][1] + (movers.includes(j) ? AMP * s : 0);
    out[j * 3 + 2] = REST[j][2];
  }
  return out;
}
const A = [3, 4], B = [6, 7]; // A=tay phải, B=tay trái (lỗi hình dáng thật)

// movPose(x) = tư thế mover hiện ở WALL-TIME x cho từng kịch bản:
type Mover = (x: number) => Float32Array;
const echo = (tau: number): Mover => (x) => pose(A, x - tau); // trễ HẰNG (canon)
const tempo = (g: number): Mover => (x) => pose(A, x * (1 + g)); // trôi nhịp (1+g)×
const formErr: Mover = (x) => pose(B, x); // múa động tác KHÁC (sai hình dáng, khác CHI)
// Lỗi hình dáng TINH VI HƠN: đúng khớp A nhưng SAI BIÊN ĐỘ (scale·AMP). Warp thời gian
// KHÔNG thể sửa sai biên độ ⇒ affine cũng phải GIỮ cao (kiểm chứng không over-warp).
const ampErr = (scale: number): Mover => (x) => {
  const s = Math.sin((2 * Math.PI * x) / PERIOD);
  const out = new Float32Array(J * 3);
  for (let j = 0; j < J; j++) {
    out[j * 3] = REST[j][0];
    out[j * 3 + 1] = REST[j][1] + (A.includes(j) ? scale * AMP * s : 0);
    out[j * 3 + 2] = REST[j][2];
  }
  return out;
};

const HALF = 0.5, K = 13;
const usamp = Array.from({ length: K }, (_, s) => ((s / (K - 1)) * 2 - 1)); // ∈[-1,1]

function rms(a: Float32Array, b: Float32Array): number {
  let sq = 0;
  for (let j = 0; j < J; j++) {
    const o = j * 3;
    const dx = a[o] - b[o], dy = a[o + 1] - b[o + 1], dz = a[o + 2] - b[o + 2];
    sq += dx * dx + dy * dy + dz * dz;
  }
  return sq; // trả TỔNG bình phương; gộp rồi mới sqrt
}

// residual cực tiểu của CẶP (ref A tempo-1 vs mov) tại playhead t*, dưới lưới warp.
// rates=[1] ⇒ chỉ-dịch; rates nhiều ⇒ affine.
function minResidual(mov: Mover, tStar: number, taus: number[], rates: number[]): number {
  // cửa sổ ref (A tempo-1)
  const refWin = usamp.map((u) => pose(A, tStar + u * HALF));
  let best = Infinity;
  for (const rho of rates) {
    for (const tau of taus) {
      let sq = 0;
      for (let s = 0; s < K; s++) {
        const w = tStar + usamp[s] * HALF;
        const mapped = tStar + rho * (w - tStar) + tau; // m(w) affine
        sq += rms(refWin[s], mov(mapped));
      }
      if (sq < best) best = sq;
    }
  }
  return Math.sqrt(best / (K * J)); // mét
}

// Lưới tìm
const TAUS: number[] = [];
for (let v = -1.0; v <= 1.0001; v += 0.05) TAUS.push(+v.toFixed(3));
const RATES_SHIFT = [1.0];
const RATES_AFFINE: number[] = [];
for (let v = 0.7; v <= 1.4001; v += 0.02) RATES_AFFINE.push(+v.toFixed(3));

const PLAYHEADS = [1.0, 2.3, 3.7, 5.1, 6.4];
const avgOver = (mov: Mover, rates: number[]) =>
  (100 * PLAYHEADS.reduce((a, t) => a + minResidual(mov, t, TAUS, rates), 0)) / PLAYHEADS.length;

console.log("# residual cực tiểu của cặp (ref A vs mov), cm — trung bình 5 playhead.");
console.log("# CHỈ-DỊCH = rigid-τ (đang ship). AFFINE = thêm bậc tự do NHỊP ρ∈[0.7,1.4].");
console.log("kịch bản mover           | CHỈ-DỊCH | AFFINE | ghi chú");
console.log("-------------------------|----------|--------|---------------------------");
const rows: [string, Mover, string][] = [
  ["echo trễ 0.30s (canon)   ", echo(0.3), "cả hai phải ~0"],
  ["trôi tempo g=10%         ", tempo(0.1), "affine nên hạ mạnh"],
  ["trôi tempo g=15%         ", tempo(0.15), "affine nên hạ mạnh"],
  ["trôi tempo g=20%         ", tempo(0.2), "affine nên hạ mạnh"],
  ["trôi tempo g=30%         ", tempo(0.3), "affine nên hạ mạnh"],
  ["LỖI hình dáng (múa B)    ", formErr, "affine PHẢI GIỮ cao"],
  ["LỖI biên độ (A×0.4)      ", ampErr(0.4), "affine PHẢI GIỮ cao"],
  ["LỖI biên độ (A×0.7)      ", ampErr(0.7), "affine PHẢI GIỮ cao"],
];
for (const [name, mov, note] of rows) {
  const sh = avgOver(mov, RATES_SHIFT);
  const af = avgOver(mov, RATES_AFFINE);
  console.log(
    `${name} |  ${sh.toFixed(2).padStart(5)}   | ${af.toFixed(2).padStart(5)}  | ${note}`
  );
}

console.log("\n# Đọc: nếu AFFINE hạ residual TRÔI TEMPO xuống ~0 mà GIỮ residual LỖI hình");
console.log("# dáng cao ⇒ bậc tự do nhịp tách đúng timing khỏi form, đáng ship. Nếu affine");
console.log("# cũng hạ mạnh residual LỖI hình dáng ⇒ over-warping, KHÔNG ship (giấu mất lỗi).");
