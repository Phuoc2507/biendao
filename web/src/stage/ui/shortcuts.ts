// Phím tắt toàn cục (bỏ qua khi đang gõ chữ).

import { useEffect } from "react";
import { st, type View } from "../store";
import * as clock from "../clock";
import {
  addFormation, removeFormation, jumpFormation, mirrorSelected, nudgeSelected,
  stepBeat, exportProject,
} from "../actions";
import { isTyping } from "./hooks";
import { toggleLoop } from "./Timeline";

const VIEWS: View[] = ["plan", "split", "audience"];

export function useShortcuts() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = st();
      const ui = s.ui;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;

      if (ctrl) {
        const lk = k.toLowerCase();
        if (lk === "z" && !e.shiftKey) s.undo();
        else if (lk === "y" || (lk === "z" && e.shiftKey)) s.redo();
        else if (lk === "s") exportProject();
        else if (lk === "a") s.setUI({ selected: s.project.dancers.map((d) => d.id) });
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;

      if (ui.presenting) {
        if (k === " ") clock.toggle();
        else if (k === "PageDown" || k === "ArrowRight") jumpFormation(1);
        else if (k === "PageUp" || k === "ArrowLeft") jumpFormation(-1);
        else if (k === "Home") clock.seek(0);
        else if (k === "Escape" || k === "f" || k === "F") {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          s.setUI({ presenting: false });
        } else return;
        e.preventDefault();
        return;
      }
      if (ui.help) {
        if (k === "Escape" || k === "?") s.setUI({ help: false });
        e.preventDefault();
        return;
      }

      const sel = ui.selected.length > 0;
      const big = e.shiftKey;
      switch (k) {
        case " ":
          clock.toggle();
          break;
        case "Home":
          clock.seek(0);
          break;
        case "ArrowLeft":
          if (sel) nudgeSelected(big ? -1 : -0.25, 0);
          else stepBeat(big ? -8 : -1);
          break;
        case "ArrowRight":
          if (sel) nudgeSelected(big ? 1 : 0.25, 0);
          else stepBeat(big ? 8 : 1);
          break;
        case "ArrowUp":
          if (!sel) return;
          nudgeSelected(0, big ? -1 : -0.25);
          break;
        case "ArrowDown":
          if (!sel) return;
          nudgeSelected(0, big ? 1 : 0.25);
          break;
        case "Escape":
          s.setUI({ selected: [], selectedBlock: null });
          break;
        case "Enter":
        case "+":
          if (!s.project.dancers.length) return;
          addFormation();
          break;
        case "Delete":
        case "Backspace":
          if (!ui.selectedBlock) return;
          removeFormation(ui.selectedBlock);
          break;
        case "[":
          jumpFormation(-1);
          break;
        case "]":
          jumpFormation(1);
          break;
        case "?":
          s.setUI({ help: true });
          break;
        default: {
          const lk = k.toLowerCase();
          if (lk === "n") s.setUI({ snap: !ui.snap });
          else if (lk === "v") s.setUI({ view: VIEWS[(VIEWS.indexOf(ui.view) + 1) % VIEWS.length] });
          else if (lk === "f") {
            if (s.project.dancers.length) s.setUI({ presenting: true });
          } else if (lk === "m") mirrorSelected();
          else if (lk === "l") toggleLoop();
          else if (lk === "z" && e.shiftKey) window.dispatchEvent(new CustomEvent("stage:fit"));
          else return;
        }
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);
}
