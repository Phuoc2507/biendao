import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Formation, type Vec2,
  newDancer, dist, inWings, spotNear, placeClones, canonOffsets, checkInvariants, emptyProject, MIN_GAP,
} from "./model.ts";

const stage = { width: 10, depth: 6 };

test("spotNear: điểm trống gần nhất, cách mọi người ≥ 0.8 m, trên sân", () => {
  const near: Vec2 = [0, 0];
  const p = spotNear(near, [near], stage)!;
  assert.ok(p);
  assert.ok(Math.abs(dist(p, near) - MIN_GAP) < 1e-9, "đứng sát ngay cạnh");
  assert.equal(p[1], 0, "ưu tiên cùng hàng");
  assert.ok(p[0] > 0, "ưu tiên bên phải");
  assert.ok(!inWings(p, stage));
});

test("spotNear: nhiều bản liên tiếp không chồng nhau", () => {
  const taken: Vec2[] = [[0, 0]];
  for (let i = 0; i < 8; i++) {
    const p = spotNear([0, 0], taken, stage)!;
    assert.ok(p);
    for (const q of taken) assert.ok(dist(p, q) >= MIN_GAP - 1e-9);
    assert.ok(Math.abs(p[0]) <= stage.width / 2 && Math.abs(p[1]) <= stage.depth / 2);
    taken.push(p);
  }
});

test("spotNear: sát mép sân thì tìm vào trong, hết chỗ trả null", () => {
  const p = spotNear([4.75, 2.75], [[4.75, 2.75]], stage)!;
  assert.ok(p && Math.abs(p[0]) <= 4.75 && Math.abs(p[1]) <= 2.75);
  const tiny = { width: 1, depth: 1 };
  assert.equal(spotNear([0, 0], [[0, 0]], tiny), null);
});

test("placeClones: cạnh bản gốc ở mọi đội hình; gốc trong cánh gà thì bản sao vào cánh gà", () => {
  const fs: Formation[] = [
    { id: "f1", name: "Đội hình 1", start: 0, end: 4, pos: { a: [0, 1], b: [2, 1] } },
    { id: "f2", name: "Đội hình 2", start: 6, end: 8, pos: { a: [-3, -1], b: [2, 1] } },
    { id: "f3", name: "Đội hình 3", start: 9, end: 10, pos: { a: [-5.75, 0], b: [2, 1] } },
  ];
  const out = placeClones(fs, "a", ["c", "d"], stage);
  assert.ok(!("c" in fs[0].pos), "không đột biến đầu vào");
  for (const f of out.slice(0, 2)) {
    const src = f.pos.a;
    for (const id of ["c", "d"]) {
      assert.ok(!inWings(f.pos[id], stage));
      assert.ok(dist(f.pos[id], src) < 1.7, "đứng gần bản gốc");
      for (const [k, q] of Object.entries(f.pos)) if (k !== id) assert.ok(dist(f.pos[id], q) >= MIN_GAP - 1e-9);
    }
  }
  assert.ok(inWings(out[2].pos.c, stage) && inWings(out[2].pos.d, stage));
  const p = { ...emptyProject(), dancers: ["a", "b", "c", "d"].map((id) => newDancer(id, id, "#fff")), formations: out };
  assert.deepEqual(checkInvariants(p), []);
});

test("canonOffsets: người thứ k lệch offset người đầu + k·Δ theo thứ tự danh sách", () => {
  const ds = ["a", "b", "c", "d"].map((id) => newDancer(id, id, "#fff"));
  ds[1].offsetSec = -1.2; // b đứng đầu trong lựa chọn
  ds[3].offsetSec = 9;
  // thứ tự chọn lộn xộn, vẫn theo thứ tự danh sách
  const r = canonOffsets(ds, ["d", "b", "c"], 0.5);
  assert.deepEqual(r, { b: -1.2, c: -0.7, d: -0.2 });
  assert.ok(!("a" in r));
  assert.deepEqual(canonOffsets(ds, [], 0.5), {});
  assert.deepEqual(canonOffsets(ds, ["a", "b"], -0.25), { a: 0, b: -0.25 });
});
