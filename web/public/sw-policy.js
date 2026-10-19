// Luật cache của service worker (sw.js), viết thuần để test bằng node.
// Tệp này chạy được ở ba nơi: service worker nạp bằng importScripts,
// vite.config.ts lúc build (lập danh sách cất sẵn), và test node
// (src/stage/pwa.test.ts). Không có import/export: gắn vào globalThis.SWPolicy.

(function (root) {
  "use strict";

  // video, nhạc: không bao giờ cất (video người dùng nằm sẵn trong IndexedDB, phát qua blob:)
  var MEDIA = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
  var MAX_BYTES = 20 * 1024 * 1024; // tệp lớn hơn thì không cất

  function isMedia(path) {
    return MEDIA.test(path);
  }

  /**
   * Xếp loại một yêu cầu. r: { url, method, mode, destination, range }.
   * scope: địa chỉ phạm vi của service worker (vd "http://192.168.1.5:4173/").
   * Trả "skip" (để trình duyệt tự lo), "page" (trang HTML: mạng trước, mất
   * mạng thì bản đã cất), "asset" (tệp build có mã băm trong tên: cất trước,
   * dùng mãi) hoặc "static" (tệp khác trong public: dùng bản cất, cập nhật ngầm).
   */
  function classify(r, scope) {
    if (String(r.method || "GET").toUpperCase() !== "GET") return "skip";
    if (r.range) return "skip"; // tua video, tải từng khúc
    var u, s;
    try {
      u = new URL(r.url);
      s = new URL(scope);
    } catch (e) {
      return "skip";
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return "skip"; // blob:, data:, chrome-extension:
    if (u.origin !== s.origin || u.pathname.indexOf(s.pathname) !== 0) return "skip";
    var rel = u.pathname.slice(s.pathname.length);
    if (rel === "sw.js" || rel === "sw-policy.js") return "skip";
    if (r.destination === "video" || r.destination === "audio" || r.destination === "track" || isMedia(rel)) return "skip";
    // máy chủ dev của vite (phòng khi lỡ đăng ký lúc dev)
    if (rel.charAt(0) === "@" || rel.indexOf("src/") === 0 || rel.indexOf("node_modules/") === 0 || u.searchParams.has("import")) {
      return "skip";
    }
    if (r.mode === "navigate" || r.destination === "document" || rel === "" || /\.html$/i.test(rel)) return "page";
    if (rel.indexOf("assets/") === 0) return "asset";
    return "static";
  }

  /** Phản hồi có nên cất không. resp: { status, type, headers: { get(name) } }. */
  function storable(resp) {
    if (!resp || resp.status !== 200) return false;
    if (resp.type && resp.type !== "basic" && resp.type !== "default") return false; // opaque, cors, lỗi
    var h = resp.headers;
    var ct = String((h && h.get("content-type")) || "").toLowerCase();
    if (ct.indexOf("video/") === 0 || ct.indexOf("audio/") === 0) return false;
    var len = Number((h && h.get("content-length")) || 0);
    if (len > MAX_BYTES) return false;
    return true;
  }

  /**
   * Danh sách cất sẵn lúc cài, từ tên tệp vite vừa build (đường dẫn tương đối,
   * dấu "/"). Bỏ bản đồ mã, video nhạc, app 3D cũ; luôn có trang chính.
   */
  function precacheList(files) {
    var out = ["./", "index.html"];
    for (var i = 0; i < files.length; i++) {
      var f = String(files[i]).replace(/\\/g, "/").replace(/^\.?\//, "");
      if (!f || /\.map$/i.test(f) || isMedia(f)) continue;
      if (f === "sw.js" || f === "sw-policy.js" || f === "3d.html" || f.indexOf("assets/legacy-") === 0) continue;
      if (f.indexOf("clips/") === 0 || f.indexOf("models/") === 0) continue; // chỉ app 3D cũ dùng
      if (out.indexOf(f) < 0) out.push(f);
    }
    return out.slice(0, 2).concat(out.slice(2).sort());
  }

  /** Mã bản dựng: băm danh sách tệp (tên có mã băm nội dung), cùng bản thì cùng mã. */
  function buildId(files) {
    var s = files.slice().sort().join("\n");
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  var CACHE_PREFIX = "stage-";
  var STATIC_CACHE = "stage-static";

  /** Tên kho cache của bản dựng. */
  function cacheName(build) {
    return CACHE_PREFIX + "v-" + build;
  }

  /** Kho cache cũ cần xoá khi bản mới chạy (chỉ đụng kho của app này). */
  function staleCaches(names, build) {
    var keep = cacheName(build);
    return names.filter(function (n) {
      return n.indexOf(CACHE_PREFIX) === 0 && n !== keep && n !== STATIC_CACHE;
    });
  }

  root.SWPolicy = {
    classify: classify,
    storable: storable,
    precacheList: precacheList,
    buildId: buildId,
    cacheName: cacheName,
    staleCaches: staleCaches,
    isMedia: isMedia,
    STATIC_CACHE: STATIC_CACHE,
    MAX_BYTES: MAX_BYTES,
  };
})(typeof self !== "undefined" ? self : globalThis);
