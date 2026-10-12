import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseBatch, makeBatcher, type Hist } from "./history.ts";

type P = { n: number };

function mkStore(p0: P) {
  let s: Hist<P> & { future: P[] } = { project: p0, past: [], future: [] };
  const commit = (n: number) => {
    const next = { n };
    s = { project: next, past: [...s.past, s.project], future: [] };
  };
  const undo = () => {
    const prev = s.past[s.past.length - 1];
    s = { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future] };
  };
  const b = makeBatcher<P>(() => s, (x) => { s = { ...s, ...x }; });
  return { get: () => s, commit, undo, b };
}

test("collapseBatch: không đổi gì thì null", () => {
  const a = { n: 0 };
  assert.equal(collapseBatch(a, { project: a, past: [] }), null);
});

test("collapseBatch: một commit thì giữ nguyên (null)", () => {
  const a = { n: 0 }, b = { n: 1 };
  assert.equal(collapseBatch(a, { project: b, past: [a] }), null);
});

test("collapseBatch: base mất khỏi lịch sử (nạp lại) thì null", () => {
  const a = { n: 0 }, b = { n: 1 }, c = { n: 2 };
  assert.equal(collapseBatch(a, { project: c, past: [b] }), null);
});

test("batch đồng bộ: nhiều commit thành một bước hoàn tác", () => {
  const p0 = { n: 0 };
  const s = mkStore(p0);
  s.b.batch(() => { s.commit(1); s.commit(2); s.commit(3); });
  assert.equal(s.get().project.n, 3);
  assert.equal(s.get().past.length, 1);
  s.undo();
  assert.equal(s.get().project, p0);
});

test("batch lồng nhau: chỉ lớp ngoài cùng gộp", () => {
  const s = mkStore({ n: 0 });
  s.b.batch(() => {
    s.commit(1);
    s.b.batch(() => { s.commit(2); s.commit(3); });
    assert.equal(s.get().past.length, 3, "lớp trong chưa gộp");
    s.commit(4);
  });
  assert.equal(s.get().past.length, 1);
  assert.equal(s.b.active(), false);
});

test("batch async: gộp sau khi promise xong, kể cả khi lỗi", async () => {
  const s = mkStore({ n: 0 });
  await s.b.batch(async () => {
    s.commit(1);
    await Promise.resolve();
    s.commit(2);
  });
  assert.equal(s.get().past.length, 1);
  await assert.rejects(s.b.batch(async () => {
    s.commit(5);
    await Promise.resolve();
    s.commit(6);
    throw new Error("x");
  }));
  assert.equal(s.get().past.length, 2);
  assert.equal(s.b.active(), false);
});

test("batch: hàm ném lỗi đồng bộ vẫn đóng batch", () => {
  const s = mkStore({ n: 0 });
  assert.throws(() => s.b.batch(() => { s.commit(1); s.commit(2); throw new Error("y"); }));
  assert.equal(s.b.active(), false);
  assert.equal(s.get().past.length, 1);
});
