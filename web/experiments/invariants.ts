// GUARD BẤT BIẾN (tầng đánh giá) — KHÁC mọi script khác: không ĐO để kể chuyện mà
// KHẲNG ĐỊNH (assert) các cam kết lõi của hội đồng, NÉM nếu vỡ. Vì sao cần: runner
// `run-all.mjs` chỉ kiểm TẤT ĐỊNH (chạy 2 lần byte y hệt) — một sửa đổi làm HỎNG
// đảm bảo V35 nhưng vẫn tất định sẽ qua mặt runner trong khi novelty âm thầm thoái.
// File này đóng khe đó: chạy TRỰC TIẾP src/sync.ts đã ship và chốt từng bất biến.
//
// Hai lớp khẳng định:
//   (1) GÁC SUY BIẾN (chắc từ đọc mã): <2 vũ công→null, chuỗi rỗng→dự phòng layout,
//       meanSync([])→null, groupSyncSeries(n≤1)→[]. Đây là các lối sập LIVE đã soát
//       ở consumer (SyncHighlighter/Timeline/SyncBreakdown) — khoá lại để không tái phát.
//   (2) CAM KẾT V33/V35 (đo-trước rồi chốt số TẤT ĐỊNH): unison→điểm ~1 & không nêu ai;
//       canon→tách pha BÁO GIẢ 0 trong khi ngây thơ >0 (đúng điểm hơn thua); sai động
//       tác thật→tách pha gọi ĐÚNG thủ phạm, KHÔNG đổ oan ai.
//
// Tái lập:  npx esbuild experiments/invariants.ts --bundle --platform=node --format=cjs | node -

import assert from "node:assert";
import type { ClipData } from "../src/clip";
import {
  groupDeviationAt,
  groupSyncAt,
  groupSyncSeries,
  meanSync,
  outlierIndex,
  phaseAlignAt,
  formOutlierIndex,
  type SyncDancer,
} from "../src/sync";

// ── Bộ xương 17 khớp + clip tổng hợp: GIỐNG phase-sync-validation.ts để bất biến
//    được khẳng định trên ĐÚNG động học mà thực nghiệm V35 đã đo. ─────────────────
const J = 17;
const REST: [number, number, number][] = [
  [0.0, 1.70, 0.0], [0.0, 1.50, 0.0], [0.18, 1.45, 0.0], [0.30, 1.20, 0.0],
  [0.34, 0.95, 0.0], [-0.18, 1.45, 0.0], [-0.30, 1.20, 0.0], [-0.34, 0.95, 0.0],
  [0.0, 1.30, 0.0], [0.12, 1.00, 0.0], [0.14, 0.55, 0.0], [0.15, 0.08, 0.0],
  [-0.12, 1.00, 0.0], [-0.14, 0.55, 0.0], [-0.15, 0.08, 0.0], [0.0, 1.00, 0.0],
  [0.0, 0.90, 0.0],
];
const FPS = 30, NUM_FRAMES = 240, PERIOD = 2.0, AMP = 0.45;

function buildClip(movers: number[]): ClipData {
  const frames: number[][][] = [];
  for (let f = 0; f < NUM_FRAMES; f++) {
    const s = Math.sin((2 * Math.PI * (f / FPS)) / PERIOD);
    const pose: number[][] = REST.map((p) => [p[0], p[1], p[2]]);
    for (const j of movers) pose[j] = [REST[j][0], REST[j][1] + AMP * s, REST[j][2]];
    frames.push(pose);
  }
  return { fps: FPS, numFrames: NUM_FRAMES, jointNames: Array.from({ length: J }, (_, i) => `j${i}`), edges: [], mirrorPairs: [], frames, meta: {} };
}

const clips: Record<string, ClipData> = { A: buildClip([3, 4]), B: buildClip([6, 7]) };
const layout = clips.A;

let passed = 0;
function ok(name: string, cond: boolean, detail = "") {
  assert.ok(cond, `BẤT BIẾN VỠ: ${name}${detail ? " — " + detail : ""}`);
  passed++;
  console.log(`  [✓] ${name}${detail ? "  (" + detail + ")" : ""}`);
}

console.log("# GUARD BẤT BIẾN tầng đánh giá — khẳng định cam kết V33/V35, ném nếu vỡ");
console.log("");

// ── (1) GÁC SUY BIẾN — các lối sập LIVE phải trả giá trị rỗng an toàn ────────────
console.log("## (1) Gác suy biến");
const one: SyncDancer[] = [{ sequence: ["A"], timeOffset: 0 }];
ok("groupDeviationAt(<2 vũ công) → null", groupDeviationAt(clips, layout, one, 1.0) === null);
ok("phaseAlignAt(<2 vũ công) → null", phaseAlignAt(clips, layout, one, 1.0) === null);
ok("groupSyncAt(<2 vũ công) → null", groupSyncAt(clips, layout, one, 1.0) === null);
ok("groupSyncSeries(n≤1) → []", groupSyncSeries(clips, layout, one, 8, 1).length === 0);
ok("meanSync([]) → null", meanSync([]) === null);
// Chuỗi RỖNG phải rơi về clip layout → deviations vẫn 1:1 theo số vũ công (không lệch mảng).
const gFallback = groupDeviationAt(
  clips, layout,
  [{ sequence: [], timeOffset: 0 }, { sequence: ["A"], timeOffset: 0 }],
  1.0
);
ok("chuỗi rỗng → dự phòng layout, deviations đủ phần tử",
  gFallback !== null && gFallback.deviations.length === 2,
  gFallback ? `len=${gFallback.deviations.length}` : "null");

// ── (2a) UNISON (V33): cùng clip, cùng nhịp → điểm ~1, KHÔNG nêu ai ──────────────
console.log("\n## (2a) Unison (V33)");
const uni: SyncDancer[] = Array.from({ length: 3 }, () => ({ sequence: ["A"], timeOffset: 0 }));
const gUni = groupDeviationAt(clips, layout, uni, 1.0)!;
ok("unison → sync ≈ 1", gUni.sync > 0.999, `sync=${gUni.sync.toFixed(4)}`);
ok("unison → outlierIndex không nêu ai", outlierIndex(gUni) === null);
const paUni = phaseAlignAt(clips, layout, uni, 1.0)!;
ok("unison → formSync ≈ 1", paUni.formSync > 0.999, `formSync=${paUni.formSync.toFixed(4)}`);
ok("unison → formOutlierIndex không nêu ai", formOutlierIndex(paUni) === null);

// ── Lưới thời gian + nhóm cho (2b)/(2c), GIỐNG thực nghiệm V35 ────────────────────
const N = 5, ECHO = 0, ERR = 2, T0 = 0.6, T1 = 7.4, NT = 40;
const times = Array.from({ length: NT }, (_, i) => T0 + ((T1 - T0) * i) / (NT - 1));
const TAU = 0.3; // canon rõ rệt
const cleanGroup: SyncDancer[] = Array.from({ length: N }, (_, k) => ({ sequence: ["A"], timeOffset: k === ECHO ? TAU : 0 }));
const errGroup: SyncDancer[] = Array.from({ length: N }, (_, k) => ({ sequence: [k === ERR ? "B" : "A"], timeOffset: 0 }));
const naive = (d: SyncDancer[], t: number) => { const g = groupDeviationAt(clips, layout, d, t); return g ? outlierIndex(g) : null; };
const phase = (d: SyncDancer[], t: number) => { const pa = phaseAlignAt(clips, layout, d, t); return pa ? formOutlierIndex(pa) : null; };

// ── (2b) CANON (V35): tách pha báo giả 0; ngây thơ >0 (điểm hơn thua) ────────────
console.log("\n## (2b) Canon — tách pha vs ngây thơ (V35)");
let fpNaive = 0, fpPhase = 0;
for (const t of times) {
  if (naive(cleanGroup, t) !== null) fpNaive++;
  if (phase(cleanGroup, t) !== null) fpPhase++;
}
ok("canon → tách pha KHÔNG báo giả (FP=0)", fpPhase === 0, `FP_phase=${fpPhase}/${NT}`);
ok("canon → ngây thơ CÓ báo giả (FP>0) = lý do cần tách pha", fpNaive > 0, `FP_naive=${fpNaive}/${NT}`);

// ── (2c) SAI ĐỘNG TÁC THẬT (V35): tách pha gọi ĐÚNG thủ phạm, KHÔNG đổ oan ────────
console.log("\n## (2c) Sai động tác thật");
let tpPhase = 0, misPhase = 0;
for (const t of times) {
  const o = phase(errGroup, t);
  if (o === ERR) tpPhase++;
  else if (o !== null) misPhase++;
}
ok("sai động tác → tách pha gọi ĐÚNG thủ phạm ở đa số mốc", tpPhase >= NT * 0.9, `TP_phase=${tpPhase}/${NT}`);
ok("sai động tác → KHÔNG đổ oan ai khác (misID=0)", misPhase === 0, `misID=${misPhase}/${NT}`);

console.log(`\n${passed} bất biến ĐẠT. Tầng đánh giá giữ đúng cam kết V33/V35.`);
