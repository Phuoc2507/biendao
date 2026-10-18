import { test } from "node:test";
import assert from "node:assert/strict";
import { printHtml, formationSvg, timeLabel, esc, safeColor, holdPoses } from "./printSheet.ts";
import { type Project, emptyProject, newDancer } from "../model.ts";

const describe = (x: number, z: number) => `x=${x} z=${z}`;

function sample(n = 3): Project {
  const fs = Array.from({ length: n }, (_, k) => ({
    id: `f${k}`, name: k === 1 ? "Chữ V <đẹp>" : `Đội hình ${k + 1}`, start: k * 8, end: k * 8 + 4,
    pos: { a: [k === 0 ? -2 : 1, 0] as [number, number], b: [2, 1] as [number, number] },
  }));
  return {
    ...emptyProject(),
    title: "Hoa & Lá",
    bpm: 120,
    downbeat: 0,
    musicName: "nhạc.mp3",
    dancers: [
      newDancer("a", "Nguyễn Thị Hương", "#ff5d6c"),
      { ...newDancer("b", "Lan", "red;}<script>") },
      { ...newDancer("c", "Ẩn", "#123456"), hidden: true },
    ],
    formations: fs,
  };
}

test("thoát ký tự HTML và màu lạ", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  assert.equal(safeColor("#AbC"), "#AbC");
  assert.equal(safeColor("red;}<script>"), "#888888");
});

test("nhãn thời gian có đếm phách khi có BPM", () => {
  const p = sample();
  assert.equal(timeLabel(p, 1), "0:08.0 – 0:12.0 · bắt đầu 8 thứ 3, phách 1 · giữ 1×8");
  assert.equal(timeLabel({ ...p, bpm: null }, 0), "0:00.0 – 0:04.0 · giữ 4.0 s");
});

test("sơ đồ: khán giả ở dưới, cánh gà, chấm tên, mũi tên chỉ khi có dời chỗ", () => {
  const p = sample();
  const s0 = formationSvg(p, 0);
  assert.ok(s0.startsWith("<svg") && s0.endsWith("</svg>"));
  assert.ok(s0.includes("KHÁN GIẢ") && s0.includes("CÁNH GÀ") && s0.includes("PHÔNG NỀN"));
  assert.ok(s0.includes(">Hươ<") && s0.includes(">Nguyễn Thị Hương<"));
  assert.ok(!s0.includes("Ẩn"), "người ẩn không in");
  assert.ok(!s0.includes("marker-end"), "đội hình đầu không có mũi tên");
  assert.ok(!s0.includes("<script>"));
  const s1 = formationSvg(p, 1);
  assert.equal(s1.match(/marker-end/g)?.length, 1, "chỉ Hương dời chỗ");
  assert.ok(s1.includes("Chữ V &lt;đẹp&gt;"));
  // khán giả (z = +depth/2) nằm dưới phông nền trong toạ độ SVG
  const y = (label: string) => Number(s0.match(new RegExp(`y="([\\d.]+)"[^>]*>${label}`))![1]);
  assert.ok(y("▼ KHÁN GIẢ ▼") > y("PHÔNG NỀN \\(CUỐI SÂN\\)"));
});

test("vị trí giữa khối giữ, người thiếu vị trí thì xếp hàng mặc định", () => {
  const p = sample();
  p.dancers.push(newDancer("d", "Mới", "#00ff00"));
  const q = holdPoses(p, 0);
  assert.deepEqual(q.a, [-2, 0]);
  assert.ok(Array.isArray(q.d));
});

test("trang in: 2 đội hình mỗi trang, bảng vị trí từng người, A4 dọc", () => {
  const p = sample(5);
  const h = printHtml(p, { describe, date: new Date(2026, 9, 12) });
  assert.ok(h.startsWith("<!doctype html>"));
  assert.ok(h.includes("size: A4 portrait"));
  assert.ok(h.includes("<h1>Hoa &amp; Lá</h1>"));
  assert.ok(h.includes("In ngày 12/10/2026") && h.includes("120 BPM") && h.includes("2 vũ công"));
  assert.equal(h.match(/<section class="page">/g)?.length, 3 + 1, "5 đội hình = 3 trang + trang bảng");
  assert.equal(h.match(/<svg /g)?.length, 5);
  assert.equal(h.match(/<table>/g)?.length, 2, "5 cột chia bảng 4 + 1");
  assert.ok(h.includes("<td>x=-2 z=0</td>"));
  assert.ok(h.includes("Vị trí từng người"));
});

test("chưa có đội hình: vẫn ra trang có lời nhắn", () => {
  const p = { ...sample(), formations: [] };
  const h = printHtml(p, { describe });
  assert.ok(h.includes("Chưa có đội hình nào."));
  assert.ok(!h.includes("<table>"));
});

test("bản in: ghi chú đội hình hiện dưới giờ, đã thoát ký tự", () => {
  const p = sample();
  p.formations[0] = { ...p.formations[0], note: "nhịp 5 <quay>" };
  const h = printHtml(p, { describe });
  assert.ok(h.includes('<div class="fnote">nhịp 5 &lt;quay&gt;</div>'));
  assert.equal(h.split('class="fnote"').length - 1, 1);
});
