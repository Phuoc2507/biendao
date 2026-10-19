import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import "./public/sw-policy.js"; // gắn globalThis.SWPolicy (luật cache dùng chung với sw.js)

interface SWPolicyApi {
  precacheList(files: string[]): string[];
  buildId(files: string[]): string;
}
const policy = (globalThis as unknown as { SWPolicy: SWPolicyApi }).SWPolicy;

/** Liệt kê mọi tệp trong thư mục (đường dẫn tương đối, dấu "/"). */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).replace(/\\/g, "/"));
  }
  return out;
}

/**
 * Chạy không cần mạng: sau khi build, điền vào dist/sw.js mã bản dựng và danh
 * sách tệp cất sẵn (tên tệp vite có mã băm nên phải điền lúc build). Bản dựng
 * đổi thì sw.js đổi, trình duyệt cài bản mới và app báo "Có bản mới".
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "stage-sw",
    apply: "build",
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    writeBundle() {
      const sw = join(outDir, "sw.js");
      const files = walk(outDir);
      const list = policy.precacheList(files);
      const src = readFileSync(sw, "utf8")
        .replace('"__BUILD__"', JSON.stringify(policy.buildId(files)))
        .replace("[/*__PRECACHE__*/]", JSON.stringify(list));
      writeFileSync(sw, src);
    },
  };
}

// Hai trang: "/" là sân khấu thẻ video (app chính), "/3d.html" là app hình nộm 3D cũ.
// Đường dẫn tính từ thư mục web/ (nơi chạy npm).
export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: { main: "index.html", legacy: "3d.html" },
    },
  },
});
