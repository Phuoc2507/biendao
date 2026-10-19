// Chạy không cần mạng: đăng ký service worker (public/sw.js) ở bản build và
// báo "Có bản mới" khi bản mới đã cài xong, chờ người dùng bấm Tải lại.
// Service worker chỉ chạy trên https hoặc localhost (xem hướng dẫn, mục 3).

import { st } from "./store";

const CHECK_MS = 30 * 60 * 1000; // điện thoại để app mở cả buổi tập: nửa giờ hỏi bản mới một lần
let wantReload = false;

function offerUpdate(w: ServiceWorker) {
  st().notify("Có bản mới của app. Bấm Tải lại để dùng (bài đã tự lưu).", {
    action: {
      label: "Tải lại",
      run: () => {
        if (st().ui.busy) return void st().notify("Đang xử lý, xong rồi hãy tải lại.", { kind: "warn" });
        wantReload = true;
        w.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}

export function registerOffline(): void {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!sw || !window.isSecureContext) return;
  const base = import.meta.env.BASE_URL || "/";

  // bản mới nhận quyền (sau khi bấm Tải lại): nạp lại trang một lần
  let reloading = false;
  sw.addEventListener("controllerchange", () => {
    if (!wantReload || reloading) return;
    reloading = true;
    location.reload();
  });

  const start = () => {
    sw.register(`${base}sw.js`, { scope: base }).then(
      (reg) => {
        // có bản cũ đang điều khiển trang thì mới gọi là "bản mới"; lần cài đầu thì im lặng
        const offer = () => {
          if (reg.waiting && sw.controller) offerUpdate(reg.waiting);
        };
        offer();
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => w.state === "installed" && offer());
        });
        // quay lại app (mở khoá máy, chuyển thẻ): nhắc lại nếu bản mới vẫn đang chờ
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          offer();
          void reg.update().catch(() => {});
        });
        setInterval(() => void reg.update().catch(() => {}), CHECK_MS);
      },
      () => {}, // không đăng ký được (trình duyệt chặn): app vẫn chạy bình thường khi có mạng
    );
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
