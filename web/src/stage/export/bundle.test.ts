import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type MediaBlob, buildBundle, readBundle, checkProject, mediaRefs, layoutPaths, safeName, slugTitle,
  mimeFromName, readmeText, pickProjectEntry, PROJECT_ENTRY, README_ENTRY,
} from "./bundle.ts";
import { makeZip, listZip, readEntry, crc32 } from "./zip.ts";
import { type Project, emptyProject, newDancer } from "../model.ts";

const enc = new TextEncoder();
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

function fill(n: number, v: number) {
  return new Uint8Array(n).map((_, i) => (i * 31 + v) & 0xff);
}

function sample(): { p: Project; store: Map<string, MediaBlob> } {
  const p: Project = {
    ...emptyProject(),
    title: "Bài múa: Hương Sen",
    musicId: "m-nhac",
    musicName: "Hương Sen (bản cắt).mp3",
    musicDuration: 95.5,
    bpm: 120,
    downbeat: 0.4,
    dancers: [
      { ...newDancer("d1", "Hương", "#ff5d6c"), mediaId: "m-a", mediaName: "Hương.card.mp4", stacked: true },
      { ...newDancer("d2", "Hương 2", "#4f9dff"), mediaId: "m-a", mediaName: "Hương.card.mp4", offsetSec: 1 }, // nhân bản
      { ...newDancer("d3", "Lan", "#3ad07a"), mediaId: "m-b", mediaName: "Lan.mp4" },
      { ...newDancer("d4", "Lan khác", "#ffb020"), mediaId: "m-c", mediaName: "lan.MP4" }, // trùng tên tệp
      { ...newDancer("d5", "Chưa có video", "#b07cff") },
    ],
    formations: [{ id: "f1", name: "Mở màn", start: 0, end: 4, pos: { d1: [0, 0], d3: [1, 1] } }],
  };
  const store = new Map<string, MediaBlob>([
    ["m-nhac", { id: "m-nhac", name: "Hương Sen (bản cắt).mp3", type: "audio/mpeg", blob: new Blob([fill(4000, 1)], { type: "audio/mpeg" }) }],
    ["m-a", { id: "m-a", name: "Hương.card.mp4", type: "video/mp4", blob: new Blob([fill(3000, 2)], { type: "video/mp4" }) }],
    ["m-b", { id: "m-b", name: "Lan.mp4", type: "video/mp4", blob: new Blob([fill(2000, 3)]) }],
    ["m-c", { id: "m-c", name: "lan.MP4", type: "video/mp4", blob: new Blob([fill(2100, 4)]) }],
  ]);
  return { p, store };
}

test("tên tệp an toàn: bỏ ký tự cấm, giữ đuôi khi cắt, tránh tên Windows cấm", () => {
  assert.equal(safeName('Bài 1: "Hoa" / Lá?.mp4'), "Bài 1_ _Hoa_ _ Lá_.mp4");
  assert.equal(safeName("  ..ẩn.mp3. "), "ẩn.mp3");
  assert.equal(safeName(""), "tep");
  assert.equal(safeName("con.mp4"), "_con.mp4");
  const long = safeName("a".repeat(300) + ".card.mp4");
  assert.equal(long.length, 120);
  assert.ok(long.endsWith(".card.mp4"));
  assert.equal(slugTitle("Bài múa: Hương Sen!"), "Bài-múa-Hương-Sen");
  assert.equal(slugTitle("  ***  "), "bai-mua");
  assert.equal(mimeFromName("x/Lan.MOV"), "video/quicktime");
  assert.equal(mimeFromName("nhac.m4a"), "audio/mp4");
  assert.equal(mimeFromName("lạ.xyz"), "");
});

test("danh sách media: nhạc trước, bản nhân bản dùng chung chỉ tính một, trùng tên thì đánh số", () => {
  const { p } = sample();
  const refs = mediaRefs(p);
  assert.deepEqual(refs.map((r) => r.id), ["m-nhac", "m-a", "m-b", "m-c"]);
  assert.deepEqual(layoutPaths(refs), [
    "nhac/Hương Sen (bản cắt).mp3",
    "video/Hương.card.mp4",
    "video/Lan.mp4",
    "video/lan (2).MP4",
  ]);
  assert.deepEqual(layoutPaths([{ kind: "video", name: "Không đuôi", type: "video/webm" }, { kind: "music", name: "Nhạc" }]), [
    "video/Không đuôi.webm",
    "nhac/Nhạc.mp3",
  ]);
});

test("ĐỌC-TÔI.txt có BOM, CRLF, tên bài và cách mở", () => {
  const { p } = sample();
  const t = readmeText(p, [{ kind: "music", path: "nhac/a.mp3", name: "a.mp3" }, { kind: "video", path: "video/b.mp4", name: "b.mp4" }], new Date(2026, 9, 12, 8, 5));
  assert.ok(t.startsWith("﻿"));
  assert.ok(t.includes("\r\n") && !/[^\r]\n/.test(t));
  assert.ok(t.includes("Bài: Bài múa: Hương Sen"));
  assert.ok(t.includes("12/10/2026 08:05"));
  assert.ok(t.includes("Không cần giải nén"));
  assert.ok(t.includes("5 vũ công, 1 đội hình"));
});

test("đóng gói rồi mở lại: đủ media, giữ id, dự án y nguyên", async () => {
  const { p, store } = sample();
  const prog: number[] = [];
  const r = await buildBundle(p, async (id) => store.get(id), { date: new Date(2026, 9, 12), onProgress: (f) => prog.push(f) });
  assert.deepEqual(r.skipped, []);
  assert.equal(r.media.length, 4);
  assert.equal(prog[prog.length - 1], 1);

  const names = (await listZip(r.blob)).map((e) => e.name);
  assert.deepEqual(names, [README_ENTRY, PROJECT_ENTRY, "nhac/Hương Sen (bản cắt).mp3", "video/Hương.card.mp4", "video/Lan.mp4", "video/lan (2).MP4"]);

  const o = await readBundle(r.blob);
  assert.deepEqual(o.project, checkProject(JSON.parse(JSON.stringify(p))));
  assert.equal((o.project as unknown as { bundle?: unknown }).bundle, undefined);
  assert.deepEqual(o.missing, []);
  assert.deepEqual(o.media.map((m) => [m.id, m.name, m.type]), [
    ["m-nhac", "Hương Sen (bản cắt).mp3", "audio/mpeg"],
    ["m-a", "Hương.card.mp4", "video/mp4"],
    ["m-b", "Lan.mp4", "video/mp4"],
    ["m-c", "lan.MP4", "video/mp4"],
  ]);
  for (const m of o.media) assert.deepEqual(await bytes(m.blob), await bytes(store.get(m.id)!.blob));
});

test("media máy không còn: bỏ qua khi đóng gói và báo thiếu khi mở", async () => {
  const { p, store } = sample();
  store.delete("m-b");
  const r = await buildBundle(p, async (id) => store.get(id));
  assert.deepEqual(r.skipped, ["Lan.mp4"]);
  const o = await readBundle(r.blob);
  assert.deepEqual(o.missing, ["m-b"]);
  assert.equal(o.media.length, 3);
});

/** Giải nén rồi nén lại kiểu khác: đổi tên/đường dẫn từng mục. */
async function repack(zip: Blob, rename: (name: string) => string | null): Promise<Blob> {
  const items = [];
  for (const e of await listZip(zip)) {
    const n = rename(e.name);
    if (n) items.push({ name: n, data: await readEntry(zip, e) });
  }
  return makeZip(items);
}

test("gói bị nén lại trong một thư mục, tên tệp bị hỏng: vẫn khớp nhờ đường dẫn, cỡ và CRC", async () => {
  const { p, store } = sample();
  const r = await buildBundle(p, async (id) => store.get(id));
  const z = await repack(r.blob, (n) => {
    if (n === "video/Lan.mp4") return "Bài múa/video/L_n.mp4"; // tên hỏng
    if (n.startsWith("nhac/")) return "Bài múa/nhac/Huong Sen.mp3";
    return "Bài múa/" + n;
  });
  const o = await readBundle(z);
  assert.deepEqual(o.missing, []);
  const got = new Map(o.media.map((m) => [m.id, m]));
  assert.deepEqual(await bytes(got.get("m-b")!.blob), await bytes(store.get("m-b")!.blob));
  assert.deepEqual(await bytes(got.get("m-nhac")!.blob), await bytes(store.get("m-nhac")!.blob));
});

test("zip tự nén (không có mục bundle): ghép video theo tên tệp gốc", async () => {
  const { p } = sample();
  const a = fill(500, 9), b = fill(600, 8);
  const z = await makeZip([
    { name: "__MACOSX/._bai.choreo.json", data: "rác" },
    { name: "bai.choreo.json", data: JSON.stringify(p) },
    { name: "Hương.card.mp4", data: a },
    { name: "khác/LAN.mp4", data: b },
    { name: "Thẻ Lan.card.json", data: "{}" },
  ]);
  const o = await readBundle(z);
  assert.deepEqual(o.media.map((m) => m.id), ["m-a", "m-b"]);
  assert.deepEqual(await bytes(o.media[0].blob), a);
  assert.equal(o.media[1].type, "video/mp4");
  assert.deepEqual(o.missing.sort(), ["m-c", "m-nhac"]);
});

test("chọn tệp dự án: project.choreo.json nông nhất, không lấy .card.json", () => {
  const e = (name: string) => ({ name, method: 0, flags: 0, crc: 0, compSize: 0, size: 0, offset: 0, dir: false });
  assert.equal(pickProjectEntry([e("a/b/project.choreo.json"), e("x.choreo.json"), e("Lan.card.json")])?.name, "x.choreo.json");
  assert.equal(pickProjectEntry([e("goi/khac.json"), e("goi/project.choreo.json")])?.name, "goi/project.choreo.json");
  assert.equal(pickProjectEntry([e("Lan.card.json"), e("__MACOSX/project.choreo.json")]), undefined);
});

test("kiểm tra dự án: từ chối tệp lạ, điền trường thiếu", async () => {
  assert.throws(() => checkProject({ version: 2, dancers: [] }), /Không phải tệp dự án/);
  assert.throws(() => checkProject(null), /Không phải tệp dự án/);
  const p = checkProject({ version: 1, dancers: [{ id: "d1", name: "A", color: "#fff" }, null], bundle: { media: [] } });
  assert.equal(p.dancers.length, 1);
  assert.equal(p.dancers[0].cardHeight, newDancer("x", "x", "#fff").cardHeight);
  assert.deepEqual(p.formations, []);
  assert.equal("bundle" in p, false);
  await assert.rejects(readBundle(await makeZip([{ name: "Lan.mp4", data: "x" }])), /không có tệp dự án/);
  await assert.rejects(readBundle(await makeZip([{ name: "project.choreo.json", data: "{hỏng" }])), /bị hỏng/);
  // CRC trong mục lục khớp nội dung
  const z = await makeZip([{ name: "a.txt", data: "Hà Nội" }]);
  assert.equal((await listZip(z))[0].crc, crc32(enc.encode("Hà Nội")));
});
