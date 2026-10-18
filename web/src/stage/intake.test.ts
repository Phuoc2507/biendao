import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fileKind, isJunk, parseCardMeta, looksLikeProject, normalizeProject, mediaKey, normalizeShapes,
  offsetPlan, importSummary, emptyReport, fitSize, stripName, ALIGN_MAX_BYTES, HINT, QUOTA_MSG,
} from "./intake.ts";
import { checkInvariants, initials } from "./model.ts";

test("fileKind phân loại theo đuôi và type", () => {
  assert.equal(fileKind("a.card.json"), "card");
  assert.equal(fileKind("bai.choreo.json"), "json");
  assert.equal(fileKind("x.mp4", "audio/mp4"), "video");
  assert.equal(fileKind("nhac.m4a"), "music");
  assert.equal(fileKind("IMG_1.MOV"), "video");
  assert.equal(fileKind("ghi-chu.txt"), "other");
  assert.equal(fileKind(".DS_Store"), "junk");
  assert.equal(fileKind("Thumbs.db"), "junk");
  assert.ok(isJunk("._IMG_1.MOV"));
});

test("stripName bỏ đuôi và .card", () => {
  assert.equal(stripName("Lan.card.mp4"), "Lan");
  assert.equal(stripName("Lan.card.json"), "Lan");
  assert.equal(stripName("IMG_2.MOV"), "IMG_2");
});

test("parseCardMeta: chỉ nhận choreo-card, lọc số hỏng", () => {
  assert.equal(parseCardMeta("{not json"), null);
  assert.equal(parseCardMeta(JSON.stringify({ version: 1, dancers: [] })), null);
  const m = parseCardMeta(JSON.stringify({ format: "choreo-card", name: "Lan", stacked: true, offsetSec: 1.5, durationSec: 0, alignConfident: false }));
  assert.deepEqual(m, { name: "Lan", stacked: true, offsetSec: 1.5, alignConfident: false });
  const n = parseCardMeta('{"format":"choreo-card","offsetSec":"x","durationSec":12}');
  assert.deepEqual(n, { durationSec: 12 });
});

test("looksLikeProject / normalizeProject", () => {
  assert.equal(looksLikeProject({ foo: 1 }), false);
  assert.equal(normalizeProject({ version: 2, dancers: [] }), null);
  assert.equal(normalizeProject(null), null);
  const p = normalizeProject({
    version: 1, title: "T", musicDuration: null,
    dancers: [{ id: "a", name: "A", color: "#fff", offsetSec: null, durationSec: -3 }, { nope: 1 }],
  })!;
  assert.equal(p.dancers.length, 1);
  assert.equal(p.dancers[0].offsetSec, 0);
  assert.equal(p.dancers[0].durationSec, 0);
  assert.equal(p.dancers[0].cardHeight, 1.7);
  assert.equal(p.musicDuration, 0);
  assert.deepEqual(p.formations, []);
  assert.equal(p.title, "T");
});

test("mediaKey theo tên + cỡ + ngày sửa", () => {
  assert.equal(mediaKey({ name: "a.mp4", size: 10, lastModified: 5 }), "a.mp4|10|5");
});

const base = { fileName: "Lan.mp4", fileSize: 1000, durationSec: 30, meta: null, hasMusic: true };

test("offsetPlan: đúng tệp cũ và offset tin được thì giữ", () => {
  const prev = { mediaName: "lan.MP4", offsetSec: 2.5, alignConfident: true, durationSec: 30.2 };
  assert.deepEqual(offsetPlan({ ...base, prev }), { how: "keep", offsetSec: 2.5, confident: true });
  // độ dài lệch nhiều: tệp khác cùng tên, không giữ
  assert.equal(offsetPlan({ ...base, prev: { ...prev, durationSec: 40 } }).how, "align");
  // offset cũ chưa tin: khớp lại nhưng tạm giữ số cũ
  const r = offsetPlan({ ...base, prev: { ...prev, alignConfident: false } });
  assert.deepEqual(r, { how: "align", offsetSec: 2.5, confident: false });
});

test("offsetPlan: card.json có offset thì dùng, khỏi giải mã", () => {
  assert.deepEqual(offsetPlan({ ...base, meta: { offsetSec: 1.2 } }), { how: "card", offsetSec: 1.2, confident: true });
  assert.equal(offsetPlan({ ...base, meta: { offsetSec: 0, alignConfident: false } }).confident, false);
  // thẻ không có offset: tự khớp như video thường
  assert.equal(offsetPlan({ ...base, meta: { stacked: true } }).how, "align");
});

test("offsetPlan: chưa có nhạc / tệp quá lớn", () => {
  assert.deepEqual(offsetPlan({ ...base, hasMusic: false }), { how: "none", offsetSec: 0, confident: false });
  assert.equal(offsetPlan({ ...base, fileSize: ALIGN_MAX_BYTES + 1 }).how, "big");
  // vũ công mặc định (mediaName rỗng) không bao giờ "giữ"
  assert.equal(offsetPlan({ ...base, prev: { mediaName: "", offsetSec: 0, alignConfident: true, durationSec: 0 } }).how, "align");
});

test("importSummary: thành công gọn", () => {
  const r = { ...emptyReport(), music: "bai.mp3", added: ["A", "B"] };
  assert.deepEqual(importSummary(r), { msg: 'Đã nạp nhạc "bai.mp3", 2 video.', kind: "info" });
});

test("importSummary: video hỏng kèm mẹo, vẫn nạp phần còn lại", () => {
  const r = { ...emptyReport(), added: ["A"], bad: [{ name: "IMG_1.MOV", code: "decode" as const }], skipped: ["x.json"] };
  const s = importSummary(r);
  assert.equal(s.kind, "warn");
  assert.match(s.msg, /Đã nạp 1 video/);
  assert.match(s.msg, /IMG_1\.MOV \(trình duyệt không giải mã được\)/);
  assert.match(s.msg, /Bỏ qua tệp không nhận ra: x\.json/);
  assert.ok(s.msg.includes(HINT));
});

test("importSummary: toàn hỏng là lỗi; đầy bộ nhớ báo cách xử lý", () => {
  const s = importSummary({ ...emptyReport(), bad: [{ name: "a.mp4", code: "quota" }] });
  assert.equal(s.kind, "error");
  assert.ok(s.msg.includes(QUOTA_MSG));
  assert.ok(!s.msg.includes(HINT));
  const t = importSummary({ ...emptyReport(), same: ["A"] });
  assert.equal(t.kind, "info");
  assert.match(t.msg, /1 video đã có sẵn/);
  assert.match(importSummary({ ...emptyReport(), weak: ["A", "B", "C", "D"] }).msg, /A, B, C…/);
});

test("fitSize giới hạn cạnh dài", () => {
  assert.deepEqual(fitSize(1920, 1080, 1024), [1024, 576]);
  assert.deepEqual(fitSize(1080, 3840, 1024), [288, 1024]);
  assert.deepEqual(fitSize(640, 360, 1024), [640, 360]);
  assert.deepEqual(fitSize(0, 0, 1024), [1, 1]);
});

test("normalizeProject: ghi chú đội hình không phải chữ thì bỏ, chữ thì giữ", () => {
  const p = normalizeProject({
    version: 1, dancers: [],
    formations: [
      { id: "a", name: "A", start: 0, end: 1, pos: {}, note: 5 },
      { id: "b", name: "B", start: 2, end: 3, pos: {}, note: "quay" },
    ],
  })!;
  assert.equal("note" in p.formations[0], false);
  assert.equal(p.formations[1].note, "quay");
});

test("normalizeProject: Hình của tôi bỏ hình và điểm hỏng, rỗng thì bỏ trường", () => {
  const p = normalizeProject({
    version: 1, dancers: [],
    myShapes: [
      { id: "h1", name: "  Chữ T ", pts: [[0, 0], [1, "x"], [2, 1], [Infinity, 0], [1, 2, 3]] },
      { id: "h1", name: "trùng id", pts: [[0, 0]] },
      { id: "h2", pts: [[0, 1]] },
      { id: "h3", name: "toàn điểm hỏng", pts: [null, "a"] },
      { name: "không id", pts: [[0, 0]] },
      null, 7,
    ],
  })!;
  assert.deepEqual(p.myShapes, [
    { id: "h1", name: "Chữ T", pts: [[0, 0], [2, 1]] },
    { id: "h2", name: "Hình không tên", pts: [[0, 1]] },
  ]);
  assert.equal("myShapes" in normalizeProject({ version: 1, dancers: [], myShapes: "hỏng" })!, false);
  assert.equal("myShapes" in normalizeProject({ version: 1, dancers: [], myShapes: [] })!, false);
  assert.equal("myShapes" in normalizeProject({ version: 1, dancers: [] })!, false);
  assert.deepEqual(normalizeShapes(undefined), []);
});

test("normalizeProject: ghi chú chỉ toàn khoảng trắng thì bỏ, có chữ thì cắt khoảng trắng hai đầu", () => {
  // tệp cũ hay sửa tay: ghi chú "   " vẫn hiện dấu bút, khung ghi chú rỗng lúc trình chiếu và trong bản in
  const p = normalizeProject({
    version: 1, dancers: [],
    formations: [
      { id: "a", name: "A", start: 0, end: 1, pos: {}, note: "  \n " },
      { id: "b", name: "B", start: 2, end: 3, pos: {}, note: "  quay\nnhịp 5  " },
    ],
  })!;
  assert.equal("note" in p.formations[0], false);
  assert.equal(p.formations[1].note, "quay\nnhịp 5");
});

test("normalizeShapes: bỏ điểm xa vô lý (cộng hai số khổng lồ tràn thành NaN khi áp hình)", () => {
  const s = normalizeShapes([{ id: "h", name: "x", pts: [[1e308, 0], [1.7e308, 0], [0, 0], [1, 1]] }]);
  assert.deepEqual(s, [{ id: "h", name: "x", pts: [[0, 0], [1, 1]] }]);
  assert.deepEqual(normalizeShapes([{ id: "k", pts: [[1e308, 0], [1.7e308, 0]] }]), []);
});

test("normalizeProject: số hỏng trong tệp (1e999 thành Infinity, nhịp 0 hay âm, sân 0) về mặc định", () => {
  const p = normalizeProject(JSON.parse(
    '{"version":1,"title":5,"stage":{"width":0,"depth":1e999},"bpm":-120,"downbeat":1e999,"musicId":7,"musicName":null,"dancers":[]}',
  ))!;
  assert.deepEqual(p.stage, { width: 10, depth: 6 });
  assert.equal(p.bpm, null);
  assert.equal(p.downbeat, 0);
  assert.equal(p.title, "Bài múa mới");
  assert.equal(p.musicId, null);
  assert.equal(p.musicName, "");
  assert.equal(normalizeProject({ version: 1, dancers: [], bpm: 0 })!.bpm, null);
  assert.equal(normalizeProject({ version: 1, dancers: [], bpm: 128 })!.bpm, 128);
  // sân khổng lồ làm dò chỗ trống (spotNear) chạy mãi: kẹp lại
  const big = normalizeProject({ version: 1, dancers: [], stage: { width: 1e6, depth: 0.001 } })!;
  assert.ok(big.stage.width <= 60 && big.stage.depth >= 1);
});

test("normalizeProject: vũ công trùng id thì giữ người đầu, tên và màu không phải chữ thì lấy mặc định", () => {
  const p = normalizeProject({
    version: 1,
    dancers: [{ id: "a", name: 3, color: null, hidden: "x" }, { id: "a", name: "Trùng" }, { id: "b", name: "B", hidden: true }],
  })!;
  assert.deepEqual(p.dancers.map((d) => d.id), ["a", "b"]);
  assert.equal(p.dancers[0].name, "a");
  assert.equal(typeof p.dancers[0].color, "string");
  assert.equal(p.dancers[0].hidden, false);
  assert.equal(p.dancers[1].hidden, true);
  assert.doesNotThrow(() => p.dancers.map((d) => initials(d.name)));
});

test("normalizeProject: đội hình hỏng, trùng id, chồng giờ, thiếu người đều được dọn cho đúng bất biến", () => {
  const p = normalizeProject(JSON.parse(`{"version":1,"stage":{"width":10,"depth":6},
    "dancers":[{"id":"a","name":"A"},{"id":"b","name":"B"}],
    "formations":[null, 3, {"name":"không id"},
      {"id":"f2","name":"Hai","start":4,"end":6,"pos":{"a":[1e999,0],"b":[1,"x"],"ma":[0,0]}},
      {"id":"f1","name":"Một","start":0,"end":5,"pos":{"a":[0,0],"b":[1,0]}},
      {"id":"f1","name":"Trùng","start":8,"end":9,"pos":{}},
      {"id":"f3","name":7,"start":10,"end":9,"pos":null},
      {"id":"f4","name":"Không giờ","start":"x","pos":{}}
    ]}`))!;
  assert.deepEqual(p.formations.map((f) => f.id), ["f1", "f2", "f3"]);
  assert.deepEqual(checkInvariants(p), []);
  const [f1, f2, f3] = p.formations;
  assert.equal(f1.name, "Một");
  assert.ok(f2.start >= f1.end, "không chồng giờ");
  assert.ok(f3.start <= f3.end);
  assert.equal(typeof f3.name, "string");
  assert.equal(f2.pos.a[0], 5 + 1.5, "Infinity kẹp vào mép cánh gà");
  assert.ok(Number.isFinite(f2.pos.b[0]) && Number.isFinite(f2.pos.b[1]), "chỗ hỏng thay bằng chỗ trong cánh gà");
  assert.equal("ma" in f2.pos, false, "bỏ chỗ của người không có trong danh sách");
  assert.ok(f3.pos.a && f3.pos.b);
});
