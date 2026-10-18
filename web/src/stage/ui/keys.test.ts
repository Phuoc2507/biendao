import { test } from "node:test";
import assert from "node:assert/strict";
import { type KeyCtx, type KeyIn, nativeKey, resolveShortcut, routeKey, targetKind } from "./keys.ts";

const ctx = (o: Partial<KeyCtx> = {}): KeyCtx => ({
  presenting: false, help: false, hasSelection: false, hasDancers: true, hasBlock: false, formationFocused: false, ...o,
});
const key = (k: string, o: Partial<KeyIn> = {}): KeyIn => ({ key: k, ctrl: false, shift: false, alt: false, ...o });

test("targetKind: chỉ ô gõ chữ mới là text", () => {
  assert.equal(targetKind({ tagName: "INPUT", type: "text" }), "text");
  assert.equal(targetKind({ tagName: "INPUT", type: "number" }), "text");
  assert.equal(targetKind({ tagName: "INPUT", type: "search" }), "text");
  assert.equal(targetKind({ tagName: "INPUT" }), "text");
  assert.equal(targetKind({ tagName: "TEXTAREA" }), "text");
  assert.equal(targetKind({ tagName: "DIV", isContentEditable: true }), "text");
  assert.equal(targetKind({ tagName: "INPUT", type: "checkbox" }), "toggle");
  assert.equal(targetKind({ tagName: "INPUT", type: "range" }), "range");
  assert.equal(targetKind({ tagName: "INPUT", type: "radio" }), "radio");
  assert.equal(targetKind({ tagName: "INPUT", type: "button" }), "button");
  assert.equal(targetKind({ tagName: "SELECT" }), "select");
  assert.equal(targetKind({ tagName: "BUTTON" }), "button");
  assert.equal(targetKind({ tagName: "A" }), "link");
  assert.equal(targetKind({ tagName: "DIV" }), "other");
  assert.equal(targetKind(null), "other");
  assert.equal(targetKind({}), "other", "window không có tagName");
});

test("nativeKey: phím riêng của từng loại ô", () => {
  assert.equal(nativeKey("button", " "), true);
  assert.equal(nativeKey("button", "ArrowLeft"), false);
  assert.equal(nativeKey("toggle", " "), true);
  assert.equal(nativeKey("toggle", "Enter"), false);
  assert.equal(nativeKey("range", "ArrowRight"), true);
  assert.equal(nativeKey("range", " "), false);
  assert.equal(nativeKey("select", "ArrowDown"), true);
  assert.equal(nativeKey("other", " "), false);
});

test("routeKey: bấm chuột vào ô rồi gõ phím tắt thì phím tắt thắng", () => {
  const mouse = { pointerFocus: true, presenting: false };
  const tab = { pointerFocus: false, presenting: false };
  // vừa bấm checkbox Bám lưới, Space phải phát/dừng chứ không bật tắt ô
  assert.equal(routeKey("toggle", " ", mouse), "steal");
  // đi tới bằng Tab thì Space vẫn bật tắt ô
  assert.equal(routeKey("toggle", " ", tab), "skip");
  // phím ô không dùng thì cứ chạy phím tắt, giữ tiêu điểm
  assert.equal(routeKey("toggle", "ArrowRight", tab), "run");
  assert.equal(routeKey("range", "n", tab), "run");
  // đang gõ chữ thì không bao giờ cướp phím
  assert.equal(routeKey("text", " ", mouse), "skip");
  // trình chiếu: ô tốc độ vừa chọn không được nuốt mũi tên
  assert.equal(routeKey("select", "ArrowRight", { pointerFocus: false, presenting: true }), "steal");
});

test("Ctrl: hoàn tác, làm lại, lưu, chọn hết", () => {
  assert.deepEqual(resolveShortcut(key("z", { ctrl: true }), ctx()), { type: "undo" });
  assert.deepEqual(resolveShortcut(key("Z", { ctrl: true, shift: true }), ctx()), { type: "redo" });
  assert.deepEqual(resolveShortcut(key("y", { ctrl: true }), ctx()), { type: "redo" });
  assert.deepEqual(resolveShortcut(key("s", { ctrl: true }), ctx()), { type: "save" });
  assert.deepEqual(resolveShortcut(key("a", { ctrl: true }), ctx()), { type: "selectAll" });
  assert.equal(resolveShortcut(key("x", { ctrl: true }), ctx()), null);
});

test("Ctrl C / Ctrl V: chép và dán chỗ đứng, nhường Ctrl C khi đang bôi đen chữ", () => {
  assert.deepEqual(resolveShortcut(key("c", { ctrl: true }), ctx()), { type: "copy" });
  assert.deepEqual(resolveShortcut(key("v", { ctrl: true }), ctx()), { type: "paste" });
  assert.equal(resolveShortcut(key("c", { ctrl: true }), ctx({ textSelected: true })), null);
  assert.equal(resolveShortcut(key("v", { ctrl: true }), ctx({ hasDancers: false })), null);
  assert.equal(resolveShortcut(key("v", { ctrl: true, repeat: true }), ctx()), null);
  assert.equal(resolveShortcut(key("c", { ctrl: true }), ctx({ presenting: true })), null);
});

test("Trình chiếu: bỏ Ctrl (trừ Ctrl S) và các phím sửa", () => {
  const pr = ctx({ presenting: true, hasSelection: true, hasBlock: true });
  assert.equal(resolveShortcut(key("z", { ctrl: true }), pr), null);
  assert.equal(resolveShortcut(key("a", { ctrl: true }), pr), null);
  assert.deepEqual(resolveShortcut(key("s", { ctrl: true }), pr), { type: "save" });
  assert.equal(resolveShortcut(key("Delete"), pr), null);
  assert.equal(resolveShortcut(key("m"), pr), null);
  assert.equal(resolveShortcut(key("Enter"), pr), null);
  assert.equal(resolveShortcut(key("?", { shift: true }), pr), null);
});

test("Trình chiếu: mũi tên và PageUp/PageDown nhảy đội hình, Home/End về đầu/cuối", () => {
  const pr = ctx({ presenting: true, hasSelection: true });
  assert.deepEqual(resolveShortcut(key("ArrowRight"), pr), { type: "jump", dir: 1 });
  assert.deepEqual(resolveShortcut(key("PageDown"), pr), { type: "jump", dir: 1 });
  assert.deepEqual(resolveShortcut(key("ArrowLeft"), pr), { type: "jump", dir: -1 });
  assert.deepEqual(resolveShortcut(key("PageUp"), pr), { type: "jump", dir: -1 });
  assert.deepEqual(resolveShortcut(key("Home"), pr), { type: "seek", to: "start" });
  assert.deepEqual(resolveShortcut(key("End"), pr), { type: "seek", to: "end" });
  assert.deepEqual(resolveShortcut(key(" "), pr), { type: "toggle" });
  assert.deepEqual(resolveShortcut(key("Escape"), pr), { type: "exit" });
  assert.deepEqual(resolveShortcut(key("F", { shift: true }), pr), { type: "exit" });
});

test("Delete không xoá đội hình khi đang chọn người", () => {
  assert.deepEqual(resolveShortcut(key("Delete"), ctx({ hasSelection: true, hasBlock: true })), { type: "deleteHint" });
  assert.deepEqual(resolveShortcut(key("Delete"), ctx({ hasBlock: true })), { type: "delete" });
  // tiêu điểm đang ở khối đội hình thì xoá được dù đang chọn người
  assert.deepEqual(
    resolveShortcut(key("Delete"), ctx({ hasSelection: true, hasBlock: true, formationFocused: true })),
    { type: "delete" },
  );
  assert.equal(resolveShortcut(key("Delete"), ctx()), null);
  // Backspace không còn xoá gì
  assert.equal(resolveShortcut(key("Backspace"), ctx({ hasBlock: true })), null);
});

test("Mũi tên: có người chọn thì dịch người, không thì lùi tới phách", () => {
  assert.deepEqual(resolveShortcut(key("ArrowLeft"), ctx({ hasSelection: true })), { type: "nudge", dx: -0.25, dz: 0 });
  assert.deepEqual(resolveShortcut(key("ArrowUp", { shift: true }), ctx({ hasSelection: true })), { type: "nudge", dx: 0, dz: -1 });
  assert.deepEqual(resolveShortcut(key("ArrowRight", { shift: true }), ctx()), { type: "step", beats: 8 });
  assert.equal(resolveShortcut(key("ArrowDown"), ctx()), null);
  // giữ phím thì vẫn dịch tiếp
  assert.deepEqual(resolveShortcut(key("ArrowRight", { repeat: true }), ctx({ hasSelection: true })), { type: "nudge", dx: 0.25, dz: 0 });
});

test("Giữ phím không lặp các lệnh một lần", () => {
  assert.equal(resolveShortcut(key(" ", { repeat: true }), ctx()), null);
  assert.equal(resolveShortcut(key("Delete", { repeat: true }), ctx({ hasBlock: true })), null);
  assert.equal(resolveShortcut(key("Enter", { repeat: true }), ctx()), null);
});

test("? mở bảng phím dù có Shift; bảng đang mở thì chỉ Esc và ? đóng", () => {
  assert.deepEqual(resolveShortcut(key("?", { shift: true }), ctx()), { type: "help", open: true });
  assert.deepEqual(resolveShortcut(key("?"), ctx()), { type: "help", open: true });
  assert.deepEqual(resolveShortcut(key("?", { ctrl: true, alt: true }), ctx()), { type: "help", open: true });
  const h = ctx({ help: true });
  assert.deepEqual(resolveShortcut(key("Escape"), h), { type: "help", open: false });
  assert.deepEqual(resolveShortcut(key("?", { shift: true }), h), { type: "help", open: false });
  assert.equal(resolveShortcut(key(" "), h), null);
  assert.equal(resolveShortcut(key("z", { ctrl: true }), h), null);
});

test("Phím chữ và Shift Z", () => {
  assert.deepEqual(resolveShortcut(key("N", { shift: true }), ctx()), { type: "snap" });
  assert.deepEqual(resolveShortcut(key("v"), ctx()), { type: "view" });
  assert.deepEqual(resolveShortcut(key("f"), ctx()), { type: "present" });
  assert.equal(resolveShortcut(key("f"), ctx({ hasDancers: false })), null);
  assert.deepEqual(resolveShortcut(key("Z", { shift: true }), ctx()), { type: "fit" });
  assert.equal(resolveShortcut(key("z"), ctx()), null);
  assert.equal(resolveShortcut(key("n", { alt: true }), ctx()), null);
  assert.deepEqual(resolveShortcut(key("End"), ctx()), { type: "seek", to: "end" });
  assert.equal(resolveShortcut(key("Enter"), ctx({ hasDancers: false })), null);
});
