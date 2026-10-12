import { test } from "node:test";
import assert from "node:assert/strict";
import { isPhone, splitDir, startSideOpen, PANE_ASPECT } from "./layout.ts";

test("isPhone: dựng đứng hẹp, xoay ngang thấp là điện thoại; laptop thì không", () => {
  assert.equal(isPhone(412, 800), true); // Android dựng đứng
  assert.equal(isPhone(360, 640), true);
  assert.equal(isPhone(915, 356), true); // Android xoay ngang
  assert.equal(isPhone(599, 900), true);
  assert.equal(isPhone(600, 900), false);
  assert.equal(isPhone(760, 700), false); // nửa màn hình laptop
  assert.equal(isPhone(1366, 635), false);
  assert.equal(isPhone(1100, 450), false); // cửa sổ laptop thấp nhưng rộng
});

test("splitDir: vùng chính rộng thì cạnh nhau, cao hẹp thì chồng", () => {
  assert.equal(splitDir(1102, 380), "row"); // laptop 1366×768
  assert.equal(splitDir(1656, 616), "row"); // màn 1920×1080
  assert.equal(splitDir(868, 380), "row"); // cửa sổ ~1100
  assert.equal(splitDir(528, 382), "col"); // nửa màn 760, còn cột trái
  assert.equal(splitDir(760, 382), "row"); // nửa màn 760, ẩn cột trái
  assert.equal(splitDir(548, 600), "col");
});

test("splitDir: tránh cách làm khung nhỏ hơn cỡ tối thiểu", () => {
  assert.equal(splitDir(419, 301), "col"); // cạnh nhau thì mỗi khung chỉ ~210 px
  assert.equal(splitDir(412, 398), "col"); // điện thoại dựng đứng
  assert.equal(splitDir(915, 173), "row"); // điện thoại xoay ngang: chồng thì quá thấp
});

test("splitDir: cỡ 0 (chưa đo được) giữ hướng cũ, mặc định cạnh nhau", () => {
  assert.equal(splitDir(0, 0), "row");
  assert.equal(splitDir(0, 400, "col"), "col");
  assert.equal(splitDir(NaN, 400), "row");
});

test("splitDir: quanh ngưỡng thì giữ hướng cũ để khỏi lật qua lật lại", () => {
  const h = 500;
  const w = PANE_ASPECT * h; // đúng ngưỡng
  assert.equal(splitDir(w, h), "row");
  assert.equal(splitDir(w, h, "col"), "col");
  assert.equal(splitDir(w * 1.03, h, "col"), "col");
  assert.equal(splitDir(w * 0.97, h, "row"), "row");
  // ra khỏi vùng đệm thì đổi
  assert.equal(splitDir(w * 1.2, h, "col"), "row");
  assert.equal(splitDir(w * 0.8, h, "row"), "col");
});

test("splitDir chọn cách cho mỗi khung gần tỉ lệ vừa mắt nhất", () => {
  const off = (r: number) => Math.abs(Math.log(r / PANE_ASPECT));
  for (const [w, h] of [[1200, 300], [900, 700], [640, 640], [1500, 500], [700, 1000]]) {
    const best = off(w / 2 / h) <= off(w / (h / 2)) ? "row" : "col";
    assert.equal(splitDir(w, h), best, `${w}×${h}`);
  }
});

test("startSideOpen: điện thoại luôn đóng; máy tính theo lần trước, mặc định mở", () => {
  assert.equal(startSideOpen(null, 1366, 768), true);
  assert.equal(startSideOpen("1", 1366, 768), true);
  assert.equal(startSideOpen("0", 1366, 768), false);
  assert.equal(startSideOpen("1", 412, 915), false);
  assert.equal(startSideOpen(null, 915, 412), false);
});
