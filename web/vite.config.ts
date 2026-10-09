import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Hai trang: "/" là sân khấu thẻ video (app chính), "/3d.html" là app hình nộm 3D cũ.
// Đường dẫn tính từ thư mục web/ (nơi chạy npm).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: { main: "index.html", legacy: "3d.html" },
    },
  },
});
