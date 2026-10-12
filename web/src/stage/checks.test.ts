import { test } from "node:test";
import assert from "node:assert/strict";
import { closestU, findIssues, invSmoothstep, transitionIssues } from "./checks.ts";
import { type Formation, type StageSize, type Vec2, lerp2, smoothstep } from "./model.ts";

const stage: StageSize = { width: 8, depth: 6 };
const ds = [
  { id: "a", name: "An" },
  { id: "b", name: "Bình" },
];
const F = (id: string, start: number, end: number, pos: Record<string, Vec2>): Formation => ({
  id, name: `Đội hình ${id}`, start, end, pos,
});
const near = (x: number, y: number, e = 1e-6) => Math.abs(x - y) < e;

test("invSmoothstep là ngược của smoothstep", () => {
  for (const u of [0, 0.1, 0.25, 0.5, 0.77, 0.9, 1]) assert.ok(near(smoothstep(invSmoothstep(u)), u, 1e-9), `u=${u}`);
  assert.equal(invSmoothstep(0.5), 0.5);
});

test("closestU: lúc gần nhất, NaN khi khoảng cách không đổi", () => {
  assert.ok(near(closestU([-1, 0], [1, 0], [1, 0], [-1, 0]), 0.5));
  assert.ok(Number.isNaN(closestU([-1, 0], [-1, 1], [1, 0], [1, 1])));
});

test("đổi chỗ cho nhau: va đúng giữa đường, đúng lúc", () => {
  const fs = [F("1", 0, 2, { a: [-1, 0], b: [1, 0] }), F("2", 4, 6, { a: [1, 0], b: [-1, 0] })];
  const is = transitionIssues(fs, ds, stage, null);
  assert.equal(is.length, 1); // 2 m trong 2 s: đỉnh đúng 1,5 m/s, không báo chạy nhanh
  const c = is[0];
  assert.equal(c.kind, "collide");
  assert.deepEqual(c.ids, ["a", "b"]);
  assert.equal(c.formation, "2");
  assert.equal(c.from, "1");
  assert.ok(near(c.t, 3));
  assert.ok(near(c.at[0], 0) && near(c.at[1], 0));
  assert.ok(near(c.value, 0));
  assert.equal(c.paths.length, 2);
  assert.match(c.msg, /va nhau/);
});

test("đi lệch giờ: thời điểm va theo smoothstep, không phải giữa khoảng", () => {
  // b đứng yên ở x = 0,5: a đi từ -1 tới 1 gặp b khi u = 0,75
  const fs = [F("1", 0, 1, { a: [-1, 0], b: [0.5, 0] }), F("2", 3, 4, { a: [1, 0], b: [0.5, 0] })];
  const c = transitionIssues(fs, ds, stage, null).find((x) => x.kind === "collide");
  assert.ok(c);
  const u = smoothstep((c.t - 1) / 2);
  assert.ok(near(u, 0.75));
  const pa = lerp2([-1, 0], [1, 0], u);
  assert.ok(near(pa[0], 0.5));
});

test("đi song song, hoặc chỉ sượt qua xa: không báo", () => {
  const par = [F("1", 0, 2, { a: [-1, 0], b: [1, 0] }), F("2", 4, 6, { a: [-1, 1], b: [1, 1] })];
  assert.deepEqual(transitionIssues(par, ds, stage, null), []);
  // đi chéo, gần nhất 0,6 m
  const far = [F("1", 0, 2, { a: [-1, 0.3], b: [1, -0.3] }), F("2", 4, 6, { a: [1, 0.3], b: [-1, -0.3] })];
  assert.deepEqual(transitionIssues(far, ds, stage, null), []);
});

test("sượt sát (giữa 45 và 50 cm): báo đi sát, chưa phải va", () => {
  const fs = [F("1", 0, 2, { a: [-1, 0.24], b: [1, -0.24] }), F("2", 4, 6, { a: [1, 0.24], b: [-1, -0.24] })];
  const is = transitionIssues(fs, ds, stage, null);
  assert.equal(is.length, 1);
  assert.ok(near(is[0].value, 0.48));
  assert.match(is[0].msg, /đi sát nhau/);
  assert.match(is[0].msg, /48 cm/);
});

test("chạy quá nhanh: theo tốc độ đỉnh, ghi theo phách nếu có BPM", () => {
  const fs = [F("1", 0, 2, { a: [-3, 0], b: [3, 2] }), F("2", 4, 6, { a: [3, 0], b: [3, 2] })];
  const is = transitionIssues(fs, ds, stage, 120);
  assert.equal(is.length, 1);
  const f = is[0];
  assert.equal(f.kind, "fast");
  assert.deepEqual(f.ids, ["a"]);
  assert.ok(near(f.value, 4.5));
  assert.ok(near(f.t, 3));
  assert.match(f.msg, /4 phách/);
  assert.match(f.msg, /4,5 m\/s/);
  // vừa đủ chậm thì thôi
  const ok = [F("1", 0, 2, { a: [-3, 0] }), F("2", 8, 9, { a: [3, 0] })];
  assert.deepEqual(transitionIssues(ok, ds, stage, null), []);
  // không có lúc chuyển mà vẫn đổi chỗ
  const jump = [F("1", 0, 2, { a: [-1, 0] }), F("2", 2, 4, { a: [1, 0] })];
  const j = transitionIssues(jump, ds, stage, null);
  assert.equal(j.length, 1);
  assert.equal(j[0].value, Infinity);
  assert.match(j[0].msg, /không có lúc chuyển/);
});

test("trong cánh gà: không báo chạy nhanh hay va nhau", () => {
  const fs = [
    F("1", 0, 2, { a: [4.5, -1], b: [4.6, 1] }),
    F("2", 2.5, 4, { a: [5.2, 1], b: [4.5, -1] }),
  ];
  assert.deepEqual(transitionIssues(fs, ds, stage, null), []);
  // ra sân từ cánh gà thì vẫn tính tốc độ
  const out = [F("1", 0, 2, { a: [5, 0] }), F("2", 2.5, 4, { a: [0, 0] })];
  assert.equal(transitionIssues(out, ds, stage, null)[0]?.kind, "fast");
});

test("người ẩn không tính; đứng chồng ở hai đầu không báo va", () => {
  const hid = [{ id: "a", name: "An" }, { id: "b", name: "Bình", hidden: true }];
  const fs = [F("1", 0, 2, { a: [-1, 0], b: [1, 0] }), F("2", 4, 6, { a: [1, 0], b: [-1, 0] })];
  assert.deepEqual(transitionIssues(fs, hid, stage, null), []);
  const split = [F("1", 0, 2, { a: [0, 0], b: [0, 0] }), F("2", 4, 6, { a: [-1, 0], b: [1, 0] })];
  assert.deepEqual(transitionIssues(split, ds, stage, null), []);
});

test("findIssues: giữ cảnh báo đứng chồng, xếp theo thời gian", () => {
  const fs = [
    F("1", 0, 2, { a: [-1, 0], b: [1, 0] }),
    F("2", 4, 6, { a: [1, 0], b: [-1, 0] }),
    F("3", 8, 10, { a: [0.1, 1], b: [0, 1] }), // tới sát nhau ở cuối: chỉ là đứng chồng
  ];
  const is = findIssues(fs, ds, stage, null);
  assert.deepEqual(is.map((x) => x.kind), ["collide", "overlap"]);
  const o = is[1];
  assert.equal(o.formation, "3");
  assert.equal(o.from, null);
  assert.ok(near(o.t, 9));
  assert.ok(near(o.at[0], 0.05) && near(o.at[1], 1));
  assert.ok(near(o.value, 0.1));
  assert.deepEqual(findIssues([], ds, stage, null), []);
});
