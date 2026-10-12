// Tệp ▸ In tờ đội hình…: dựng trang in trong khung ẩn rồi gọi hộp thoại in.

import { st } from "../store";
import { describePos } from "../ui/hooks";
import { printHtml } from "./printSheet";

let frame: HTMLIFrameElement | null = null;

export function printFormations() {
  const p = st().project;
  if (!p.formations.length) {
    st().notify("Chưa có đội hình nào để in. Thêm đội hình ở dải thời gian trước.", { kind: "warn" });
    return;
  }
  frame?.remove();
  const f = document.createElement("iframe");
  frame = f;
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    setTimeout(() => {
      f.remove();
      if (frame === f) frame = null;
    }, 500);
  };
  f.onload = () => {
    const w = f.contentWindow;
    if (!w) return cleanup();
    w.addEventListener("afterprint", cleanup);
    // đợi phông chữ và bố cục rồi mới in
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        st().notify("Trình duyệt chặn hộp thoại in.", { kind: "error" });
        cleanup();
      }
      setTimeout(cleanup, 60_000); // trình duyệt không báo afterprint
    }, 150);
  };
  f.srcdoc = printHtml(p, { describe: describePos });
  document.body.appendChild(f);
}
