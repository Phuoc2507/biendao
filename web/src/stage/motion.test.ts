import { test } from "node:test";
import assert from "node:assert/strict";
import { JOINTS, motionKey, parseMotion, sampleMotion, motionDuration, isMotionName } from "./motion.ts";

const frame = (y: number) => JOINTS.map((_, i) => [i * 0.1, y, 0]);
const file = (frames: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: "choreo-motion", version: 1, name: "Lan", fps: 10, numFrames: frames.length, jointNames: JOINTS, frames, ...extra });

test("parseMotion: đọc đúng tệp, nội suy thẳng, ngoài khoảng giữ khung đầu cuối", () => {
  const m = parseMotion(file([frame(0), frame(1), frame(3)]))!;
  assert.equal(m.n, 3);
  assert.equal(m.name, "Lan");
  assert.ok(Math.abs(motionDuration(m) - 0.2) < 1e-9);
  const out = new Float32Array(JOINTS.length * 3);
  assert.ok(Math.abs(sampleMotion(m, 0.05, out)[1] - 0.5) < 1e-6);
  assert.ok(Math.abs(sampleMotion(m, 0.15, out)[1] - 2) < 1e-6);
  assert.equal(sampleMotion(m, -4, out)[1], 0);
  assert.equal(sampleMotion(m, 99, out)[1], 3);
  assert.equal(sampleMotion(m, NaN, out)[1], 0);
  assert.ok(Math.abs(out[3 * 5] - 0.5) < 1e-6); // khớp thứ 6, trục x
});

test("parseMotion: sai định dạng, thiếu khớp, số hỏng thì null", () => {
  assert.equal(parseMotion("không phải json"), null);
  assert.equal(parseMotion(file([frame(0)], { format: "choreo-card" })), null);
  assert.equal(parseMotion(file([frame(0)], { fps: 0 })), null);
  assert.equal(parseMotion(file([])), null);
  assert.equal(parseMotion(file([frame(0).slice(1)])), null);
  assert.equal(parseMotion(file([frame(0)], { jointNames: [...JOINTS].reverse() })), null);
  const bad = frame(0);
  bad[2] = [0, null as unknown as number, 0];
  assert.equal(parseMotion(file([bad])), null);
});

test("motionKey: bỏ đuôi để ghép theo tên", () => {
  assert.equal(motionKey("Lan.motion.json"), "lan");
  assert.equal(motionKey("IMG_5116.card.MOTION.JSON"), "img_5116");
  assert.ok(isMotionName("a.Motion.json"));
  assert.ok(!isMotionName("a.card.json"));
});
