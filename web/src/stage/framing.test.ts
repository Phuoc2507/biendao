import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Box, type Lens, type Safe, type View,
  fitFront, fitAlong, project, inside, stagePoints, TOP_DIR, SIDE_DIR,
} from "./framing.ts";

const safe: Safe = { top: 0.12, bottom: 0.2, side: 0.03 };
const boxes: Box[] = [
  { W: 10, D: 6, H: 1.9 },
  { W: 8, D: 5, H: 1.8 },
  { W: 14, D: 8, H: 2.1 },
  { W: 6, D: 6, H: 1.7 },
];
const aspects = [0.6, 1, 1.78, 3];
const lens = (aspect: number): Lens => ({ fov: 38, aspect });
const pitch = (v: View) =>
  Math.atan2(v.pos[1] - v.target[1], Math.hypot(v.pos[0] - v.target[0], v.pos[2] - v.target[2]));

test("góc khán giả: thấy hết sàn và đỉnh thẻ với mọi tỉ lệ khung", () => {
  for (const b of boxes)
    for (const a of aspects) {
      const v = fitFront(b, lens(a), safe);
      assert.ok(inside(stagePoints(b), v, lens(a), safe), `W${b.W} D${b.D} aspect ${a}`);
      assert.equal(v.pos[0], 0);
      assert.ok(v.pos[2] > b.D / 2, "máy đứng phía khán giả");
    }
});

test("góc khán giả: chân hàng đầu nằm đúng lề dưới, không bị cắt", () => {
  for (const b of boxes)
    for (const a of aspects) {
      const v = fitFront(b, lens(a), safe);
      const zf = b.D / 2 + 0.3;
      for (const x of [0, b.W / 2]) {
        const q = project([x, 0, zf], v, lens(a));
        assert.ok(Math.abs(q.y - (-1 + safe.bottom)) < 1e-6, `y=${q.y}`);
      }
      // mép trước sân (không tính bóng) còn cao hơn lề dưới
      assert.ok(project([0, 0, b.D / 2], v, lens(a)).y > -1 + safe.bottom);
    }
});

test("góc khán giả: khít một chiều (không lùi xa thừa)", () => {
  for (const b of boxes)
    for (const a of aspects) {
      const L = lens(a);
      const v = fitFront(b, L, safe);
      let maxX = 0, maxY = -1;
      for (const p of stagePoints(b)) {
        const q = project(p, v, L);
        maxX = Math.max(maxX, Math.abs(q.x));
        maxY = Math.max(maxY, q.y);
      }
      const tightX = Math.abs(maxX - (1 - safe.side)) < 0.01;
      const tightY = Math.abs(maxY - (1 - safe.top)) < 0.01;
      assert.ok(tightX || tightY, `aspect ${a}: x ${maxX.toFixed(3)} y ${maxY.toFixed(3)}`);
    }
});

test("góc khán giả: luôn chúc xuống ít nhất 3°, khung rộng thì đứng gần hơn", () => {
  for (const b of boxes) {
    let last = Infinity;
    for (const a of aspects) {
      const v = fitFront(b, lens(a), safe);
      assert.ok(pitch(v) >= (3 * Math.PI) / 180 - 1e-9);
      assert.ok(v.target[1] >= 0, "điểm xoay không chui xuống sàn");
      const d = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
      assert.ok(d <= last + 1e-6, `aspect ${a}: ${d} > ${last}`);
      assert.ok(d < 150, "trong giới hạn xa của OrbitControls");
      last = d;
    }
  }
});

test("lề trên lớn hơn thì vẫn vừa (chừa chỗ cho dòng nhắc)", () => {
  const b = boxes[0];
  const big: Safe = { top: 0.3, bottom: 0.25, side: 0.03 };
  for (const a of aspects) assert.ok(inside(stagePoints(b), fitFront(b, lens(a), big), lens(a), big));
});

test("góc Trên cao và Chéo cũng thấy hết sân", () => {
  for (const b of boxes)
    for (const a of aspects) {
      const L = lens(a);
      const top = fitAlong(b, L, safe, TOP_DIR, [0, 0, 0.3]);
      assert.ok(inside(stagePoints(b), top, L, safe));
      const side = fitAlong(b, L, safe, SIDE_DIR, [0, b.H / 3, 0]);
      assert.ok(inside(stagePoints(b), side, L, safe));
      assert.ok(side.pos[0] > 0 && side.pos[2] > 0);
    }
});

test("project: điểm trên trục nhìn ở giữa khung, bên phải khán giả ở bên phải khung", () => {
  const v: View = { pos: [0, 2, 10], target: [0, 1, 0] };
  const c = project([0, 1, 0], v, lens(1.5));
  assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9);
  assert.ok(project([2, 1, 0], v, lens(1.5)).x > 0);
  assert.ok(project([0, 2, 0], v, lens(1.5)).y > 0);
});
