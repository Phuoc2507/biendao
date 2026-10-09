import { test } from "node:test";
import assert from "node:assert/strict";
import {
  videoTarget, snapTime, fmtTime, countAt, fmtCounts, tapTempo, defaultLens,
} from "./timing.ts";

test("videoTarget: trừ offset và kẹp trong video", () => {
  assert.deepEqual(videoTarget(5, 2, 10), { time: 3, inRange: true });
  const before = videoTarget(1, 2, 10);
  assert.equal(before.time, 0);
  assert.equal(before.inRange, false);
  const after = videoTarget(20, 2, 10);
  assert.ok(Math.abs(after.time - 9.96) < 1e-9);
  assert.equal(after.inRange, false);
  // offset âm: video bắt đầu trước nhạc
  assert.deepEqual(videoTarget(0, -1.5, 10), { time: 1.5, inRange: true });
});

test("snapTime: theo phách khi có BPM, theo 0.1 s khi không", () => {
  assert.equal(snapTime(1.04, null), 1);
  assert.equal(snapTime(1.06, null), 1.1);
  // 120 BPM: phách 0.5 s, downbeat 0.2
  assert.equal(snapTime(0.9, 120, 0.2), 0.7);
  assert.equal(snapTime(1.0, 120, 0.2), 1.2);
  assert.equal(snapTime(-3, 120, 0.2), 0);
  // nửa phách
  assert.equal(snapTime(0.9, 120, 0.2, 0.1, 2), 0.95);
});

test("fmtTime", () => {
  assert.equal(fmtTime(0), "0:00.0");
  assert.equal(fmtTime(65.27), "1:05.2");
  assert.equal(fmtTime(-1), "0:00.0");
});

test("countAt: đếm 1..8 theo lượt", () => {
  assert.deepEqual(countAt(0, 120, 0), { eight: 1, beat: 1 });
  assert.deepEqual(countAt(0.5, 120, 0), { eight: 1, beat: 2 });
  assert.deepEqual(countAt(3.6, 120, 0), { eight: 1, beat: 8 });
  assert.deepEqual(countAt(4.0, 120, 0), { eight: 2, beat: 1 });
  assert.deepEqual(countAt(-0.5, 120, 0), { eight: 0, beat: 8 });
});

test("fmtCounts", () => {
  assert.equal(fmtCounts(8, 120), "2×8");
  assert.equal(fmtCounts(6, 120), "1×8 + 4");
  assert.equal(fmtCounts(1.5, 120), "3 phách");
  assert.equal(fmtCounts(2, null), "2.0 s");
});

test("tapTempo: trung vị khoảng gõ", () => {
  assert.equal(tapTempo([0, 500]), null);
  assert.equal(tapTempo([0, 500, 1000, 1500, 2000]), 120);
  assert.equal(tapTempo([0, 500, 1010, 1500, 2000]), 120);
});

test("defaultLens: 8 phách khi có BPM", () => {
  assert.deepEqual(defaultLens(120), { hold: 4, gap: 4 });
  assert.deepEqual(defaultLens(null), { hold: 4, gap: 2 });
});
