import { test } from "node:test";
import assert from "node:assert/strict";
import { type Formation, type Vec2, fitSavedShape } from "./model.ts";
import { blockedIssues } from "./checks.ts";
import { LIB_MAX, LIB_MIN, anyBlocked, isStaggerName, libraryFor, minSpacing } from "./library.ts";

const stage = { width: 10, depth: 6 };
const counts = Array.from({ length: LIB_MAX - LIB_MIN + 1 }, (_, i) => LIB_MIN + i);

/** Đội đứng một hàng sát mép trái sân, để hình phải dời cả khối vào. */
function crowd(n: number): { cur: Record<string, Vec2>; ids: string[] } {
  const ids = Array.from({ length: n }, (_, i) => `d${i}`);
  const cur: Record<string, Vec2> = {};
  ids.forEach((id, i) => { cur[id] = [-4.6 + (i % 4) * 0.3, -2.5 + Math.floor(i / 4) * 0.9]; });
  return { cur, ids };
}

test("thư viện: mọi số người 3 tới 16 đều có hình, đủ chỗ, id không trùng", () => {
  for (const n of counts) {
    const lib = libraryFor(n);
    assert.ok(lib.length >= 5, `${n} người chỉ có ${lib.length} hình`);
    assert.equal(new Set(lib.map((s) => s.id)).size, lib.length);
    for (const s of lib) assert.equal(s.pts.length, n, `${s.name} cho ${n} người`);
  }
  assert.deepEqual(libraryFor(2), []);
  assert.deepEqual(libraryFor(17), []);
  assert.deepEqual(libraryFor(7.5), []);
});

test("thư viện: có kim cương, tam giác, chữ V, so le, người giữa nổi cho số người thông dụng", () => {
  const names = (n: number) => libraryFor(n).map((s) => s.name);
  for (const n of [6, 8, 10]) {
    for (const want of ["Kim cương", "Tam giác", "Tam giác ngược", "Chữ V", "Hai hàng so le", "Người giữa nổi", "Vòng cung"])
      assert.ok(names(n).includes(want), `${n} người thiếu ${want}`);
  }
  assert.ok(names(8).includes("So le 3-2-3"));
  assert.ok(names(8).includes("Chữ W"));
  assert.ok(names(9).includes("Đường chéo"));
  assert.ok(names(8).includes("Mũi tên"));
});

test("thư viện: mọi hình đã trừ tâm, mọi cặp cách nhau từ 0,8 m", () => {
  for (const n of counts)
    for (const s of libraryFor(n)) {
      const mx = s.pts.reduce((a, q) => a + q[0], 0) / n;
      const mz = s.pts.reduce((a, q) => a + q[1], 0) / n;
      assert.ok(Math.abs(mx) < 0.01 && Math.abs(mz) < 0.01, `${s.id} chưa trừ tâm`);
      assert.ok(minSpacing(s.pts) >= 0.8, `${s.id}: ${minSpacing(s.pts)} m`);
      assert.ok(s.pts.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])));
    }
});

test("thư viện: áp hình vào sân 10 × 6 thì nằm trong sân và giữ khoảng cách", () => {
  for (const n of counts)
    for (const s of libraryFor(n)) {
      const { cur, ids } = crowd(n);
      const r = fitSavedShape(cur, ids, s.pts, stage);
      assert.equal(Object.keys(r.moves).length, n);
      assert.deepEqual(r.kept, []);
      const placed = Object.values(r.moves);
      for (const q of placed) assert.ok(Math.abs(q[0]) <= 5 && Math.abs(q[1]) <= 3, `${s.id} ra ngoài sân: ${q}`);
      assert.ok(minSpacing(placed) >= 0.8, `${s.id} bị co khi áp: ${minSpacing(placed)} m`);
    }
});

test("thư viện: hình so le, tam giác, kim cương không bị cảnh báo bị che", () => {
  let named = 0;
  for (const n of counts)
    for (const s of libraryFor(n)) {
      const { cur, ids } = crowd(n);
      const pos = fitSavedShape(cur, ids, s.pts, stage).moves;
      const f: Formation = { id: "F", name: s.name, start: 0, end: 4, pos };
      const issues = blockedIssues([f], ids.map((id) => ({ id, name: id })), stage);
      // mọi hình trong thư viện đều không ai bị che; với nhóm có tên so le thì đây là yêu cầu chính
      assert.deepEqual(issues.map((w) => w.msg), [], `${s.id} (${s.name})`);
      assert.equal(anyBlocked(s.pts), false);
      if (isStaggerName(s.name)) named++;
    }
  assert.ok(named > 40, `chỉ có ${named} hình so le, tam giác, kim cương`);
});

test("thư viện: sân hẹp thì bỏ hình không vừa, kết quả ổn định giữa các lần gọi", () => {
  const small = { width: 5, depth: 4 };
  const lib = libraryFor(12, small);
  for (const s of lib) {
    const xs = s.pts.map((q) => q[0]), zs = s.pts.map((q) => q[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 4.2 && Math.max(...zs) - Math.min(...zs) <= 3.2, s.id);
  }
  assert.ok(lib.length < libraryFor(12).length);
  const a = libraryFor(9);
  a[0].pts[0][0] = 99; // sửa bản trả về không làm hỏng bộ nhớ đệm
  assert.notEqual(libraryFor(9)[0].pts[0][0], 99);
  assert.deepEqual(libraryFor(9).map((s) => s.id), a.map((s) => s.id));
});
