import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROP_MAX, PROP_MIN, PROP_NAME_MAX, PROP_PRESETS, addProp, cleanProps, fitPropsToStage, moveProp, nextMarkNumber,
  propCorners, propDist, propFromPreset, removeProp, renameProp, resizeProp, withProps,
} from "./props.ts";
import { type Formation, type Project, type StageProp, checkInvariants, emptyProject, newDancer } from "./model.ts";
import { normalizeProject } from "./intake.ts";
import { findIssues, isSoft, propIssues } from "./checks.ts";
import { fixAll } from "./fixes.ts";
import { type Ctx2D, drawPlanFrame, planFrame, planGeometry } from "./export/planRender.ts";
import { formationSvg } from "./export/printSheet.ts";

const stage = { width: 10, depth: 6 };
const P = (id: string, kind: StageProp["kind"], x: number, z: number, w = 1, d = w, name = id): StageProp => ({ id, name, kind, x, z, w, d });
const F = (id: string, start: number, end: number, pos: Formation["pos"]): Formation => ({ id, name: id, start, end, pos });
const ds = [{ id: "a", name: "Hương" }, { id: "b", name: "Lan" }];

test("cleanProps: bỏ món hỏng, trùng id, loại lạ thành hộp, kẹp kích thước và vị trí, cắt tên", () => {
  const raw = [
    P("b", "box", 1, 1, 2, 1, "  Bục   lớn "),
    null,
    "rác",
    { id: 5, kind: "box", x: 0, z: 0, w: 1, d: 1 },
    { id: "", kind: "box", x: 0, z: 0, w: 1, d: 1 },
    P("b", "round", 0, 0, 1, 1, "trùng id"),
    { id: "lạ", name: "Cột", kind: "tam giác", x: 99, z: -99, w: 0, d: 500 },
    { id: "nan", kind: "round", x: NaN, z: Infinity, w: "x", d: 3, name: "" },
    { id: "dài", kind: "mark", x: 0, z: 0, w: 0.4, d: 0.4, name: "x".repeat(80) },
    { id: "xoay", kind: "box", x: 0, z: 0, w: 1, d: 2, rot: -90 },
    { id: "xoay0", kind: "box", x: 0, z: 0, w: 1, d: 2, rot: 720 },
  ];
  const out = cleanProps(raw, stage);
  assert.deepEqual(out.map((o) => o.id), ["b", "lạ", "nan", "dài", "xoay", "xoay0"]);
  assert.equal(out[0].name, "Bục lớn");
  const odd = out[1];
  assert.equal(odd.kind, "box");
  assert.equal(odd.w, PROP_MIN);
  assert.equal(odd.d, PROP_MAX);
  assert.deepEqual([odd.x, odd.z], [5 + 1.5, -3], "kẹp vào sân cộng cánh gà");
  const nan = out[2];
  assert.deepEqual([nan.x, nan.z], [0, 0]);
  assert.equal(nan.w, nan.d, "món tròn: sâu bằng rộng");
  assert.equal(nan.name, "Đạo cụ");
  assert.equal(out[3].name.length, PROP_NAME_MAX);
  assert.equal(out[4].rot, 270);
  assert.ok(!("rot" in out[5]), "góc 0 thì bỏ trường");
  assert.deepEqual(cleanProps("rác", stage), []);
  for (const o of out) assert.ok(Number.isFinite(o.x + o.z + o.w + o.d));
});

test("normalizeProject: đọc đạo cụ, không có thì bỏ trường, tệp cũ không đổi", () => {
  const p = normalizeProject({ ...emptyProject(), props: [P("m", "round", 20, 0, 0.4)] }) as Project;
  assert.equal(p.props?.length, 1);
  assert.equal(p.props![0].x, 5 + 1.5);
  assert.deepEqual(checkInvariants(p), []);
  const q = normalizeProject({ ...emptyProject(), props: [null, "x"] }) as Project;
  assert.ok(!("props" in q));
  const r = normalizeProject(emptyProject()) as Project;
  assert.ok(!("props" in r));
});

test("thu nhỏ sân: kéo đạo cụ vào trong, không đổi gì thì giữ đúng mảng cũ", () => {
  const props = [P("a", "box", 6, 2.5), P("b", "mark", 0, 0)];
  const small = { width: 6, depth: 4 };
  const out = fitPropsToStage(props, small)!;
  assert.deepEqual([out[0].x, out[0].z], [3 + 1.5, 2]);
  assert.equal(out[1], props[1], "món không đổi giữ nguyên đối tượng");
  assert.equal(fitPropsToStage(props, { width: 20, depth: 10 }), props);
  assert.equal(fitPropsToStage(undefined, small), undefined);
  const p = { ...emptyProject(), props: out, stage: small };
  assert.deepEqual(checkInvariants(p).filter((e) => e.startsWith("đạo cụ")), []);
});

test("thêm theo mẫu, dời, đổi tên, đổi cỡ, xoá; mốc sàn tự đánh số", () => {
  const mark = PROP_PRESETS.find((x) => x.kind === "mark")!;
  const riser = PROP_PRESETS.find((x) => x.key === "riser")!;
  let ps = addProp(undefined, propFromPreset(undefined, mark, "m1", stage), stage);
  assert.equal(ps[0].name, "1");
  ps = addProp(ps, propFromPreset(ps, mark, "m2", stage), stage);
  assert.equal(ps[1].name, "2");
  assert.ok(Math.hypot(ps[0].x - ps[1].x, ps[0].z - ps[1].z) >= 1 - 1e-9, "món mới không đặt chồng lên món cũ");
  ps = removeProp(ps, "m1");
  assert.equal(nextMarkNumber(ps), 1, "lấp số đã xoá");
  ps = addProp(ps, propFromPreset(ps, riser, "r", stage), stage);
  const r = ps.find((o) => o.id === "r")!;
  assert.deepEqual([r.kind, r.w, r.d, r.name], ["box", 2, 1, "Bục"]);
  ps = moveProp(ps, "r", 100, 1, stage);
  assert.equal(ps.find((o) => o.id === "r")!.x, 6.5);
  ps = moveProp(ps, "r", NaN, 1, stage);
  assert.equal(ps.find((o) => o.id === "r")!.x, 6.5);
  ps = renameProp(ps, "r", "  Bục hát ");
  assert.equal(ps.find((o) => o.id === "r")!.name, "Bục hát");
  ps = renameProp(ps, "r", "   ");
  assert.equal(ps.find((o) => o.id === "r")!.name, "Bục hát", "tên rỗng thì giữ tên cũ");
  ps = resizeProp(ps, "r", { w: 50, rot: 450 }, stage);
  assert.deepEqual([ps.find((o) => o.id === "r")!.w, ps.find((o) => o.id === "r")!.rot], [PROP_MAX, 90]);
  const p = withProps(emptyProject(), []);
  assert.ok(!("props" in p));
  assert.equal(withProps(emptyProject(), ps).props, ps);
});

test("hình học: khoảng cách tới hộp xoay và tới hình tròn", () => {
  const b = P("b", "box", 0, 0, 2, 1);
  assert.ok(propDist(b, [0, 0]) < 0);
  assert.ok(Math.abs(propDist(b, [2, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(propDist(b, [0, 1]) - 0.5) < 1e-9);
  const r = { ...b, rot: 90 };
  assert.ok(Math.abs(propDist(r, [0, 2]) - 1) < 1e-9, "xoay 90°: cạnh dài nằm dọc");
  assert.ok(Math.abs(propDist(r, [1, 0]) - 0.5) < 1e-9);
  const c = propCorners(r);
  assert.ok(c.every(([x, z]) => Math.abs(Math.abs(x) - 0.5) < 1e-9 && Math.abs(Math.abs(z) - 1) < 1e-9));
  const m = P("m", "round", 1, 1, 0.4);
  assert.ok(Math.abs(propDist(m, [1, 2]) - 0.8) < 1e-9);
});

test("cảnh báo đạo cụ: đứng trong, đi xuyên thì báo; đi vòng, mốc sàn thì không", () => {
  const riser = P("r", "box", 0, 0, 2, 1, "Bục");
  const fs = [
    F("A", 0, 2, { a: [-3, 0], b: [0, 0.2] }), // Lan đứng trên bục
    F("B", 4, 6, { a: [3, 0], b: [0, 2] }), // Hương đi xuyên bục; Lan bước xuống (đầu ở trong: không báo thêm)
    F("C", 8, 10, { a: [3, -2.5], b: [-3, 2] }), // Hương đi ra sau bục, Lan đi phía trước: vòng qua
  ];
  const w = propIssues(fs, ds, [riser]);
  const inside = w.filter((x) => x.from === null);
  const through = w.filter((x) => x.from !== null);
  assert.equal(inside.length, 1);
  assert.deepEqual([inside[0].formation, inside[0].ids], ["A", ["b"]]);
  assert.match(inside[0].msg, /Lan đứng trong Bục/);
  assert.equal(through.length, 1, "chỉ Hương đi xuyên, một lần");
  assert.deepEqual([through[0].from, through[0].formation, through[0].ids], ["A", "B", ["a"]]);
  assert.match(through[0].msg, /Hương đi xuyên Bục khi sang B/);
  assert.ok(through[0].t > 2 && through[0].t < 4);
  assert.ok(through[0].t > 2.5 && through[0].t < 3, "lúc chạm mép bục, trước giữa khoảng chuyển");
  // mốc sàn, người ẩn: không báo
  assert.deepEqual(propIssues(fs, ds, [{ ...riser, kind: "mark" }]), []);
  assert.deepEqual(propIssues(fs, ds.map((d) => ({ ...d, hidden: true })), [riser]), []);
  assert.deepEqual(propIssues(fs, ds, undefined), []);
  // micro nhỏ giữa đường thẳng cũng không lọt khi lấy mẫu
  const mic = P("m", "round", 0, 0, 0.1);
  const line = [F("A", 0, 1, { a: [-4, 0], b: [-4, 2] }), F("B", 2, 3, { a: [4, 0], b: [-4, 2] })];
  assert.equal(propIssues(line, ds, [mic]).length, 1);
});

test("findIssues gộp cảnh báo đạo cụ (nhẹ); Sửa tất cả vẫn dừng, không vỡ", () => {
  const riser = P("r", "box", 0, 0, 2, 1, "Bục");
  const fs = [F("A", 0, 2, { a: [-3, 0], b: [0, 0] }), F("B", 4, 6, { a: [3, 0], b: [0, 2] })];
  const all = findIssues(fs, ds, stage, null, [riser]);
  const pw = all.filter((w) => w.kind === "prop");
  assert.equal(pw.length, 2);
  assert.ok(pw.every((w) => isSoft(w.kind)));
  assert.equal(findIssues(fs, ds, stage, null).filter((w) => w.kind === "prop").length, 0, "không truyền đạo cụ thì như cũ");
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].t <= all[i].t, "xếp theo giờ");
  const fixed = fixAll(fs, ds, stage, null);
  assert.equal(fixed.length, fs.length);
});

test("bản vẽ: khung video và bản in có đạo cụ, mốc sàn có số", () => {
  const p: Project = {
    ...emptyProject(),
    dancers: [newDancer("a", "Hương", "#ff0000")],
    formations: [F("A", 0, 4, { a: [-2, 0] })],
    props: [P("r", "box", 0, 0, 2, 1, "Bục"), P("m", "round", 2, 1, 0.4, 0.4, "Micro đứng"), P("k", "mark", -1, 1, 0.4, 0.4, "7")],
  };
  const g = planGeometry(p.stage, 1280, 720);
  const fr = planFrame(p, 2, g);
  assert.equal(fr.props?.length, 3);
  assert.equal(fr.props![0].pts?.length, 4);
  assert.equal(planFrame({ ...p, props: undefined }, 2, g).props, undefined);
  const texts: string[] = [];
  const noop = () => {};
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop, stroke: noop,
    fillText: (s) => void texts.push(s), setLineDash: noop, save: noop, restore: noop, rect: noop, clip: noop,
  };
  drawPlanFrame(ctx, g, fr);
  for (const s of ["Bục", "Micro đứng", "7", "Hương"]) assert.ok(texts.includes(s), s);
  assert.equal(ctx.globalAlpha, 1);
  const svg = formationSvg(p, 0);
  assert.ok(svg.includes(">Bục<") && svg.includes(">Micro đứng<") && svg.includes(">7<"));
  assert.ok(svg.includes("<polygon"));
  // đạo cụ vẽ trước (dưới) chấm người
  assert.ok(svg.indexOf(">Bục<") < svg.indexOf("Hương") || !svg.includes("Hương"));
});

test("thêm đạo cụ mới không đè lên bục đã có", () => {
  const stage = { width: 10, depth: 6 };
  const box = PROP_PRESETS.find((x) => x.kind === "box")!, mic = PROP_PRESETS.find((x) => x.kind === "round")!;
  let ps = addProp(undefined, propFromPreset(undefined, box, "b", stage), stage);
  for (const id of ["m1", "m2", "m3"]) ps = addProp(ps, propFromPreset(ps, mic, id, stage), stage);
  const b = ps[0];
  for (const o of ps.slice(1)) assert.ok(propDist(b, [o.x, o.z]) > o.w / 2, `${o.id} đè lên bục`);
  for (const o of ps) assert.ok(Math.abs(o.x) <= 5 && Math.abs(o.z) <= 3);
});
