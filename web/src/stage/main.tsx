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
