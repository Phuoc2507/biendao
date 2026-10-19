// Service worker của Sân khấu thẻ video: mở được khi không có mạng (phòng tập
// không wifi). Viết tay, không dùng thư viện. Luật cất ở sw-policy.js.
//
// * Lúc cài: cất sẵn trang chính và mọi tệp build (vite.config.ts điền danh
//   sách PRECACHE và mã BUILD khi chạy npm run build).
// * Tệp build trong assets/ (tên có mã băm): lấy từ kho trước, chưa có thì tải
//   rồi cất (cache-first, cất dần lúc chạy).
// * Trang HTML: mạng trước (để thấy bản mới), mạng chậm hoặc mất thì bản đã cất.
// * Tệp khác trong public: dùng bản đã cất, tải ngầm bản mới.
// * Không bao giờ cất video, nhạc, yêu cầu tua (Range) hay blob:.
// * Bản mới cài xong thì CHỜ, app hiện "Có bản mới" và chỉ chuyển khi người
//   dùng bấm Tải lại (gửi tin SKIP_WAITING).

/* global SWPolicy */
importScripts("sw-policy.js");

const BUILD = "__BUILD__"; // vite thay khi build
const PRECACHE = [/*__PRECACHE__*/];
const CACHE = SWPolicy.cacheName(BUILD);
const PAGE_TIMEOUT_MS = 3500; // wifi chập chờn: quá lâu thì dùng bản đã cất

const scope = () => self.registration.scope;
const abs = (p) => new URL(p, scope()).href;

async function put(cacheName, req, resp) {
  if (!SWPolicy.storable(resp)) return;
  try {
    const c = await caches.open(cacheName);
    await c.put(req, resp);
  } catch (e) {
    // máy đầy: bỏ qua, lần sau thử lại
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      // từng tệp một: một tệp lỗi không làm hỏng cả lần cài
      await Promise.all(
        PRECACHE.map(async (p) => {
          try {
            const r = await fetch(abs(p), { cache: "reload" });
            if (SWPolicy.storable(r)) await c.put(abs(p), r);
          } catch (err) {
            // mất mạng giữa chừng: tệp này cất dần lúc chạy
          }
        }),
      );
      // lần cài đầu tiên (chưa có bản cũ) thì chạy ngay; có bản cũ thì chờ người dùng bấm
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(SWPolicy.staleCaches(names, BUILD).map((n) => caches.delete(n)));
      await self.clients.claim(); // lần đầu: trang đang mở cũng được cất dần ngay
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function fromCache(req) {
  const hit = await caches.match(req, { ignoreSearch: false });
  return hit || null;
}

async function assetFirst(req) {
  const hit = await fromCache(req);
  if (hit) return hit;
  const r = await fetch(req);
  await put(CACHE, req, r.clone());
  return r;
}

async function pageNetworkFirst(req) {
  const net = fetch(req).then(async (r) => {
    await put(CACHE, req, r.clone());
    return r;
  });
  net.catch(() => {}); // lỗi mạng xử lý bên dưới, khỏi báo lỗi chưa bắt
  const timeout = new Promise((res) => setTimeout(() => res(null), PAGE_TIMEOUT_MS));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
  } catch (err) {
    // mất mạng
  }
  const hit =
    (await caches.match(req, { ignoreSearch: true })) ||
    (await caches.match(abs("index.html"))) ||
    (await caches.match(abs("./")));
  if (hit) return hit;
  return net; // chưa từng cất: chờ mạng (hoặc lỗi như bình thường)
}

async function staticStale(req) {
  const hit = await caches.match(req);
  const net = fetch(req)
    .then(async (r) => {
      await put(SWPolicy.STATIC_CACHE, req, r.clone());
      return r;
    })
    .catch(() => null);
  if (hit) return hit;
  const r = await net;
  return r || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const kind = SWPolicy.classify(
    { url: req.url, method: req.method, mode: req.mode, destination: req.destination, range: req.headers.has("range") },
    scope(),
  );
  if (kind === "skip") return;
  if (kind === "page") e.respondWith(pageNetworkFirst(req));
  else if (kind === "asset") e.respondWith(assetFirst(req));
  else e.respondWith(staticStale(req));
});
