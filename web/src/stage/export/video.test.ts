import { test } from "node:test";
import assert from "node:assert/strict";
import { pickMime, extFor, rangeFor, outputSize, videoFileName, fmtDuration, bitrateFor } from "./videoOpts.ts";
import { planGeometry, planFrame, drawPlanFrame, toPx, type Ctx2D } from "./planRender.ts";
import { type Project, emptyProject, newDancer, WING } from "../model.ts";

test("chọn định dạng: MP4 trước, rồi WebM, không có thì null", () => {
  assert.equal(pickMime(() => true), "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
  assert.equal(pickMime((m) => m.startsWith("video/webm")), "video/webm;codecs=vp9,opus");
  assert.equal(pickMime((m) => m === "video/webm;codecs=vp8,opus"), "video/webm;codecs=vp8,opus");
  assert.equal(pickMime(() => { throw new Error("x"); }), null);
  assert.equal(extFor("video/mp4;codecs=avc1"), "mp4");
  assert.equal(extFor("video/webm"), "webm");
  assert.equal(bitrateFor(720), 5e6);
});

test("đoạn ghi: cả bài, đoạn lặp, từ vạch phát", () => {
  const c = { end: 60, loop: { a: 10, b: 70 }, t: 20 };
  assert.deepEqual(rangeFor("all", c), { a: 0, b: 60 });
  assert.deepEqual(rangeFor("loop", c), { a: 10, b: 60 });
  assert.deepEqual(rangeFor("playhead", c), { a: 20, b: 60 });
  assert.deepEqual(rangeFor("loop", { ...c, loop: null }), { error: "Chưa đặt đoạn lặp." });
  assert.ok("error" in rangeFor("playhead", { ...c, t: 59.8 }));
});

test("cỡ khung chẵn, vừa hộp 16:9", () => {
  assert.deepEqual(outputSize(720, 16 / 9), { w: 1280, h: 720 });
  assert.deepEqual(outputSize(1080, 16 / 9), { w: 1920, h: 1080 });
  assert.deepEqual(outputSize(720, 4 / 3), { w: 960, h: 720 });
  assert.deepEqual(outputSize(720, 2.5), { w: 1280, h: 512 });
  const o = outputSize(720, 1.7777 + 0.0123);
  assert.equal(o.w % 2, 0);
  assert.equal(o.h % 2, 0);
  assert.deepEqual(outputSize(480, NaN), { w: 854, h: 480 });
});

test("tên tệp và thời lượng", () => {
  assert.equal(videoFileName("Bài múa: Hương Sen", "mp4"), "Bài-múa-Hương-Sen.mp4");
  assert.equal(videoFileName("Hoa", "webm", "Thị Lan"), "Hoa-Thị-Lan.webm");
  assert.equal(fmtDuration(65), "1 phút 05 giây");
  assert.equal(fmtDuration(9.6), "10 giây");
});

function sample(): Project {
  return {
    ...emptyProject(),
    title: "Hoa",
    bpm: 120,
    dancers: [newDancer("a", "Hương", "#ff5d6c"), newDancer("b", "Lan", "#4f9dff"), { ...newDancer("c", "Ẩn", "#000"), hidden: true }],
    formations: [
      { id: "f1", name: "Mở", start: 0, end: 4, pos: { a: [-2, 0], b: [2, 2] } },
      { id: "f2", name: "Chữ V", start: 6, end: 10, pos: { a: [2, 0], b: [-2, 2] } },
    ],
  };
}

test("hình học: sân và cánh gà nằm gọn trong khung, khán giả ở dưới", () => {
  const p = sample();
  const g = planGeometry(p.stage, 1280, 720);
  const [l, top] = toPx(g, -p.stage.width / 2 - WING, -p.stage.depth / 2);
  const [r, bot] = toPx(g, p.stage.width / 2 + WING, p.stage.depth / 2);
  assert.ok(l >= 0 && r <= 1280 && top >= g.head && bot < 720 - 30);
  assert.ok(bot > top);
});

test("khung: vị trí theo thời gian, chuyển đội hình, tô một người", () => {
  const p = sample();
  const g = planGeometry(p.stage, 1280, 720);
  const f0 = planFrame(p, 2, g);
  assert.equal(f0.sub, "Mở");
  assert.equal(f0.title, "Hoa");
  assert.equal(f0.count, "5/8 · lượt 1");
  assert.equal(f0.dots.length, 2, "người ẩn không vẽ");
  assert.deepEqual([f0.dots[0].x, f0.dots[0].y], toPx(g, -2, 0));
  const mid = planFrame(p, 5, g);
  assert.equal(mid.sub, "Mở → Chữ V");
  assert.ok(Math.abs(mid.dots[0].x - g.cx) < 1e-6, "giữa đường chuyển thì ở tâm");
  const hi = planFrame(p, 8, g, { highlightId: "a" });
  assert.equal(hi.title, "Vị trí của Hương");
  assert.equal(hi.dots[hi.dots.length - 1].id, "a");
  assert.equal(hi.dots.find((d) => d.id === "b")!.alpha, 0.35);
});

test("vẽ khung: chạy hết lệnh canvas, có chữ KHÁN GIẢ và tên", () => {
  const p = sample();
  const g = planGeometry(p.stage, 1280, 720);
  const texts: string[] = [];
  const noop = () => {};
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop, stroke: noop,
    fillText: (s) => void texts.push(s), setLineDash: noop, save: noop, restore: noop, rect: noop, clip: noop,
  };
  drawPlanFrame(ctx, g, planFrame(p, 2, g));
  assert.ok(texts.includes("▼ KHÁN GIẢ ▼"));
  assert.ok(texts.includes("Hương") && texts.includes("Lan") && texts.includes("0:02.0"));
  assert.equal(ctx.globalAlpha, 1);
});

test("khung: dải chữ kèm ghi chú đội hình, đang chuyển thì ghi chú của đội hình tới, dài thì cắt", () => {
  const p = sample();
  p.formations = p.formations.map((f, k) => (k === 1 ? { ...f, note: "nhịp 5\nquay" } : f));
  const g = planGeometry(p.stage, 1280, 720);
  assert.equal(planFrame(p, 2, g).sub, "Mở");
  assert.equal(planFrame(p, 5, g).sub, "Mở → Chữ V · nhịp 5 quay");
  p.formations = p.formations.map((f, k) => (k === 1 ? { ...f, note: "x".repeat(80) } : f));
  assert.ok(planFrame(p, 5, g).sub.endsWith("x…"));
  assert.ok(planFrame(p, 5, g).sub.length < 80);
});

test("khung: cắt ghi chú dài không xẻ đôi biểu tượng cảm xúc", () => {
  const p = sample();
  // biểu tượng nằm đúng chỗ cắt (ký tự 59, 60 tính theo UTF-16)
  p.formations = p.formations.map((f, k) => (k === 1 ? { ...f, note: `${"x".repeat(58)}😀${"y".repeat(20)}` } : f));
  const g = planGeometry(p.stage, 1280, 720);
  const sub = planFrame(p, 5, g).sub;
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(sub), "còn nửa cặp thay thế");
  assert.ok(sub.endsWith("…"));
});
