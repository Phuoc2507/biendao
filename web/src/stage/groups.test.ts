import { test } from "node:test";
import assert from "node:assert/strict";
import { type DancerGroup, type Project, emptyProject, newDancer, PALETTE } from "./model.ts";
import {
  addGroup, addToGroup, cleanGroups, cloneIntoGroups, dropFromGroups, groupPick, groupRingColors, isGroupPicked,
  nextGroupColor, nextGroupName, recolorGroup, removeFromGroup, renameGroup, setGroupMembers, toggleGroupPick, withGroups,
} from "./groups.ts";
import { normalizeProject } from "./intake.ts";
import { planFrame, planGeometry } from "./export/planRender.ts";
import { resolveShortcut, type KeyCtx, type KeyIn } from "./ui/keys.ts";

const ids = ["a", "b", "c", "d"];
const G = (id: string, members: string[], o: Partial<DancerGroup> = {}): DancerGroup => ({ id, name: id, color: "#ff5d6c", members, ...o });

test("cleanGroups: bỏ người không còn, người trùng, nhóm trùng id, nhóm hết người; tên và màu hỏng thì đặt lại", () => {
  const raw = [
    { id: "g1", name: "  Nam  ", color: "#4F9DFF", members: ["c", "a", "zz", "a", 7] },
    { id: "g1", name: "trùng id", color: "#000000", members: ["b"] },
    { id: "g2", name: "", color: "đỏ", members: ["b"] },
    { id: "g3", name: "Ma", color: "#123456", members: ["zz"] },
    null, "rác", { name: "không id", members: ["a"] },
    { id: "g4", name: 5, color: "#abc", members: "a" },
  ];
  const gs = cleanGroups(raw, ids);
  assert.deepEqual(gs, [
    { id: "g1", name: "Nam", color: "#4f9dff", members: ["a", "c"] },
    { id: "g2", name: "Nhóm 2", color: PALETTE[1], members: ["b"] },
  ]);
  assert.deepEqual(cleanGroups(undefined, ids), []);
  assert.deepEqual(cleanGroups({}, ids), []);
});

test("normalizeProject: làm sạch nhóm, không có nhóm thì bỏ trường; groupRings chỉ giữ khi false", () => {
  const base = { ...emptyProject(), dancers: [newDancer("a", "Lan", "#ff5d6c"), newDancer("b", "Mai", "#4f9dff")] };
  const p = normalizeProject({ ...base, groups: [{ id: "g", name: "Nữ", color: "#3ad07a", members: ["a", "b", "x"] }], groupRings: false })!;
  assert.deepEqual(p.groups, [{ id: "g", name: "Nữ", color: "#3ad07a", members: ["a", "b"] }]);
  assert.equal(p.groupRings, false);
  const q = normalizeProject({ ...base, groups: [{ id: "g", members: ["x"] }], groupRings: "có" })!;
  assert.ok(!("groups" in q));
  assert.ok(!("groupRings" in q));
  assert.ok(!("groups" in normalizeProject(base)!));
});

test("xoá vũ công: bỏ khỏi mọi nhóm, nhóm hết người thì bỏ", () => {
  const gs = [G("g1", ["a", "b"]), G("g2", ["b"]), G("g3", ["c"])];
  assert.deepEqual(dropFromGroups(gs, "b"), [G("g1", ["a"]), G("g3", ["c"])]);
  assert.deepEqual(dropFromGroups(gs, "zz"), gs);
  assert.deepEqual(dropFromGroups(undefined, "a"), []);
  assert.deepEqual(gs[0].members, ["a", "b"], "không đột biến đầu vào");
});

test("nhân bản vũ công: bản sao vào cùng nhóm với bản gốc, theo thứ tự danh sách", () => {
  const gs = [G("g1", ["a", "c"]), G("g2", ["b"])];
  const after = ["a", "a2", "a3", "b", "c"];
  assert.deepEqual(cloneIntoGroups(gs, "a", ["a2", "a3"], after), [G("g1", ["a", "a2", "a3", "c"]), G("g2", ["b"])]);
});

test("chọn nhóm: bỏ id chết; chạm lại khi đã chọn đúng nhóm thì bỏ chọn", () => {
  const g = G("g", ["c", "dead", "a"]);
  assert.deepEqual(groupPick(g, ids), ["a", "c"]);
  assert.deepEqual(toggleGroupPick(g, [], ids), ["a", "c"]);
  assert.deepEqual(toggleGroupPick(g, ["b"], ids), ["a", "c"]);
  assert.ok(isGroupPicked(g, ["c", "a"], ids));
  assert.deepEqual(toggleGroupPick(g, ["c", "a"], ids), []);
  assert.ok(!isGroupPicked(g, ["a", "c", "b"], ids), "chọn thừa người thì không tính là đúng nhóm");
  assert.ok(!isGroupPicked(G("x", ["dead"]), [], ids), "nhóm toàn người đã xoá");
});

test("sửa nhóm: tạo, đổi tên, đổi màu, đặt lại, thêm, bớt (bớt hết thì xoá)", () => {
  let gs = addGroup(undefined, G("g1", ["b", "a", "b"], { name: " " }), ids);
  assert.deepEqual(gs, [G("g1", ["a", "b"], { name: "Nhóm 1" })]);
  assert.deepEqual(addGroup(gs, G("g2", ["zz"]), ids), gs, "không ai còn thì không tạo");
  gs = renameGroup(gs, "g1", "  Cánh   A ");
  assert.equal(gs[0].name, "Cánh A");
  assert.equal(renameGroup(gs, "g1", "   ")[0].name, "Cánh A", "tên rỗng thì giữ tên cũ");
  assert.equal(recolorGroup(gs, "g1", "#3AD07A")[0].color, "#3ad07a");
  assert.equal(recolorGroup(gs, "g1", "xanh")[0].color, gs[0].color);
  assert.deepEqual(setGroupMembers(gs, "g1", ["d", "c"], ids)[0].members, ["c", "d"]);
  assert.deepEqual(addToGroup(gs, "g1", ["d", "a"], ids)[0].members, ["a", "b", "d"]);
  assert.deepEqual(removeFromGroup(gs, "g1", ["a"])[0].members, ["b"]);
  assert.deepEqual(removeFromGroup(gs, "g1", ["a", "b"]), []);
});

test("tên và màu mặc định cho nhóm mới; withGroups bỏ trường khi rỗng", () => {
  assert.equal(nextGroupName(undefined), "Nhóm 1");
  assert.equal(nextGroupName([G("x", ["a"], { name: "Nhóm 2" })]), "Nhóm 3");
  assert.equal(nextGroupColor([G("x", ["a"], { color: PALETTE[0] })]), PALETTE[1]);
  const p = { ...emptyProject(), groups: [G("g", ["a"])] } as Project;
  assert.ok(!("groups" in withGroups(p, [])));
  assert.deepEqual(withGroups(emptyProject(), [G("g", ["a"])]).groups, [G("g", ["a"])]);
});

test("viền theo nhóm: người ở nhiều nhóm lấy nhóm đầu; tắt thì rỗng; ảnh/video sơ đồ có màu viền", () => {
  const gs = [G("g1", ["a"], { color: "#111111" }), G("g2", ["a", "b"], { color: "#222222" })];
  assert.deepEqual(groupRingColors({ groups: gs }), { a: "#111111", b: "#222222" });
  assert.deepEqual(groupRingColors({ groups: gs, groupRings: false }), {});
  assert.deepEqual(groupRingColors({}), {});
  const p: Project = {
    ...emptyProject(),
    dancers: [newDancer("a", "Lan", "#ff5d6c"), newDancer("c", "Hoa", "#4f9dff")],
    formations: [{ id: "f", name: "Mở", start: 0, end: 4, pos: { a: [0, 0], c: [1, 0] } }],
    groups: gs,
  };
  const g = planGeometry(p.stage, 1280, 720);
  const dots = planFrame(p, 1, g).dots;
  assert.equal(dots.find((d) => d.id === "a")?.ring, "#111111");
  assert.equal(dots.find((d) => d.id === "c")?.ring, undefined);
  assert.ok(planFrame({ ...p, groupRings: false }, 1, g).dots.every((d) => d.ring === undefined));
});

test("phím Alt 1..9 chọn nhóm thứ n (theo phím vật lý), không đụng phím khác", () => {
  const ctx = (o: Partial<KeyCtx> = {}): KeyCtx => ({
    presenting: false, help: false, hasSelection: false, hasDancers: true, hasBlock: false, formationFocused: false, ...o,
  });
  const key = (k: string, o: Partial<KeyIn> = {}): KeyIn => ({ key: k, ctrl: false, shift: false, alt: true, ...o });
  assert.deepEqual(resolveShortcut(key("1", { code: "Digit1" }), ctx()), { type: "group", n: 1 });
  assert.deepEqual(resolveShortcut(key("¡", { code: "Digit1" }), ctx()), { type: "group", n: 1 }, "Option 1 trên Mac");
  assert.deepEqual(resolveShortcut(key("9"), ctx()), { type: "group", n: 9 });
  assert.deepEqual(resolveShortcut(key("3", { code: "Numpad3" }), ctx()), { type: "group", n: 3 });
  assert.equal(resolveShortcut(key("0", { code: "Digit0" }), ctx()), null);
  assert.equal(resolveShortcut(key("1", { alt: false, code: "Digit1" }), ctx()), null, "1 không Alt vẫn không làm gì");
  assert.equal(resolveShortcut(key("1", { ctrl: true, code: "Digit1" }), ctx()), null, "Ctrl Alt (AltGr) bỏ qua");
  assert.equal(resolveShortcut(key("!", { shift: true, code: "Digit1" }), ctx()), null);
  assert.equal(resolveShortcut(key("1", { code: "Digit1" }), ctx({ presenting: true })), null);
  assert.equal(resolveShortcut(key("1", { code: "Digit1" }), ctx({ hasDancers: false })), null);
  assert.equal(resolveShortcut(key("1", { code: "Digit1", repeat: true }), ctx()), null, "giữ phím không lặp");
  assert.equal(resolveShortcut(key("n"), ctx()), null);
});
