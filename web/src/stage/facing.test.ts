import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normFacing, facingOf, withFacing, turnFacing, setFacing, mirrorFacing, dropFacing, copyFacing, cleanFacing,
  angleDiff, lerpFacing, facingAt, faceVec, faceTri, facingLabel, facingName, FACINGS,
} from "./facing.ts";
import {
  type Formation, type Project, emptyProject, newDancer, ensureFormationAt, addFormationAfter, placeClones,
  removeDancerFromAll, checkInvariants,
} from "./model.ts";
import { normalizeProject } from "./intake.ts";
import { meCue } from "./rehearse.ts";
import { resolveShortcut, type KeyCtx, type KeyIn } from "./ui/keys.ts";
import { planFrame, planGeometry } from "./export/planRender.ts";
import { formationSvg, printHtml } from "./export/printSheet.ts";

const stage = { width: 10, depth: 6 };
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

function two(): Formation[] {
  return [
    { id: "A", name: "Đội hình 1", start: 0, end: 2, pos: { a: [0, 0], b: [1, 0] } },
    { id: "B", name: "Đội hình 2", start: 4, end: 6, pos: { a: [2, 0], b: [1, 2] }, facing: { a: 90 } },
  ];
}

function proj(fs: Formation[] = two()): Project {
  return { ...emptyProject(), dancers: [newDancer("a", "Lan", "#ff5d6c"), newDancer("b", "Mai", "#5dd0ff")], formations: fs };
}

test("normFacing: làm tròn bội 45, đưa về (−180, 180], số hỏng thành 0", () => {
  assert.equal(normFacing(0), 0);
  assert.equal(normFacing(44), 45);
  assert.equal(normFacing(-20), 0);
  assert.equal(Object.is(normFacing(-10), 0), true); // không ra −0
  assert.equal(normFacing(180), 180);
  assert.equal(normFacing(-180), 180);
  assert.equal(normFacing(225), -135);
  assert.equal(normFacing(360 + 90), 90);
  assert.equal(normFacing(-270), 90);
  assert.equal(normFacing(NaN), 0);
  assert.equal(normFacing(Infinity), 0);
  assert.equal(normFacing("90"), 0);
  assert.equal(normFacing(undefined), 0);
  for (const a of FACINGS) assert.equal(normFacing(a), a);
});

test("withFacing bỏ người nhìn khán giả, bảng rỗng thì bỏ trường", () => {
  const f = two()[1];
  assert.equal("facing" in withFacing(f, { a: 0, b: 360 }), false);
  assert.deepEqual(withFacing(f, { a: 46, b: 0 }).facing, { a: 45 });
  assert.equal(facingOf(f, "a"), 90);
  assert.equal(facingOf(f, "b"), 0);
  assert.equal(facingOf(null, "a"), 0);
});

test("quay, đặt, lật gương; không đổi gì thì trả đúng mảng cũ", () => {
  const fs = two();
  const r = turnFacing(fs, "A", ["a"], 45);
  assert.deepEqual(r[0].facing, { a: 45 });
  assert.equal(r[1], fs[1]);
  // quay đủ vòng về 0 thì bỏ trường
  let q = fs;
  for (let i = 0; i < 8; i++) q = turnFacing(q, "A", ["a"], 45);
  assert.equal("facing" in q[0], false);
  assert.equal(turnFacing(fs, "A", ["a"], 0), fs);
  assert.equal(turnFacing(fs, "nope", ["a"], 45), fs);
  assert.equal(turnFacing(fs, "A", ["lạ"], 45), fs); // id không có trong đội hình
  assert.deepEqual(setFacing(fs, "B", ["a", "b"], 180)[1].facing, { a: 180, b: 180 });
  assert.equal(setFacing(fs, "B", ["a"], 90), fs);
  // gương: 90 thành −90, 180 giữ, 0 giữ
  assert.deepEqual(mirrorFacing(fs, "B", ["a", "b"])[1].facing, { a: -90 });
  assert.equal(mirrorFacing(setFacing(fs, "B", ["a"], 180), "B", ["a"])[1].facing!.a, 180);
  // Xoay nhóm R: cộng 90 rồi quay về
  const r2 = turnFacing(fs, "B", ["a"], 90);
  assert.equal(r2[1].facing!.a, 180);
  assert.equal(turnFacing(r2, "B", ["a"], -90)[1].facing!.a, 90);
});

test("dropFacing, copyFacing, cleanFacing", () => {
  const f = two()[1];
  assert.equal("facing" in dropFacing(f, "a"), false);
  assert.equal(dropFacing(f, "b"), f);
  assert.deepEqual(copyFacing(f, "a", ["c", "d"]).facing, { a: 90, c: 90, d: 90 });
  assert.equal(copyFacing(f, "b", ["c"]), f);
  const ids = new Set(["a", "b", "c", "d"]);
  assert.deepEqual(cleanFacing({ a: 92, b: NaN, c: 0, d: "90", e: 45 }, ids), { a: 90 });
  assert.deepEqual(cleanFacing([90], ids), {});
  assert.deepEqual(cleanFacing(null, ids), {});
});

test("angleDiff và lerpFacing đi đường ngắn nhất", () => {
  assert.equal(angleDiff(0, 90), 90);
  assert.equal(angleDiff(135, -135), 90);
  assert.equal(angleDiff(-135, 135), -90);
  assert.equal(angleDiff(0, 180), 180);
  assert.equal(lerpFacing(0, 90, 0.5), 45);
  assert.equal(lerpFacing(135, -135, 0.5), 180);
  assert.equal(lerpFacing(0, 180, 0.5), 90); // quay lưng đúng 180: theo chiều kim đồng hồ
  assert.equal(lerpFacing(-90, 90, 1), 90);
  assert.equal(lerpFacing(10, 20, -1), 10);
});

test("facingAt: đứng thì đúng góc, chuyển thì xoay dần, ngoài bài giữ góc khối gần nhất", () => {
  const fs = two();
  assert.equal(facingAt([], "a", 1), 0);
  assert.equal(facingAt(fs, "a", 1), 0);
  assert.equal(facingAt(fs, "a", 5), 90);
  assert.ok(close(facingAt(fs, "a", 3), 45)); // giữa khoảng chuyển, smoothstep(0.5) = 0.5
  assert.ok(facingAt(fs, "a", 2.5) > 0 && facingAt(fs, "a", 2.5) < 45);
  assert.equal(facingAt(fs, "a", 9), 90);
  const lead = [{ ...fs[1], start: 2 }];
  assert.equal(facingAt(lead, "a", 0), 90);
  assert.equal(facingAt(fs, "b", 3), 0);
});

test("faceVec, faceTri và tên hướng", () => {
  const [x0, z0] = faceVec(0);
  assert.ok(close(x0, 0) && close(z0, 1)); // nhìn khán giả là +Z
  const [x9, z9] = faceVec(90);
  assert.ok(close(x9, -1) && close(z9, 0)); // quay phải của người múa: về −X
  const [tip, l, r] = faceTri(0, 0.3);
  assert.ok(close(tip[0], 0) && close(tip[1], 0.45));
  assert.ok(close(l[1], r[1]) && close(l[0], -r[0]));
  assert.equal(facingLabel(180), "quay lưng");
  assert.equal(facingLabel(-180), "quay lưng");
  assert.equal(facingLabel(90), "quay phải");
  assert.equal(facingLabel(-90), "quay trái");
  assert.equal(facingLabel(45), "chéo phải");
  assert.equal(facingLabel(0), "");
  assert.equal(facingName(0), "nhìn khán giả");
});

test("model: tạo đội hình giữa khoảng chuyển lấy góc đang xoay, + Đội hình chép hướng mặt", () => {
  const fs = two();
  const r = ensureFormationAt(fs, 3, ["a", "b"], stage, "N", 1);
  assert.ok(r.created);
  assert.deepEqual(r.formations.find((f) => f.id === "N")!.facing, { a: 45 });
  const r2 = addFormationAfter(fs, 5, ["a", "b"], stage, "M", 2, 2);
  assert.deepEqual(r2.formations.find((f) => f.id === "M")!.facing, { a: 90 });
});

test("model: nhân bản chép hướng mặt, xoá người thì xoá hướng mặt, kiểm bất biến", () => {
  const fs = two();
  const c = placeClones(fs, "a", ["a2"], stage);
  assert.equal(c[1].facing!.a2, 90);
  assert.equal(c[0].facing, undefined);
  const rm = removeDancerFromAll(fs, "a");
  assert.equal("facing" in rm[1], false);
  assert.deepEqual(checkInvariants(proj()), []);
  const bad = proj([two()[0], { ...two()[1], facing: { a: 30, b: 0, z: 90 } }]);
  assert.ok(checkInvariants(bad).length >= 3);
});

test("intake: nạp tệp làm sạch hướng mặt", () => {
  const p = normalizeProject({
    version: 1, title: "T", musicDuration: 10,
    dancers: [{ id: "a", name: "Lan", color: "#fff" }, { id: "b", name: "Mai", color: "#000" }],
    formations: [
      { id: "A", name: "A", start: 0, end: 2, pos: { a: [0, 0], b: [1, 0] }, facing: { a: 170, b: "x", zz: 90 } },
      { id: "B", name: "B", start: 4, end: 6, pos: { a: [0, 0], b: [1, 0] }, facing: { a: 0, b: NaN } },
      { id: "C", name: "C", start: 8, end: 9, pos: { a: [0, 0], b: [1, 0] }, facing: "bậy" },
    ],
  })!;
  assert.deepEqual(p.formations[0].facing, { a: 180 });
  assert.equal("facing" in p.formations[1], false);
  assert.equal("facing" in p.formations[2], false);
  assert.deepEqual(checkInvariants(p), []);
});

test("Trình chiếu: dòng nhắc Tôi là ai có hướng mặt", () => {
  const fs = turnFacing(two(), "A", ["a"], 180);
  const desc = () => "giữa";
  assert.match(meCue(fs, "a", 1, null, desc)!, /quay lưng/);
  assert.match(meCue(fs, "a", -1, null, desc)!, /Chuẩn bị · vào chỗ: giữa · quay lưng/);
  assert.match(meCue(fs, "a", 3, null, desc)!, /đi tới.* · quay phải$/);
  assert.doesNotMatch(meCue(fs, "b", 1, null, desc)!, /quay/);
});

test("phím Q quay mặt, Shift Q quay ngược; F vẫn là Trình chiếu", () => {
  const ctx = (o: Partial<KeyCtx> = {}): KeyCtx => ({
    presenting: false, help: false, hasSelection: true, hasDancers: true, hasBlock: false, formationFocused: false, ...o,
  });
  const key = (k: string, o: Partial<KeyIn> = {}): KeyIn => ({ key: k, ctrl: false, shift: false, alt: false, ...o });
  assert.deepEqual(resolveShortcut(key("q"), ctx()), { type: "turn", dir: 1 });
  assert.deepEqual(resolveShortcut(key("Q", { shift: true }), ctx()), { type: "turn", dir: -1 });
  assert.equal(resolveShortcut(key("q"), ctx({ hasDancers: false })), null);
  assert.equal(resolveShortcut(key("q", { repeat: true } as Partial<KeyIn>), ctx()), null);
  assert.deepEqual(resolveShortcut(key("f"), ctx()), { type: "present" });
});

test("xuất: sơ đồ video có góc mặt, tờ in có tam giác và chữ LƯNG", () => {
  const p = proj(setFacing(two(), "A", ["a"], 180));
  const g = planGeometry(p.stage, 1280, 720);
  const f0 = planFrame(p, 1, g);
  assert.equal(f0.dots.find((d) => d.id === "a")!.face, 180);
  assert.equal(f0.dots.find((d) => d.id === "b")!.face, undefined);
  const svg = formationSvg(p, 0);
  assert.match(svg, /<polygon /);
  assert.match(svg, /LƯNG/);
  assert.doesNotMatch(formationSvg(proj(two().map((f) => withFacing(f, {}))), 1), /<polygon /);
  const h = printHtml(p, { describe: () => "giữa" });
  assert.match(h, /giữa · <b>quay lưng<\/b>/);
});
