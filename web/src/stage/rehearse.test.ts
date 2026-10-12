import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNT_IN, countInBeat, leadIn, untilText, dancerStops, stopLabel, dancerLegs, meCue,
} from "./rehearse.ts";
import { type Formation, type Vec2 } from "./model.ts";

const F = (id: string, start: number, end: number, pos: Record<string, Vec2>): Formation => ({
  id, name: `Đội hình ${id}`, start, end, pos,
});
const fs: Formation[] = [
  F("1", 2, 6, { a: [1.5, 1], b: [-1, 0] }),
  F("2", 8, 12, { a: [-1, 0], b: [-1, 0] }),
  F("3", 14, 18, { a: [1.5, 1], b: [2, -1] }),
];
const desc = (q: Vec2) => `${q[0]}/${q[1]}`;

test("đếm vào: 4 số, theo phách nếu có BPM, chậm lại khi phát chậm", () => {
  assert.deepEqual(COUNT_IN, ["5", "6", "7", "8"]);
  assert.equal(countInBeat(120), 0.5);
  assert.equal(countInBeat(120, 0.5), 1);
  assert.equal(countInBeat(null), 0.6);
  assert.equal(countInBeat(600), 0.2); // quá nhanh thì giữ tối thiểu
  assert.equal(countInBeat(20), 2);
});

test("leadIn: còn bao lâu tới phách kế", () => {
  assert.equal(leadIn(3, null), 0);
  assert.ok(Math.abs(leadIn(1.2, 120, 0) - 0.3) < 1e-9);
  assert.equal(leadIn(1.5, 120, 0), 0); // đúng phách
  assert.ok(Math.abs(leadIn(0.05, 120, 0.25) - 0.2) < 1e-9);
  assert.ok(Math.abs(leadIn(0.1, 60, 0.4) - 0.3) < 1e-9);
});

test("untilText: không nhảy mỗi khung, đổi theo phách hoặc giây", () => {
  // 120 BPM: phách 0,5 s
  assert.equal(untilText(6, 120), "còn 1×8 + 4");
  assert.equal(untilText(5.9, 120), "còn 1×8 + 4"); // làm tròn lên
  assert.equal(untilText(5.99, 120), untilText(5.6, 120));
  assert.equal(untilText(4, 120), "còn 1×8");
  assert.equal(untilText(0.01, 120), "còn 1 phách");
  assert.equal(untilText(3.2, null), "còn 4 s");
  assert.equal(untilText(3.9, null), untilText(3.1, null));
  assert.equal(untilText(0, null), "còn 1 s");
});

test("dancerStops / stopLabel: gộp chỗ đứng trùng, nhãn đội hình", () => {
  const st = dancerStops(fs, "a");
  assert.equal(st.length, 2);
  assert.deepEqual(st[0].ks, [0, 2]);
  assert.equal(stopLabel(st[0].ks), "1, 3");
  assert.equal(stopLabel([0, 1, 2, 5]), "1–3, 6");
  assert.equal(stopLabel([3]), "4");
  assert.equal(dancerStops(fs, "b")[0].ks.length, 2);
  assert.deepEqual(dancerStops(fs, "zz"), []);
});

test("dancerLegs: bỏ chặng đứng yên", () => {
  assert.deepEqual(dancerLegs(fs, "a").map((l) => l.k), [0, 1]);
  assert.deepEqual(dancerLegs(fs, "b").map((l) => l.k), [1]);
});

test("meCue: dòng nhắc theo từng đoạn", () => {
  assert.equal(meCue([], "a", 0, null, desc), null);
  assert.equal(meCue(fs, "a", 0, null, desc), "Chuẩn bị · vào chỗ: 1.5/1");
  assert.equal(meCue(fs, "a", 3, null, desc), "Đội hình 1 · bạn đứng: 1.5/1 · còn 3 s thì đi tới -1/0");
  assert.equal(meCue(fs, "b", 3, null, desc), "Đội hình 1 · bạn đứng: -1/0 · Đội hình 2: đứng yên");
  assert.equal(meCue(fs, "a", 7, 120, desc), "→ Đội hình 2 · đi tới: -1/0 · còn 2 phách");
  assert.equal(meCue(fs, "a", 20, null, desc), "Đội hình 3 · bạn đứng: 1.5/1");
  assert.equal(meCue(fs, "zz", 3, null, desc), null);
});
