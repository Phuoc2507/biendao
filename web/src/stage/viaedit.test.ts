// Gỡ chỗ còn nghi của đường cong: chép dán, xoay, giãn, đổi chỗ, núm uốn, video sơ đồ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Ctx2D, drawPlanFrame, planFrame, planGeometry, toPx } from "./export/planRender.ts";
import {
  type Formation, type Project, type StageSize, type Vec2, bendHandleAt, emptyProject, newDancer, pasteVia, pathsInto,
  rotateGroupMap, scaleGroupMap, setPositions, viaOf, viaThrough,
} from "./model.ts";

const stage: StageSize = { width: 8, depth: 6 };
const F = (id: string, start: number, end: number, pos: Record<string, Vec2>, via?: Record<string, Vec2>): Formation => ({
  id, name: `Đội hình ${id}`, start, end, pos, ...(via && { via }),
});
const near = (x: number, y: number, e = 1e-6) => Math.abs(x - y) < e;
const nearV = (p: Vec2 | null | undefined, q: Vec2, e = 1e-6) => !!p && near(p[0], q[0], e) && near(p[1], q[1], e);

test("Ctrl C/V mang theo đường cong, dời theo chỗ trước ở đội hình đích", () => {
  const src = [F("1", 0, 2, { a: [-2, 0], b: [0, 0] }), F("2", 4, 6, { a: [2, 0], b: [1, 0] }, { a: [0, 2] })];
  const paths = pathsInto(src, "2", ["a", "b"]);
  assert.deepEqual(Object.keys(paths), ["a"], "người đi thẳng thì không chép đường");
  assert.deepEqual(pathsInto(src, "1", ["a"]), {}, "đội hình đầu không có đường vào");
  // đích: chỗ trước khác (dây cung dọc thay vì ngang)
  const dst = [F("x", 0, 2, { a: [0, -2] }), F("y", 4, 6, { a: [0, 2] })];
  const out = pasteVia(dst, "y", paths, stage);
  // dây cung quay 90 độ ngược chiều kim đồng hồ: điểm uốn cũng quay theo, giữ dáng
  assert.ok(nearV(viaOf(out[1], "a"), [-2, 0]), JSON.stringify(out[1].via));
  assert.equal(pasteVia(dst, "x", paths, stage), dst, "dán vào đội hình đầu thì không có đường");
  const still = [F("x", 0, 2, { a: [2, 0] }), F("y", 4, 6, { a: [2.1, 0] })];
  assert.equal(pasteVia(still, "y", paths, stage), still, "đứng gần như yên ở đích thì không uốn");
  // dán lại đúng chỗ: đường giữ nguyên
  assert.ok(nearV(viaOf(pasteVia(src, "2", paths, stage)[1], "a"), [0, 2]));
});

test("Xoay, Giãn: điểm uốn đi theo nửa phép biến đổi của nhóm; Đổi chỗ bỏ điểm uốn", () => {
  const cur: Record<string, Vec2> = { a: [-1, 0], b: [1, 0] };
  const r = rotateGroupMap(cur, ["a", "b"], 1, stage);
  for (const id of ["a", "b"]) assert.ok(nearV(r.map(cur[id]), r.moves[id], 1e-3), "phép trả về khớp chỗ mới");
  // nhóm dài hơn sân sau khi xoay: phép gồm cả bước thu cho vừa sân
  const long: Record<string, Vec2> = { a: [-3.5, 0], b: [3.5, 0] };
  const rl = rotateGroupMap(long, ["a", "b"], 1, stage);
  for (const id of ["a", "b"]) assert.ok(nearV(rl.map(long[id]), rl.moves[id], 1e-3));
  const sc = scaleGroupMap(cur, ["a", "b"], 1.5, stage)!;
  assert.ok(nearV(sc.map([0, 1]), [0, 1.5]));
  const fs = [
    F("1", 0, 2, { a: [-1, -2], b: [1, -2] }),
    F("2", 4, 6, cur, { a: [-1.5, -1], b: [1.5, -1] }),
    F("3", 8, 10, { a: [-1, 2], b: [1, 2] }, { a: [-2, 1] }),
  ];
  const half = (m: (v: Vec2) => Vec2, v: Vec2): Vec2 => {
    const t = m(v);
    return [(v[0] + t[0]) / 2, (v[1] + t[1]) / 2];
  };
  const rot = setPositions(fs, "2", r.moves, stage, { groupMap: r.map });
  assert.ok(nearV(viaOf(rot[1], "a"), half(r.map, [-1.5, -1])));
  assert.ok(nearV(viaOf(rot[2], "a"), half(r.map, [-2, 1])), "đường ra khỏi đội hình cũng đi theo");
  const big = setPositions(fs, "2", sc.moves, stage, { groupMap: sc.map });
  assert.ok(nearV(viaOf(big[1], "b"), [(1.5 + 2.25) / 2, (-1 - 1.5) / 2]));
  // Đổi chỗ: bỏ đường vào và ra của hai người
  const sw = setPositions(fs, "2", { a: cur.b, b: cur.a }, stage, { dropVia: true });
  assert.equal(sw[1].via, undefined);
  assert.equal(sw[2].via, undefined);
  assert.deepEqual(sw[1].pos, { a: [1, 0], b: [-1, 0] });
  // không có tuỳ chọn: vẫn dời theo dây cung như cũ, không mất đường
  const plain = setPositions(fs, "2", { a: [-1, 0.5] }, stage);
  assert.ok(viaOf(plain[1], "a") && viaOf(plain[2], "a"));
});

test("núm uốn: giữa đường khi đủ xa, đẩy ra vuông góc khi đường ngắn, ẩn khi gần như đứng yên", () => {
  const a: Vec2 = [0, 0];
  assert.ok(nearV(bendHandleAt(a, [3, 0], null), [1.5, 0]));
  const k = bendHandleAt(a, [0.8, 0], null)!;
  assert.ok(near(Math.hypot(k[0], k[1]), 0.6, 1e-9), "cách chấm đúng 0,6 m");
  assert.ok(near(k[0], 0.4), "đẩy vuông góc với dây cung, từ giữa đường");
  assert.equal(bendHandleAt(a, [0.2, 0], null), null, "đi dưới 0,3 m mà chưa cong: ẩn");
  assert.ok(bendHandleAt(a, [0.2, 0], [0.1, 0.4]), "đã cong thì vẫn hiện để bấm đúp đi thẳng lại");
  // đường đang cong về phía z âm thì núm đẩy về phía đó
  const c = viaThrough(a, [0.8, 0], [0.4, -0.1]);
  assert.ok(bendHandleAt(a, [0.8, 0], c)![1] < -0.4);
  // kéo: đường đi qua đúng chỗ núm (điểm điều khiển tính từ núm thật) thì núm đứng yên dưới con trỏ
  const v = viaThrough(a, [0.8, 0], k);
  assert.ok(nearV(bendHandleAt(a, [0.8, 0], v), k, 1e-9));
});

test("video sơ đồ: mũi tên mờ đường sắp đi lúc đang giữ đội hình", () => {
  const p: Project = {
    ...emptyProject(), stage,
    dancers: [newDancer("a", "An", "#ff0000"), newDancer("b", "Bình", "#00ff00")],
    formations: [F("1", 0, 2, { a: [-2, 0], b: [1, 1] }), F("2", 4, 6, { a: [2, 0], b: [1, 1] }, { a: [0, 2] })],
  };
  const g = planGeometry(stage, 1280, 720);
  const f = planFrame(p, 1, g);
  assert.equal(f.trails!.length, 1, "Bình đứng yên thì không có mũi tên");
  const t = f.trails![0];
  assert.ok(t.ahead && t.cx !== undefined, "đường cong vẽ cong");
  assert.deepEqual([t.x0, t.y0], toPx(g, -2, 0));
  assert.deepEqual([t.x1, t.y1], toPx(g, 2, 0));
  assert.equal(planFrame(p, 3, g).trails, undefined, "đang chuyển thì không vẽ");
  assert.equal(planFrame(p, 5, g).trails, undefined, "đội hình cuối thì không vẽ");
  assert.equal(planFrame(p, 1, g, { highlightId: "b" }).trails, undefined, "video riêng: chỉ đường của người đó");
  let lines = 0, arcs = 0;
  const alphas: number[] = [];
  const noop = () => {};
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    get globalAlpha() { return alphas[alphas.length - 1] ?? 1; },
    set globalAlpha(x: number) { alphas.push(x); },
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: () => void lines++, arc: () => void arcs++,
    fill: noop, stroke: noop, fillText: noop, setLineDash: noop, save: noop, restore: noop, rect: noop, clip: noop,
  };
  drawPlanFrame(ctx, g, f);
  assert.ok(lines > 10, "đường cong lấy mẫu thành nhiều đoạn");
  assert.ok(alphas.includes(0.35), "vẽ mờ");
  assert.equal(arcs, 2, "chỉ hai chấm người, không có bóng chỗ cũ");
});
