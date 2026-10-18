// Thử ngẫu nhiên có hạt giống cố định (lặp lại được): tệp dự án rác và các phép
// sửa đội hình với khoảng hở rất nhỏ không được làm vỡ bất biến của bài.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./model.ts";
import { findIssues } from "./checks.ts";
import { fixAll } from "./fixes.ts";
import { normalizeProject } from "./intake.ts";

function rng(seed: number) {
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  return { rnd, pick };
}

const overlaps = (fs: M.Formation[]) =>
  fs.some((f, k) => !(f.start <= f.end) || (k + 1 < fs.length && f.end > fs[k + 1].start + 1e-9));

test("thử ngẫu nhiên: tệp dự án rác không làm normalizeProject văng lỗi hay vỡ bất biến", () => {
  const { rnd, pick } = rng(7);
  const junk = () => pick<unknown>([null, 0, -1, 1e999, -1e999, "x", true, [], {}, [1], [1, 2], ["a", 1], NaN, 5, 0.001]);
  for (let it = 0; it < 1500; it++) {
    const raw: Record<string, unknown> & { dancers: unknown[]; formations: unknown[] } = { version: 1, dancers: [], formations: [] };
    for (const k of ["title", "stage", "bpm", "downbeat", "musicId", "musicName", "musicDuration", "myShapes"])
      if (rnd() < 0.5) raw[k] = rnd() < 0.3 ? { width: junk(), depth: junk() } : junk();
    for (let i = 0, n = pick([0, 1, 3]); i < n; i++)
      raw.dancers.push(rnd() < 0.1 ? junk() : { id: pick(["a", "b", "a", 3]), name: pick(["A", 3, null]), offsetSec: junk(), hidden: junk() });
    for (let i = 0, n = pick([0, 1, 3]); i < n; i++)
      raw.formations.push(rnd() < 0.1 ? junk() : {
        id: pick(["f", "g", "f", 1]), name: pick(["F", null]), start: junk(), end: junk(),
        pos: rnd() < 0.2 ? junk() : { a: pick([junk(), [1, 2], [1e999, 0], [100, 100]]), b: [0, 0] },
      });
    const ctx = JSON.stringify(raw);
    const p = normalizeProject(raw);
    assert.ok(p, ctx);
    assert.deepEqual(M.checkInvariants(p), [], ctx);
    assert.ok(p.stage.width > 0 && p.stage.depth > 0 && Number.isFinite(p.stage.width) && Number.isFinite(p.stage.depth), ctx);
    assert.ok(p.bpm === null || p.bpm > 0, ctx);
    assert.ok(Number.isFinite(p.downbeat) && typeof p.title === "string", ctx);
    assert.equal(new Set(p.dancers.map((d) => d.id)).size, p.dancers.length, ctx);
    assert.equal(new Set(p.formations.map((f) => f.id)).size, p.formations.length, ctx);
    for (const d of p.dancers) assert.ok(typeof d.name === "string" && typeof d.color === "string", ctx);
    for (const f of p.formations) {
      assert.ok(Number.isFinite(f.start) && Number.isFinite(f.end) && f.start >= 0 && typeof f.name === "string", ctx);
      for (const q of Object.values(f.pos)) assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]), ctx);
    }
    const ids = p.dancers.map((d) => d.id);
    for (const q of Object.values(M.posesAt(p.formations, ids, 1, p.stage))) assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]), ctx);
    findIssues(p.formations, p.dancers, p.stage, p.bpm);
  }
});

test("thử ngẫu nhiên: thêm, dời, kéo giãn, sửa tất cả đội hình với khoảng hở rất nhỏ không làm khối đè nhau", () => {
  const { rnd, pick } = rng(11);
  for (let it = 0; it < 1500; it++) {
    const stage = { width: pick([4, 10, 0.5, 30]), depth: pick([3, 6, 0.3]) };
    const ids = Array.from({ length: pick([0, 1, 2, 5]) }, (_, i) => "d" + i);
    let t0 = rnd() * 2;
    const fs: M.Formation[] = [];
    for (let i = 0, n = pick([0, 1, 2, 4]); i < n; i++) {
      const len = pick([0, 0.05, 0.2, 1, 3]), gap = pick([0, 0.01, 0.1, 0.5, 2]);
      const pos: Record<string, M.Vec2> = {};
      for (const id of ids) pos[id] = M.clampToStage([(rnd() - 0.5) * (stage.width + 4), (rnd() - 0.5) * stage.depth], stage);
      fs.push({ id: "f" + i, name: "F" + i, start: t0, end: t0 + len, pos });
      t0 += len + gap;
    }
    const t = pick([-1, 0, rnd() * 15, 1e9]);
    const ctx = JSON.stringify({ stage, n: ids.length, fs: fs.map((f) => [f.start, f.end]), t });
    assert.ok(!overlaps(M.ensureFormationAt(fs, t, ids, stage, "mới", pick([0.1, 4])).formations), "ensureFormationAt " + ctx);
    assert.ok(!overlaps(M.addFormationAfter(fs, t, ids, stage, "mới", pick([0.1, 4]), pick([0, 2])).formations), "addFormationAfter " + ctx);
    if (fs.length) {
      const f = pick(fs);
      assert.ok(!overlaps(M.setBlockTimes(fs, f.id, pick([-5, 0, rnd() * 10, 100]), pick([-5, 0, rnd() * 10, 100]))), "setBlockTimes " + ctx);
      assert.ok(!overlaps(M.moveBlock(fs, f.id, pick([-5, 0, rnd() * 10, 100]))), "moveBlock " + ctx);
    }
    for (const q of Object.values(M.lineup(ids, stage))) assert.deepEqual(M.clampToStage(q, stage), q, "lineup " + ctx);
    const dancers = ids.map((id) => ({ id, name: id }));
    assert.ok(!overlaps(fixAll(fs, dancers, stage, pick([null, 0, -120, 120]), pick([0, -3, 1]))), "fixAll " + ctx);
  }
});
