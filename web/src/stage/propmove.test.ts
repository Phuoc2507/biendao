// Đạo cụ dời theo đội hình: chỗ riêng (Formation.propPos), trượt lúc chuyển,
// lật gương, đọc tệp cũ, cảnh báo va chạm theo chỗ động, xếp nhãn không chồng.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearPropSpots, cleanPropPos, layoutPropLabels, lerpProp, mirrorPropsIn, propIn, propMoves, propsAt, propsIn,
  rotatePropAll, seedPropSpots, setPropSpot, shiftPropAll,
} from "./props.ts";
import {
  type Formation, type Project, type StageProp, addFormationAfter, checkInvariants, emptyProject, ensureFormationAt,
  fitFormationsToStage, newDancer, smoothstep,
} from "./model.ts";
import { normalizeProject } from "./intake.ts";
import { propIssues } from "./checks.ts";
import { planFrame, planGeometry } from "./export/planRender.ts";
import { formationSvg } from "./export/printSheet.ts";

const stage = { width: 10, depth: 6 };
const P = (id: string, kind: StageProp["kind"], x: number, z: number, w = 1, d = w, name = id): StageProp => ({ id, name, kind, x, z, w, d });
const F = (id: string, start: number, end: number, pos: Formation["pos"], propPos?: Formation["propPos"]): Formation =>
  ({ id, name: id, start, end, pos, ...(propPos && { propPos }) });
const ds = [{ id: "a", name: "Hương" }, { id: "b", name: "Lan" }];
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("propsAt: không ai có chỗ riêng thì trả đúng mảng gốc; trước, trong, sau, giữa khoảng chuyển", () => {
  const mic = P("m", "round", 0, 0, 0.4);
  const riser = P("r", "box", 2, 1, 2, 1, "Bục");
  const props = [mic, riser];
  const still = [F("A", 0, 2, {}), F("B", 4, 6, {})];
  assert.equal(propsAt(still, props, 3), props, "đứng yên cả bài: không tạo mảng mới");
  assert.equal(propsAt([], props, 3), props);
  assert.ok(!propMoves(still));

  const fs = [F("A", 1, 2, {}, { m: { x: -3, z: 1 } }), F("B", 4, 6, {}), F("C", 8, 9, {}, { m: { x: 3, z: -1 }, r: { x: 2, z: 1, rot: 90 } })];
  assert.ok(propMoves(fs) && propMoves(fs, "m") && propMoves(fs, "r"));
  // trước đội hình đầu: như đội hình đầu; sau cuối: như cuối
  assert.deepEqual([propsAt(fs, props, 0)[0].x, propsAt(fs, props, 0)[0].z], [-3, 1]);
  assert.deepEqual([propsAt(fs, props, 20)[0].x, propsAt(fs, props, 20)[0].z], [3, -1]);
  assert.equal(propsAt(fs, props, 20)[1].rot, 90);
  // đội hình B không ghi gì: về chỗ gốc
  assert.deepEqual(propsAt(fs, props, 5)[0], mic);
  assert.equal(propsAt(fs, props, 5)[1], riser);
  // giữa A và B: smoothstep như người
  const u = (2.5 - 2) / (4 - 2), s = smoothstep(u);
  const m = propsAt(fs, props, 2.5)[0];
  near(m.x, -3 + 3 * s);
  near(m.z, 1 - s);
  // giữa khoảng chuyển B sang C: bục xoay dần từ 0 tới 90
  const r = propsAt(fs, props, 7)[1];
  near(r.rot!, 45);
});

test("lerpProp: góc đi đường ngắn nhất, món tròn không có góc", () => {
  const a = { ...P("r", "box", 0, 0, 2, 1), rot: 350 };
  const b = { ...P("r", "box", 0, 0, 2, 1), rot: 10 };
  near(lerpProp(a, b, 0.5).rot! % 360, 0);
  assert.equal(lerpProp(P("m", "round", 0, 0), P("m", "round", 2, 0), 0.5).rot, undefined);
  assert.equal(lerpProp(a, b, 0), a);
  assert.equal(lerpProp(a, b, 1), b);
});

test("setPropSpot: làm tròn, kẹp vào sân, trùng chỗ gốc thì xoá; propIn đọc lại", () => {
  const riser = { ...P("r", "box", 0, 0, 2, 1, "Bục"), rot: 90 };
  let fs = [F("A", 0, 2, {}), F("B", 4, 6, {})];
  fs = setPropSpot(fs, "B", riser, { x: 1.234, z: 99, rot: 90 }, stage);
  assert.deepEqual(fs[1].propPos, { r: { x: 1.23, z: 3 } }, "góc như gốc thì không ghi; z kẹp vào mép sân");
  assert.equal(fs[0].propPos, undefined);
  const same = setPropSpot(fs, "B", riser, { x: 1.23, z: 3, rot: 90 }, stage);
  assert.equal(same, fs, "không đổi gì thì giữ mảng cũ");
  fs = setPropSpot(fs, "B", riser, { x: 1.23, z: 3, rot: 0 }, stage);
  assert.deepEqual(fs[1].propPos, { r: { x: 1.23, z: 3, rot: 0 } }, "góc 0 khác góc gốc 90: phải ghi");
  assert.equal(propIn(fs[1], riser).rot, undefined);
  fs = setPropSpot(fs, "B", riser, { x: 0, z: 0, rot: 90 }, stage);
  assert.ok(!("propPos" in fs[1]), "về đúng chỗ gốc: bỏ hẳn trường");
  assert.equal(propIn(fs[1], riser), riser);
});

test("Giữ yên cả bài (clearPropSpots), dời cả bài (shiftPropAll), xoay cả bài (rotatePropAll)", () => {
  const mic = P("m", "round", 0, 0, 0.4);
  const riser = P("r", "box", 2, 0, 2, 1);
  const fs = [F("A", 0, 2, {}, { m: { x: -1, z: 0 }, r: { x: 3, z: 0, rot: 90 } }), F("B", 4, 6, {}, { m: { x: 4.5, z: 2 } })];
  const c = clearPropSpots(fs, "m");
  assert.deepEqual(c[0].propPos, { r: { x: 3, z: 0, rot: 90 } });
  assert.ok(!("propPos" in c[1]));
  assert.equal(clearPropSpots(c, "m"), c, "không còn gì để xoá: giữ mảng cũ");

  // dời cả bài 1 m sang phải: gốc và mọi chỗ riêng cùng lệch, món ở mép (4.5 + 1) kẹp vào sân + cánh gà
  const r = shiftPropAll([mic, riser], fs, "m", 1, 0, stage);
  assert.deepEqual([r.props[0].x, r.props[0].z], [1, 0]);
  assert.equal(r.props[1], riser);
  assert.deepEqual(r.formations[0].propPos!.m, { x: 0, z: 0 });
  assert.deepEqual(r.formations[1].propPos!.m, { x: 5.5, z: 2 });
  assert.deepEqual(r.formations[0].propPos!.r, fs[0].propPos!.r, "món khác không đổi");

  const t = rotatePropAll([mic, riser], fs, "r", 90, stage);
  assert.equal(t.props[1].rot, 90);
  assert.equal(t.formations[0].propPos!.r.rot, 180);
  assert.equal(rotatePropAll([mic, riser], fs, "m", 90, stage).formations, fs, "món tròn không xoay");
});

test("lật gương cả đội: đạo cụ đi theo đội hình lật x và góc; món đứng yên cả bài không lật", () => {
  const mic = P("m", "round", 2, 1, 0.4);
  const riser = { ...P("r", "box", 1, -1, 2, 1), rot: 30 };
  const tape = P("k", "mark", 3, 0, 0.4);
  const fs = [F("A", 0, 2, {}, { r: { x: 2, z: 0 } }), F("B", 4, 6, {})];
  const out = mirrorPropsIn(fs, "B", [mic, riser, tape], stage);
  // B: bục đang ở chỗ gốc (1, -1, 30°) mà có đi theo đội hình nên lật thành (-1, -1, -30° = 330°)
  assert.deepEqual(out[1].propPos, { r: { x: -1, z: -1, rot: 330 } });
  assert.equal(out[0], fs[0], "đội hình khác không đụng");
  const out2 = mirrorPropsIn(out, "A", [mic, riser, tape], stage);
  assert.deepEqual(out2[0].propPos, { r: { x: -2, z: 0, rot: 330 } });
  // lật hai lần thì về như cũ (chỗ riêng trùng gốc thì bỏ)
  assert.ok(!("propPos" in mirrorPropsIn(out, "B", [mic, riser, tape], stage)[1]));
});

test("khối mới tạo giữa khoảng chuyển nhận chỗ đạo cụ đang trượt dở; Thêm đội hình chép chỗ của đội hình trước", () => {
  const mic = P("m", "round", 0, 0, 0.4);
  const fs = [F("A", 0, 2, { a: [0, 0] }, { m: { x: -2, z: 0 } }), F("B", 4, 6, { a: [0, 0] }, { m: { x: 2, z: 0 } })];
  const r = ensureFormationAt(fs, 3, ["a"], stage, "N", 1);
  const seeded = seedPropSpots(fs, r.formations, "N", [mic], 3, stage);
  const n = seeded.find((f) => f.id === "N")!;
  assert.ok(!("propPos" in n), "giữa đường đúng tâm sân, trùng chỗ gốc nên bỏ trường");
  // kiểm lại ở chỗ khác chỗ gốc
  const r2 = ensureFormationAt(fs, 2.5, ["a"], stage, "N", 0.5);
  const s2 = seedPropSpots(fs, r2.formations, "N", [mic], 2.5, stage);
  const n2 = s2.find((f) => f.id === "N")!;
  const want = -2 + 4 * smoothstep(0.25);
  near(n2.propPos?.m.x ?? 0, Math.round(want * 100) / 100);
  // hình đi của đạo cụ không đổi sau khi chèn khối (tại chính giây chèn)
  near(propsAt(s2, [mic], 2.5)[0].x, Math.round(want * 100) / 100);
  // đứng yên cả bài: không ghi gì
  const still = [F("A", 0, 2, { a: [0, 0] }), F("B", 4, 6, { a: [0, 0] })];
  const r3 = ensureFormationAt(still, 3, ["a"], stage, "N", 1);
  assert.equal(seedPropSpots(still, r3.formations, "N", [mic], 3, stage), r3.formations);

  const a = addFormationAfter(fs, 5, ["a"], stage, "C", 2, 1);
  assert.deepEqual(a.formations.find((f) => f.id === "C")!.propPos, { m: { x: 2, z: 0 } });
  assert.notEqual(a.formations.find((f) => f.id === "C")!.propPos, fs[1].propPos, "chép, không dùng chung đối tượng");
});

test("thu nhỏ sân kẹp cả chỗ riêng của đạo cụ; checkInvariants bắt chỗ lạ, hỏng, ngoài sân", () => {
  const fs = [F("A", 0, 2, {}, { m: { x: 6, z: 0 } })];
  const out = fitFormationsToStage(fs, { width: 6, depth: 4 });
  assert.deepEqual(out[0].propPos, { m: { x: 4.5, z: 0 } });
  assert.equal(fitFormationsToStage(out, { width: 6, depth: 4 }), out);

  const p: Project = { ...emptyProject(), stage, props: [P("m", "round", 0, 0, 0.4)], formations: [F("A", 0, 2, {}, { m: { x: 1, z: 1 } })] };
  assert.deepEqual(checkInvariants(p), []);
  const bad: Project = {
    ...p,
    formations: [F("A", 0, 2, {}, { m: { x: 99, z: 0 }, lạ: { x: 0, z: 0 } }), F("B", 3, 4, {}, { m: { x: NaN, z: 0 } })],
  };
  const errs = checkInvariants(bad).join("\n");
  assert.match(errs, /chỗ đạo cụ lạ/);
  assert.match(errs, /ngoài sân/);
  assert.match(errs, /chỗ đạo cụ hỏng/);
});

test("đọc tệp: dự án cũ không có propPos vẫn mở như cũ; propPos hỏng, id lạ thì bỏ", () => {
  const dancers = [newDancer("a", "Hương", "#ff0000")];
  const old = normalizeProject({
    ...emptyProject(), dancers, props: [P("m", "round", 1, 1, 0.4)], formations: [F("A", 0, 2, { a: [0, 0] })],
  }) as Project;
  assert.ok(!("propPos" in old.formations[0]));
  assert.deepEqual(checkInvariants(old), []);

  const raw = {
    ...emptyProject(), dancers, props: [P("m", "round", 1, 1, 0.4), P("r", "box", 0, 0, 2, 1)],
    formations: [
      { ...F("A", 0, 2, { a: [0, 0] }), propPos: { m: { x: 2.346, z: 99 }, r: { x: 0, z: 0, rot: 90 }, lạ: { x: 0, z: 0 }, hỏng: 5 } },
      { ...F("B", 3, 4, { a: [0, 0] }), propPos: { m: { x: "x", z: 0 }, r: { x: 0, z: 0 } } },
      { ...F("C", 5, 6, { a: [0, 0] }), propPos: "rác" },
      { ...F("D", 7, 8, { a: [0, 0] }), propPos: { m: { x: 1, z: 1, rot: 45 } } },
    ],
  };
  const p = normalizeProject(raw) as Project;
  assert.deepEqual(p.formations[0].propPos, { m: { x: 2.35, z: 3 }, r: { x: 0, z: 0, rot: 90 } });
  assert.ok(!("propPos" in p.formations[1]), "số hỏng và chỗ trùng gốc: bỏ cả trường");
  assert.ok(!("propPos" in p.formations[2]));
  assert.ok(!("propPos" in p.formations[3]), "món tròn không có góc riêng: trùng gốc");
  assert.deepEqual(checkInvariants(p), []);
  // xoá đạo cụ khỏi danh sách thì chỗ riêng của nó cũng rơi khi đọc lại
  const q = normalizeProject({ ...raw, props: [P("r", "box", 0, 0, 2, 1)] }) as Project;
  assert.deepEqual(q.formations[0].propPos, { r: { x: 0, z: 0, rot: 90 } });
  assert.equal(cleanPropPos({}, [], stage), undefined);
});

test("cảnh báo theo chỗ động: đứng trong bục ở đội hình có bục dời tới, bục dời qua người đứng yên", () => {
  const riser = P("r", "box", 0, 0, 2, 1, "Bục");
  // A: bục ở tâm, B: bục dời sang trái nơi Lan đang đứng
  const fs = [
    F("A", 0, 2, { a: [3, 2], b: [-3, 0] }),
    F("B", 4, 6, { a: [3, 2], b: [-3, 0] }, { r: { x: -3, z: 0 } }),
  ];
  const w = propIssues(fs, ds, [riser]);
  const inside = w.filter((x) => x.from === null);
  assert.equal(inside.length, 1);
  assert.deepEqual([inside[0].formation, inside[0].ids], ["B", ["b"]]);
  assert.match(inside[0].msg, /Lan đứng trong Bục/);
  // Lan đứng trong ở B (đầu cuối) nên lúc chuyển không báo thêm; cho bục đi qua rồi dừng xa hơn
  const fs2 = [
    F("A", 0, 2, { a: [3, 2], b: [-1.5, 0] }),
    F("B", 4, 6, { a: [3, 2], b: [-1.5, 0] }, { r: { x: -4, z: 0 } }),
  ];
  const w2 = propIssues(fs2, ds, [riser]);
  assert.equal(w2.length, 1);
  assert.equal(w2[0].from, "A");
  assert.match(w2[0].msg, /Bục dời qua chỗ Lan khi sang B/);
  assert.ok(w2[0].t > 2 && w2[0].t < 4);
  // đạo cụ và người cùng đi một hướng, giữ khoảng cách: không báo
  const fs3 = [
    F("A", 0, 2, { a: [3, 2], b: [-2, 0] }),
    F("B", 4, 6, { a: [3, 2], b: [2, 0] }, { r: { x: 4, z: 0 } }),
  ];
  assert.deepEqual(propIssues(fs3, ds, [riser]), []);
  // người đi tới chỗ bục cũ trong lúc bục đã rời: không báo; đứng yên cả bài như cũ thì sẽ báo
  const fs4 = [
    F("A", 0, 2, { a: [3, 2], b: [-3, 0] }, { r: { x: 0, z: -2 } }),
    F("B", 4, 6, { a: [3, 2], b: [3, 0] }, { r: { x: 0, z: -2 } }),
  ];
  assert.deepEqual(propIssues(fs4, ds, [riser]), []);
  const fs4still = fs4.map((f) => ({ ...f, propPos: undefined }));
  assert.equal(propIssues(fs4still, ds, [riser]).length, 1);
});

test("xếp nhãn: hai món sát nhau không chồng chữ, hết chỗ thì ẩn, món ưu tiên giữ tên", () => {
  const id = (v: number) => v;
  const a = P("a", "round", 0, 0, 0.4, 0.4, "Micro A");
  const b = P("b", "round", 0.3, 0, 0.4, 0.4, "Micro B");
  const L = layoutPropLabels([a, b], id, id, 0.2);
  const la = L.get("a")!, lb = L.get("b")!;
  assert.ok(la && lb, "đủ chỗ cho cả hai");
  const w = (o: StageProp) => o.name.length * 0.2 * 0.58 + 0.04;
  const apart = Math.abs(la.x - lb.x) >= (w(a) + w(b)) / 2 - 1e-9 || Math.abs(la.y - lb.y) >= 0.2 * 1.15 - 1e-9;
  assert.ok(apart, "hai hộp chữ không đè nhau");
  // chụm năm món tên dài vào một chỗ: có món phải ẩn tên; món ưu tiên luôn có tên
  const pile = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => P(`p${i}`, "round", 0.01 * i, 0, 0.2, 0.2, "Micro đứng rất dài"));
  const L2 = layoutPropLabels(pile, id, id, 0.2, ["p7"]);
  assert.ok([...L2.values()].some((v) => v === null));
  assert.ok(L2.get("p7"));
  // món lớn: tên nằm trong lòng
  const riser = P("r", "box", 1, 1, 3, 1.5, "Bục");
  const L3 = layoutPropLabels([riser], id, id, 0.2);
  near(L3.get("r")!.x, 1);
  near(L3.get("r")!.y, 1 + 0.2 * 0.35);
});

test("bản vẽ theo thời điểm: khung video, bản in vẽ đạo cụ ở chỗ của đội hình", () => {
  const p: Project = {
    ...emptyProject(),
    dancers: [newDancer("a", "Hương", "#ff0000")],
    props: [P("m", "round", 0, 0, 0.4, 0.4, "Micro")],
    formations: [F("A", 0, 2, { a: [-2, 0] }), F("B", 4, 6, { a: [-2, 0] }, { m: { x: 3, z: 0 } })],
  };
  const g = planGeometry(p.stage, 1280, 720);
  const f1 = planFrame(p, 1, g), f2 = planFrame(p, 5, g), mid = planFrame(p, 3, g);
  near(f1.props![0].x, g.cx);
  near(f2.props![0].x, g.cx + 3 * g.s);
  assert.ok(mid.props![0].x > f1.props![0].x && mid.props![0].x < f2.props![0].x, "đang chuyển: trượt giữa hai chỗ");
  assert.ok(f1.props![0].label, "có chỗ đặt tên");
  const cx = (svg: string) => Number(/<circle cx="([\d.]+)"[^>]*fill="#e3e5e9"/.exec(svg)![1]);
  assert.ok(cx(formationSvg(p, 1)) > cx(formationSvg(p, 0)), "bản in đội hình B vẽ micro bên phải");
  assert.deepEqual(propsIn(p.formations, 1, p.props).map((o) => o.x), [3]);
});
