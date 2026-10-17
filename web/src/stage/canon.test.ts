import { test } from "node:test";
import assert from "node:assert/strict";
import { canonTime, putCanon, canonSig } from "./timing.ts";
import { canonRanks, rightSide, newDancer, type Vec2 } from "./model.ts";
import { playerKey, keyMedia, wantPlayers, type PlayerDancer } from "./players.ts";
import { normalizeProject } from "./intake.ts";

const seg = { start: 10, end: 20, lag: 2 };

test("canonTime: ngoài đoạn như cả nhóm, đầu đoạn đứng chờ, sau đó trễ, hết đoạn khớp lại", () => {
  assert.deepEqual(canonTime(9.5, [seg]), { t: 9.5, hold: false });
  assert.deepEqual(canonTime(10, [seg]), { t: 10, hold: true });
  assert.deepEqual(canonTime(11.9, [seg]), { t: 10, hold: true });
  assert.deepEqual(canonTime(12, [seg]), { t: 10, hold: false });
  assert.deepEqual(canonTime(15, [seg]), { t: 13, hold: false });
  assert.deepEqual(canonTime(20, [seg]), { t: 20, hold: false });
  assert.deepEqual(canonTime(5, undefined), { t: 5, hold: false });
});

test("canonTime: trễ dài hơn đoạn vẫn chừa 0,1 s múa, trễ 0 không làm gì", () => {
  const r = canonTime(19.95, [{ start: 10, end: 20, lag: 50 }]);
  assert.equal(r.hold, false);
  assert.ok(Math.abs(r.t - 10.05) < 1e-9);
  assert.deepEqual(canonTime(12, [{ start: 10, end: 20, lag: 0 }]), { t: 12, hold: false });
});

test("putCanon: đoạn chồng lên thay đoạn cũ, lag 0 là xoá, giữ thứ tự thời gian", () => {
  let s = putCanon(undefined, { start: 30, end: 40, lag: 1 });
  s = putCanon(s, { start: 10, end: 20, lag: 2 });
  assert.deepEqual(s.map((x) => x.start), [10, 30]);
  s = putCanon(s, { start: 15, end: 25, lag: 0.5 });
  assert.deepEqual(s, [{ start: 15, end: 25, lag: 0.5 }, { start: 30, end: 40, lag: 1 }]);
  assert.deepEqual(putCanon(s, { start: 0, end: 100, lag: 0 }), []);
  // đảo đầu cuối và trễ quá dài: tự sửa
  assert.deepEqual(putCanon([], { start: 8, end: 4, lag: 9 }), [{ start: 4, end: 8, lag: 3.9 }]);
});

test("khoá element: canon khác nhau thì element riêng, keyMedia vẫn đúng", () => {
  const segs = [{ start: 1, end: 2.5, lag: 0.5 }];
  assert.equal(canonSig(segs), "~1000:2500:500");
  assert.equal(playerKey("m1", 0, segs), "m1@0~1000:2500:500");
  assert.equal(keyMedia(playerKey("m1", 0, segs)), "m1");
  const d = (id: string, canon?: typeof segs): PlayerDancer =>
    ({ id, mediaId: "m1", offsetSec: 0, durationSec: 10, hidden: false, canon });
  const { byKey, assign } = wantPlayers([d("a"), d("b", segs), d("c", segs)], () => true);
  assert.equal(byKey.size, 2);
  assert.equal(assign.get("b"), assign.get("c"));
  assert.notEqual(assign.get("a"), assign.get("b"));
  assert.deepEqual(byKey.get(assign.get("b")!)!.canon, segs);
});

const ds = ["a", "b", "c", "d"].map((id) => newDancer(id, id, "#fff"));
const pos: Record<string, Vec2> = { a: [2, 0], b: [-2, 0], c: [0, 1], d: [0.1, -1] };

test("canonRanks: trái sang phải, giữa trước, hàng đầu trước, theo danh sách", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(canonRanks(ids, ds, pos, "ltr"), { b: 0, c: 1, a: 2 });
  assert.deepEqual(canonRanks(ids, ds, pos, "rtl"), { a: 0, c: 1, b: 2 });
  // giữa trước, cặp hai bên đối xứng vào cùng lượt
  assert.deepEqual(canonRanks(ids, ds, pos, "center"), { c: 0, a: 1, b: 1 });
  // c và d cùng cột (lệch 0,1 m) vào cùng lượt khi trái sang phải
  assert.deepEqual(canonRanks(["a", "b", "c", "d"], ds, pos, "ltr"), { b: 0, c: 1, d: 1, a: 2 });
  assert.deepEqual(canonRanks(["d", "c"], ds, pos, "front"), { c: 0, d: 1 });
  assert.deepEqual(canonRanks(["c", "a"], ds, pos, "list"), { a: 0, c: 1 });
});

test("rightSide: người bên phải giữa nhóm (khán giả nhìn)", () => {
  assert.deepEqual(rightSide(["a", "b", "c"], pos), ["a"]);
  assert.deepEqual(rightSide(["c", "d"], pos), []);
});

test("normalizeProject giữ canon và lật gương hợp lệ, bỏ dữ liệu hỏng", () => {
  const raw = {
    version: 1,
    dancers: [
      { id: "a", flip: true, canon: [{ start: 5, end: 9, lag: 1 }, { start: 3, end: 2, lag: 1 }, { start: 0, end: 1, lag: 0 }, null] },
      { id: "b", flip: "có", canon: "x" },
    ],
    formations: [],
  };
  const p = normalizeProject(raw)!;
  assert.equal(p.dancers[0].flip, true);
  assert.deepEqual(p.dancers[0].canon, [{ start: 5, end: 9, lag: 1 }]);
  assert.equal("flip" in p.dancers[1], false);
  assert.equal("canon" in p.dancers[1], false);
});
