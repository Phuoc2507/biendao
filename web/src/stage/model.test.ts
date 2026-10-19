import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Formation, type Project, type Vec2,
  emptyProject, newDancer, cloneDancer, initials, smoothstep, lineup, clampToStage, snapPos,
  segmentAt, poseAt, posesAt, ensureFormationAt, setPositions, addFormationAfter,
  setBlockTimes, moveBlock, addDancerToAll, removeDancerFromAll, checkInvariants,
  shapePoints, assignNearest, arrangeShape, mirrorPositions, distributeX, rotateGroup, scaleGroup, fitGroup,
  findWarnings, prevFormation, nextFormation, inWings, WING, setFormationNote, captureShape, fitSavedShape,
  fitFormationsToStage, setPersonNote, personNote, noteIndexAt, placeClones, clipChars, PERSON_NOTE_MAX,
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
  // bước 0, âm, NaN, vô cùng: giữ nguyên chỗ, không ra NaN
  for (const s of [0, -0.25, NaN, Infinity]) assert.deepEqual(snapPos([1.13, -2.2], s), [1.13, -2.2]);
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

test("addFormationAfter nhét vừa khoảng trống, không dời khối đã gắn nhạc", () => {
  const fs = two(); // A 0–2, B 4–6: trống 2 s
  const r = addFormationAfter(fs, 1, ["a", "b"], stage, "N", 2, 1);
  const n = r.formations.find((f) => f.id === "N")!;
  assert.equal(n.start, 2.5);
  assert.equal(n.end, 3.5);
  assert.deepEqual(n.pos, fs[0].pos);
  assert.equal(r.formations.find((f) => f.id === "B")!.start, 4);
  assert.equal(r.shifted, 0);
  assert.equal(r.jumpTo, 2.5);
  assert.deepEqual(r.formations.map((f) => f.id), ["A", "N", "B"]);
});

test("addFormationAfter chỉ dời khối sau khi quá chật, và báo số giây dời", () => {
  const fs: Formation[] = [
    { id: "A", name: "A", start: 0, end: 2, pos: { a: [0, 0] } },
    { id: "B", name: "B", start: 2.5, end: 4, pos: { a: [1, 0] } },
  ];
  const r = addFormationAfter(fs, 1, ["a"], stage, "N", 2, 1);
  const n = r.formations.find((f) => f.id === "N")!;
  assert.equal(n.start, 3);
  assert.equal(n.end, 5);
  assert.equal(r.shifted, 3.5);
  assert.equal(r.formations.find((f) => f.id === "B")!.start, 6);
  // không đột biến đầu vào
  assert.equal(fs[1].start, 2.5);
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

test("nhân bản: chung video và độ lệch, tên đánh số không trùng", () => {
  const src = { ...newDancer("a", "Lan", "#f00"), mediaId: "m1", offsetSec: 1.5, stacked: true };
  const c = cloneDancer(src, "b", ["Lan", "Lan 2"], "#0f0");
  assert.equal(c.id, "b");
  assert.equal(c.name, "Lan 3");
  assert.equal(c.color, "#0f0");
  assert.equal(c.mediaId, "m1");
  assert.equal(c.offsetSec, 1.5);
  assert.equal(c.stacked, true);
  assert.equal(cloneDancer(c, "c", ["Lan", "Lan 2", "Lan 3"], "#00f").name, "Lan 4");
});

test("ghi chú đội hình: đặt, cắt khoảng trắng, chuỗi rỗng thì bỏ trường, khối khác giữ nguyên", () => {
  const fs: Formation[] = [
    { id: "x", name: "A", start: 0, end: 2, pos: {} },
    { id: "y", name: "B", start: 3, end: 5, pos: {} },
  ];
  const a = setFormationNote(fs, "x", "  nhịp 5 quay  ");
  assert.equal(a[0].note, "nhịp 5 quay");
  assert.equal(a[1], fs[1]);
  const b = setFormationNote(a, "x", "   ");
  assert.equal("note" in b[0], false);
});

test("xoay nhóm: một phần tư vòng quanh tâm, xoay hai chiều thì về như cũ, tràn sân thì kéo vào", () => {
  const cur: Record<string, Vec2> = { a: [-1, 0], b: [1, 0], c: [5, 5] };
  const r = rotateGroup(cur, ["a", "b"], 1, stage);
  assert.deepEqual(r, { a: [0, -1], b: [0, 1] }, "hàng ngang thành hàng dọc, người phải xuống dưới");
  assert.equal(r.c, undefined, "người ngoài nhóm không đụng tới");
  const back = rotateGroup(r, ["a", "b"], -1, stage);
  assert.deepEqual(back, { a: [-1, 0], b: [1, 0] });
  // hàng ngang 8 m xoay thành dọc 8 m trên sân sâu 6 m: thu lại cho vừa
  const long = rotateGroup({ a: [-4, 0], b: [4, 0] }, ["a", "b"], 1, stage);
  assert.ok(Math.abs(long.a[1]) <= 2.7 + 1e-9 && Math.abs(long.b[1]) <= 2.7 + 1e-9);
  assert.ok(long.b[1] > long.a[1]);
});

test("đưa nhóm vào sân: dời mà không méo khi vừa", () => {
  const f = fitGroup({ a: [4.9, 0], b: [3.9, 1] }, stage);
  assert.deepEqual(f, { a: [4.7, 0], b: [3.7, 1] });
});

test("giãn và thu nhóm quanh tâm: dừng ở mép sân, không cho sát nhau", () => {
  const cur: Record<string, Vec2> = { a: [-1, 0], b: [1, 0] };
  assert.deepEqual(scaleGroup(cur, ["a", "b"], 1.5, stage), { a: [-1.5, 0], b: [1.5, 0] });
  // mép sân x = 4.7 (cách 0.3): giãn 10 lần chỉ được tới 4.7
  assert.deepEqual(scaleGroup(cur, ["a", "b"], 10, stage), { a: [-4.7, 0], b: [4.7, 0] });
  assert.equal(scaleGroup({ a: [-4.7, 0], b: [4.7, 0] }, ["a", "b"], 1.2, stage), null);
  // thu: hai người cách 2 m, thu còn tối thiểu 0.5 m
  assert.deepEqual(scaleGroup(cur, ["a", "b"], 0.1, stage), { a: [-0.25, 0], b: [0.25, 0] });
  assert.equal(scaleGroup({ a: [-0.25, 0], b: [0.25, 0] }, ["a", "b"], 0.8, stage), null);
  assert.equal(scaleGroup(cur, ["a"], 1.2, stage), null, "một người thì không giãn");
});

// ---------- hình của tôi ----------

test("captureShape: điểm trừ tâm nhóm, không gắn người, không phụ thuộc thứ tự", () => {
  const cur: Record<string, Vec2> = { a: [3, 1], b: [1, 1], c: [2, -1], z: [-4, 0] };
  const s = captureShape(cur, ["a", "b", "c"]);
  assert.deepEqual(s, [[0, -1.333], [-1, 0.667], [1, 0.667]]);
  assert.deepEqual(captureShape(cur, ["c", "a", "b"]), s);
  // dời cả nhóm đi đâu cũng ra cùng một hình
  const moved: Record<string, Vec2> = { p: [-1, 2], q: [-3, 2], r: [-2, 0] };
  assert.deepEqual(captureShape(moved, ["p", "q", "r"]), s);
  assert.deepEqual(captureShape(cur, []), []);
});

test("fitSavedShape: đặt quanh tâm nhóm hiện tại, gán người đi gần nhất", () => {
  const pts: Vec2[] = [[-1, 0], [0, 0], [1, 0]];
  // ba người đứng hàng ngang quanh (2, 0.5), truyền lộn thứ tự: ai gần điểm nào thì vào điểm đó
  const cur: Record<string, Vec2> = { a: [1.2, 0.5], b: [2, 0.5], c: [2.8, 0.5] };
  const r = fitSavedShape(cur, ["c", "a", "b"], pts, stage);
  assert.deepEqual(r.moves, { a: [1, 0.5], b: [2, 0.5], c: [3, 0.5] });
  assert.deepEqual(r.kept, []);
  assert.equal(r.unused, 0);
});

test("fitSavedShape: hình tràn mép sân thì dời vào trong", () => {
  const pts: Vec2[] = [[-1, 0], [1, 0]];
  const cur: Record<string, Vec2> = { a: [4.5, 0], b: [4.6, 0] };
  const r = fitSavedShape(cur, ["a", "b"], pts, stage);
  for (const q of Object.values(r.moves)) assert.ok(q[0] <= stage.width / 2 - 0.3 + 1e-9);
  assert.ok(close(r.moves.b[0] - r.moves.a[0], 2, 1e-6));
});

test("fitSavedShape: nhóm đông hơn số điểm thì người xa nhất giữ chỗ cũ", () => {
  const pts: Vec2[] = [[-0.5, 0], [0.5, 0]];
  const cur: Record<string, Vec2> = { a: [-0.6, 0], b: [0.6, 0], far: [0, 2.4] };
  const r = fitSavedShape(cur, ["a", "b", "far"], pts, stage);
  assert.deepEqual(r.kept, ["far"]);
  assert.equal(Object.keys(r.moves).length, 2);
  assert.ok(!("far" in r.moves));
  assert.ok(r.moves.a[0] < r.moves.b[0]);
  assert.ok(close(r.moves.b[0] - r.moves.a[0], 1, 1e-6));
});

test("fitSavedShape: nhóm ít hơn số điểm thì dùng các điểm gần tâm hình nhất", () => {
  const pts: Vec2[] = [[-3, 0], [-1, 0], [1, 0], [3, 0]];
  const cur: Record<string, Vec2> = { a: [0, 0], b: [0.5, 0] };
  const r = fitSavedShape(cur, ["a", "b"], pts, stage);
  assert.equal(r.unused, 2);
  assert.deepEqual(r.kept, []);
  const xs = Object.values(r.moves).map((q) => q[0]).sort((x, y) => x - y);
  assert.ok(close(xs[1] - xs[0], 2, 1e-6));
  assert.ok(r.moves.a[0] < r.moves.b[0]);
});

test("fitSavedShape: không có điểm hay không có người thì không dời ai", () => {
  assert.deepEqual(fitSavedShape({ a: [0, 0] }, ["a"], [], stage).moves, {});
  assert.deepEqual(fitSavedShape({}, ["x"], [[0, 0]], stage), { moves: {}, kept: [], unused: 0 });
});

test("checkInvariants: hình tự lưu hỏng bị báo", () => {
  const p = { ...emptyProject(), myShapes: [{ id: "h1", name: "A", pts: [] }, { id: "h2", name: "B", pts: [[NaN, 0]] as Vec2[] }] };
  assert.equal(checkInvariants(p).length, 2);
  assert.deepEqual(checkInvariants({ ...emptyProject(), myShapes: [{ id: "h", name: "C", pts: [[0, 0]] }] }), []);
});

test("ensureFormationAt: khoảng chuyển ngắn hơn MIN_BLOCK thì khối mới không đè khối trước", () => {
  const fs: Formation[] = [
    { id: "A", name: "A", start: 0, end: 5, pos: { a: [0, 0] } },
    { id: "B", name: "B", start: 5.1, end: 8, pos: { a: [1, 0] } },
  ];
  const p = { ...emptyProject(), dancers: [newDancer("a", "A", "#fff")] };
  const r = ensureFormationAt(fs, 5.05, ["a"], stage, "N", 4);
  assert.deepEqual(checkInvariants({ ...p, formations: r.formations }), []);
  const n = r.formations.find((f) => f.id === "N")!;
  assert.ok(n.start >= 5 && n.end <= 5.1 && n.start < n.end);
  // nút + Đội hình ở chỗ trống đó cũng vậy
  const a = addFormationAfter(fs, 5.05, ["a"], stage, "N", 4, 2);
  assert.deepEqual(checkInvariants({ ...p, formations: a.formations }), []);
});

test("lineup: sân hẹp hơn 1 m không đảo thứ tự hàng", () => {
  const l = lineup(["a", "b", "c"], { width: 0.5, depth: 1 });
  assert.ok(l.a[0] <= l.b[0] && l.b[0] <= l.c[0]);
});

test("fitFormationsToStage: thu sân thì kéo người ra ngoài sân và cánh gà vào trong", () => {
  const small = { width: 4, depth: 3 };
  const fs: Formation[] = [
    { id: "A", name: "A", start: 0, end: 1, pos: { a: [4.9, 2.9], b: [0, 0] } },
    { id: "B", name: "B", start: 2, end: 3, pos: { a: [-1, 1] } },
  ];
  const out = fitFormationsToStage(fs, small);
  assert.deepEqual(out[0].pos.a, [2 + WING, 1.5]);
  assert.equal(out[0].pos.b, fs[0].pos.b);
  // khối không ai ra ngoài thì giữ nguyên đối tượng (khỏi vẽ lại)
  assert.equal(out[1], fs[1]);
  assert.equal(fitFormationsToStage(fs, stage), fs);
  const p = { ...emptyProject(), stage: small, dancers: [newDancer("a", "A", "#fff"), newDancer("b", "B", "#fff")] };
  assert.deepEqual(checkInvariants({ ...p, formations: out }).filter((e) => e.includes("ngoài sân")), []);
});

test("ghi chú riêng: đặt, gộp khoảng trắng, rỗng thì xoá, hết người thì bỏ trường, khối khác giữ nguyên", () => {
  const fs = two();
  const a = setPersonNote(fs, "A", "a", "  cầm   quạt đỏ ");
  assert.deepEqual(a[0].notes, { a: "cầm quạt đỏ" });
  assert.equal(a[1], fs[1]);
  assert.equal(setPersonNote(a, "A", "a", "cầm quạt đỏ"), a, "không đổi thì giữ mảng cũ");
  assert.equal(setPersonNote(a, "zz", "a", "x"), a);
  const b = setPersonNote(a, "A", "b", "quỳ nhịp 7");
  assert.deepEqual(b[0].notes, { a: "cầm quạt đỏ", b: "quỳ nhịp 7" });
  const c = setPersonNote(setPersonNote(b, "A", "a", " "), "A", "b", "");
  assert.equal("notes" in c[0], false);
  // cắt theo ký tự thật: biểu tượng cảm xúc không bị xẻ đôi
  const long = setPersonNote(fs, "A", "a", "🪭".repeat(PERSON_NOTE_MAX + 5));
  assert.equal(Array.from(personNote(long[0], "a")).length, PERSON_NOTE_MAX);
  assert.ok(personNote(long[0], "a").endsWith("🪭"));
  assert.equal(clipChars("ab🪭cd", 4), "ab🪭…");
  assert.equal(clipChars("ab", 4), "ab");
});

test("ghi chú riêng: thuộc đội hình đang đứng, đang chuyển thì đội hình sắp tới", () => {
  const fs = two();
  assert.equal(noteIndexAt([], 1), -1);
  assert.equal(noteIndexAt(fs, 1), 0);
  assert.equal(noteIndexAt(fs, 3), 1);
  assert.equal(noteIndexAt(fs, 9), 1);
});

test("ghi chú riêng: + Đội hình chép theo, ensureFormationAt không chép, xoá người thì xoá ghi chú", () => {
  const fs = setPersonNote(setPersonNote(two(), "A", "a", "cầm quạt"), "B", "b", "quỳ");
  const r = addFormationAfter(fs, 1, ["a", "b"], stage, "N", 2, 1);
  const n = r.formations.find((f) => f.id === "N")!;
  assert.deepEqual(n.notes, { a: "cầm quạt" });
  assert.notEqual(n.notes, fs[0].notes, "bảng ghi chú là bản chép, sửa khối mới không đụng khối cũ");
  const e = ensureFormationAt(fs, 8, ["a", "b"], stage, "E", 2);
  assert.equal("notes" in e.formations.find((f) => f.id === "E")!, false);
  const rm = removeDancerFromAll(fs, "a");
  assert.equal("notes" in rm[0], false);
  assert.deepEqual(rm[1].notes, { b: "quỳ" });
  assert.deepEqual(checkInvariants({ ...emptyProject(), dancers: [newDancer("b", "B", "#000")], formations: rm }), []);
  const bad = checkInvariants({
    ...emptyProject(), dancers: [newDancer("b", "B", "#000")],
    formations: fs.map((f) => ({ ...f, pos: { b: [0, 0] as Vec2 } })),
  });
  assert.ok(bad.some((x) => x.includes("ghi chú riêng")), "ghi chú của người không còn bị báo");
});

test("ghi chú riêng: bản sao mang theo ghi chú của bản gốc ở từng đội hình", () => {
  const fs = setPersonNote(two(), "A", "a", "cầm quạt");
  const out = placeClones(fs, "a", ["a2", "a3"], stage);
  assert.deepEqual(out[0].notes, { a: "cầm quạt", a2: "cầm quạt", a3: "cầm quạt" });
  assert.equal("notes" in out[1], false);
});
