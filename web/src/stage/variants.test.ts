import { test } from "node:test";
import assert from "node:assert/strict";
import { type Formation, type Project, emptyProject, newDancer } from "./model.ts";
import {
  type KV, BACKUP_NAME, backupBeforeSwitch, changeText, defaultVariantName, diffProjects, fmtSavedAt,
  parseVariants, sameProject, stableJson, uniqueName, variantRepo, variantSummary, VARIANTS_KEY,
} from "./variants.ts";

const F = (id: string, name: string, start: number, end: number, pos: Formation["pos"], o: Partial<Formation> = {}): Formation =>
  ({ id, name, start, end, pos, ...o });

function base(): Project {
  return {
    ...emptyProject(),
    title: "Trống cơm",
    dancers: [newDancer("a", "Lan", "#ff5d6c"), newDancer("b", "Mai", "#4f9dff"), newDancer("c", "Hoa", "#3ad07a")],
    formations: [
      F("f1", "Đội hình 1", 0, 8, { a: [-2, 0], b: [0, 0], c: [2, 0] }),
      F("f2", "Đội hình 2", 12, 20, { a: [-1, 1], b: [1, 1], c: [0, -1] }),
    ],
  };
}

const memKV = (): KV & { m: Map<string, unknown> } => {
  const m = new Map<string, unknown>();
  return {
    m,
    get: async (k) => structuredClone(m.get(k)),
    set: async (k, v) => void m.set(k, structuredClone(v)),
  };
};

test("defaultVariantName: A, B... bỏ qua tên đã có, qua Z thì đánh số", () => {
  assert.equal(defaultVariantName([]), "Phương án A");
  assert.equal(defaultVariantName(["Phương án A", "phương án b ", "Thử đổi đoạn 2"]), "Phương án C");
  const all = Array.from({ length: 26 }, (_, i) => `Phương án ${String.fromCharCode(65 + i)}`);
  assert.equal(defaultVariantName(all), "Phương án 27");
});

test("uniqueName: trùng thì thêm số, tên trắng thì là Phương án", () => {
  assert.equal(uniqueName("Thử", []), "Thử");
  assert.equal(uniqueName(" Thử ", ["thử", "Thử 2"]), "Thử 3");
  assert.equal(uniqueName("   ", []), "Phương án");
});

test("stableJson và sameProject: không phụ thuộc thứ tự khoá, bỏ trường undefined", () => {
  assert.equal(stableJson({ b: 1, a: [1, { y: 2, x: undefined }] }), stableJson({ a: [1, { y: 2 }], b: 1 }));
  const p = base();
  const q = JSON.parse(JSON.stringify({ ...p, formations: p.formations.map((f) => ({ pos: f.pos, ...f })) })) as Project;
  assert.ok(sameProject(p, q));
  assert.ok(!sameProject(p, { ...p, title: "khác" }));
});

test("backupBeforeSwitch: chỉ cất khi khác mọi phương án và bài không trống; tên không trùng", () => {
  const p = base();
  const v = (name: string, project: Project) => ({ id: name, name, savedAt: 1, project });
  assert.equal(backupBeforeSwitch(emptyProject(), []), null, "bài trống thì thôi");
  assert.equal(backupBeforeSwitch(p, []), BACKUP_NAME);
  assert.equal(backupBeforeSwitch(p, [v("A", structuredClone(p))]), null, "trùng phương án A");
  assert.equal(backupBeforeSwitch(p, [v("A", { ...p, title: "x" }), v(BACKUP_NAME, { ...p, bpm: 120 })]), `${BACKUP_NAME} 2`);
});

test("diffProjects: hai bản giống nhau thì rỗng", () => {
  assert.deepEqual(diffProjects(base(), base()), []);
});

test("diffProjects: đội hình thêm, bớt, đổi giờ, đổi tên", () => {
  const a = base();
  const b = base();
  b.formations = [
    { ...b.formations[0], start: 1, end: 9, name: "Mở màn" },
    F("f3", "Đội hình 3", 24, 30, { a: [0, 0], b: [1, 0], c: [2, 0] }),
  ];
  const d = diffProjects(a, b);
  const kinds = d.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["formAdded", "formRemoved", "formRenamed", "formRetimed"]);
  const txt = d.map(changeText);
  assert.ok(txt.includes("Bớt đội hình Đội hình 2 (0:12.0 tới 0:20.0)"));
  assert.ok(txt.includes("Thêm đội hình Đội hình 3 (0:24.0 tới 0:30.0)"));
  assert.ok(txt.includes("Đổi tên đội hình Đội hình 1 thành Mở màn"));
  assert.ok(txt.includes("Mở màn: giờ 0:00.0 tới 0:08.0 thành 0:01.0 tới 0:09.0"));
});

test("diffProjects: người dời chỗ ghi tên, đội hình, số mét; hai người đổi chỗ gộp một dòng", () => {
  const a = base();
  const b = base();
  b.formations[0] = { ...b.formations[0], pos: { a: [0, 0], b: [-2, 0], c: [2, 1.5] } };
  b.formations[1] = { ...b.formations[1], pos: { ...b.formations[1].pos, a: [-1, 1.02] } }; // 2 cm: coi như đứng yên
  const txt = diffProjects(a, b).map(changeText);
  assert.deepEqual(txt, ["Đội hình 1: Lan đổi chỗ với Mai", "Đội hình 1: Hoa dời 1,5 m"]);
});

test("diffProjects: ghi chú đội hình, ghi chú từng người, đường cong, vũ công thêm bớt", () => {
  const a = base();
  a.formations[1] = { ...a.formations[1], note: "quay trái" };
  const b = base();
  b.formations[1] = { ...b.formations[1], note: "quay phải", notes: { b: "cầm quạt" }, via: { c: [0.5, 0] } };
  b.dancers = [...b.dancers.filter((d) => d.id !== "a"), newDancer("e", "Tú", "#ffffff")];
  const txt = diffProjects(a, b).map(changeText);
  assert.ok(txt.includes("Thêm vũ công Tú"));
  assert.ok(txt.includes("Bớt vũ công Lan"));
  assert.ok(txt.includes('Đội hình 2: ghi chú "quay trái" thành "quay phải"'));
  assert.ok(txt.includes('Đội hình 2: ghi chú của Mai (trống) thành "cầm quạt"'));
  assert.ok(txt.includes("Đội hình 2: đổi đường đi của Hoa"));
});

test("diffProjects: sân, nhịp, mốc nhạc, phần video của vũ công", () => {
  const a = base();
  const b = { ...base(), stage: { width: 12, depth: 6 }, bpm: 128, marks: [{ id: "m", t: 4, label: "Điệp khúc" }] };
  b.dancers = b.dancers.map((d) => (d.id === "c" ? { ...d, offsetSec: 1.5 } : d));
  const txt = diffProjects(a, b).map(changeText);
  assert.ok(txt.includes("Sân: 10 × 6 m thành 12 × 6 m"));
  assert.ok(txt.includes("Nhịp: chưa đặt thành 128 BPM"));
  assert.ok(txt.includes("Đổi mốc đoạn nhạc"));
  assert.ok(txt.includes("Đổi video, khớp nhạc hoặc canon của vũ công"));
});

test("variantSummary và fmtSavedAt", () => {
  assert.equal(variantSummary(base()), "2 đội hình, 3 người");
  const now = new Date(2026, 9, 19, 15, 0).getTime();
  assert.equal(fmtSavedAt(new Date(2026, 9, 19, 9, 5).getTime(), now), "hôm nay 09:05");
  assert.equal(fmtSavedAt(new Date(2026, 9, 2, 21, 30).getTime(), now), "2/10 21:30");
  assert.equal(fmtSavedAt(new Date(2025, 0, 2, 8, 0).getTime(), now), "2/1/2025 08:00");
});

test("parseVariants: bỏ bản hỏng, mới lưu đứng trước", () => {
  const p = base();
  const l = parseVariants([
    { id: "1", name: "cũ", savedAt: 1, project: p },
    null, "rác", { id: "x", name: "thiếu project", savedAt: 3 },
    { id: "2", name: "mới", savedAt: 2, project: p },
  ]);
  assert.deepEqual(l.map((v) => v.id), ["2", "1"]);
  assert.deepEqual(parseVariants(undefined), []);
});

test("variantRepo trên kho giả: thêm, đổi tên, xoá, đưa lại, media dùng chung", async () => {
  const kv = memKV();
  const r = variantRepo(kv);
  assert.deepEqual(await r.list(), []);
  const p = base();
  p.musicId = "nhac";
  p.dancers[0] = { ...p.dancers[0], mediaId: "vid-a" };
  const [v1, v2] = await Promise.all([r.add("Phương án A", p, 10), r.add("Phương án A", base(), 20)]);
  assert.equal(v1.name, "Phương án A");
  assert.equal(v2.name, "Phương án A 2", "hai lần lưu cùng lúc không đè nhau");
  assert.deepEqual((await r.list()).map((v) => v.name), ["Phương án A 2", "Phương án A"]);
  assert.ok(Array.isArray(kv.m.get(VARIANTS_KEY)));
  assert.equal(await r.rename(v2.id, "  Thử đổi đoạn 2 "), true);
  assert.equal(await r.rename(v2.id, "   "), false);
  assert.equal(await r.rename("không có", "x"), false);
  assert.deepEqual((await r.list()).map((v) => v.name), ["Thử đổi đoạn 2", "Phương án A"]);
  assert.deepEqual((await r.mediaIds()).sort(), ["nhac", "vid-a"]);
  const gone = await r.remove(v1.id);
  assert.equal(gone?.id, v1.id);
  assert.deepEqual(await r.mediaIds(), []);
  await r.restore(gone!);
  await r.restore(gone!);
  assert.deepEqual((await r.list()).map((v) => v.id), [v2.id, v1.id], "đưa lại một lần, đúng chỗ theo giờ lưu");
});

test("variantRepo: hai thẻ cùng ghi một kho không mất phương án của nhau", async () => {
  // kho chậm: đọc và ghi đều nhường lượt, như IndexedDB thật
  const data = new Map<string, unknown>();
  const tick = () => new Promise((r) => setTimeout(r, 1));
  const kv = {
    get: async (k: string) => (await tick(), structuredClone(data.get(k))),
    set: async (k: string, v: unknown) => (await tick(), data.set(k, structuredClone(v))),
  };
  // khoá dùng chung như navigator.locks: một việc một lúc
  let q: Promise<unknown> = Promise.resolve();
  const lock = <T,>(fn: () => Promise<T>): Promise<T> => {
    const job = q.then(fn);
    q = job.catch(() => {});
    return job;
  };
  const tabA = variantRepo(kv, lock);
  const tabB = variantRepo(kv, lock);
  const p = emptyProject();
  await Promise.all([
    tabA.add("A1", p, 1), tabB.add("B1", p, 2), tabA.add("A2", p, 3), tabB.add("B2", p, 4),
  ]);
  const names = (await tabA.list()).map((v) => v.name).sort();
  assert.deepEqual(names, ["A1", "A2", "B1", "B2"]);
  // xoá ở thẻ này, đổi tên ở thẻ kia cùng lúc: cả hai đều giữ
  const l = await tabB.list();
  const a1 = l.find((v) => v.name === "A1")!;
  const b1 = l.find((v) => v.name === "B1")!;
  await Promise.all([tabA.remove(b1.id), tabB.rename(a1.id, "A một")]);
  assert.deepEqual((await tabA.list()).map((v) => v.name).sort(), ["A một", "A2", "B2"]);
  // tên trùng giữa hai thẻ vẫn được thêm số
  await Promise.all([tabA.add("Chung", p, 5), tabB.add("Chung", p, 6)]);
  assert.deepEqual((await tabB.list()).map((v) => v.name).filter((n) => n.startsWith("Chung")).sort(), ["Chung", "Chung 2"]);
});

test("variantRepo: một lần ghi lỗi không chặn các lần sau", async () => {
  const kv = memKV();
  let fail = true;
  const r = variantRepo({ get: kv.get, set: async (k, v) => { if (fail) { fail = false; throw new Error("đầy"); } return kv.set(k, v); } });
  await assert.rejects(r.add("A", base()));
  const v = await r.add("B", base());
  assert.deepEqual((await r.list()).map((x) => x.id), [v.id]);
});

test("diffProjects: báo đổi hướng mặt", () => {
  const a = base();
  const b = base();
  b.formations[1] = { ...b.formations[1], facing: { a: 180 } };
  const lines = diffProjects(a, b).map(changeText);
  assert.ok(lines.some((l) => l.includes("Đội hình 2") && l.includes("Lan")), lines.join(" | "));
  assert.equal(diffProjects(a, base()).length, 0);
});
test("diffProjects: đạo cụ chỉ đổi chỗ trong một đội hình vẫn được báo", () => {
  const prop = { id: "p1", kind: "box" as const, name: "Bục", x: 0, z: 0, w: 1, d: 1 };
  const a = { ...base(), props: [prop] };
  const b = structuredClone(a);
  b.formations[1] = { ...b.formations[1], propPos: { p1: { x: 2, z: 1 } } };
  assert.deepEqual(diffProjects(a, b), [{ kind: "other", what: "đạo cụ" }]);
  assert.deepEqual(diffProjects(a, structuredClone(a)), []);
});
