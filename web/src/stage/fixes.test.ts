import { test } from "node:test";
import assert from "node:assert/strict";
import { fixAll, reassignFix, staggerFix, widenFix } from "./fixes.ts";
import { blockedIssues, transitionIssues } from "./checks.ts";
import { type Formation, type StageSize, type Vec2 } from "./model.ts";

const stage: StageSize = { width: 8, depth: 6 };
const ds = [
  { id: "a", name: "An" },
  { id: "b", name: "Bình" },
];
const F = (id: string, start: number, end: number, pos: Record<string, Vec2>): Formation => ({
  id, name: `Đội hình ${id}`, start, end, pos,
});

test("đổi chỗ cho gần: hai người bắt chéo thì đổi lại, hết va và hết chạy nhanh", () => {
  // An từ trái sang phải, Bình ngược lại, 4 m trong 2 s: vừa va vừa quá nhanh
  const fs = [F("1", 0, 2, { a: [-2, 0], b: [2, 0] }), F("2", 4, 6, { a: [2, 0], b: [-2, 0] })];
  assert.ok(transitionIssues(fs, ds, stage, null).length >= 2);
  const fx = reassignFix(fs, 1, ds, stage, null);
  assert.ok(fx);
  assert.equal(fx.after, 0);
  assert.deepEqual(fx.fs[1].pos, { a: [-2, 0], b: [2, 0] });
  assert.equal(fx.fs[0], fs[0]); // đội hình trước giữ nguyên
});

test("đổi chỗ cho gần: đã gần nhất thì không đề nghị", () => {
  const fs = [F("1", 0, 2, { a: [-2, 0], b: [2, 0] }), F("2", 2.5, 6, { a: [-2, 2], b: [2, 2] })];
  assert.equal(reassignFix(fs, 1, ds, stage, null), null);
});

test("đổi chỗ cho gần: không đề nghị nếu làm đoạn ra khỏi đội hình xấu đi", () => {
  // vào đội hình 2 thì đổi là tốt, nhưng đội hình 3 lại đưa mỗi người về đúng chỗ cũ ở đội hình 2
  const fs = [
    F("1", 0, 2, { a: [-2, 0], b: [2, 0] }),
    F("2", 4, 6, { a: [2, 0], b: [-2, 0] }),
    F("3", 6.5, 8, { a: [2, 1], b: [-2, 1] }),
  ];
  const fx = reassignFix(fs, 1, ds, stage, null);
  // vào: hết 2 cảnh báo; ra: thêm va và chạy nhanh. Không được tệ hơn tổng thể.
  assert.ok(fx === null || fx.after < fx.before);
});

test("đổi vai từ đây: đổi riêng làm đoạn ra xấu thì đổi vai cho cả các đội hình sau", () => {
  // vào đội hình 2 chậm (6 s) nên chỉ va; ra đội hình 3 gấp (0,5 s) nên đổi riêng là va và chạy nhanh
  const fs = [
    F("1", 0, 2, { a: [-2, 0], b: [2, 0] }),
    F("2", 8, 10, { a: [2, 0], b: [-2, 0] }),
    F("3", 10.5, 12, { a: [2, 1], b: [-2, 1] }),
  ];
  const fx = reassignFix(fs, 1, ds, stage, null);
  assert.ok(fx);
  assert.equal(fx.carry, true);
  // hết va; hai lỗi chạy nhanh sang đội hình 3 vẫn y như trước (hình giữ nguyên, chỉ đổi tên)
  assert.equal(fx.after, fx.before - 1);
  assert.ok(transitionIssues(fx.fs, ds, stage, null).every((i) => i.kind === "fast"));
  assert.deepEqual(fx.fs[2].pos, { a: [-2, 1], b: [2, 1] }); // An nhận luôn chỗ của Bình về sau
  assert.equal(fx.fs[0], fs[0]);
});

test("nới khoảng chuyển: rời sớm đủ cho dưới VMAX, giữ lúc tới, bắt về phách", () => {
  // 6 m trong 2 s ở 120 BPM (phách 0,5 s): cần 1,5·6/1,5 = 6 s
  const fs = [F("1", 0, 10, { a: [-3, 0] }), F("2", 12, 14, { a: [3, 0] })];
  const one = [ds[0]];
  const fx = widenFix(fs, 1, one, stage, 120);
  assert.ok(fx);
  assert.equal(fx.fs[1].start, 12);
  assert.equal(fx.fs[0].end, 6);
  assert.equal(fx.partial, false);
  assert.equal(transitionIssues(fx.fs, one, stage, 120).length, 0);
});

test("nới khoảng chuyển: mép rời bắt về phách trước (không làm thiếu giờ)", () => {
  // cần 5 s, phách 0,6 s (100 BPM): 12 - 5 = 7 -> bắt xuống 6,6
  const fs = [F("1", 0, 10, { a: [-2.5, 0] }), F("2", 12, 14, { a: [2.5, 0] })];
  const fx = widenFix(fs, 1, [ds[0]], stage, 100);
  assert.ok(fx);
  assert.ok(Math.abs(fx.fs[0].end - 6.6) < 1e-9);
});

test("nới khoảng chuyển: đội hình trước quá ngắn thì nới hết mức và báo chưa đủ", () => {
  const fs = [F("1", 0, 3, { a: [-3, 0] }), F("2", 4, 6, { a: [3, 0] })];
  const fx = widenFix(fs, 1, [ds[0]], stage, 120);
  assert.ok(fx);
  assert.equal(fx.fs[0].end, 0.5);
  assert.equal(fx.partial, true);
});

test("nới khoảng chuyển: không ai quá nhanh thì không đề nghị", () => {
  const fs = [F("1", 0, 2, { a: [-1, 0] }), F("2", 4, 6, { a: [1, 0] })];
  assert.equal(widenFix(fs, 1, [ds[0]], stage, null), null);
});

test("sửa tất cả: bắt chéo và quá nhanh đều hết, lúc tới các đội hình giữ nguyên", () => {
  const fs = [
    F("1", 0, 3, { a: [-3, 0], b: [3, 0] }),
    F("2", 4, 6, { a: [3, 0], b: [-3, 0] }),
    F("3", 7, 9, { a: [-3, 2], b: [3, 2] }),
  ];
  const out = fixAll(fs, ds, stage, 120);
  assert.deepEqual(out.map((f) => f.start), [0, 4, 7]);
  assert.equal(transitionIssues(out, ds, stage, 120).length, 0);
});

test("đứng so le: dời người bị che sang ngang vừa đủ, về phía xa người trước", () => {
  const fs = [F("1", 0, 2, { a: [0.1, -1], b: [0, 1] }), F("2", 8, 10, { a: [-2, 0], b: [2, 0] })];
  assert.equal(blockedIssues(fs, ds, stage).length, 1);
  const fx = staggerFix(fs, 0, "a", "b", ds, stage, null);
  assert.ok(fx);
  assert.deepEqual(fx.fs[0].pos.a, [0.4, -1]); // giữ hàng sau, chỉ dời ngang
  assert.deepEqual(fx.fs[0].pos.b, [0, 1]);
  assert.equal(fx.fs[1], fs[1]);
  assert.equal(fx.before, 1);
  assert.equal(fx.after, 0);
  assert.ok(Math.abs(fx.dx - 0.3) < 1e-9);
  assert.deepEqual(blockedIssues(fx.fs, ds, stage), []);
  assert.ok(transitionIssues(fx.fs, ds, stage, null).length <= transitionIssues(fs, ds, stage, null).length);
});

test("đứng so le: sát mép sân thì dời vào trong; hết chỗ thì null", () => {
  const edge = [F("1", 0, 2, { a: [3.9, -1], b: [3.8, 1] })];
  const fx = staggerFix(edge, 0, "a", "b", ds, stage, null);
  assert.ok(fx);
  assert.deepEqual(fx.fs[0].pos.a, [3.4, -1]); // bên phải ra ngoài sân, nên sang trái
  // hai bên đều vướng người khác đứng sau cùng hàng: không có chỗ
  const four = [...ds, { id: "c", name: "Cúc" }, { id: "d", name: "Dung" }];
  const tight = [F("1", 0, 2, { a: [0, -1], b: [0, 1], c: [0.5, -1], d: [-0.5, -1] })];
  assert.equal(staggerFix(tight, 0, "a", "b", four, stage, null), null);
  // không bị che thì không có gì để sửa
  assert.equal(staggerFix([F("1", 0, 2, { a: [-2, 0], b: [2, 0] })], 0, "a", "b", ds, stage, null), null);
});

// ---- thử ngẫu nhiên: sửa tất cả không bao giờ làm tệ hơn và giữ thời gian hợp lệ ----
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("sửa tất cả (ngẫu nhiên 300 bài): số cảnh báo không tăng, lúc tới giữ nguyên, khối không ngược", async () => {
  const { findIssues } = await import("./checks.ts");
  let improved = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    const n = 2 + Math.floor(r() * 7);
    const people = Array.from({ length: n }, (_, i) => ({ id: `d${i}`, name: `N${i}` }));
    const bpm = r() < 0.7 ? 90 + Math.floor(r() * 60) : null;
    const fs: Formation[] = [];
    let t = 0;
    const nf = 2 + Math.floor(r() * 5);
    for (let k = 0; k < nf; k++) {
      const start = t + (k ? 0.5 + r() * 4 : 0);
      const end = start + 1 + r() * 6;
      const pos: Record<string, Vec2> = {};
      for (const d of people) pos[d.id] = [Math.round((r() * 7 - 3.5) * 4) / 4, Math.round((r() * 5 - 2.5) * 4) / 4];
      fs.push(F(String(k), start, end, pos));
      t = end;
    }
    const before = findIssues(fs, people, stage, bpm).length;
    const out = fixAll(fs, people, stage, bpm);
    const after = findIssues(out, people, stage, bpm).length;
    assert.ok(after <= before, `seed ${seed}: ${before} -> ${after}`);
    // Sửa tất cả chỉ đổi ai đứng chỗ nào và lúc rời: số chỗ bị che giữ nguyên
    assert.equal(blockedIssues(out, people, stage).length, blockedIssues(fs, people, stage).length, `seed ${seed}: bị che đổi`);
    if (after < before) improved++;
    out.forEach((f, k) => {
      assert.equal(f.start, fs[k].start, `seed ${seed}: lúc tới đội hình ${k} đổi`);
      assert.ok(f.end > f.start, `seed ${seed}: khối ${k} ngược`);
      if (k) assert.ok(f.start >= out[k - 1].end - 1e-9, `seed ${seed}: khối chồng`);
      assert.equal(Object.keys(f.pos).length, n, `seed ${seed}: mất người`);
    });
  }
  assert.ok(improved > 100, `chỉ đỡ hơn ở ${improved} bài`);
});
