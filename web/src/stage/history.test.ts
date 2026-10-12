import { test } from "node:test";
import assert from "node:assert/strict";
import { canMerge, collapseBatch, makeBatcher, pruneSelection, type Hist } from "./history.ts";

test("canMerge: cùng khoá, trong cửa sổ thời gian thì gộp", () => {
  assert.equal(canMerge("tap", 1000, "tap", 2000), true);
  assert.equal(canMerge("tap", 1000, "tap", 3500), true);
  assert.equal(canMerge("tap", 1000, "tap", 3600), false, "ngừng gõ quá lâu: bước mới");
  assert.equal(canMerge("tap", 1000, "bpm", 1200), false, "khác khoá");
  assert.equal(canMerge(null, 1000, "tap", 1200), false);
  assert.equal(canMerge("tap", 1000, undefined, 1200), false, "không có khoá thì không gộp");
  assert.equal(canMerge("cardH:a", 0, "cardH:b", 10), false, "thẻ người khác");
});

test("canMerge: một loạt gõ nhịp liền nhau chỉ thành một bước", () => {
  let key: string | null = null;
  let at = 0;
  let steps = 0;
  for (const t of [0, 450, 900, 1350, 1800, 2250, 2700, 3150]) {
    if (!canMerge(key, at, "tap", t)) steps++;
    key = "tap";
    at = t;
  }
  assert.equal(steps, 1);
});

const ui = (selected: string[], selectedBlock: string | null) => ({ selected, selectedBlock, view: "plan" });
const proj = {
  dancers: [{ id: "a" }, { id: "b" }],
  formations: [{ id: "f1" }],
};

test("pruneSelection bỏ người và khối không còn", () => {
  const u = ui(["a", "x", "b"], "f9");
  const r = pruneSelection(u, proj);
  assert.deepEqual(r.selected, ["a", "b"]);
  assert.equal(r.selectedBlock, null);
  assert.equal(r.view, "plan", "giữ các trường khác");
});

test("pruneSelection không đổi gì thì trả đúng đối tượng cũ", () => {
  const u = ui(["a"], "f1");
  assert.equal(pruneSelection(u, proj), u);
  const empty = ui([], null);
  assert.equal(pruneSelection(empty, proj), empty);
});

test("pruneSelection: hoàn tác lần thêm người thì người mới bị bỏ chọn", () => {
  const u = ui(["c"], "f1");
  const r = pruneSelection(u, proj);
  assert.deepEqual(r.selected, []);
  assert.equal(r.selectedBlock, "f1");
});


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
