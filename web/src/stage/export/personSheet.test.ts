import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERSON_W, PERSON_MAXH, personPages, personHeader, cellLines, personLayout, personFrame, drawPersonSheet,
  personSheets, personZipName, hasPersonNotes,
} from "./personSheet.ts";
import { toPx, type Ctx2D } from "./planRender.ts";
import { type Project, type Formation, emptyProject, newDancer, WING } from "../model.ts";

function sample(n = 2): Project {
  const fs: Formation[] = [
    { id: "f1", name: "Mở", start: 0, end: 4, pos: { a: [-2, 0], b: [2, 2], c: [0, 0] } },
    { id: "f2", name: "Chữ V", start: 6, end: 10, pos: { a: [2, 0], b: [2, 2], c: [1, 1] } },
  ];
  for (let k = 2; k < n; k++) fs.push({ id: `f${k + 1}`, name: `Hình ${k + 1}`, start: 12 * k, end: 12 * k + 4, pos: { a: [k % 3, 0], b: [-1, 1] } });
  return {
    ...emptyProject(),
    title: "Bài múa: Hương Sen",
    bpm: 120,
    dancers: [newDancer("a", "Hương", "#ff5d6c"), newDancer("b", "Lan", "#4f9dff"), { ...newDancer("c", "Ẩn", "#000"), hidden: true }],
    formations: fs.slice(0, n),
  };
}

function fakeCtx() {
  const texts: string[] = [];
  const fills: string[] = [];
  const bg: number[][] = [];
  const noop = () => {};
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    fillRect: (x, y, w, h) => void (ctx.fillStyle === "#0f1115" && bg.push([x, y, w, h])), strokeRect: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, arc: noop,
    fill: () => void fills.push(String(ctx.fillStyle)), stroke: noop,
    fillText: (s) => void texts.push(s), setLineDash: noop, save: noop, restore: noop, rect: noop, clip: noop,
  };
  return { ctx, texts, fills, bg };
}

test("ảnh từng người: chia trang cân, tối đa 1080×1920, 2 cột", () => {
  assert.deepEqual(personPages(sample(2)), [[0, 1]]);
  const per = personPages(sample(40))[0].length;
  assert.ok(per >= 6 && per % 2 === 0, `một trang chứa ${per} đội hình`);
  const pages = personPages(sample(per + 1));
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.flat(), Array.from({ length: per + 1 }, (_, k) => k));
  assert.ok(Math.abs(pages[0].length - pages[1].length) <= 1, "hai trang chia đều");
  assert.deepEqual(personPages({ ...sample(), formations: [] }), []);
  for (const n of [1, 2, 7, per, per + 1, 3 * per]) {
    const p = sample(n);
    const ps = personPages(p);
    ps.forEach((ks, i) => {
      const L = personLayout(p, "a", ps, i);
      assert.equal(L.w, PERSON_W);
      assert.ok(L.h <= PERSON_MAXH, `${n} đội hình, trang ${i + 1}: cao ${L.h}`);
      assert.equal(L.cells.length, ks.length);
    });
  }
});

test("ảnh từng người: chữ đầu ảnh có tên người, tên bài, số trang khi nhiều trang", () => {
  const p = sample(2);
  const h = personHeader(p, "a", 0, 1).map((l) => l.text);
  assert.equal(h[0], "Vị trí của Hương");
  assert.ok(h.includes("Bài múa: Hương Sen"));
  assert.ok(!h.some((t) => t.includes("trang")));
  assert.ok(personHeader(p, "a", 1, 3).some((l) => l.text.includes("trang 2/3")));
  const lines = personHeader(p, "a", 0, 1);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].y > lines[i - 1].y);
  assert.ok(lines.every((l) => l.size >= 30));
  // tên rất dài vẫn một dòng, chiều cao đầu ảnh không đổi
  const long = { ...p, dancers: p.dancers.map((d) => (d.id === "a" ? { ...d, name: "Nguyễn Thị Thanh Hương ".repeat(4) } : d)) };
  const hl = personHeader(long, "a", 0, 1);
  assert.equal(hl.length, lines.length);
  assert.ok(hl[0].text.endsWith("…"));
});

test("ảnh từng người: ô có số thứ tự, tên đội hình, giờ bắt đầu và nhịp", () => {
  const p = sample(2);
  const l = cellLines(p, 1, 480).map((x) => x.text);
  assert.equal(l[0], "2 · Chữ V");
  assert.ok(l[1].startsWith("bắt đầu 0:06.0"));
  assert.ok(l[1].includes("8 thứ"));
  const nb = cellLines({ ...p, bpm: null }, 0, 480).map((x) => x.text);
  assert.equal(nb[1], "bắt đầu 0:00.0");
  const long = { ...p, formations: [{ ...p.formations[0], name: "Tên đội hình rất rất dài ".repeat(5) }] };
  assert.equal(cellLines(long, 0, 480).length, 2, "tên dài cắt một dòng");
});

test("ảnh từng người: ô xếp 2 cột trong ảnh, sân và cánh gà nằm gọn trong ô", () => {
  const p = sample(5);
  const ps = personPages(p);
  const L = personLayout(p, "a", ps, 0);
  const xs = new Set(L.cells.map((c) => c.x));
  assert.equal(xs.size, 2);
  for (const c of L.cells) {
    assert.ok(c.x >= 0 && c.x + c.w <= L.w + 1e-6);
    assert.ok(c.y >= L.head && c.y + c.h <= L.h + 1e-6);
    const g = c.geom;
    const [l, top] = toPx(g, -p.stage.width / 2 - WING, -p.stage.depth / 2);
    const [r, bot] = toPx(g, p.stage.width / 2 + WING, p.stage.depth / 2);
    assert.ok(l >= c.x - 1e-6 && r <= c.x + c.w + 1e-6);
    assert.ok(top > c.lines[c.lines.length - 1].y, "sân dưới chữ của ô");
    assert.ok(bot + 22 * g.u! < c.y + c.h, "còn chỗ cho chữ KHÁN GIẢ");
  }
  // các ô không chồng nhau
  for (const a of L.cells) for (const b of L.cells) {
    if (a === b) continue;
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  // sân sâu vẫn vừa ô
  const deep = { ...sample(3), stage: { width: 6, depth: 14 } };
  const D = personLayout(deep, "a", personPages(deep), 0);
  assert.ok(D.h <= PERSON_MAXH);
  for (const c of D.cells) assert.ok(toPx(c.geom, 0, 7)[1] + 22 * c.geom.u! < c.y + c.h);
});

test("ảnh từng người: người đó tô nổi, người khác mờ, chỉ mũi tên của người đó", () => {
  const p = sample(2);
  const L = personLayout(p, "a", personPages(p), 0);
  const g = L.cells[1].geom;
  const f = personFrame(p, 1, "a", g);
  assert.equal(f.dots.length, 2, "bỏ người ẩn");
  const me = f.dots.find((d) => d.id === "a")!;
  const lan = f.dots.find((d) => d.id === "b")!;
  assert.ok(me.highlight && !lan.highlight);
  assert.ok(me.r > lan.r);
  assert.ok(lan.alpha < 1 && me.alpha === 1);
  assert.equal(f.dots[f.dots.length - 1].id, "a", "người đó vẽ sau cùng");
  assert.deepEqual([me.x, me.y], toPx(g, 2, 0));
  assert.equal(f.trails!.length, 1);
  assert.deepEqual([f.trails![0].x0, f.trails![0].y0], toPx(g, -2, 0));
  assert.equal(f.trails![0].color, "#ff5d6c");
  assert.equal(personFrame(p, 1, "b", g).trails!.length, 0, "Lan đứng yên thì không có mũi tên");
  assert.equal(personFrame(p, 0, "a", L.cells[0].geom).trails!.length, 0, "đội hình đầu không có mũi tên");
  assert.equal(lan.name, "", "người khác chỉ có chữ tắt trong chấm");
  assert.equal(me.name, "Hương", "tên không vừa chấm thì có nhãn dưới chấm");
  assert.equal(personFrame(p, 1, "b", g).dots.find((d) => d.id === "b")!.name, "", "tên ngắn nằm trọn trong chấm thì không có nhãn");
  assert.equal(f.title, "");
});

test("vẽ ảnh từng người: mỗi ô một sơ đồ, có chữ đầu ảnh, ô, vòng trắng và mũi tên", () => {
  const p = sample(3);
  const L = personLayout(p, "a", personPages(p), 0);
  const { ctx, texts, fills, bg } = fakeCtx();
  drawPersonSheet(ctx, p, "a", L);
  assert.ok(texts.includes("Vị trí của Hương"));
  assert.ok(texts.includes("1 · Mở") && texts.includes("2 · Chữ V") && texts.includes("3 · Hình 3"));
  assert.equal(texts.filter((s) => s === "▼ KHÁN GIẢ ▼").length, 3);
  assert.ok(!texts.includes("Ẩn"));
  assert.equal(texts.filter((s) => s === "Lan").length, 3, "Lan chỉ có chữ trong chấm, không nhãn dưới chấm");
  assert.equal(texts.filter((s) => s === "Hương").length, 3, "nhãn của người đó ở mỗi ô");
  assert.ok(fills.includes("#ffffff"), "vòng trắng quanh người đó");
  assert.ok(fills.includes("#aab3c2"), "có đầu mũi tên");
  // nền sơ đồ từng ô đặt đúng chỗ ô, không xoá cả ảnh
  for (const c of L.cells) assert.ok(bg.some(([x, y, w, h]) => x === c.geom.ox && y === c.geom.oy && w === c.geom.w && h === c.geom.h));
  assert.equal(bg.filter(([x, y, w, h]) => x === 0 && y === 0 && w === L.w && h === L.h).length, 1, "nền cả ảnh chỉ tô một lần, đầu tiên");
  assert.deepEqual(bg[0], [0, 0, L.w, L.h]);
  assert.equal(ctx.globalAlpha, 1);
});

test("tên tệp ảnh từng người: bỏ người ẩn, trùng tên thêm số, nhiều trang thêm -p1 -p2", () => {
  const p = sample(2);
  const s = personSheets(p);
  assert.deepEqual(s.map((x) => x.id), ["a", "b"]);
  assert.deepEqual(s[0].files, ["Bài-múa-Hương-Sen-vi-tri-Hương.png"]);
  assert.deepEqual(s[0].pages, [[0, 1]]);
  const dup = { ...p, dancers: [...p.dancers, newDancer("d", "Lan", "#3ad07a"), newDancer("e", "  ", "#3ad07a")] };
  const names = personSheets(dup).flatMap((x) => x.files);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("Bài-múa-Hương-Sen-vi-tri-Lan.png") && names.includes("Bài-múa-Hương-Sen-vi-tri-Lan-2.png"));
  assert.ok(names.includes("Bài-múa-Hương-Sen-vi-tri-nguoi-5.png"));
  const per = personPages(sample(40))[0].length;
  const big = sample(per + 1);
  assert.deepEqual(personSheets(big, ["a"])[0].files, ["Bài-múa-Hương-Sen-vi-tri-Hương-p1.png", "Bài-múa-Hương-Sen-vi-tri-Hương-p2.png"]);
  assert.deepEqual(personSheets(p, ["c"]), [], "người ẩn không có ảnh");
  assert.equal(personZipName(p), "Bài-múa-Hương-Sen-vi-tri-tung-nguoi.zip");
  assert.equal(personZipName(p, s[0]), "Bài-múa-Hương-Sen-vi-tri-Hương.zip");
  for (const n of names) assert.ok(!/\s/.test(n));
});

test("ảnh từng người: ghi chú riêng hiện trong ô của đúng người, mọi ô chừa cùng chỗ, vẫn vừa 1920", () => {
  const p = sample(2);
  assert.equal(hasPersonNotes(p), false);
  p.formations[1] = { ...p.formations[1], notes: { b: "cầm quạt đỏ 🪭", c: "người ẩn" } };
  assert.equal(hasPersonNotes(p), true);
  const l = cellLines(p, 1, 480, 0, "b").map((x) => x.text);
  assert.equal(l.length, 3);
  assert.equal(l[2], "✎ cầm quạt đỏ 🪭");
  assert.equal(cellLines(p, 0, 480, 0, "b").length, 2, "đội hình không có ghi chú thì không thêm dòng");
  assert.equal(cellLines(p, 1, 480, 0, "a").length, 2, "ghi chú của người khác không hiện");
  const ln = cellLines({ ...p, formations: [p.formations[0], { ...p.formations[1], notes: { b: "quỳ ".repeat(80) } }] }, 1, 480, 0, "b");
  assert.equal(ln.length, 4, "dài thì tối đa 2 dòng");
  assert.ok(ln[3].text.endsWith("…"));
  // ô cao thêm cho ghi chú, sơ đồ nằm dưới chữ, ảnh vẫn không quá 1920
  const plain = personLayout(sample(2), "b", personPages(sample(2)), 0);
  const L = personLayout(p, "b", personPages(p), 0);
  assert.ok(L.cells[0].h > plain.cells[0].h);
  for (const c of L.cells) for (const t of c.lines) assert.ok(t.y < c.geom.oy, "chữ nằm trên sơ đồ");
  const many = sample(30);
  many.formations = many.formations.map((f) => ({ ...f, notes: { a: "giơ quạt nhịp 5, quỳ nhịp 7" } }));
  const ps = personPages(many);
  ps.forEach((_, i) => assert.ok(personLayout(many, "a", ps, i).h <= PERSON_MAXH));
  const { ctx, texts } = fakeCtx();
  drawPersonSheet(ctx, p, "b", L);
  assert.ok(texts.includes("✎ cầm quạt đỏ 🪭"));
});
