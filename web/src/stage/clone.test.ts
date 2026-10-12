import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Formation, type Vec2,
  newDancer, dist, inWings, spotNear, placeClones, canonOffsets, checkInvariants, emptyProject, MIN_GAP,
  wingSpot,
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

test("canonOffsets: chỉ lệch những người dùng chung video với người dẫn", () => {
  const ds = ["a", "b", "c", "d", "e"].map((id) => newDancer(id, id, "#fff"));
  ds[0].mediaId = "m1"; ds[0].offsetSec = 0.3;
  ds[1].mediaId = "m2"; ds[1].offsetSec = 1; // video khác, đã khớp nhạc riêng
  ds[2].mediaId = "m1"; ds[2].offsetSec = 0.3;
  ds[3].mediaId = "m1"; ds[3].offsetSec = 0.3;
  // e chưa có video
  assert.deepEqual(canonOffsets(ds, ["a", "b", "c", "d", "e"], 0.5), { a: 0.3, c: 0.8, d: 1.3 });
  // người đầu danh sách chưa có video: dẫn là người đầu tiên có video
  assert.deepEqual(canonOffsets(ds, ["e", "b"], 0.5), { b: 1 });
  // lặp lại cùng bước không cộng dồn
  ds[2].offsetSec = 0.8; ds[3].offsetSec = 1.3;
  assert.deepEqual(canonOffsets(ds, ["a", "c", "d"], 0.5), { a: 0.3, c: 0.8, d: 1.3 });
});

test("placeClones: gốc trong cánh gà, nhiều bản sao không chồng nhau, kín bên này sang bên kia", () => {
  const fs: Formation[] = [{ id: "f", name: "Đội hình 1", start: 0, end: 4, pos: { a: [5.75, 2.5] } }];
  const newIds = Array.from({ length: 40 }, (_, i) => `c${i}`);
  const out = placeClones(fs, "a", newIds, stage)[0].pos;
  const pts = Object.values(out);
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i], pts[j]) > 0.4, `${i} ${j} chồng nhau`);
  for (const id of newIds) assert.ok(inWings(out[id], stage));
  assert.ok(out.c0[0] > 0, "cùng bên với bản gốc trước");
  assert.ok(newIds.some((id) => out[id][0] < 0), "kín bên phải thì sang trái");
  const p = {
    ...emptyProject(),
    dancers: ["a", ...newIds].map((id) => newDancer(id, id, "#fff")),
    formations: [{ ...fs[0], pos: out }],
  };
  assert.deepEqual(checkInvariants(p), []);
});

test("wingSpot: cánh gà kín thì chọn chỗ thưa nhất, không dồn một điểm", () => {
  const taken: Vec2[] = [];
  for (let i = 0; i < 45; i++) taken.push(wingSpot(taken, stage, -1));
  assert.equal(new Set(taken.map((p) => p.join())).size, taken.length);
  for (const p of taken) assert.ok(inWings(p, stage) && p[0] < 0 && Math.abs(p[0]) <= stage.width / 2 + 1.5);
  // 11 chỗ đầu như cũ: cột giữa cánh gà
  assert.ok(taken.slice(0, 11).every((p) => p[0] === -5.75));
});
