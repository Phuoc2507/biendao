import { test } from "node:test";
import assert from "node:assert/strict";
import { fixAll, reassignFix, widenFix } from "./fixes.ts";
import { transitionIssues } from "./checks.ts";
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
