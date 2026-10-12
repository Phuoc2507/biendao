import { test } from "node:test";
import assert from "node:assert/strict";
import { playerKey, keyMedia, wantPlayers, planPlayers, type PlayerDancer } from "./players.ts";

const d = (id: string, mediaId: string | null, offsetSec = 0, extra: Partial<PlayerDancer> = {}): PlayerDancer => ({
  id, mediaId, offsetSec, durationSec: 10, hidden: false, ...extra,
});
const all = () => true;

test("playerKey làm tròn mili giây, keyMedia lấy lại mediaId", () => {
  assert.equal(playerKey("m1", 1.2344), "m1@1234");
  assert.equal(playerKey("m1", NaN), "m1@0");
  assert.equal(keyMedia("m@x@1500"), "m@x");
});

test("wantPlayers: bản nhân bản cùng offset dùng chung, lệch canon thì riêng", () => {
  const { byKey, assign } = wantPlayers([
    d("a", "m1", 0), d("b", "m1", 0, { durationSec: 12 }), d("c", "m1", 0.5),
    d("h", "m1", 0, { hidden: true }), d("n", null), d("x", "chua-nap"),
  ], (id) => id !== "chua-nap");
  assert.deepEqual([...byKey.keys()].sort(), ["m1@0", "m1@500"]);
  assert.equal(byKey.get("m1@0")!.durationSec, 12);
  assert.equal(assign.get("a"), assign.get("b"));
  assert.ok(!assign.has("h") && !assign.has("n") && !assign.has("x"));
});

test("planPlayers: kéo độ lệch thì đổi khoá element cũ, không tạo mới", () => {
  const before = wantPlayers([d("a", "m1", 0), d("b", "m2", 0)], all);
  const after = wantPlayers([d("a", "m1", 0.25), d("b", "m2", 0)], all);
  const r = planPlayers(after.byKey, after.assign, before.assign, before.byKey.keys());
  assert.deepEqual(r, { renames: [["m1@0", "m1@250"]], creates: [], drops: [] });
});

test("planPlayers: tách bản nhân bản ra thì tạo thêm một element", () => {
  const before = wantPlayers([d("a", "m1", 0), d("b", "m1", 0)], all);
  const after = wantPlayers([d("a", "m1", 0), d("b", "m1", 1)], all);
  const r = planPlayers(after.byKey, after.assign, before.assign, before.byKey.keys());
  assert.deepEqual(r, { renames: [], creates: ["m1@1000"], drops: [] });
});

test("planPlayers: bỏ element không còn ai dùng, đổi tệp thì tạo mới", () => {
  const before = wantPlayers([d("a", "m1", 0), d("b", "m2", 0)], all);
  const after = wantPlayers([d("a", "m3", 0)], all);
  const r = planPlayers(after.byKey, after.assign, before.assign, before.byKey.keys());
  assert.deepEqual(r.creates, ["m3@0"]);
  assert.deepEqual(r.drops.sort(), ["m1@0", "m2@0"]);
  assert.deepEqual(r.renames, []);
});
