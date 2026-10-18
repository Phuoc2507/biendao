import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMG_W, IMG_H, formationIndexAt, wrapText, headerLines, imageLayout, imageFrame, drawImage, imageFileName, imagesZipName,
} from "./imageSheet.ts";
import { toPx, type Ctx2D } from "./planRender.ts";
import { type Project, emptyProject, newDancer, WING } from "../model.ts";

function sample(): Project {
  return {
    ...emptyProject(),
    title: "Bài múa: Hương Sen",
    bpm: 120,
    dancers: [newDancer("a", "Hương", "#ff5d6c"), newDancer("b", "Lan", "#4f9dff"), { ...newDancer("c", "Ẩn", "#000"), hidden: true }],
    formations: [
      { id: "f1", name: "Mở", start: 0, end: 4, pos: { a: [-2, 0], b: [2, 2], c: [0, 0] } },
      { id: "f2", name: "Chữ V", start: 6, end: 10, pos: { a: [2, 0], b: [2, 2], c: [1, 1] }, note: "nhịp 5 quay sang trái" },
    ],
  };
}

function fakeCtx() {
  const texts: string[] = [];
  const fills: string[] = [];
  const noop = () => {};
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop,
    fill: () => void fills.push(String(ctx.fillStyle)), stroke: noop,
    fillText: (s) => void texts.push(s), setLineDash: noop, save: noop, restore: noop, rect: noop, clip: noop,
  };
  return { ctx, texts, fills };
}

test("chọn đội hình tại vạch phát: đang đứng, đang chuyển (gần bên nào), trước và sau bài", () => {
  const p = sample();
  assert.equal(formationIndexAt(p, 2), 0);
  assert.equal(formationIndexAt(p, 4.5), 0);
  assert.equal(formationIndexAt(p, 5.5), 1);
  assert.equal(formationIndexAt(p, 8), 1);
  assert.equal(formationIndexAt(p, 99), 1);
  assert.equal(formationIndexAt({ ...p, formations: p.formations.map((f) => ({ ...f, start: f.start + 1, end: f.end + 1 })) }, 0), 0);
  assert.equal(formationIndexAt({ ...p, formations: [] }, 1), -1);
});

test("ngắt chữ: theo từ, cắt từ quá dài, quá số dòng thì thêm dấu …", () => {
  assert.deepEqual(wrapText("một hai ba bốn", 7, 3), ["một hai", "ba bốn"]);
  assert.deepEqual(wrapText("  a\n\nb  ", 10, 2), ["a b"]);
  assert.deepEqual(wrapText("x".repeat(12), 5, 5), ["xxxxx", "xxxxx", "xx"]);
  const cut = wrapText("aa bb cc dd ee ff", 5, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith("…") && cut[1].length <= 5);
  assert.deepEqual(wrapText("", 5, 2), []);
});

test("chữ đầu ảnh: tên bài, số thứ tự và tên đội hình, nhịp, ghi chú; chữ đủ to cho điện thoại", () => {
  const p = sample();
  const l0 = headerLines(p, 0).map((l) => l.text);
  assert.equal(l0[0], "Bài múa: Hương Sen");
  assert.equal(l0[1], "1/2 · Mở");
  assert.ok(l0.some((t) => t.includes("0:00.0")));
  assert.ok(!l0.some((t) => t.includes("nhịp 5")), "đội hình không có ghi chú");
  const l1 = headerLines(p, 1);
  assert.ok(l1.some((l) => l.text.includes("nhịp 5 quay")));
  assert.ok(l1.some((l) => l.text.includes("bắt đầu 8 thứ")));
  assert.ok(l1.every((l) => l.size >= 30), "chữ nhỏ nhất 30 px trên ảnh rộng 1080");
  for (let i = 1; i < l1.length; i++) assert.ok(l1[i].y > l1[i - 1].y);
  assert.equal(headerLines({ ...p, title: "" }, 0)[0].text, "Bài múa");
});

test("bố cục: khung dọc, chữ ở trên, sân và cánh gà nằm gọn bên dưới, chừa dòng khán giả", () => {
  const p = sample();
  for (const k of [0, 1]) {
    const L = imageLayout(p, k);
    assert.equal(L.w, IMG_W);
    assert.ok(L.h >= IMG_W && L.h <= IMG_H, "ảnh vuông hoặc dọc, không quá 4:5");
    const g = L.geom;
    const [l, top] = toPx(g, -p.stage.width / 2 - WING, -p.stage.depth / 2);
    const [r, bot] = toPx(g, p.stage.width / 2 + WING, p.stage.depth / 2);
    assert.ok(l >= 0 && r <= IMG_W + 1e-6);
    assert.ok(top > L.head, "sân nằm dưới phần chữ");
    assert.ok(bot + 22 * g.u! < L.h, "còn chỗ cho chữ KHÁN GIẢ");
    assert.ok(g.s * 0.36 >= 24, "chấm đủ to");
    assert.ok(14 * g.u! >= 28, "chữ KHÁN GIẢ đủ to");
  }
  // ghi chú dài đẩy sân xuống nhưng vẫn vừa
  const long = sample();
  long.formations[1].note = "rất dài ".repeat(60);
  const L = imageLayout(long, 1);
  assert.ok(L.lines.length <= 1 + 2 + 2 + 3);
  assert.ok(toPx(L.geom, 0, long.stage.depth / 2)[1] < L.h);
  // sân sâu: ảnh cao tới 4:5 rồi thu sân lại cho vừa
  const deep = { ...sample(), stage: { width: 6, depth: 14 } };
  const D = imageLayout(deep, 0);
  assert.equal(D.h, IMG_H);
  assert.ok(toPx(D.geom, 0, 7)[1] + 22 * D.geom.u! < IMG_H);
});

test("nội dung sơ đồ: chấm ở giữa khối giữ, mũi tên chỉ cho người đã dời chỗ, bỏ người ẩn", () => {
  const p = sample();
  const g = imageLayout(p, 1).geom;
  const f = imageFrame(p, 1, g);
  assert.equal(f.dots.length, 2);
  assert.deepEqual([f.dots[0].x, f.dots[0].y], toPx(g, 2, 0));
  assert.equal(f.trails!.length, 1, "chỉ Hương dời chỗ, Lan đứng yên, người ẩn không tính");
  const t = f.trails![0];
  assert.deepEqual([t.x0, t.y0, t.x1, t.y1], [...toPx(g, -2, 0), ...toPx(g, 2, 0)]);
  assert.equal(t.color, "#ff5d6c");
  assert.equal(imageFrame(p, 0, imageLayout(p, 0).geom).trails!.length, 0, "đội hình đầu không có mũi tên");
  assert.equal(f.title, "");
});

test("vẽ ảnh: có tên bài, tên đội hình, ghi chú, KHÁN GIẢ, tên người và đầu mũi tên", () => {
  const p = sample();
  const { ctx, texts, fills } = fakeCtx();
  drawImage(ctx, p, 1);
  assert.ok(texts.includes("Bài múa: Hương Sen"));
  assert.ok(texts.includes("2/2 · Chữ V"));
  assert.ok(texts.some((s) => s.includes("nhịp 5 quay")));
  assert.ok(texts.includes("▼ KHÁN GIẢ ▼") && texts.includes("CÁNH GÀ"));
  assert.ok(texts.includes("Hương") && texts.includes("Lan") && !texts.includes("Ẩn"));
  assert.ok(fills.includes("#aab3c2"), "có đầu mũi tên");
  assert.equal(ctx.globalAlpha, 1);
});

test("tên tệp ảnh và gói: không dấu cách, có số thứ tự", () => {
  const p = sample();
  assert.equal(imageFileName(p, 0), "Bài-múa-Hương-Sen-01-Mở.png");
  assert.equal(imageFileName(p, 1), "Bài-múa-Hương-Sen-02-Chữ-V.png");
  assert.equal(imagesZipName(p), "Bài-múa-Hương-Sen-doi-hinh.zip");
  const q = { ...p, title: "", formations: [{ ...p.formations[0], name: "  " }] };
  assert.equal(imageFileName(q, 0), "bai-mua-01-doi-hinh.png");
  for (const n of [imageFileName(p, 1), imagesZipName(p), imageFileName(q, 0)]) assert.ok(!/\s/.test(n));
});
