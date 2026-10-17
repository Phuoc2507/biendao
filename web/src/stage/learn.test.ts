import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Key, type Rect, IDENTITY, MAX_ZOOM, NO_LOOP,
  boxAt, cleanKeys, cleanLoop, clampRect, fitCss, fitView, frameRect, loopOn, loopWrap, mirrorRect,
  playStart, rectFromPoints, setA, setB, sourceToView, stepTime, upsertKey, viewToSource,
} from "./learn.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearRect = (a: Rect | null, b: Rect) => {
  assert.ok(a);
  near(a.x, b.x);
  near(a.y, b.y);
  near(a.w, b.w);
  near(a.h, b.h);
};
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

test("boxAt: không có khung thì null, giữ khung đầu và cuối ngoài khoảng", () => {
  assert.equal(boxAt([], 3), null);
  const ks: Key[] = [{ t: 10, r: R(0.6, 0.2, 0.2, 0.6) }, { t: 2, r: R(0.1, 0.2, 0.2, 0.6) }];
  nearRect(boxAt(ks, 0), R(0.1, 0.2, 0.2, 0.6));
  nearRect(boxAt(ks, 2), R(0.1, 0.2, 0.2, 0.6));
  nearRect(boxAt(ks, 99), R(0.6, 0.2, 0.2, 0.6));
  // một khung: lúc nào cũng là khung đó
  nearRect(boxAt([ks[0]], 0), ks[0].r);
});

test("boxAt: nội suy thẳng giữa hai khung kề nhau (mảng chưa xếp vẫn đúng)", () => {
  const ks: Key[] = [
    { t: 4, r: R(0.4, 0.1, 0.2, 0.8) },
    { t: 0, r: R(0, 0, 0.2, 0.4) },
    { t: 8, r: R(0.4, 0.1, 0.4, 0.8) },
  ];
  nearRect(boxAt(ks, 2), R(0.2, 0.05, 0.2, 0.6));
  nearRect(boxAt(ks, 4), R(0.4, 0.1, 0.2, 0.8));
  nearRect(boxAt(ks, 6), R(0.4, 0.1, 0.3, 0.8));
  assert.equal(ks[0].t, 4, "không sửa mảng gốc");
});

test("upsertKey: thay khung gần cùng lúc, giữ thứ tự thời gian, kẹp khung", () => {
  let ks: Key[] = [];
  ks = upsertKey(ks, { t: 5, r: R(0.1, 0.1, 0.2, 0.2) });
  ks = upsertKey(ks, { t: 1, r: R(0.3, 0.3, 0.2, 0.2) });
  assert.deepEqual(ks.map((k) => k.t), [1, 5]);
  ks = upsertKey(ks, { t: 5.05, r: R(0.5, 0.5, 0.9, 0.2) });
  assert.deepEqual(ks.map((k) => k.t), [1, 5.05]);
  near(ks[1].r.w, 0.5, 1e-12);
});

test("rectFromPoints và clampRect: kéo ngược chiều, kéo ra ngoài khung", () => {
  nearRect(rectFromPoints([0.8, 0.9], [0.2, 0.1]), R(0.2, 0.1, 0.6, 0.8));
  nearRect(rectFromPoints([-0.5, 0.5], [0.5, 1.5]), R(0, 0.5, 0.5, 0.5));
  nearRect(clampRect(R(0.9, -0.1, 0.5, -2)), R(0.9, 0, 0.1, 0));
});

test("gương: lật hai lần về như cũ; vẽ lúc soi gương lưu đúng bên của video gốc", () => {
  const r = R(0.1, 0.2, 0.3, 0.4);
  nearRect(mirrorRect(r), R(0.6, 0.2, 0.3, 0.4));
  nearRect(mirrorRect(mirrorRect(r)), r);
  const fr = frameRect(16 / 9, 16 / 9);
  // người đứng bên TRÁI video gốc, soi gương thì hiện bên PHẢI màn
  const shown = sourceToView(r, fr, true);
  nearRect(shown, R(0.6, 0.2, 0.3, 0.4));
  // vẽ lại đúng chỗ hiện trên màn thì lưu ra khung gốc ban đầu
  const a = viewToSource([shown.x, shown.y], fr, true);
  const b = viewToSource([shown.x + shown.w, shown.y + shown.h], fr, true);
  nearRect(rectFromPoints(a, b), r);
});

test("frameRect: hiện vừa khít, có dải đen trên dưới hoặc hai bên", () => {
  nearRect(frameRect(16 / 9, 16 / 9), R(0, 0, 1, 1));
  // video ngang trong khung nhìn vuông: dải đen trên dưới
  nearRect(frameRect(2, 1), R(0, 0.25, 1, 0.5));
  // video dọc (điện thoại) trong khung nhìn ngang: dải đen hai bên
  nearRect(frameRect(0.5, 2), R(0.375, 0, 0.25, 1));
  nearRect(frameRect(0, 1), R(0, 0, 1, 1));
  // điểm trong dải đen kẹp về mép khung hình
  assert.deepEqual(viewToSource([0.1, 0.5], frameRect(0.5, 2), false), [0, 0.5]);
});

test("fitView: khung lấp khung nhìn, giữ tỉ lệ, chừa lề, khung ở giữa màn", () => {
  const box = R(0.4, 0.4, 0.2, 0.2);
  const f = fitView(box, 1, 1, 0.25);
  near(f.scale, 1 / (0.2 * 1.5));
  // tâm khung (0,5) về giữa màn
  near(f.scale * 0.5 + f.tx, 0.5);
  near(f.scale * 0.5 + f.ty, 0.5);
  // khung cao gầy: cạnh cao quyết định độ phóng
  const g = fitView(R(0.45, 0.2, 0.1, 0.5), 1, 1, 0);
  near(g.scale, 2);
});

test("fitView: không thu nhỏ dưới 1, không phóng quá MAX_ZOOM, khung rỗng thì giữ nguyên", () => {
  assert.equal(fitView(R(0, 0, 1, 1), 1, 1, 0.1).scale, 1);
  assert.equal(fitView(R(0.5, 0.5, 0.001, 0.001), 1, 1, 0.1).scale, MAX_ZOOM);
  assert.deepEqual(fitView(R(0.5, 0.5, 0, 0.2), 1, 1), IDENTITY);
  const one = fitView(R(0, 0, 1, 1), 16 / 9, 16 / 9, 0.1);
  near(one.tx, 0);
  near(one.ty, 0);
});

test("fitView: khung sát mép không làm lộ nền ngoài khung hình", () => {
  // khung ở góc trên trái, khung hình đầy khung nhìn
  const f = fitView(R(0, 0, 0.2, 0.2), 1, 1, 0.1);
  assert.ok(f.scale > 1);
  near(f.tx, 0);
  near(f.ty, 0);
  // góc dưới phải: mép phải và mép dưới của khung hình chạm mép màn
  const g = fitView(R(0.8, 0.8, 0.2, 0.2), 1, 1, 0.1);
  near(g.scale * 1 + g.tx, 1);
  near(g.scale * 1 + g.ty, 1);
});

test("fitView: video dọc trong khung nhìn ngang, phóng chưa đủ rộng thì để giữa theo chiều ngang", () => {
  // khung hình rộng 0,25 khung nhìn; phóng 2 lần vẫn hẹp hơn màn
  const f = fitView(R(0.1, 0.25, 0.8, 0.5), 0.5, 2, 0);
  near(f.scale, 2);
  near(f.tx, 0.5 - 2 * 0.5);
  // chiều dọc đã tràn màn: kẹp không lộ nền
  assert.ok(f.ty <= 0 && f.ty >= 1 - 2);
  assert.match(fitCss(f), /^translate\(-50\.000%, -50\.000%\) scale\(2\.0000\)$/);
});

test("fitView: khung nhìn rộng hơn video, bạn đứng sát mép thì vẫn dời theo được tới dải đen vốn có", () => {
  // video 16:9 trong khung nhìn 2,5:1: dải đen mỗi bên rộng (1 − 0,7111)/2
  const fr = frameRect(16 / 9, 2.5);
  const f = fitView(R(0, 0.25, 0.1, 0.5), 16 / 9, 2.5, 0);
  near(f.scale, 2);
  // mép trái khung hình dừng ở đúng chỗ dải đen lúc chưa phóng
  near(f.scale * fr.x + f.tx, fr.x);
});

test("lặp A–B: đặt A, đặt B, đổi chỗ, sát quá thì bỏ qua", () => {
  assert.equal(loopOn(NO_LOOP), false);
  let l = setA(NO_LOOP, 3);
  assert.deepEqual(l, { a: 3, b: null });
  assert.equal(loopOn(l), false);
  l = setB(l, 7);
  assert.deepEqual(l, { a: 3, b: 7 });
  assert.equal(loopOn(l), true);
  assert.deepEqual(setB(l, 3.05), l, "B sát A quá: không đổi");
  assert.deepEqual(setB({ a: 5, b: null }, 2), { a: 2, b: 5 }, "B trước A: đổi chỗ");
  assert.deepEqual(setB(NO_LOOP, 4), { a: 0, b: 4 }, "chưa có A: A là đầu video");
  assert.deepEqual(setA({ a: 1, b: 4 }, 6), { a: 6, b: null }, "A qua B: bỏ B");
  assert.deepEqual(setA({ a: 1, b: 4 }, 2), { a: 2, b: 4 });
});

test("lặp A–B: tới B thì về A, chỗ bắt đầu phát", () => {
  const l = { a: 2, b: 6 };
  assert.equal(loopWrap(5.9, l), null);
  assert.equal(loopWrap(6, l), 2);
  assert.equal(loopWrap(9, l), 2);
  assert.equal(loopWrap(9, { a: 2, b: null }), null);
  assert.equal(playStart(4, l, 30), 4);
  assert.equal(playStart(1, l, 30), 2, "trước A: về A");
  assert.equal(playStart(6, l, 30), 2, "ở B: về A");
  assert.equal(playStart(12, NO_LOOP, 30), 12);
  assert.equal(playStart(30, NO_LOOP, 30), 0, "hết video: về đầu");
  assert.equal(stepTime(1, -2, 30), 0);
  assert.equal(stepTime(29, 2, 30), 30);
  near(stepTime(10, 1 / 30, 30), 10 + 1 / 30);
});

test("đọc lại dữ liệu đã nhớ: bỏ mục hỏng, kẹp, xếp", () => {
  assert.deepEqual(cleanKeys(null), []);
  assert.deepEqual(cleanKeys("x"), []);
  const ks = cleanKeys([
    { t: 5, r: { x: 0.2, y: 0.1, w: 0.3, h: 2 } },
    { t: "1", r: { x: 0, y: 0, w: 1, h: 1 } },
    { t: 1, r: { x: 0, y: 0, w: 0, h: 1 } },
    { t: 2, r: { x: 0.1, y: 0.1, w: 0.1, h: NaN } },
    { t: 3, r: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
    null,
  ]);
  assert.deepEqual(ks.map((k) => k.t), [3, 5]);
  near(ks[1].r.h, 0.9);
  assert.deepEqual(cleanLoop({ a: 1, b: 5 }), { a: 1, b: 5 });
  assert.deepEqual(cleanLoop({ a: 1, b: 1.1 }), { a: 1, b: null });
  assert.deepEqual(cleanLoop({ a: -1, b: "x" }), NO_LOOP);
  assert.deepEqual(cleanLoop(undefined), NO_LOOP);
});
