import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presetSpan, customSpan, checkSpan, formationSpan, formationIndexAt, markSpan, parseClock, timeTag, type SpanCtx,
} from "./videoRange.ts";
import type { Formation } from "../model.ts";

const F = (id: string, name: string, start: number, end: number): Formation => ({ id, name, start, end, pos: {} });
const fs = [F("f1", "Mở", 0, 4), F("f2", "Chữ V", 6, 10), F("f3", "Vòng", 13, 20)];
const marks = [
  { id: "m2", t: 30, label: "Điệp khúc" },
  { id: "m1", t: 8, label: "Nhạc dạo" },
];
const ctx = (o: Partial<SpanCtx> = {}): SpanCtx => ({ end: 60, loop: null, t: 0, formations: fs, marks, ...o });

test("cả bài và vùng lặp", () => {
  assert.deepEqual(presetSpan("all", ctx()), { kind: "all", a: 0, b: 60, tag: "", label: "Cả bài" });
  const l = presetSpan("loop", ctx({ loop: { a: 10, b: 70 } }));
  assert.ok(!("error" in l));
  assert.equal(l.a, 10);
  assert.equal(l.b, 60); // kẹp về hết bài
  assert.equal(l.tag, "0m10s-1m00s");
  assert.ok("error" in presetSpan("loop", ctx()));
  assert.ok("error" in presetSpan("loop", ctx({ loop: { a: 59.8, b: 70 } })));
});

test("đội hình tại vạch phát kèm khoảng chuyển vào", () => {
  assert.equal(formationIndexAt(fs, -1), 0);
  assert.equal(formationIndexAt(fs, 5), 1); // đang chuyển vào Chữ V
  assert.equal(formationIndexAt(fs, 10), 1);
  assert.equal(formationIndexAt(fs, 99), 2);
  assert.equal(formationIndexAt([], 3), -1);
  assert.deepEqual(formationSpan(fs, 2), { a: 0, b: 4, name: "Mở" });
  assert.deepEqual(formationSpan(fs, 5), { a: 4, b: 10, name: "Chữ V" });
  assert.deepEqual(formationSpan(fs, 8), { a: 4, b: 10, name: "Chữ V" });
  assert.deepEqual(formationSpan(fs, 11), { a: 10, b: 20, name: "Vòng" });
  // đầu vào chưa xếp vẫn ra đúng
  assert.deepEqual(formationSpan([fs[2], fs[0], fs[1]], 11), { a: 10, b: 20, name: "Vòng" });
  const s = presetSpan("formation", ctx({ t: 7 }));
  assert.ok(!("error" in s));
  assert.equal(s.tag, "Chữ V");
  assert.equal(s.a, 4);
  assert.ok("error" in presetSpan("formation", ctx({ formations: [] })));
});

test("mốc đoạn nhạc: mốc này tới mốc sau", () => {
  assert.deepEqual(markSpan(marks, 2, 60), { a: 8, b: 30, label: "Nhạc dạo" }); // trước mốc đầu
  assert.deepEqual(markSpan(marks, 8, 60), { a: 8, b: 30, label: "Nhạc dạo" });
  assert.deepEqual(markSpan(marks, 31, 60), { a: 30, b: 60, label: "Điệp khúc" });
  assert.equal(markSpan([], 3, 60), null);
  assert.equal(markSpan(undefined, 3, 60), null);
  const s = presetSpan("mark", ctx({ t: 40 }));
  assert.ok(!("error" in s));
  assert.equal(s.tag, "Điệp khúc");
  assert.ok("error" in presetSpan("mark", ctx({ marks: [] })));
  // mốc cuối nằm sát hết bài: quá ngắn
  assert.ok("error" in presetSpan("mark", ctx({ t: 59.9, marks: [{ id: "x", t: 59.8, label: "Kết" }] })));
});

test("kiểm khoảng và khoảng gõ tay", () => {
  assert.deepEqual(checkSpan(-3, 12.345, 60), { a: 0, b: 12.35 });
  assert.deepEqual(checkSpan(50, 99, 60), { a: 50, b: 60 });
  assert.ok("error" in checkSpan(20, 20.2, 60));
  assert.ok("error" in checkSpan(30, 10, 60));
  assert.ok("error" in checkSpan(NaN, 10, 60));
  const c = customSpan(65.5, 80, 120);
  assert.ok(!("error" in c));
  assert.equal(c.kind, "custom");
  assert.equal(c.tag, "1m05s-1m20s");
  assert.equal(timeTag(0, 9.99), "0m00s-0m09s");
});

test("đọc giờ gõ tay", () => {
  assert.equal(parseClock("65"), 65);
  assert.equal(parseClock(" 65,5 "), 65.5);
  assert.equal(parseClock("1:05"), 65);
  assert.equal(parseClock("1:05.5"), 65.5);
  assert.equal(parseClock("2:3"), 123);
  assert.equal(parseClock("1:75"), null);
  assert.equal(parseClock("abc"), null);
  assert.equal(parseClock(""), null);
  assert.equal(parseClock("-3"), null);
});
