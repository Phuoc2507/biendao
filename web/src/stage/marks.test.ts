import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARK_LABEL_MAX, addMark, cleanLabel, cleanMarks, markAt, markJump, markNear, mergeSuggested,
  moveMark, nextMarkLabel, removeMark, renameMark, withMarks,
} from "./marks.ts";
import { emptyProject, newDancer, type Project, type SongMark } from "./model.ts";
import { energyChangeScore, suggestMarkTimes } from "./autoplan.ts";
import { normalizeProject } from "./intake.ts";
import { cellLines } from "./export/personSheet.ts";

const M = (id: string, t: number, label = id): SongMark => ({ id, t, label });

test("cleanMarks: bỏ mốc hỏng, trùng id, kẹp giờ, xếp theo giờ", () => {
  const raw = [
    M("b", 30, "  Điệp   khúc "),
    null,
    "rác",
    { id: 5, t: 3, label: "x" },
    { id: "nan", t: NaN, label: "x" },
    { id: "inf", t: Infinity, label: "x" },
    { id: "s", t: "4", label: "x" },
    M("a", 10, "Nhạc dạo"),
    M("b", 12, "trùng id"),
    M("neg", -5, ""),
    M("late", 999, "Kết"),
  ];
  const out = cleanMarks(raw, 120);
  assert.deepEqual(out.map((m) => m.id), ["neg", "a", "b", "late"]);
  assert.equal(out[0].t, 0);
  assert.equal(out[0].label, "Đoạn", "nhãn rỗng thì đặt Đoạn");
  assert.equal(out[2].label, "Điệp khúc", "gộp khoảng trắng, cắt hai đầu");
  assert.equal(out[2].t, 30, "id trùng giữ cái đầu");
  assert.equal(out[3].t, 120, "kẹp vào cuối bài");
  assert.deepEqual(cleanMarks(undefined), []);
  assert.deepEqual(cleanMarks({ a: 1 }), []);
  // chưa biết thời lượng: chỉ chặn âm
  assert.equal(cleanMarks([M("x", 500)], 0)[0].t, 500);
});

test("cleanLabel: cắt độ dài", () => {
  const s = cleanLabel("a".repeat(100));
  assert.equal(s.length, MARK_LABEL_MAX);
  assert.equal(cleanLabel(42), "");
});

test("withMarks: rỗng thì bỏ hẳn trường", () => {
  const p = emptyProject();
  const a = withMarks(p, [M("a", 1)]);
  assert.equal(a.marks?.length, 1);
  const b = withMarks(a, []);
  assert.equal("marks" in b, false);
});

test("markAt: đoạn đang chứa t", () => {
  const ms = [M("a", 5), M("b", 20), M("c", 40)];
  assert.equal(markAt(ms, 0), null, "chưa tới mốc đầu");
  assert.equal(markAt(ms, 5)?.id, "a", "đúng giờ mốc thì đã vào đoạn");
  assert.equal(markAt(ms, 19.99)?.id, "a");
  assert.equal(markAt(ms, 20)?.id, "b");
  assert.equal(markAt(ms, 1000)?.id, "c", "mốc cuối tới hết bài");
  assert.equal(markAt(undefined, 3), null);
  assert.equal(markAt([], 3), null);
});

test("markJump: tới và lùi giữa các mốc", () => {
  const ms = [M("a", 5), M("b", 20), M("c", 40)];
  assert.equal(markJump(ms, 0, 1), 5);
  assert.equal(markJump(ms, 5, 1), 20, "đứng ngay mốc thì tới mốc sau");
  assert.equal(markJump(ms, 30, 1), 40);
  assert.equal(markJump(ms, 40, 1), null, "hết mốc");
  assert.equal(markJump(ms, 30, -1), 20, "lùi về đầu đoạn đang đứng");
  assert.equal(markJump(ms, 20.1, -1), 5, "vừa qua mốc thì về mốc trước nữa");
  assert.equal(markJump(ms, 20, -1), 5);
  assert.equal(markJump(ms, 4, -1), null, "trước mốc đầu");
  assert.equal(markJump(undefined, 4, 1), null);
});

test("nextMarkLabel: Đoạn n chưa dùng", () => {
  assert.equal(nextMarkLabel(undefined), "Đoạn 1");
  assert.equal(nextMarkLabel([M("a", 1, "Nhạc dạo")]), "Đoạn 2");
  assert.equal(nextMarkLabel([M("a", 1, "Đoạn 2"), M("b", 2, "Đoạn 3")]), "Đoạn 4");
});

test("add / rename / move / remove: trả mảng mới đã xếp", () => {
  const ms0 = [M("a", 10, "A"), M("b", 20, "B")];
  const ms1 = addMark(ms0, M("c", 15, ""), 30);
  assert.deepEqual(ms1.map((m) => m.id), ["a", "c", "b"]);
  assert.equal(ms1[1].label, "Đoạn 3", "nhãn rỗng thì đặt tên kế tiếp");
  assert.equal(ms0.length, 2, "không đột biến đầu vào");
  assert.equal(addMark(ms0, M("z", 99, "Z"), 30).at(-1)?.t, 30, "kẹp giờ");

  assert.equal(renameMark(ms1, "c", "  Điệp khúc ")[1].label, "Điệp khúc");
  assert.equal(renameMark(ms1, "c", "   ")[1].label, "Đoạn 3", "tên rỗng giữ tên cũ");

  const mv = moveMark(ms1, "a", 25, 30);
  assert.deepEqual(mv.map((m) => m.id), ["c", "b", "a"]);
  assert.equal(moveMark(ms1, "a", -3)[0].t, 0);
  assert.deepEqual(moveMark(ms1, "a", NaN), ms1, "giờ hỏng thì giữ nguyên");

  assert.deepEqual(removeMark(ms1, "c").map((m) => m.id), ["a", "b"]);
  assert.equal(markNear(ms1, 15.02)?.id, "c");
  assert.equal(markNear(ms1, 15.02, undefined, "c"), null, "trừ chính nó");
});

test("mergeSuggested: không ghi đè mốc đã có gần đó", () => {
  let n = 0;
  const id = () => `s${++n}`;
  const mine = [M("me", 31, "Điệp khúc")];
  const r = mergeSuggested(mine, [48, 16, 32], id, 2, 60);
  assert.equal(r.added, 2, "32 trùng mốc 31 của người dùng nên bỏ");
  assert.deepEqual(r.marks.map((m) => [m.t, m.label]), [[16, "Đoạn 2"], [31, "Điệp khúc"], [48, "Đoạn 3"]]);
  // gợi ý lần nữa không chồng mốc
  const r2 = mergeSuggested(r.marks, [16, 32, 48], id, 2, 60);
  assert.equal(r2.added, 0);
  assert.equal(r2.marks.length, 3);
  // gợi ý từ trống: Đoạn 1, Đoạn 2 theo giờ
  const r3 = mergeSuggested(undefined, [40, 8, NaN], id);
  assert.deepEqual(r3.marks.map((m) => [m.t, m.label]), [[8, "Đoạn 1"], [40, "Đoạn 2"]]);
});

// ---- gợi ý mốc từ nhạc ----

/** Sóng sin 220 Hz, to trong [loudFrom, loudTo), nhỏ ngoài đó. */
function synth(sr: number, dur: number, loudFrom: number, loudTo: number): Float32Array {
  const x = new Float32Array(Math.round(sr * dur));
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    x[i] = (t >= loudFrom && t < loudTo ? 0.8 : 0.05) * Math.sin(2 * Math.PI * 220 * t);
  }
  return x;
}

test("suggestMarkTimes: có BPM thì mốc rơi đúng vạch lượt 8 chỗ nhạc đổi", () => {
  const sr = 8000;
  const score = energyChangeScore(synth(sr, 48, 16, 32), sr);
  assert.deepEqual(suggestMarkTimes({ duration: 48, bpm: 120, score }), [16, 32]);
  // nhạc đổi lệch vạch một chút vẫn bám vạch gần nhất
  const s2 = energyChangeScore(synth(sr, 48, 16.2, 31.9), sr);
  assert.deepEqual(suggestMarkTimes({ duration: 48, bpm: 120, score: s2 }), [16, 32]);
});

test("suggestMarkTimes: điểm giả, minGap, max, không nhịp, nhạc phẳng", () => {
  const peaks = (ps: number[]) => (t: number) => (ps.some((p) => Math.abs(p - t) < 1e-6) ? 10 : 1);
  // 120 BPM: lượt 8 = 4 s; 20 và 24 quá gần nhau (minGap 8) nên chỉ lấy một
  assert.deepEqual(suggestMarkTimes({ duration: 100, bpm: 120, score: peaks([20, 24, 60]) }), [20, 60]);
  // lượt 8 đầu bài (0) và cuối bài không nhận
  assert.deepEqual(suggestMarkTimes({ duration: 100, bpm: 120, score: peaks([0, 100]) }), []);
  // max
  assert.equal(suggestMarkTimes({ duration: 100, bpm: 120, score: peaks([20, 40, 60, 80]), max: 2 }).length, 2);
  // không nhịp: xét mỗi 0,5 s, giữ đúng giờ
  assert.deepEqual(suggestMarkTimes({ duration: 60, bpm: null, score: peaks([12.5, 40]) }), [12.5, 40]);
  // nhạc đều đều thì không gợi ý
  assert.deepEqual(suggestMarkTimes({ duration: 60, bpm: 120, score: () => 3 }), []);
  assert.deepEqual(suggestMarkTimes({ duration: 0, bpm: 120, score: () => 3 }), []);
  assert.deepEqual(suggestMarkTimes({ duration: 60, bpm: 120, score: () => NaN }), []);
});

// ---- đọc tệp và ảnh từng người ----

test("normalizeProject: mốc được làm sạch, không có thì không thêm trường", () => {
  const raw = {
    version: 1, title: "T", musicDuration: 60, dancers: [],
    marks: [M("b", 70, " Kết "), M("a", 10, "Nhạc dạo"), M("a", 20, "trùng"), { id: "x", t: "1" }],
  };
  const p = normalizeProject(raw)!;
  assert.deepEqual(p.marks, [M("a", 10, "Nhạc dạo"), M("b", 60, "Kết")]);
  const q = normalizeProject({ ...raw, marks: "hỏng" })!;
  assert.equal("marks" in q, false);
  assert.equal("marks" in normalizeProject({ version: 1, dancers: [] })!, false);
});

test("ảnh từng người: có mốc thì dòng giờ ghi tên đoạn nhạc", () => {
  const p: Project = {
    ...emptyProject(), bpm: 120, dancers: [newDancer("a", "Hương", "#ff5d6c")],
    formations: [
      { id: "f1", name: "Mở", start: 0, end: 4, pos: { a: [0, 0] } },
      { id: "f2", name: "Chữ V", start: 16, end: 20, pos: { a: [1, 0] } },
    ],
  };
  assert.ok(cellLines(p, 1, 480)[1].text.startsWith("bắt đầu 0:16.0"), "không mốc thì như cũ");
  const pm = { ...p, marks: [M("m1", 2, "Nhạc dạo"), M("m2", 16, "Điệp khúc thứ hai rất dài")] };
  assert.ok(cellLines(pm, 0, 480)[1].text.startsWith("bắt đầu 0:00.0"), "trước mốc đầu thì như cũ");
  const l = cellLines(pm, 1, 480)[1].text;
  assert.ok(l.startsWith("Điệp khúc thứ…"), l);
  assert.ok(l.includes("0:16.0") && l.includes("8 thứ"), l);
});
