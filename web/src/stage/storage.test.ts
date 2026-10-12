import { test } from "node:test";
import assert from "node:assert/strict";
import { QUOTA_MSG, isQuotaError, errText, fmtBytes, usageText } from "./storage.ts";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

test("isQuotaError nhận lỗi hết chỗ của các trình duyệt", () => {
  assert.equal(isQuotaError(new DOMException("đầy", "QuotaExceededError")), true);
  assert.equal(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true); // Firefox cũ
  assert.equal(isQuotaError({ code: 22 }), true);
  assert.equal(isQuotaError({ code: 1014 }), true);
  assert.equal(isQuotaError(new Error("The quota has been exceeded.")), true);
  assert.equal(isQuotaError(new Error("Disk is full")), true);
  assert.equal(isQuotaError("QuotaExceededError"), true);
});

test("isQuotaError bỏ qua lỗi khác và giá trị lạ", () => {
  assert.equal(isQuotaError(new DOMException("không có", "NotFoundError")), false);
  assert.equal(isQuotaError(new Error("Không đọc được tệp media")), false);
  assert.equal(isQuotaError(null), false);
  assert.equal(isQuotaError(undefined), false);
  assert.equal(isQuotaError(42), false);
  assert.equal(isQuotaError({ name: 5, message: null }), false);
});

test("errText: hết chỗ thì chỉ cách gỡ, còn lại ghép tiền tố", () => {
  assert.equal(errText(new DOMException("x", "QuotaExceededError"), "Lỗi khi nạp tệp"), QUOTA_MSG);
  assert.equal(errText(new Error(" Hỏng tệp "), "Lỗi khi nạp tệp"), "Lỗi khi nạp tệp: Hỏng tệp");
  assert.equal(errText("mất kết nối", "Không lưu được"), "Không lưu được: mất kết nối");
  assert.equal(errText(null, "Không lưu được"), "Không lưu được");
  assert.equal(errText(new Error(""), "Không lưu được"), "Không lưu được");
  assert.match(QUOTA_MSG, /Lưu ra tệp/);
});

test("fmtBytes: KB nguyên, MB và GB một chữ số lẻ, dấu phẩy", () => {
  assert.equal(fmtBytes(0), "0 KB");
  assert.equal(fmtBytes(NaN), "0 KB");
  assert.equal(fmtBytes(300), "1 KB");
  assert.equal(fmtBytes(850 * 1024), "850 KB");
  assert.equal(fmtBytes(1010 * 1024), "1 MB");
  assert.equal(fmtBytes(2.5 * MB), "2,5 MB");
  assert.equal(fmtBytes(2 * MB), "2 MB");
  assert.equal(fmtBytes(12.4 * MB), "12 MB");
  assert.equal(fmtBytes(1.2 * GB), "1,2 GB");
  assert.equal(fmtBytes(300 * GB), "300 GB");
});

test("usageText: dung lượng, mức đầy và việc trình duyệt có giữ dữ liệu", () => {
  assert.equal(usageText(undefined, 10 * GB, true), null);
  const kept = usageText(1.2 * GB, 120 * GB, true)!;
  assert.match(kept, /1,2 GB trên 120 GB/);
  assert.match(kept, /không tự xoá/);
  assert.doesNotMatch(kept, /Sắp hết chỗ/);
  assert.match(usageText(1.2 * GB, 120 * GB, false)!, /có thể tự xoá/);
  const plain = usageText(5 * MB, undefined, null)!;
  assert.equal(plain, "Đang dùng 5 MB.");
  assert.match(usageText(9 * GB, 10 * GB, null)!, /Sắp hết chỗ/);
});
