import { test } from "node:test";
import assert from "node:assert/strict";
import { clampNum, commaDec, fmtNum, fmtSigned, parseNum, readNum } from "./num.ts";

test("parseNum đọc dấu phẩy kiểu Việt", () => {
  assert.equal(parseNum("1,5"), 1.5);
  assert.equal(parseNum("1.5"), 1.5);
  assert.equal(parseNum(" 120 "), 120);
  assert.equal(parseNum(",5"), 0.5);
  assert.equal(parseNum("12,"), 12);
  assert.equal(parseNum("−0,25"), -0.25);
  assert.equal(parseNum("-3"), -3);
  assert.equal(parseNum("1 000"), 1000);
});

test("parseNum: rỗng là null, gõ sai là NaN", () => {
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("   "), null);
  assert.ok(Number.isNaN(parseNum("abc")));
  assert.ok(Number.isNaN(parseNum("1,5,3")));
  assert.ok(Number.isNaN(parseNum("1e3")));
  assert.ok(Number.isNaN(parseNum("-")));
});

test("clampNum làm tròn theo bước rồi kẹp", () => {
  assert.equal(clampNum(1, { min: 30, max: 300, quantum: 1 }), 30);
  assert.equal(clampNum(302, { min: 30, max: 300, quantum: 1 }), 300);
  assert.equal(clampNum(119.6, { min: 30, max: 300, quantum: 1 }), 120);
  assert.equal(clampNum(12.34, { min: 4, max: 30, quantum: 0.1 }), 12.3);
  assert.equal(clampNum(0.1 + 0.2, { min: -10, max: 10 }), 0.3);
  assert.equal(clampNum(1.62, { min: 1.2, max: 2.2, quantum: 0.05 }), 1.6);
  assert.equal(clampNum(1.63, { min: 1.2, max: 2.2, quantum: 0.05 }), 1.65);
});

test("readNum: gõ 120 rồi rời ô ra đúng 120 (không bị kẹp giữa chừng)", () => {
  const bpm = { min: 30, max: 300, quantum: 0.1, allowEmpty: true };
  assert.equal(readNum("120", bpm), 120);
  assert.equal(readNum("87,5", bpm), 87.5);
  assert.equal(readNum("", bpm), null);
  assert.equal(readNum("x", bpm), undefined);
  assert.equal(readNum("1000", bpm), 300);
  const width = { min: 4, max: 30, quantum: 0.1 };
  assert.equal(readNum("12", width), 12);
  assert.equal(readNum("", width), undefined, "ô bắt buộc: để trống là giữ giá trị cũ");
  assert.equal(readNum("1,5", width), 4);
});

test("fmtNum và fmtSigned viết dấu phẩy", () => {
  assert.equal(fmtNum(1.5), "1,5");
  assert.equal(fmtNum(12), "12");
  assert.equal(fmtNum(null), "");
  assert.equal(fmtNum(1.6, 2), "1,60");
  assert.equal(fmtNum(0.1 + 0.2), "0,3");
  assert.equal(fmtNum(-0.5), "-0,5");
  assert.equal(fmtSigned(0.25), "+0,25");
  assert.equal(fmtSigned(-0.1), "−0,10");
  assert.equal(fmtSigned(0), "+0,00");
  assert.equal(fmtSigned(-0.001), "+0,00");
  assert.equal(fmtSigned(-0.1, 1), "−0,1");
});

test("commaDec chỉ đổi dấu chấm nằm giữa hai chữ số", () => {
  assert.equal(commaDec("4.5 s"), "4,5 s");
  assert.equal(commaDec("2×8 + 3"), "2×8 + 3");
  assert.equal(commaDec("Xong. 3 người"), "Xong. 3 người");
});
