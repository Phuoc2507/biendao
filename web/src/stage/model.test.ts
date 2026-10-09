import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Formation, type Project, type Vec2,
  emptyProject, newDancer, initials, smoothstep, lineup, clampToStage, snapPos,
  segmentAt, poseAt, posesAt, ensureFormationAt, setPositions, addFormationAfter,
  setBlockTimes, moveBlock, addDancerToAll, removeDancerFromAll, checkInvariants,
  shapePoints, assignNearest, arrangeShape, mirrorPositions, distributeX,
  findWarnings, prevFormation, nextFormation, inWings, WING,
} from "./model.ts";

const stage = { width: 10, depth: 6 };
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

function two(): Formation[] {
  return [
    { id: "A", name: "A", start: 0, end: 2, pos: { a: [0, 0], b: [1, 0] } },
    { id: "B", name: "B", start: 4, end: 6, pos: { a: [2, 0], b: [1, 2] } },
  ];
}

test("smoothstep biên và giữa", () => {
  assert.equal(smoothstep(-1), 0);
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(2), 1);
});

test("initials", () => {
  assert.equal(initials("Nguyễn Thị Lan"), "Lan");
  assert.equal(initials("trần phương"), "Phư");
  assert.equal(initials("D3"), "D3");
  assert.equal(initials(""), "?");
});

test("lineup căn giữa, cách tối đa 1 m, ở phía trước", () => {
  const p = lineup(["a", "b", "c"], stage);
  assert.deepEqual(p.a, [-1, 1.5]);
  assert.deepEqual(p.b, [0, 1.5]);
  assert.deepEqual(p.c, [1, 1.5]);
  const many = lineup(Array.from({ length: 20 }, (_, i) => `d${i}`), stage);
  assert.ok(Math.abs(many.d0[0]) <= stage.width / 2);
});

test("clamp cho phép cánh gà, snap bỏ -0", () => {
  assert.deepEqual(clampToStage([100, -100], stage), [5 + WING, -3]);
  assert.deepEqual(snapPos([-0.01, 0.26], 0.25), [0, 0.25]);
  assert.ok(Object.is(snapPos([-0.01, 0], 0.25)[0], 0));
  assert.equal(inWings([5.5, 0], stage), true);
  assert.equal(inWings([4.9, 0], stage), false);
});

test("segmentAt và poseAt nội suy trong khoảng trống", () => {
  const fs = two();
  assert.equal(segmentAt([], 1).kind, "none");
  assert.deepEqual(segmentAt(fs, 1), { kind: "hold", k: 0 });
  assert.equal(segmentAt(fs, 3).kind, "gap");
  assert.deepEqual(segmentAt(fs, 9), { kind: "after", k: 1 });
  assert.deepEqual(poseAt(fs, "a", 1), [0, 0]);
  assert.deepEqual(poseAt(fs, "a", 3), [1, 0]); // giữa khoảng, smoothstep 0.5
  assert.deepEqual(poseAt(fs, "b", 9), [1, 2]);
  assert.equal(poseAt(fs, "zz", 1), null);
  const all = posesAt(fs, ["a", "zz"], 1, stage);
  assert.deepEqual(all.a, [0, 0]);
  assert.ok(all.zz);
});

test("prev/next formation", () => {
  const fs = two();
  assert.equal(prevFormation(fs, 1), null);
  assert.equal(nextFormation(fs, 1)?.id, "B");
  assert.equal(prevFormation(fs, 3)?.id, "A");
  assert.equal(nextFormation(fs, 3)?.id, "B");
  assert.equal(prevFormation(fs, 5)?.id, "A");
  assert.equal(nextFormation(fs, 5), null);
});

test("ensureFormationAt: trong khối thì giữ, ngoài khối thì tạo không đè", () => {
  const fs = two();
  const r1 = ensureFormationAt(fs, 1, ["a", "b"], stage, "N", 4);
  assert.equal(r1.created, false);
  assert.equal(r1.id, "A");
  const r2 = ensureFormationAt(fs, 3, ["a", "b"], stage, "N", 4);
  assert.equal(r2.created, true);
  const n = r2.formations.find((f) => f.id === "N")!;
  assert.equal(n.start, 3);
  assert.equal(n.end, 4); // không đè B
  assert.deepEqual(n.pos.a, [1, 0]);
  assert.deepEqual(r2.formations.map((f) => f.id), ["A", "N", "B"]);
  assert.deepEqual(checkInvariants({ ...emptyProject(), dancers: [newDancer("a", "a", "#f00"), newDancer("b", "b", "#0f0")], formations: r2.formations }), []);
  // dự án rỗng
  const r3 = ensureFormationAt([], 0, ["a"], stage, "N", 4);
  assert.equal(r3.formations.length, 1);
  assert.equal(r3.formations[0].end, 4);
});

test("setPositions kẹp vào sân và không đột biến", () => {
  const fs = two();
  const out = setPositions(fs, "A", { a: [50, 0] }, stage);
  assert.deepEqual(out[0].pos.a, [5 + WING, 0]);
  assert.deepEqual(fs[0].pos.a, [0, 0]);
  assert.equal(out[1], fs[1]);
});

test("addFormationAfter chép khối và dời khối sau khi chật", () => {
  const fs = two();
  const r = addFormationAfter(fs, 1, ["a", "b"], stage, "N", 2, 1);
  const n = r.formations.find((f) => f.id === "N")!;
  assert.equal(n.start, 3);
  assert.equal(n.end, 5);
  assert.deepEqual(n.pos, fs[0].pos);
  const b = r.formations.find((f) => f.id === "B")!;
  assert.equal(b.start, 6); // dời 2 s để còn khoảng 1 s
  assert.equal(r.jumpTo, 3);
  assert.deepEqual(r.formations.map((f) => f.id), ["A", "N", "B"]);
  // không đột biến đầu vào
  assert.equal(fs[1].start, 4);
});

test("setBlockTimes và moveBlock kẹp bởi hàng xóm", () => {
  const fs = two();
  const a = setBlockTimes(fs, "A", -1, 10);
  assert.equal(a[0].start, 0);
  assert.equal(a[0].end, 4);
  const b = setBlockTimes(fs, "B", 5.9, 5.95);
  assert.ok(b[1].end - b[1].start >= 0.2 - 1e-9);
  const m = moveBlock(fs, "B", 1);
  assert.equal(m[1].start, 2);
  assert.equal(m[1].end, 4);
  const m2 = moveBlock(fs, "A", 100);
  assert.equal(m2[0].start, 2);
});

test("thêm/bớt vũ công trên mọi khối", () => {
  const fs = two();
  const add = addDancerToAll(fs, "c", stage);
  for (const f of add) {
    assert.ok(f.pos.c);
    assert.ok(f.pos.c[0] < -stage.width / 2); // đứng trong cánh gà trái
  }
  const rm = removeDancerFromAll(add, "a");
  for (const f of rm) assert.equal("a" in f.pos, false);
});

test("checkInvariants bắt chồng khối và thiếu vũ công", () => {
  const p: Project = {
    ...emptyProject(),
    dancers: [newDancer("a", "a", "#f00"), newDancer("b", "b", "#0f0")],
    formations: [
      { id: "A", name: "A", start: 0, end: 5, pos: { a: [0, 0] } },
      { id: "B", name: "B", start: 4, end: 6, pos: { a: [0, 0], b: [0, 0] } },
    ],
  };
  const errs = checkInvariants(p);
  assert.ok(errs.some((e) => e.includes("đè")));
  assert.ok(errs.some((e) => e.includes("thiếu b")));
});

test("shapePoints đủ điểm, không trùng nhau", () => {
  for (const k of ["line", "twoLines", "stagger", "arc", "v", "circle", "diagonal"] as const) {
    for (const n of [1, 2, 5, 8, 12]) {
      const pts = shapePoints(k, n, [0, 0], 8);
      assert.equal(pts.length, n, `${k} ${n}`);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          assert.ok(d > 0.3, `${k} n=${n} điểm ${i},${j} quá gần (${d})`);
        }
    }
  }
});

test("assignNearest là tối ưu (so với vét cạn)", () => {
  const from: Vec2[] = [[0, 0], [3, 0], [1, 2], [-2, 1]];
  const to: Vec2[] = [[3, 1], [-2, 0], [0, 2], [1, -1]];
  const asg = assignNearest(from, to);
  assert.deepEqual([...asg].sort(), [0, 1, 2, 3]);
  const cost = (p: number[]) => p.reduce((s, j, i) => s + (from[i][0] - to[j][0]) ** 2 + (from[i][1] - to[j][1]) ** 2, 0);
  let best = Infinity;
  const perm = (arr: number[], l: number) => {
    if (l === arr.length) { best = Math.min(best, cost(arr)); return; }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      perm(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  };
  perm([0, 1, 2, 3], 0);
  assert.ok(close(cost(asg), best));
});

test("arrangeShape, mirror, distribute", () => {
  const cur: Record<string, Vec2> = { a: [-3, 0], b: [0, 1], c: [3, -1] };
  const line = arrangeShape(cur, ["a", "b", "c"], "line", stage);
  assert.ok(line.a[0] < line.b[0] && line.b[0] < line.c[0]); // giữ thứ tự trái phải
  assert.equal(line.a[1], line.c[1]);
  assert.deepEqual(mirrorPositions(cur, ["a"]).a, [3, 0]);
  const d = distributeX({ a: [0, 0], b: [0.5, 1], c: [4, 2] }, ["a", "b", "c"]);
  assert.deepEqual(d.b, [2, 1]);
});

test("findWarnings: chồng, chạy quá nhanh, va nhau", () => {
  const ds = [{ id: "a", name: "An" }, { id: "b", name: "Bình" }];
  const overlap: Formation[] = [{ id: "A", name: "A", start: 0, end: 1, pos: { a: [0, 0], b: [0.1, 0] } }];
  assert.equal(findWarnings(overlap, ds)[0].kind, "overlap");
  const fast: Formation[] = [
    { id: "A", name: "A", start: 0, end: 1, pos: { a: [-4, 0], b: [4, 2] } },
    { id: "B", name: "B", start: 1.5, end: 3, pos: { a: [4, 0], b: [4, 2] } },
  ];
  assert.ok(findWarnings(fast, ds).some((w) => w.kind === "fast" && w.ids[0] === "a"));
  const cross: Formation[] = [
    { id: "A", name: "A", start: 0, end: 1, pos: { a: [-2, 0], b: [2, 0] } },
    { id: "B", name: "B", start: 5, end: 6, pos: { a: [2, 0], b: [-2, 0] } },
  ];
  const w = findWarnings(cross, ds);
  assert.ok(w.some((x) => x.kind === "collide"));
  assert.ok(!w.some((x) => x.kind === "fast"));
  const ok: Formation[] = [
    { id: "A", name: "A", start: 0, end: 1, pos: { a: [-2, 0], b: [2, 0] } },
    { id: "B", name: "B", start: 5, end: 6, pos: { a: [-2, 1], b: [2, 1] } },
  ];
  assert.deepEqual(findWarnings(ok, ds), []);
});
