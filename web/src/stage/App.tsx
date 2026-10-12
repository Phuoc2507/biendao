// Bố cục app sân khấu thẻ video.

import { useEffect } from "react";
import { st, useProject, useUI } from "./store";
import * as clock from "./clock";
import { mirrorSelected, distributeSelected, sendToWings } from "./actions";
import { TopBar } from "./ui/TopBar";
import { SidePanel } from "./ui/SidePanel";
import { Timeline } from "./ui/Timeline";
import { PlanView } from "./ui/PlanView";
import { AudienceView } from "./ui/AudienceView";
import { EmptyState } from "./ui/EmptyState";
import { Present } from "./ui/Present";
import { Busy, DropZone, Help, ToastView } from "./ui/Overlays";
import { useShortcuts } from "./ui/shortcuts";
import { Icon } from "./ui/icons";
import { SaveGuard } from "./ui/SaveGuard";

function SelectionHud() {
  const ui = useUI();
  const p = useProject();
  const n = ui.selected.length;
  if (!n) return null;
  const name = n === 1 ? p.dancers.find((d) => d.id === ui.selected[0])?.name : null;
  return (
    <div className="hud">
      <span className="lbl">{name ?? `${n} người`} · mũi tên để dịch</span>
      <span className="sep" />
      <button className="btn sm" onClick={mirrorSelected} title="Lật trái phải (M)"><Icon name="mirror" /> Lật</button>
      {n >= 3 && <button className="btn sm" onClick={distributeSelected} title="Dàn đều ngang"><Icon name="distribute" /> Dàn đều</button>}
      <button className="btn sm" onClick={() => sendToWings(-1)} title="Vào cánh gà trái"><Icon name="wingL" /></button>
      <button className="btn sm" onClick={() => sendToWings(1)} title="Vào cánh gà phải"><Icon name="wingR" /></button>
      <span className="sep" />
      <button className="btn sm icon ghost" onClick={() => st().setUI({ selected: [] })} title="Bỏ chọn (Esc)"><Icon name="close" /></button>
    </div>
  );
}

function Main() {
  const ui = useUI();
  const showPlan = ui.view !== "audience";
  const showAud = ui.view !== "plan";
  return (
    <main className="main">
      {showPlan && (
        <div className="pane">
          <div className="pane-label">Sơ đồ (nhìn từ trên)</div>
          <PlanView />
        </div>
      )}
      {showAud && (
        <div className="pane">
          <div className="pane-label">Khán giả thấy</div>
          <AudienceView />
        </div>
      )}
      <SelectionHud />
    </main>
  );
}

export function App() {
  const ui = useUI();
  const p = useProject();
  useShortcuts();

  // hoàn tác / mở dự án có thể đổi video hay độ lệch: đồng bộ lại video theo nhạc
  useEffect(() => {
    clock.resync();
  }, [p.dancers]);

  if (!ui.loaded) return <div className="empty"><div className="dim">{ui.busy?.msg ?? "Đang mở…"}</div></div>;

  const empty = p.dancers.length === 0;
  return (
    <>
      {ui.presenting && !empty ? (
        <Present />
      ) : (
        <div className="app">
          <TopBar />
          <SidePanel />
          {empty ? (
            <main className="main"><EmptyState /></main>
          ) : (
            <Main />
          )}
          {!empty && <Timeline />}
        </div>
      )}
      <DropZone />
      <Busy />
      <Help />
      <ToastView />
      <SaveGuard />
    </>
  );
}
