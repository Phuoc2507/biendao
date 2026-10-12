import { test } from "node:test";
import assert from "node:assert/strict";
import { canMerge, pruneSelection } from "./history.ts";

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
