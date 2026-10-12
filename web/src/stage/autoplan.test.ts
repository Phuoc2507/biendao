import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoPlan, pairClearance, clearance, minTransitionGap, fittedShape, timeGrid,
  changeIndices, energyChangeScore, nextArrangement, repairSwaps,
  DEFAULT_SHAPES, VMAX, CLEAR_M, MARGIN_X,
} from "./autoplan.ts";
import {
  type Project, type Vec2, type Formation, emptyProject, newDancer, checkInvariants,
  inWings, smoothstep, lerp2, dist, findWarnings, assignNearest,
} from "./model.ts";

const stage = { width: 10, depth: 6 };
const mkIds = (n: number) => Array.from({ length: n }, (_, i) => `d${i + 1}`);

function asProject(ids: string[], fs: Formation[]): Project {
  return {
    ...emptyProject(), stage,
    dancers: ids.map((id, i) => newDancer(id, `D${i + 1}`, "#fff")),
    formations: fs,
  };
}

/** Lấy mẫu theo thời gian thật với smoothstep, như findWarnings. */
function sampledClearance(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2, S = 400): number {
  let m = Infinity;
  for (let s = 0; s <= S; s++) {
    const u = smoothstep(s / S);
    m = Math.min(m, dist(lerp2(a0, a1, u), lerp2(b0, b1, u)));
  }
  return m;
}

test("pairClearance khớp lấy mẫu smoothstep", () => {
  const cases: [Vec2, Vec2, Vec2, Vec2][] = [
    [[-2, 0], [2, 0], [2, 0], [-2, 0]], // đổi chỗ đối đầu: va nhau ở giữa
    [[-2, 1], [2, 1], [2, -1], [-2, -1]], // đi song song ngược chiều, cách 2 m
    [[0, 0], [1, 0], [3, 0], [4, 0]], // cùng tịnh tiến
    [[0, 0], [3, 3], [3, 0], [0, 3]], // cắt chéo
    [[1, 1], [1, 1], [0, 0], [0, 0]], // đứng yên
  ];
  for (const [a0, a1, b0, b1] of cases) {
    const exact = pairClearance(a0, a1, b0, b1);
    const smp = sampledClearance(a0, a1, b0, b1);
    assert.ok(exact <= smp + 1e-9, "cực tiểu chính xác không lớn hơn lấy mẫu");
    assert.ok(smp - exact < 0.02, `lệch ${smp - exact}`);
  }
  assert.ok(pairClearance([-2, 0], [2, 0], [2, 0], [-2, 0]) < 1e-9);
  assert.ok(Math.abs(pairClearance([-2, 1], [2, 1], [2, -1], [-2, -1]) - 2) < 1e-9);
});

test("clearance đếm cặp va và chỉ ra cặp gần nhất", () => {
  const from: Vec2[] = [[-2, 0], [2, 0], [0, 2]];
  const to: Vec2[] = [[2, 0], [-2, 0], [0, 2]];
  const c = clearance(from, to);
  assert.equal(c.hits, 1);
  assert.deepEqual(c.pair, [0, 1]);
});

test("repairSwaps gỡ cặp đổi chỗ đối đầu", () => {
  const from: Vec2[] = [[-2, 0], [2, 0]];
  const to: Vec2[] = [[2, 0], [-2, 0]];
  const fixed = repairSwaps(from, to);
  assert.equal(clearance(from, fixed).hits, 0);
});

test("fittedShape: mọi hình nằm trong sàn (không vào cánh gà), không ai chồng ai", () => {
  for (const n of [1, 2, 5, 8, 12, 16]) {
    for (const k of DEFAULT_SHAPES) {
      for (const mirror of [false, true]) {
        const pts = fittedShape(k, n, stage, mirror);
        assert.equal(pts.length, n);
        for (const p of pts) {
          assert.ok(!inWings(p, stage), `${k} n=${n} vào cánh gà`);
          assert.ok(Math.abs(p[0]) <= stage.width / 2 - MARGIN_X + 1e-9);
          assert.ok(Math.abs(p[1]) <= stage.depth / 2 + 1e-9);
        }
        if (n <= 12)
          for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++)
              assert.ok(dist(pts[i], pts[j]) >= 0.45, `${k} n=${n} chồng nhau`);
      }
    }
  }
});

test("timeGrid: vạch lượt 8 theo BPM và phách 1, không BPM thì mốc 4 s", () => {
  const g = timeGrid(60, 120, 1);
  assert.equal(g.unit, 4);
  assert.equal(g.lines[0], 1);
  assert.ok(g.lines.at(-1)! <= 60);
  assert.ok(g.lines.every((t, i) => i === 0 || Math.abs(t - g.lines[i - 1] - 4) < 1e-6));
  // phách 1 đặt muộn: vẫn có vạch trước đó (≥ 0)
  const late = timeGrid(30, 120, 9);
  assert.equal(late.lines[0], 1);
  const free = timeGrid(30, null);
  assert.deepEqual(free.lines, [0, 4, 8, 12, 16, 20, 24, 28]);
  assert.equal(free.onBeat, false);
});

test("changeIndices: chia đều, có điểm số thì dời tới vạch điểm cao", () => {
  assert.deepEqual(changeIndices(12, 3, 2), [0, 4, 8, 12]);
  // điểm cao ở vạch 5 (gần 4): dời 4 -> 5
  const idx = changeIndices(12, 3, 2, (j) => (j === 5 ? 10 : 0));
  assert.deepEqual(idx, [0, 5, 8, 12]);
  // điểm cao quá xa chỗ chia đều: không dời
  assert.deepEqual(changeIndices(24, 3, 2, (j) => (j === 1 ? 10 : 0)), [0, 8, 16, 24]);
});

function checkPlan(fs: Formation[], ids: string[], bpm: number | null, downbeat: number, dur: number) {
  const p = asProject(ids, fs);
  assert.deepEqual(checkInvariants(p), []);
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    assert.ok(f.end - f.start >= (bpm ? (8 * 60) / bpm : 2) - 1e-6, `${f.name} giữ quá ngắn`);
    assert.ok(f.start >= -1e-9 && f.end <= dur + 1e-6);
    if (k > 0) assert.ok(fs[k - 1].end <= f.start + 1e-9, "khối đè nhau");
    for (const id of ids) assert.ok(!inWings(f.pos[id], stage), `${f.name}: ${id} trong cánh gà`);
    if (bpm) {
      const eight = (8 * 60) / bpm;
      const onLine = (t: number) => {
        const r = (t - downbeat) / eight;
        return Math.abs(r - Math.round(r)) < 1e-3;
      };
      assert.ok(onLine(f.start), `${f.name} bắt đầu lệch vạch lượt 8`);
      assert.ok(onLine(f.end), `${f.name} kết thúc lệch vạch lượt 8`);
    }
    const g = fs[k + 1];
    if (g) {
      const dur2 = g.start - f.end;
      for (const id of ids) {
        const peak = (1.5 * dist(f.pos[id], g.pos[id])) / dur2;
        assert.ok(peak <= VMAX + 1e-6, `${id} chạy ${peak.toFixed(2)} m/s`);
      }
    }
  }
  // không cảnh báo chạy quá nhanh hay chồng nhau
  const ws = findWarnings(fs, p.dancers).filter((w) => w.kind !== "collide");
  assert.deepEqual(ws.map((w) => w.msg), []);
}

test("autoPlan có BPM: mỗi 4 lượt 8, bám phách, không đè, không cánh gà", () => {
  const ids = mkIds(8);
  const bpm = 120, downbeat = 0.5, dur = 180;
  const fs = autoPlan({ ids, stage, duration: dur, bpm, downbeat });
  // 180 s, lượt 8 = 4 s, từ 0.5 tới 176.5 là 44 lượt -> 11 đội hình
  assert.equal(fs.length, 11);
  checkPlan(fs, ids, bpm, downbeat, dur);
  assert.equal(fs[0].start, 0.5);
  assert.equal(fs.at(-1)!.end, 176.5);
  // xoay vòng kiểu hình: hai đội hình liền nhau không trùng kiểu
  for (let k = 1; k < fs.length; k++) assert.notEqual(fs[k].name.split("· ")[1], fs[k - 1].name.split("· ")[1]);
  assert.ok(new Set(fs.map((f) => f.id)).size === fs.length);
});

test("autoPlan: số đội hình mong muốn và mỗi N lượt 8", () => {
  const ids = mkIds(6);
  const a = autoPlan({ ids, stage, duration: 120, bpm: 100, count: 5 });
  assert.equal(a.length, 5);
  checkPlan(a, ids, 100, 0, 120);
  const b = autoPlan({ ids, stage, duration: 120, bpm: 120, everyEights: 2 });
  assert.equal(b.length, 15); // 30 lượt 8 / 2
  checkPlan(b, ids, 120, 0, 120);
  // xin quá nhiều: kẹp để mỗi đoạn còn đủ 1 lượt giữ + 1 lượt chuyển
  const c = autoPlan({ ids, stage, duration: 40, bpm: 120, count: 50 });
  assert.equal(c.length, 5);
  checkPlan(c, ids, 120, 0, 40);
});

test("autoPlan không BPM: mốc giây đều, khoảng chuyển ≥ 2 s", () => {
  const ids = mkIds(7);
  const fs = autoPlan({ ids, stage, duration: 95, count: 6 });
  assert.equal(fs.length, 6);
  checkPlan(fs, ids, null, 0, 95);
  for (let k = 0; k + 1 < fs.length; k++) {
    assert.ok(fs[k + 1].start - fs[k].end >= 2 - 1e-9);
    assert.ok(Math.abs(fs[k + 1].start % 4) < 1e-6, "điểm đổi ở mốc 4 s");
  }
});

test("autoPlan: đường xa thì giãn khoảng chuyển theo VMAX", () => {
  // sân rộng 20 m, hai hình chéo qua lại: phải đi xa
  const big = { width: 20, depth: 10 };
  const ids = mkIds(10);
  const fs = autoPlan({ ids, stage: big, duration: 200, bpm: 180, everyEights: 4, shapes: ["line", "diagonal"] });
  const eight = (8 * 60) / 180;
  let longer = false;
  for (let k = 0; k + 1 < fs.length; k++) {
    const gap = fs[k + 1].start - fs[k].end;
    const far = Math.max(...ids.map((id) => dist(fs[k].pos[id], fs[k + 1].pos[id])));
    assert.ok((1.5 * far) / gap <= VMAX + 1e-6);
    if (gap > eight + 1e-6) longer = true;
  }
  assert.ok(longer, "ít nhất một khoảng chuyển phải giãn hơn 1 lượt 8");
});

test("autoPlan: bài quá ngắn ra đúng một khối; không có vũ công vẫn chạy", () => {
  const one = autoPlan({ ids: mkIds(3), stage, duration: 3, bpm: 120 });
  assert.equal(one.length, 1);
  assert.deepEqual(checkInvariants(asProject(mkIds(3), one)), []);
  const none = autoPlan({ ids: [], stage, duration: 60, bpm: 120 });
  assert.ok(none.length >= 1);
});

test("autoPlan: đội hình đầu gán theo vị trí sẵn có", () => {
  const ids = mkIds(4);
  // đang đứng hàng ngang đảo ngược thứ tự: d1 bên phải
  const start: Record<string, Vec2> = { d1: [3, 0], d2: [1, 0], d3: [-1, 0], d4: [-3, 0] };
  const fs = autoPlan({ ids, stage, duration: 60, bpm: 120, start, shapes: ["line", "v"] });
  assert.ok(fs[0].pos.d1[0] > fs[0].pos.d4[0], "giữ trái phải như đang đứng");
});

/** Gán ngây thơ: người thứ i tới điểm thứ i của hình, cùng chuỗi kiểu hình. */
function naiveGap(ids: string[], kinds: string[]): number {
  let min = Infinity;
  let prev = fittedShape(kinds[0] as never, ids.length, stage);
  for (let k = 1; k < kinds.length; k++) {
    const next = fittedShape(kinds[k] as never, ids.length, stage);
    min = Math.min(min, clearance(prev, next).min);
    prev = next;
  }
  return min;
}

test("khoảng cách tối thiểu khi chuyển tốt hơn gán ngây thơ, đạt ≥ 0.5 m", () => {
  for (const n of [5, 8, 10]) {
    const ids = mkIds(n);
    const fs = autoPlan({ ids, stage, duration: 240, bpm: 120 });
    const kinds = fs.map((f) => DEFAULT_SHAPES.find((k) => f.name.endsWith(
      { line: "Hàng ngang", twoLines: "Hai hàng", stagger: "So le", arc: "Vòng cung", v: "Chữ V", circle: "Vòng tròn", diagonal: "Đường chéo" }[k],
    ))!);
    const ours = minTransitionGap(fs, ids);
    const naive = naiveGap(ids, kinds);
    assert.ok(ours > naive, `n=${n}: ${ours.toFixed(2)} không hơn ngây thơ ${naive.toFixed(2)}`);
    assert.ok(ours >= CLEAR_M, `n=${n}: còn sát ${ours.toFixed(2)} m`);
    // khớp cảnh báo va chạm của app (ngưỡng 0.45 m)
    const p = asProject(ids, fs);
    assert.deepEqual(findWarnings(fs, p.dancers).filter((w) => w.kind === "collide"), []);
  }
});

test("nextArrangement: kiểu dự định gây va thì đổi gán/lật/kiểu khác cho đỡ va", () => {
  // hai người đứng thẳng hàng dọc giữa sân, đích hàng ngang: gán nào cũng ổn
  const from: Vec2[] = [[0, 1], [0, -1], [-2, 0], [2, 0]];
  const r = nextArrangement(from, "line", DEFAULT_SHAPES, stage);
  assert.equal(r.clearance.hits, 0);
  assert.equal(r.to.length, 4);
});

// ---------- năng lượng nhạc ----------

function synth(sr: number, sec: number, loudFrom: number, loudTo: number): Float32Array {
  const x = new Float32Array(Math.round(sr * sec));
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const amp = t >= loudFrom && t < loudTo ? 0.8 : 0.05;
    x[i] = amp * Math.sin(2 * Math.PI * 220 * t);
  }
  return x;
}

test("energyChangeScore: đỉnh ở chỗ nhạc to lên / nhỏ đi", () => {
  const sr = 8000;
  const x = synth(sr, 60, 21, 41);
  const sc = energyChangeScore(x, sr);
  const at = (t: number) => sc(t);
  assert.ok(at(21) > 3 * at(10), "vào đoạn to");
  assert.ok(at(41) > 3 * at(30), "ra đoạn to");
  // đỉnh cục bộ đúng chỗ đổi (±0.2 s)
  let best = 0, bt = 0;
  for (let t = 15; t <= 27; t += 0.05) if (at(t) > best) { best = at(t); bt = t; }
  assert.ok(Math.abs(bt - 21) < 0.2, `đỉnh ở ${bt}`);
});

test("autoPlan với nhạc: điểm đổi rơi vào vạch lượt 8 gần chỗ nhạc đổi", () => {
  const sr = 8000;
  // 120 BPM, lượt 8 = 4 s; chia đều 4 đoạn trong 64 s -> đổi ở 16, 32, 48.
  // Nhạc to lên ở 20.1 s (gần vạch 20) và nhỏ đi ở 44 s.
  const x = synth(sr, 64, 20.1, 44);
  const ids = mkIds(6);
  const plain = autoPlan({ ids, stage, duration: 64, bpm: 120, count: 4 });
  assert.deepEqual(plain.map((f) => f.start), [0, 16, 32, 48]);
  const fs = autoPlan({ ids, stage, duration: 64, bpm: 120, count: 4, changeScore: energyChangeScore(x, sr) });
  assert.deepEqual(fs.map((f) => f.start), [0, 20, 32, 44]);
  checkPlan(fs, ids, 120, 0, 64);
});

test("sửa va chạm (hoán đổi/lật/đổi kiểu) thoáng hơn chỉ gán Hungary khi đông người", () => {
  const n = 16;
  const ids = mkIds(n);
  const fs = autoPlan({ ids, stage, duration: 240, bpm: 120 });
  let prev = fittedShape(DEFAULT_SHAPES[0], n, stage);
  let hung = Infinity;
  for (let k = 1; k < fs.length; k++) {
    const pts = fittedShape(DEFAULT_SHAPES[k % DEFAULT_SHAPES.length], n, stage);
    const a = assignNearest(prev, pts);
    const to = prev.map((_, i) => pts[a[i]]);
    hung = Math.min(hung, clearance(prev, to).min);
    prev = to;
  }
  const ours = minTransitionGap(fs, ids);
  assert.ok(ours >= CLEAR_M, `còn sát ${ours.toFixed(2)} m`);
  assert.ok(ours > hung, `${ours.toFixed(2)} không hơn Hungary ${hung.toFixed(2)}`);
  for (let k = 1; k < fs.length; k++) assert.notEqual(fs[k].name.split("· ")[1], fs[k - 1].name.split("· ")[1]);
});
