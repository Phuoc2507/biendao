// Bố cục app sân khấu thẻ video.

import { useEffect, useRef } from "react";
import { st, useProject, useUI } from "./store";
import * as clock from "./clock";
import { mirrorSelected, distributeSelected, sendToWings } from "./actions";
import { savedSide } from "./layout";
import { QUOTA_MSG, requestPersist } from "./storage";
import { TopBar } from "./ui/TopBar";
import { SidePanel } from "./ui/SidePanel";
import { Timeline } from "./ui/Timeline";
import { PlanView } from "./ui/PlanView";
import { AudienceView } from "./ui/AudienceView";
import { EmptyState } from "./ui/EmptyState";
import { Present } from "./ui/Present";
import { Busy, DropZone, Help, ToastView } from "./ui/Overlays";
import { useShortcuts } from "./ui/shortcuts";
import { closeSide, usePhone, useSplitDir } from "./ui/useLayout";
import { Icon } from "./ui/icons";

function SelectionHud({ phone }: { phone: boolean }) {
  const ui = useUI();
  const p = useProject();
  const n = ui.selected.length;
  if (!n) return null;
  const name = n === 1 ? p.dancers.find((d) => d.id === ui.selected[0])?.name : null;
  return (
    <div className="hud">
      <span className="lbl">{name ?? `${n} người`}{phone ? "" : " · mũi tên để dịch"}</span>
      <span className="sep" />
      <button className="btn sm" onClick={mirrorSelected} title="Lật trái phải (M)"><Icon name="mirror" /> Lật</button>
      {n >= 3 && <button className="btn sm" onClick={distributeSelected} title="Dàn đều ngang"><Icon name="distribute" /> Dàn đều</button>}
      <button className="btn sm" onClick={() => sendToWings(-1)} title="Vào cánh gà trái" aria-label="Vào cánh gà trái"><Icon name="wingL" /></button>
      <button className="btn sm" onClick={() => sendToWings(1)} title="Vào cánh gà phải" aria-label="Vào cánh gà phải"><Icon name="wingR" /></button>
      <span className="sep" />
      <button className="btn sm icon ghost" onClick={() => st().setUI({ selected: [] })} title="Bỏ chọn (Esc)" aria-label="Bỏ chọn"><Icon name="close" /></button>
    </div>
  );
}

function Main({ phone }: { phone: boolean }) {
  const ui = useUI();
  const ref = useRef<HTMLElement>(null);
  const showPlan = ui.view !== "audience";
  const showAud = ui.view !== "plan";
  // Cả hai: vùng chính rộng thì hai khung cạnh nhau, cao hẹp thì chồng trên dưới
  const dir = useSplitDir(ref, showPlan && showAud);
  return (
    <main className={`main${showPlan && showAud && dir === "col" ? " stack" : ""}`} ref={ref}>
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
      <SelectionHud phone={phone} />
    </main>
  );
}

export function App() {
  const ui = useUI();
  const p = useProject();
  const phone = usePhone();
  useShortcuts();

  // hoàn tác / mở dự án có thể đổi video hay độ lệch: đồng bộ lại video theo nhạc
  useEffect(() => {
    clock.resync();
  }, [p.dancers]);

  // sang cỡ điện thoại thì đóng cột trái; về máy tính thì theo lựa chọn đã nhớ
  useEffect(() => {
    const open = !phone && savedSide() !== "0";
    if (st().ui.sideOpen !== open) st().setUI({ sideOpen: open });
  }, [phone]);

  // ngăn kéo cột trái trên điện thoại: Esc để đóng (khi có bàn phím)
  useEffect(() => {
    if (!phone || !ui.sideOpen) return;
    const down = (e: KeyboardEvent) => e.key === "Escape" && closeSide();
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [phone, ui.sideOpen]);

  // đã có bài thì xin trình duyệt giữ dữ liệu lâu dài (một lần, lặng lẽ)
  const hasWork = p.dancers.length > 0 || !!p.musicId;
  useEffect(() => {
    if (hasWork) void requestPersist();
  }, [hasWork]);

  // không lưu được: báo một lần cho mỗi đợt lỗi; ô "Không lưu được" ở thanh trên vẫn hiện tiếp
  const told = useRef(false);
  useEffect(() => {
    if (ui.saveState === "saved") told.current = false;
    if (ui.saveState !== "error" || told.current) return;
    told.current = true;
    st().notify(
      ui.saveError === QUOTA_MSG ? QUOTA_MSG : "Không lưu được vào trình duyệt — hãy Lưu ra tệp (Ctrl S) để giữ bài",
      { kind: "error" },
    );
  }, [ui.saveState, ui.saveError]);

  if (!ui.loaded) return <div className="empty"><div className="dim">Đang mở…</div></div>;

  const empty = p.dancers.length === 0;
  const cls = phone ? `app phone${ui.sideOpen ? " drawer" : ""}` : `app${ui.sideOpen ? "" : " noside"}`;
  return (
    <>
      {ui.presenting && !empty ? (
        <Present />
      ) : (
        <div className={cls}>
          <TopBar phone={phone} />
          <SidePanel />
          {phone && ui.sideOpen && <div className="side-scrim" onClick={closeSide} aria-hidden="true" />}
          {empty ? (
            <main className="main"><EmptyState /></main>
          ) : (
            <Main phone={phone} />
          )}
          {!empty && <Timeline />}
        </div>
      )}
      <DropZone />
      <Busy />
      <Help />
      <ToastView />
    </>
  );
}
