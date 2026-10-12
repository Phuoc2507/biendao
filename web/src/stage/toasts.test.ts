import { test } from "node:test";
import assert from "node:assert/strict";
import { type Toast, pushToast, toastMs } from "./toasts.ts";

const t = (id: number, msg: string, o: Partial<Toast> = {}): Toast => ({ id, msg, ...o });

test("pushToast xếp chồng, tối đa 3, bỏ cái cũ nhất", () => {
  let q: Toast[] = [];
  q = pushToast(q, t(1, "một"));
  q = pushToast(q, t(2, "hai"));
  q = pushToast(q, t(3, "ba"));
  q = pushToast(q, t(4, "bốn"));
  assert.deepEqual(q.map((x) => x.id), [2, 3, 4]);
});

test("pushToast: thông báo quan trọng không bị đè mất ngay", () => {
  let q: Toast[] = [];
  q = pushToast(q, t(1, "3 video khớp nhạc chưa chắc", { kind: "warn" }));
  q = pushToast(q, t(2, "Bỏ qua 2 tệp không đọc được"));
  assert.deepEqual(q.map((x) => x.id), [1, 2], "cả hai cùng hiện");
});

test("pushToast giữ lỗi, bỏ thông báo thường trước", () => {
  let q: Toast[] = [];
  q = pushToast(q, t(1, "Lỗi đọc tệp", { kind: "error" }));
  q = pushToast(q, t(2, "a"));
  q = pushToast(q, t(3, "b"));
  q = pushToast(q, t(4, "c"));
  assert.deepEqual(q.map((x) => x.id), [1, 3, 4]);
  // toàn lỗi thì bỏ lỗi cũ nhất, cái mới luôn được giữ
  let e: Toast[] = [];
  for (let i = 1; i <= 4; i++) e = pushToast(e, t(i, `lỗi ${i}`, { kind: "error" }));
  assert.deepEqual(e.map((x) => x.id), [2, 3, 4]);
  let m: Toast[] = [];
  for (let i = 1; i <= 3; i++) m = pushToast(m, t(i, `lỗi ${i}`, { kind: "error" }));
  m = pushToast(m, t(9, "thường"));
  assert.deepEqual(m.map((x) => x.id), [2, 3, 9]);
});

test("pushToast: trùng nội dung thì thay cái cũ, không nhân đôi", () => {
  let q: Toast[] = [];
  q = pushToast(q, t(1, "Đã lưu"));
  q = pushToast(q, t(2, "khác"));
  q = pushToast(q, t(3, "Đã lưu"));
  assert.deepEqual(q.map((x) => x.id), [2, 3]);
  // cùng chữ nhưng khác loại thì vẫn là hai thông báo
  q = pushToast(q, t(4, "Đã lưu", { kind: "error" }));
  assert.deepEqual(q.map((x) => x.id), [2, 3, 4]);
});

test("toastMs: lỗi ở lâu nhất, câu dài ở lâu hơn", () => {
  assert.equal(toastMs(t(1, "ngắn")), 3500);
  assert.equal(toastMs(t(1, "ngắn", { undo: true })), 6000);
  assert.equal(toastMs(t(1, "ngắn", { kind: "warn" })), 6000);
  assert.equal(toastMs(t(1, "ngắn", { kind: "error" })), 10000);
  assert.equal(toastMs(t(1, "x".repeat(100))), 6500);
  assert.equal(toastMs(t(1, "x".repeat(1000))), 12000);
});
