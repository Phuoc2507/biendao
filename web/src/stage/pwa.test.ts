import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../../public/sw-policy.js"; // gắn globalThis.SWPolicy, cùng tệp service worker dùng

interface Req { url: string; method?: string; mode?: string; destination?: string; range?: boolean }
interface Resp { status: number; type?: string; headers: { get(n: string): string | null } }
interface SWPolicyApi {
  classify(r: Req, scope: string): "skip" | "page" | "asset" | "static";
  storable(r: Resp): boolean;
  precacheList(files: string[]): string[];
  buildId(files: string[]): string;
  cacheName(build: string): string;
  staleCaches(names: string[], build: string): string[];
  STATIC_CACHE: string;
  MAX_BYTES: number;
}
const P = (globalThis as unknown as { SWPolicy: SWPolicyApi }).SWPolicy;
const S = "http://192.168.1.5:4173/";
const get = (path: string, o: Partial<Req> = {}): Req => ({ url: S + path, method: "GET", ...o });

test("sw classify: trang, tệp build có mã băm, tệp tĩnh", () => {
  assert.equal(P.classify(get("", { mode: "navigate" }), S), "page");
  assert.equal(P.classify(get("index.html"), S), "page");
  assert.equal(P.classify(get("?bai=1", { mode: "navigate" }), S), "page");
  assert.equal(P.classify(get("assets/index-BX3k9a.js", { destination: "script" }), S), "asset");
  assert.equal(P.classify(get("assets/index-77aa.css", { destination: "style" }), S), "asset");
  assert.equal(P.classify(get("manifest.webmanifest"), S), "static");
  assert.equal(P.classify(get("icon.svg", { destination: "image" }), S), "static");
});

test("sw classify: không cất video, nhạc, tua, blob, máy khác, POST, chính sw", () => {
  assert.equal(P.classify(get("clips/le.mp4"), S), "skip");
  assert.equal(P.classify(get("nhac/bai.MP3"), S), "skip");
  assert.equal(P.classify(get("x", { destination: "video" }), S), "skip");
  assert.equal(P.classify(get("x", { destination: "audio" }), S), "skip");
  assert.equal(P.classify(get("assets/a.js", { range: true }), S), "skip");
  assert.equal(P.classify({ url: "blob:http://192.168.1.5:4173/9b1e", method: "GET" }, S), "skip");
  assert.equal(P.classify({ url: "data:text/plain,hi", method: "GET" }, S), "skip");
  assert.equal(P.classify({ url: "https://cdn.example.com/a.js", method: "GET" }, S), "skip");
  assert.equal(P.classify(get("assets/a.js", { method: "POST" }), S), "skip");
  assert.equal(P.classify(get("sw.js"), S), "skip");
  assert.equal(P.classify(get("sw-policy.js"), S), "skip");
  assert.equal(P.classify({ url: "chrome-extension://abc/x.js", method: "GET" }, S), "skip");
  assert.equal(P.classify({ url: "không phải địa chỉ", method: "GET" }, S), "skip");
});

test("sw classify: máy chủ dev của vite và ngoài phạm vi thì bỏ qua", () => {
  assert.equal(P.classify(get("@vite/client"), S), "skip");
  assert.equal(P.classify(get("src/stage/main.tsx"), S), "skip");
  assert.equal(P.classify(get("node_modules/.vite/deps/react.js"), S), "skip");
  assert.equal(P.classify(get("assets/x.js?import"), S), "skip");
  const sub = "http://192.168.1.5:4173/san/";
  assert.equal(P.classify({ url: "http://192.168.1.5:4173/khac/a.js", method: "GET" }, sub), "skip");
  assert.equal(P.classify({ url: "http://192.168.1.5:4173/san/assets/a.js", method: "GET" }, sub), "asset");
});

const resp = (status: number, h: Record<string, string> = {}, type = "basic"): Resp => ({
  status, type, headers: { get: (n) => h[n.toLowerCase()] ?? null },
});

test("sw storable: chỉ cất phản hồi 200 cùng nguồn, không phải video, không quá lớn", () => {
  assert.equal(P.storable(resp(200, { "content-type": "text/javascript" })), true);
  assert.equal(P.storable(resp(200, {}, "default")), true);
  assert.equal(P.storable(resp(206, { "content-type": "video/mp4" })), false);
  assert.equal(P.storable(resp(404)), false);
  assert.equal(P.storable(resp(200, {}, "opaque")), false);
  assert.equal(P.storable(resp(200, { "content-type": "video/webm" })), false);
  assert.equal(P.storable(resp(200, { "content-type": "Audio/mpeg" })), false);
  assert.equal(P.storable(resp(200, { "content-length": String(P.MAX_BYTES + 1) })), false);
  assert.equal(P.storable(resp(200, { "content-length": "5000" })), true);
  assert.equal(P.storable(null as unknown as Resp), false);
});

test("sw precacheList: trang chính trước, bỏ bản đồ mã, video, app 3D cũ, chính sw", () => {
  const files = [
    "index.html", "3d.html", "sw.js", "sw-policy.js", "assets/index-a1.js", "assets/index-a1.js.map",
    "assets\\Learn-b2.js", "assets/legacy-c3.js", "assets/index-d4.css", "manifest.webmanifest", "icon.svg",
    "clips/demo.json", "models/man.gltf", "nhac.mp3",
  ];
  assert.deepEqual(P.precacheList(files), [
    "./", "index.html",
    "assets/Learn-b2.js", "assets/index-a1.js", "assets/index-d4.css", "icon.svg", "manifest.webmanifest",
  ]);
  assert.deepEqual(P.precacheList([]), ["./", "index.html"]);
});

test("sw buildId và kho cũ: cùng bản cùng mã, bản đổi thì xoá kho cũ của app, giữ kho khác", () => {
  const a = ["index.html", "assets/index-a1.js"];
  assert.equal(P.buildId(a), P.buildId([...a].reverse()));
  assert.notEqual(P.buildId(a), P.buildId(["index.html", "assets/index-a2.js"]));
  const cur = P.cacheName(P.buildId(a));
  const names = [cur, P.cacheName("cu"), P.STATIC_CACHE, "kho-cua-app-khac"];
  assert.deepEqual(P.staleCaches(names, P.buildId(a)), [P.cacheName("cu")]);
});

test("sw.js: có chỗ để vite điền mã bản dựng và danh sách cất sẵn, có tin SKIP_WAITING", () => {
  const src = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  assert.ok(src.includes('"__BUILD__"'));
  assert.ok(src.includes("[/*__PRECACHE__*/]"));
  assert.ok(src.includes("SKIP_WAITING"));
  assert.ok(src.includes('importScripts("sw-policy.js")'));
  // bản cũ đang chạy thì bản mới phải chờ người dùng bấm, không tự skipWaiting lúc cài
  const install = src.slice(src.indexOf('addEventListener("install"'), src.indexOf('addEventListener("activate"'));
  assert.ok(!install.includes("skipWaiting"));
  const cfg = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.ok(cfg.includes('"__BUILD__"') && cfg.includes("[/*__PRECACHE__*/]"));
});

test("manifest: tên tiếng Việt, mở riêng như app, có icon", () => {
  const m = JSON.parse(readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(m.name, "Sân khấu thẻ video");
  assert.equal(m.lang, "vi");
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i: { src: string }) => i.src === "icon.svg"));
  assert.ok(m.icons.some((i: { sizes: string }) => i.sizes === "512x512"));
});
