import { test } from "node:test";
import assert from "node:assert/strict";
import { propIssues, transitionIssues } from "./checks.ts";
import { reassignFix } from "./fixes.ts";
import { type Ctx2D, drawPlanFrame, planGeometry } from "./export/planRender.ts";
import { imageFrame } from "./export/imageSheet.ts";
import { formationSvg } from "./export/printSheet.ts";
import { normalizeProject } from "./intake.ts";
import {
  type Formation, type Project, type StageSize, type Vec2, clampToStage, emptyProject, newDancer, ensureFormationAt, pathAt, pathMid, pathPeak, poseAt,
  removeDancerFromAll, setPositions, setVia, smoothstep, viaThrough,
} from "./model.ts";

const stage: StageSize = { width: 8, depth: 6 };
const ds = [
  { id: "a", name: "An" },
  { id: "b", name: "Bình" },
];
const F = (id: string, start: number, end: number, pos: Record<string, Vec2>, via?: Record<string, Vec2>): Formation => ({
  id, name: `Đội hình ${id}`, start, end, pos, ...(via && { via }),
});
const near = (x: number, y: number, e = 1e-6) => Math.abs(x - y) < e;
const nearV = (p: Vec2 | null | undefined, q: Vec2, e = 1e-6) => !!p && near(p[0], q[0], e) && near(p[1], q[1], e);

test("giữa khoảng chuyển: chỗ đứng là điểm Bézier bậc hai B(s), s = smoothstep(u)", () => {
  const P: Vec2 = [-2, 0], Q: Vec2 = [2, 0], V: Vec2 = [0, 2];
  const fs = [F("1", 0, 2, { a: P }), F("2", 6, 8, { a: Q }, { a: V })];
  for (const t of [2, 3, 4, 5.3, 6]) {
    const s = smoothstep((t - 2) / 4), r = 1 - s;
    const want: Vec2 = [r * r * P[0] + 2 * r * s * V[0] + s * s * Q[0], r * r * P[1] + 2 * r * s * V[1] + s * s * Q[1]];
    assert.ok(nearV(poseAt(fs, "a", t), want), `t=${t}`);
  }
  // giữa đường: 0,25P + 0,5V + 0,25Q
  assert.ok(nearV(poseAt(fs, "a", 4), [0, 1]));
  // không có via thì như cũ: nội suy thẳng
  const straight = [F("1", 0, 2, { a: P }), F("2", 6, 8, { a: Q })];
  assert.ok(nearV(poseAt(straight, "a", 4), [0, 0]));
  // đỉnh tốc độ đường thẳng đúng 1,5 lần độ dài, đường cong lớn hơn
  assert.ok(near(pathPeak(P, Q, null), 6));
  assert.ok(pathPeak(P, Q, V) > 6);
});

test("núm giữa đường: viaThrough cho đường đi qua đúng điểm kéo", () => {
  const P: Vec2 = [-2, 0], Q: Vec2 = [2, 1], M: Vec2 = [0.5, 2];
  const V = viaThrough(P, Q, M);
  assert.ok(nearV(pathMid(P, Q, V), M));
  assert.ok(nearV(pathAt(P, Q, V, 0.5), M));
});

test("va chạm trên đường cong mà đường thẳng không có", () => {
  // An đi ngang trước mặt Bình (cách 1,5 m): đi thẳng thì không va
  const pos1 = { a: [-2, 0] as Vec2, b: [0, 1.5] as Vec2 };
  const pos2 = { a: [2, 0] as Vec2, b: [0, 1.5] as Vec2 };
  const straight = [F("1", 0, 2, pos1), F("2", 8, 10, pos2)];
  assert.equal(transitionIssues(straight, ds, stage, null).filter((i) => i.kind === "collide").length, 0);
  // uốn đường của An lên phía Bình: giữa đường An đi đúng qua chỗ Bình
  const curved = [F("1", 0, 2, pos1), F("2", 8, 10, pos2, { a: [0, 3] })];
  const hits = transitionIssues(curved, ds, stage, null).filter((i) => i.kind === "collide");
  assert.equal(hits.length, 1);
  assert.ok(near(hits[0].t, 5, 0.05), `t=${hits[0].t}`);
  assert.ok(nearV(hits[0].at, [0, 1.5], 0.05) || hits[0].value < 0.05);
  assert.ok(hits[0].ctrl?.some((c) => c && nearV(c, [0, 3])));
});

test("lật gương lật luôn điểm điều khiển", () => {
  // P nằm trên trục giữa nên ảnh gương của P là chính nó
  const fs = [F("1", 0, 2, { a: [0, -2] }), F("2", 4, 6, { a: [2, 0] }, { a: [2, -2] })];
  const out = setPositions(fs, "2", { a: [-2, 0] }, stage, { mirror: true });
  assert.ok(nearV(out[1].pos.a, [-2, 0]));
  assert.ok(nearV(out[1].via?.a, [-2, -2]));
  // dời bình thường (không gương): giữ dáng theo dây cung, phía uốn không đổi
  const moved = setPositions(fs, "2", { a: [2, 1] }, stage);
  const v = moved[1].via!.a;
  assert.ok(v[0] > 1 && v[1] < 0, `via=${v}`);
});

test("setVia: đội hình đầu không có đường cong; null bỏ đường cong", () => {
  const fs = [F("1", 0, 2, { a: [0, 0] }), F("2", 4, 6, { a: [2, 0] })];
  assert.equal(setVia(fs, "1", "a", [1, 1], stage), fs);
  const c = setVia(fs, "2", "a", [1, 9], stage);
  assert.ok(nearV(c[1].via?.a, clampToStage([1, 9], stage)));
  const s = setVia(c, "2", "a", null, stage);
  assert.equal(s[1].via, undefined);
});

test("xoá người thì xoá luôn đường cong của người đó", () => {
  const fs = [F("1", 0, 2, { a: [0, 0], b: [1, 0] }), F("2", 4, 6, { a: [2, 0], b: [1, 1] }, { a: [1, 1], b: [0, 1] })];
  const out = removeDancerFromAll(fs, "a");
  assert.deepEqual(out[1].via, { b: [0, 1] });
  assert.equal(removeDancerFromAll(out, "b")[1].via, undefined);
});

test("tạo đội hình giữa đường cong: chẻ đôi, hình đi không đổi", () => {
  const fs = [F("1", 0, 2, { a: [-2, 0] }), F("2", 6, 8, { a: [2, 0] }, { a: [0, 2] })];
  const P: Vec2 = [-2, 0], Q: Vec2 = [2, 0], V: Vec2 = [0, 2];
  const r = ensureFormationAt(fs, 3, ["a"], stage, "n", 0);
  assert.ok(r.created);
  const mid = r.formations.find((f) => f.id === "n")!;
  const g = r.formations.find((f) => f.id === "2")!;
  const M = mid.pos.a, s = smoothstep(0.25);
  assert.ok(nearV(M, pathAt(P, Q, V, s)));
  // hai khúc mới nằm đúng trên đường cũ
  for (const w of [0.2, 0.5, 0.8]) {
    assert.ok(nearV(pathAt(P, M, mid.via!.a, w), pathAt(P, Q, V, s * w)), `khúc 1 w=${w}`);
    assert.ok(nearV(pathAt(M, Q, g.via!.a, w), pathAt(P, Q, V, s + (1 - s) * w)), `khúc 2 w=${w}`);
  }
});

test("đổi chỗ cho gần: ai đổi chỗ thì bỏ đường cong của người đó", () => {
  const fs = [
    F("1", 0, 2, { a: [-2, 0], b: [2, 0] }),
    F("2", 4, 6, { a: [2, 0], b: [-2, 0] }, { a: [0, 2], b: [0, -2] }),
  ];
  const fx = reassignFix(fs, 1, ds, stage, null);
  assert.ok(fx);
  assert.deepEqual(fx.fs[1].pos, { a: [-2, 0], b: [2, 0] });
  assert.equal(fx.fs[1].via, undefined);
});

test("normalizeProject làm sạch via", () => {
  const p = normalizeProject({
    version: 1, title: "T", musicDuration: 20, stage,
    dancers: [{ id: "a", name: "A", color: "#fff" }, { id: "b", name: "B", color: "#000" }],
    formations: [
      { id: "1", start: 0, end: 2, pos: { a: [0, 0], b: [1, 0] }, via: { a: [1, 1] } },
      {
        id: "2", start: 4, end: 6, pos: { a: [2, 0], b: [1, 1] },
        via: { a: [NaN, 1], b: [50, -50], ghost: [0, 0] },
      },
      { id: "3", start: 8, end: 9, pos: { a: [2, 0], b: [1, 1] }, via: "rác" },
    ],
  })!;
  assert.ok(p);
  assert.equal(p.formations.length, 3);
  assert.equal(p.formations[0].via, undefined); // đội hình đầu: bỏ
  assert.deepEqual(p.formations[1].via, { b: clampToStage([50, -50], p.stage) }); // NaN và id lạ: bỏ, ngoài sân khấu: kẹp
  assert.equal(p.formations[2].via, undefined);
});

test("ảnh và tờ in vẽ mũi tên cong khi có via", () => {
  const p: Project = {
    ...emptyProject(),
    dancers: [newDancer("a", "Hương", "#ff0000")],
    formations: [F("1", 0, 2, { a: [-2, 0] }), F("2", 4, 6, { a: [2, 0] }, { a: [0, 2] })],
  };
  const g = planGeometry(p.stage, 1080, 1350);
  const fr = imageFrame(p, 1, g);
  assert.equal(fr.trails?.length, 1);
  assert.ok(fr.trails![0].cx !== undefined && fr.trails![0].cy !== undefined);
  let lines = 0;
  const noop = () => {};
  const ctx: Ctx2D = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: () => void lines++, arc: noop, fill: noop, stroke: noop,
    fillText: noop, setLineDash: noop, save: noop, restore: noop, rect: noop, clip: noop,
  };
  drawPlanFrame(ctx, g, fr);
  assert.ok(lines > 10, `lineTo=${lines}`); // đường cong lấy mẫu thành nhiều đoạn
  const svg = formationSvg(p, 1);
  assert.match(svg, /<path d="M[\d.\- ]+Q[\d.\- ]+"[^>]*marker-end/);
  // không có via: vẫn là <line> như cũ
  const flat = { ...p, formations: [p.formations[0], { ...p.formations[1], via: undefined }] };
  assert.ok(!/Q/.test(formationSvg(flat, 1).match(/<path d="M[^"]*"[^>]*marker-end/)?.[0] ?? ""));
  assert.equal(imageFrame(flat, 1, g).trails![0].cx, undefined);
});

test("đi xuyên đạo cụ: kiểm theo đường cong", () => {
  // bục giữa sân khấu: đi thẳng thì xuyên qua, uốn vòng lên trên thì tránh được; vòng qua micro thì báo
  const riser = { id: "r", name: "Bục", kind: "box" as const, x: 0, z: 0, w: 1, d: 1 };
  const mic = { id: "m", name: "Micro", kind: "round" as const, x: 0, z: 1.5, w: 0.2, d: 0.2 };
  const f1 = F("1", 0, 2, { a: [-3, 0] });
  const straight = [f1, F("2", 4, 6, { a: [3, 0] })];
  assert.equal(propIssues(straight, [ds[0]], [riser]).length, 1);
  const curved = [f1, F("2", 4, 6, { a: [3, 0] }, { a: [0, 3] })];
  assert.equal(propIssues(curved, [ds[0]], [riser]).length, 0);
  assert.equal(propIssues(curved, [ds[0]], [mic]).length, 1);
  assert.equal(propIssues(straight, [ds[0]], [mic]).length, 0);
});
