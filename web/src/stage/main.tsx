import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./stage.css";
import { App } from "./App";
import { boot } from "./actions";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
boot();

if (import.meta.env.DEV) {
  // tay cầm để soát lỗi từ console khi chạy dev
  void Promise.all([import("./store"), import("./clock"), import("./media")]).then(([store, clock, media]) => {
    (window as unknown as Record<string, unknown>).__stage = { st: store.st, clock, media };
  });
}
