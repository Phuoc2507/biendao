// THỰC NGHIỆM (tầng đánh giá): TÁCH PHA có thắng ĐỒNG BỘ TỨC THỜI ngây thơ không?
// ---------------------------------------------------------------------------
// Chạy TRỰC TIẾP trên mã đã ship (src/sync.ts, src/clip.ts) — không giả lập lại
// thuật toán. Sinh clip tổng hợp có SỰ THẬT NỀN đã biết rồi so hai bộ phát hiện
// "người múa sai":
//   NGÂY THƠ (V34):  outlierIndex ∘ groupDeviationAt   — đồng bộ TỨC THỜI tại t.
//   TÁCH PHA (V35):  formOutlierIndex ∘ phaseAlignAt    — căn trễ tối ưu rồi mới
//                     chấm phần dư HÌNH DÁNG (bất biến với trễ nhịp/canon).
//
// Hai kịch bản, sự thật nền rõ ràng:
//   SẠCH (canon/echo cố ý, KHÔNG lỗi): mọi người múa ĐỘNG TÁC A; riêng 1 người
//       vào trễ τ giây (echo). Không ai múa sai → mọi lần "gọi tên" là BÁO GIẢ (FP).
//   LỖI (sai động tác thật): mọi người múa A đúng nhịp; riêng 1 người múa ĐỘNG TÁC
//       B (khác hẳn). Sự thật: người đó sai → gọi đúng tên = TRÚNG (TP), gọi nhầm
//       người khác = misID.
//
// Kỳ vọng: dưới canon, bộ NGÂY THƠ báo giả nhiều (người echo trông như múa sai),
// còn TÁCH PHA căn được τ nên phần dư ~0 → không báo giả; cả hai vẫn bắt đúng lỗi B.
//
// Tái lập:  npx esbuild experiments/phase-sync-validation.ts --bundle --platform=node --format=cjs | node -

import type { ClipData } from "../src/clip";
import {
  groupDeviationAt,
  outlierIndex,
  phaseAlignAt,
  formOutlierIndex,
  groupSyncAt,
  type SyncDancer,
} from "../src/sync";

// ── Bộ xương 17 khớp (đại khái người đứng, mét, Y-up, sàn Y=0) ────────────────
const J = 17;
const REST: [number, number, number][] = [
  [0.0, 1.70, 0.0], // 0 đầu
  [0.0, 1.50, 0.0], // 1 cổ
  [0.18, 1.45, 0.0], // 2 vai P
  [0.30, 1.20, 0.0], // 3 khuỷu P
  [0.34, 0.95, 0.0], // 4 bàn tay P
  [-0.18, 1.45, 0.0], // 5 vai T
  [-0.30, 1.20, 0.0], // 6 khuỷu T
  [-0.34, 0.95, 0.0], // 7 bàn tay T
  [0.0, 1.30, 0.0], // 8 ngực
  [0.12, 1.00, 0.0], // 9 hông P
  [0.14, 0.55, 0.0], // 10 gối P
  [0.15, 0.08, 0.0], // 11 cổ chân P
  [-0.12, 1.00, 0.0], // 12 hông T
  [-0.14, 0.55, 0.0], // 13 gối T
  [-0.15, 0.08, 0.0], // 14 cổ chân T
  [0.0, 1.00, 0.0], // 15 rốn
  [0.0, 0.90, 0.0], // 16 chậu
];

const FPS = 30;
const NUM_FRAMES = 240; // 8.0s
const PERIOD = 2.0; // chu kỳ dao động (giây)
const AMP = 0.45; // biên độ tay (mét) — đủ lớn như mocap thật

// Dựng clip: `movers` là các khớp dao động theo Y = rest + AMP·sin(2π t/P).
// Động tác A vung TAY PHẢI (khớp 3,4); B vung TAY TRÁI (khớp 6,7). Khác bên nên
// KHÔNG phép dịch thời gian τ nào căn khớp được → phần dư hình dáng luôn lớn.
function buildClip(movers: number[]): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const t = f / FPS;
    const s = Math.sin((2 * Math.PI * t) / PERIOD);
    const pose: number[][] = REST.map((p) => [p[0], p[1], p[2]]);
    for (const j of movers) pose[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    frames.push(pose);
  }
  return {
    fps: FPS,
    numFrames: NUM_FRAMES,
    jointNames: Array.from({ length: J }, (_, i) => `j${i}`),
    edges: [],
    mirrorPairs: [],
    frames,
    meta: {},
  };
}

const clips: Record<string, ClipData> = {
  A: buildClip([3, 4]), // vung tay PHẢI
  B: buildClip([6, 7]), // vung tay TRÁI (động tác "sai")
};
const layout = clips.A;

const N = 5; // số vũ công
const ECHO = 0; // người vào trễ (canon) trong kịch bản SẠCH
const ERR = 0; // người múa động tác B trong kịch bản LỖI
const T0 = 0.6,
  T1 = 7.4,
  NT = 40; // 40 mốc thời gian treo
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const TAUS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];

// Nhóm SẠCH: mọi người múa A; riêng ECHO vào trễ τ (canon/echo, KHÔNG sai).
function cleanGroup(tau: number): SyncDancer[] {
  return Array.from({ length: N }, (_, k) => ({
    sequence: ["A"],
    timeOffset: k === ECHO ? tau : 0,
  }));
}
// Nhóm LỖI: mọi người múa A đúng nhịp; riêng ERR múa B (sai động tác thật).
function errGroup(): SyncDancer[] {
  return Array.from({ length: N }, (_, k) => ({
    sequence: [k === ERR ? "B" : "A"],
    timeOffset: 0,
  }));
}

function naiveOutlier(dancers: SyncDancer[], t: number): number | null {
  const g = groupDeviationAt(clips, layout, dancers, t);
  return g ? outlierIndex(g) : null;
}
function phaseOutlier(dancers: SyncDancer[], t: number): number | null {
  const pa = phaseAlignAt(clips, layout, dancers, t);
  return pa ? formOutlierIndex(pa) : null;
}

console.log("# Tách pha (V35) vs Đồng bộ tức thời (V34) — phát hiện người múa sai");
console.log(`# N=${N} vũ công, ${NT} mốc thời gian ∈ [${T0},${T1}]s, clip 8s @${FPS}fps`);
console.log("# A=vung tay phải, B=vung tay trái (lỗi). ECHO/ERR = vũ công 0.");
console.log("");
console.log(
  "τ(s) | FP_naive FP_phase | TP_naive TP_phase | mis_naive mis_phase | syncNaive formSync"
);
console.log(
  "-----|-------------------|-------------------|---------------------|-------------------"
);

const rows: Record<string, number>[] = [];
for (const tau of TAUS) {
  let fpN = 0,
    fpP = 0,
    tpN = 0,
    tpP = 0,
    misN = 0,
    misP = 0;
  let syncNaiveSum = 0,
    formSyncSum = 0;
  const clean = cleanGroup(tau);
  const err = errGroup();
  for (const t of times) {
    // SẠCH → mọi lần gọi tên là báo giả.
    if (naiveOutlier(clean, t) !== null) fpN++;
    if (phaseOutlier(clean, t) !== null) fpP++;
    // LỖI → gọi đúng ERR = trúng; gọi người khác = nhầm.
    const oN = naiveOutlier(err, t);
    if (oN === ERR) tpN++;
    else if (oN !== null) misN++;
    const oP = phaseOutlier(err, t);
    if (oP === ERR) tpP++;
    else if (oP !== null) misP++;
    // Chỉ số nhóm trên nhóm SẠCH (canon): naive tụt, formSync phải giữ cao.
    const sN = groupSyncAt(clips, layout, clean, t);
    if (sN !== null) syncNaiveSum += sN;
    const pa = phaseAlignAt(clips, layout, clean, t);
    if (pa) formSyncSum += pa.formSync;
  }
  const pct = (x: number) => Math.round((100 * x) / NT);
  const r = {
    tau,
    FP_naive: pct(fpN),
    FP_phase: pct(fpP),
    TP_naive: pct(tpN),
    TP_phase: pct(tpP),
    mis_naive: pct(misN),
    mis_phase: pct(misP),
    syncNaive: Math.round((100 * syncNaiveSum) / NT),
    formSync: Math.round((100 * formSyncSum) / NT),
  };
  rows.push(r);
  console.log(
    `${tau.toFixed(2)} |   ${String(r.FP_naive).padStart(3)}      ${String(
      r.FP_phase
    ).padStart(3)}    |   ${String(r.TP_naive).padStart(3)}      ${String(
      r.TP_phase
    ).padStart(3)}    |    ${String(r.mis_naive).padStart(3)}      ${String(
      r.mis_phase
    ).padStart(3)}     |    ${String(r.syncNaive).padStart(3)}      ${String(
      r.formSync
    ).padStart(3)}`
  );
}

// Tổng hợp cho τ>0 (có canon).
const canon = rows.filter((r) => r.tau > 0);
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
console.log("");
console.log("## Tổng hợp cho các mốc CÓ canon (τ>0):");
console.log(`  FP trung bình:  naive=${mean(canon.map((r) => r.FP_naive))}%  phase=${mean(canon.map((r) => r.FP_phase))}%`);
console.log(`  TP trung bình:  naive=${mean(canon.map((r) => r.TP_naive))}%  phase=${mean(canon.map((r) => r.TP_phase))}%`);
console.log(`  misID trung bình: naive=${mean(canon.map((r) => r.mis_naive))}%  phase=${mean(canon.map((r) => r.mis_phase))}%`);
console.log(`  Chỉ số nhóm SẠCH: syncNaive=${mean(canon.map((r) => r.syncNaive))}%  formSync=${mean(canon.map((r) => r.formSync))}%`);
console.log("");
console.log("JSON " + JSON.stringify(rows));
