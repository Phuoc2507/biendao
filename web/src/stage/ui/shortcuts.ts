// Phím tắt toàn cục (bỏ qua khi đang gõ chữ). Đổi phím thành hành động ở keys.ts.

import { useEffect } from "react";
import { st, type View } from "../store";
import * as clock from "../clock";
import {
  addFormation, removeFormation, jumpFormation, mirrorSelected, nudgeSelected,
  stepBeat, exportProject, projectEnd,
} from "../actions";
import { focusByPointer } from "./hooks";
import { type Action, resolveShortcut, routeKey, targetKind } from "./keys";
import { toggleLoop } from "./Timeline";
import { togglePlanFrom } from "./PlanView";

const VIEWS: View[] = ["plan", "split", "audience"];

export const DELETE_HINT = "Delete xoá đội hình đang chọn. Muốn xoá người, bấm thùng rác ở danh sách Vũ công.";

function run(a: Action, focusedFormation: string | null) {
  const s = st();
  const ui = s.ui;
  switch (a.type) {
    case "save": exportProject(); break;
    case "undo": s.undo(); break;
    case "redo": s.redo(); break;
    case "selectAll": s.setUI({ selected: s.project.dancers.map((d) => d.id) }); break;
    case "toggle": clock.toggle(); break;
    case "seek": clock.seek(a.to === "start" ? 0 : projectEnd()); break;
    case "jump": jumpFormation(a.dir); break;
    case "step": stepBeat(a.beats); break;
    case "nudge": nudgeSelected(a.dx, a.dz); break;
    case "clear": s.setUI({ selected: [], selectedBlock: null }); break;
    case "add": addFormation(); break;
    case "delete": {
      const id = focusedFormation ?? ui.selectedBlock;
      if (id) removeFormation(id);
      break;
    }
    case "deleteHint": s.notify(DELETE_HINT); break;
    case "help": s.setUI({ help: a.open }); break;
    case "snap": s.setUI({ snap: !ui.snap }); break;
    case "planFrom": togglePlanFrom(); break;
    case "view": s.setUI({ view: VIEWS[(VIEWS.indexOf(ui.view) + 1) % VIEWS.length] }); break;
    case "present": s.setUI({ presenting: true }); break;
    case "exit":
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      s.setUI({ presenting: false });
      break;
    case "mirror": mirrorSelected(); break;
    case "loop": toggleLoop(); break;
    case "fit": window.dispatchEvent(new CustomEvent("stage:fit")); break;
  }
}

export function useShortcuts() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // ô hoặc dòng đã tự xử lý phím (Enter ở dòng danh sách, Esc ở ô số...)
      if (e.defaultPrevented || e.isComposing) return;
      const el = e.target instanceof Element ? (e.target as HTMLElement) : null;
      const kind = targetKind(el);
      const ctrl = e.ctrlKey || e.metaKey;
      if (kind === "text") {
        // đang gõ chữ: chỉ nhận Ctrl S, chốt ô đang gõ rồi mới lưu
        if (ctrl && !e.altKey && e.key.toLowerCase() === "s") {
          e.preventDefault();
          el?.blur();
          exportProject();
        }
        return;
      }
      const s = st();
      const ui = s.ui;
      const fEl = el?.closest<HTMLElement>("[data-formation]") ?? null;
      const a = resolveShortcut(
        { key: e.key, ctrl, shift: e.shiftKey, alt: e.altKey, repeat: e.repeat },
        {
          presenting: ui.presenting,
          help: ui.help,
          hasSelection: ui.selected.length > 0,
          hasDancers: s.project.dancers.length > 0,
          hasBlock: !!ui.selectedBlock,
          formationFocused: !!fEl,
        },
      );
      if (!a) return;
      // vừa bấm chuột vào nút/ô đánh dấu/thanh kéo thì phím tắt thắng, đi tới bằng Tab thì ô giữ phím của nó
      const route = routeKey(kind, e.key, { pointerFocus: focusByPointer(), presenting: ui.presenting });
      if (route === "skip") return;
      e.preventDefault();
      if (route === "steal") el?.blur();
      run(a, fEl?.dataset.formation ?? null);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);
}
