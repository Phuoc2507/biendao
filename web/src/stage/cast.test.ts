import { test } from "node:test";
import assert from "node:assert/strict";
import { type Formation, type Project, type VDancer, cloneDancer, emptyProject, newDancer } from "./model.ts";
import {
  SUB_MAX, activeSub, addSub, castBack, castIn, castLabel, castLabelIn, cleanCast, isStandIn, mainName, recolorSub,
  removeSub, renameCast, standInText, swapFacingIn, swapRolesAll,
} from "./cast.ts";
import { normalizeProject } from "./intake.ts";
import { reassignFix } from "./fixes.ts";
import { changeText, diffProjects } from "./variants.ts";
import { castLine, personNotesOf, printHtml } from "./export/printSheet.ts";
import { personHeader, personSheets } from "./export/personSheet.ts";
import { resolveShortcut } from "./ui/keys.ts";

const lan = (): VDancer => addSub(addSub(newDancer("a", "Lan", "#ff5d6c"), "Mai", "#3ad07a"), "Hoa");

test("thêm người dự bị: bỏ tên rỗng, trùng (kể cả trùng người chính), quá SUB_MAX", () => {
  const d = lan();
  assert.deepEqual(d.subs, [{ name: "Mai", color: "#3ad07a" }, { name: "Hoa" }]);
  assert.equal(addSub(d, "  "), d);
  assert.equal(addSub(d, "mai"), d);
  assert.equal(addSub(d, "LAN"), d);
  let x = newDancer("x", "X", "#fff");
  for (let i = 0; i < SUB_MAX + 3; i++) x = addSub(x, `P${i}`);
  assert.equal(x.subs!.length, SUB_MAX);
});

test("thay vai: đổi tên và màu người đang đóng, nhớ người chính; đổi lại trả nguyên", () => {
  const d = lan();
  const m = castIn(d, d.subs![0]);
  assert.equal(m.name, "Mai");
  assert.equal(m.color, "#3ad07a");
  assert.deepEqual(m.lead, { name: "Lan", color: "#ff5d6c" });
  assert.ok(isStandIn(m));
  assert.equal(mainName(m), "Lan");
  assert.equal(activeSub(m), 0);
  // người thứ hai không có màu riêng: giữ màu của vai
  const h = castIn(m, m.subs![1]);
  assert.equal(h.name, "Hoa");
  assert.equal(h.color, "#ff5d6c");
  assert.deepEqual(h.lead, { name: "Lan", color: "#ff5d6c" });
  assert.equal(activeSub(h), 1);
  const back = castBack(h);
  assert.deepEqual(back, d);
  assert.equal(castBack(d), d);
  // castIn với tên người chính là đổi lại
  assert.deepEqual(castIn(m, { name: "lan" }), d);
});

test("nhãn (thay A) và dòng nhắc Tôi là ai", () => {
  const d = lan();
  const m = castIn(d, d.subs![0]);
  assert.equal(castLabel(d), "Lan");
  assert.equal(castLabel(m), "Mai (thay Lan)");
  assert.equal(castLabel(m, false), "Mai");
  assert.equal(castLabelIn({}, m), "Mai (thay Lan)");
  assert.equal(castLabelIn({ castNote: false }, m), "Mai");
  assert.equal(standInText(m), "Mai đóng thay Lan");
  assert.equal(standInText(d), null);
});

test("bỏ người dự bị đang đóng thì người chính đóng lại; đổi màu người đang đóng đổi chấm", () => {
  const d = lan();
  const m = castIn(d, d.subs![0]);
  const r = removeSub(m, 0);
  assert.equal(r.name, "Lan");
  assert.equal(r.lead, undefined);
  assert.deepEqual(r.subs, [{ name: "Hoa" }]);
  assert.equal("subs" in removeSub(removeSub(d, 0), 0), false);
  const c = recolorSub(m, 0, "#4f9dff");
  assert.equal(c.color, "#4f9dff");
  assert.equal(recolorSub(c, 0, undefined).color, "#ff5d6c");
  assert.equal(recolorSub(d, 1, "#4f9dff").color, "#ff5d6c"); // không đang đóng thì chấm giữ màu
});

test("đổi tên người đang thay sửa luôn danh sách dự bị; gõ tên người chính là đổi lại", () => {
  const d = lan();
  const m = castIn(d, d.subs![0]);
  const r = renameCast(m, "Mai Anh");
  assert.equal(r.name, "Mai Anh");
  assert.equal(r.subs![0].name, "Mai Anh");
  assert.equal(activeSub(r), 0);
  assert.deepEqual(renameCast(m, "Lan"), d);
  assert.equal(renameCast(d, "Lan Anh").name, "Lan Anh");
  assert.equal(renameCast(d, "  "), d);
});

test("nhân bản vai không mang theo người dự bị, người thay", () => {
  const m = castIn(lan(), { name: "Mai" });
  const c = cloneDancer(m, "z", ["Mai"], "#000");
  assert.equal(c.lead, undefined);
  assert.equal(c.subs, undefined);
});

test("mở tệp: dự án cũ không có trường mới vẫn y nguyên; dữ liệu hỏng bị làm sạch", () => {
  const old: Project = { ...emptyProject(), dancers: [newDancer("a", "Lan", "#ff5d6c")] };
  const n = normalizeProject(JSON.parse(JSON.stringify(old)))!;
  assert.equal("subs" in n.dancers[0], false);
  assert.equal("lead" in n.dancers[0], false);
  assert.equal("castNote" in n, false);
  const m = castIn(lan(), { name: "Mai", color: "#3ad07a" });
  const round = normalizeProject(JSON.parse(JSON.stringify({ ...old, dancers: [m], castNote: false })))!;
  assert.deepEqual(round.dancers[0], m);
  assert.equal(round.castNote, false);
  const x = { ...newDancer("a", "Lan", "#fff") } as VDancer;
  cleanCast(x, { name: "Lan", subs: [{ name: " Mai " }, { name: "mai" }, { name: 3 }, null, { name: "Hoa", color: "đỏ" }], lead: { name: "Lan" } } as never);
  assert.deepEqual(x.subs, [{ name: "Mai" }, { name: "Hoa" }]);
  assert.equal(x.lead, undefined); // người chính trùng người đang đóng: bỏ
});

const F = (id: string, start: number, pos: Formation["pos"], o: Partial<Formation> = {}): Formation =>
  ({ id, name: id, start, end: start + 4, pos, ...o });

test("đổi vai cả bài: đổi chỗ, đường cong, hướng mặt, ghi chú trên mọi đội hình; người khác giữ nguyên", () => {
  const fs: Formation[] = [
    F("f1", 0, { a: [-2, 0], b: [2, 0], c: [0, 1] }, { facing: { a: 90 }, notes: { b: "cầm quạt" } }),
    F("f2", 8, { a: [-1, 1], b: [1, 1], c: [0, -1] }, { via: { a: [-3, 2] }, facing: { b: 180, c: 45 } }),
  ];
  const r = swapRolesAll(fs, "a", "b");
  assert.deepEqual(r[0].pos, { a: [2, 0], b: [-2, 0], c: [0, 1] });
  assert.deepEqual(r[0].facing, { b: 90 });
  assert.deepEqual(r[0].notes, { a: "cầm quạt" });
  assert.deepEqual(r[1].pos, { a: [1, 1], b: [-1, 1], c: [0, -1] });
  assert.deepEqual(r[1].via, { b: [-3, 2] });
  assert.deepEqual(r[1].facing, { a: 180, c: 45 });
  // làm hai lần là về như cũ; không đụng mảng gốc
  assert.deepEqual(swapRolesAll(r, "a", "b"), fs);
  assert.deepEqual(fs[0].pos.a, [-2, 0]);
  assert.equal(swapRolesAll(fs, "a", "a"), fs);
});

test("Đổi chỗ X: hướng mặt đi theo chỗ đứng ở đúng đội hình đó", () => {
  const fs: Formation[] = [
    F("f1", 0, { a: [-2, 0], b: [2, 0] }, { facing: { a: 90 } }),
    F("f2", 8, { a: [-1, 1], b: [1, 1] }, { facing: { a: -90 } }),
  ];
  const r = swapFacingIn(fs, "f2", "a", "b");
  assert.deepEqual(r[1].facing, { b: -90 });
  assert.equal(r[0], fs[0]);
  const none = [F("f1", 0, { a: [0, 0], b: [1, 0] })];
  assert.equal(swapFacingIn(none, "f1", "a", "b"), none);
});

test("reassignFix: ai nhận chỗ nào thì nhận hướng mặt của chỗ đó", () => {
  // a, b đi chéo nhau: đổi chỗ cho gần sẽ cho a sang chỗ phải, b sang chỗ trái
  const stage = { width: 10, depth: 6 };
  const ds = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const fs: Formation[] = [
    F("f1", 0, { a: [-2, 0], b: [2, 0] }),
    F("f2", 4.5, { a: [2, 0], b: [-2, 0] }, { facing: { a: 90, b: -90 } }),
  ];
  const fx = reassignFix(fs, 1, ds, stage, null);
  assert.ok(fx);
  assert.deepEqual(fx.fs[1].pos, { a: [-2, 0], b: [2, 0] });
  // chỗ phải (2, 0) nhìn 90, chỗ trái (-2, 0) nhìn -90: hình giữ nguyên
  assert.deepEqual(fx.fs[1].facing, { a: -90, b: 90 });
});

function show(): Project {
  const m = castIn(lan(), { name: "Mai", color: "#3ad07a" });
  return {
    ...emptyProject(),
    title: "Trống cơm",
    dancers: [m, newDancer("b", "Hùng", "#4f9dff")],
    formations: [F("f1", 0, { a: [-1, 0], b: [1, 0] }, { notes: { a: "cầm nón" } }), F("f2", 8, { a: [1, 0], b: [-1, 0] })],
  };
}

test("bản in: bảng và ghi chú ghi tên người đang đóng kèm (thay A), đầu trang liệt kê người thay; tắt thì chỉ tên", () => {
  const p = show();
  const html = printHtml(p, { describe: () => "giữa", date: new Date(2026, 9, 19) });
  assert.ok(html.includes("Mai (thay Lan)"));
  assert.ok(html.includes("Người thay: Mai thay Lan"));
  assert.deepEqual(personNotesOf(p, 0), [["Mai (thay Lan)", "cầm nón"]]);
  const off = { ...p, castNote: false as const };
  assert.equal(castLine(off), "");
  const h2 = printHtml(off, { describe: () => "giữa" });
  assert.ok(!h2.includes("(thay Lan)"));
  assert.ok(h2.includes(">Mai<"));
});

test("ảnh từng người: đầu ảnh và tên ghi người đang đóng, tên tệp theo người đang đóng", () => {
  const p = show();
  assert.equal(personHeader(p, "a", 0, 1)[0].text, "Vị trí của Mai (thay Lan)");
  const s = personSheets(p);
  assert.equal(s[0].name, "Mai (thay Lan)");
  assert.ok(s[0].files[0].endsWith("-vi-tri-Mai.png"));
  assert.equal(personHeader({ ...p, castNote: false }, "a", 0, 1)[0].text, "Vị trí của Mai");
});

test("so sánh phương án: thay vai ghi một dòng riêng, không phải đổi tên hay đổi video", () => {
  const a: Project = { ...show(), dancers: [lan(), newDancer("b", "Hùng", "#4f9dff")] };
  const b = show();
  const ch = diffProjects(a, b);
  assert.deepEqual(ch.map((c) => c.kind), ["cast"]);
  assert.equal(changeText(ch[0]), "Vai của Lan: Mai đóng (trước là Lan)");
  assert.equal(changeText(diffProjects(b, a)[0]), "Lan đóng lại vai của mình (thôi Mai thay)");
  const c: Project = { ...a, dancers: [addSub(a.dancers[0], "Thu"), a.dancers[1]] };
  assert.deepEqual(diffProjects(a, c).map(changeText), ["Đổi người dự bị"]);
});

test("phím Shift X là đổi vai cả bài, X vẫn là đổi chỗ", () => {
  const k = (key: string, shift = false) => ({ key, code: "", ctrl: false, meta: false, alt: false, shift, repeat: false });
  const c = { hasSelection: true, hasDancers: true, hasBlock: true, formationFocused: false } as never;
  assert.deepEqual(resolveShortcut(k("x"), c), { type: "swap" });
  assert.deepEqual(resolveShortcut(k("X", true), c), { type: "swapRoles" });
});
