// Màn đầu tiên khi chưa có ai: hai cách bắt đầu và nút xem thử bài mẫu.

import { useState } from "react";
import { st } from "../store";
import * as clock from "../clock";
import { startWith } from "../actions";
import { canMakeDemo, makeDemoProject } from "../demo";
import { pickAnyFiles } from "./SidePanel";
import { Icon } from "./icons";

export async function loadDemo(n = 6) {
  clock.pause();
  st().setUI({ busy: { msg: "Đang dựng bài mẫu…", progress: 0 } });
  try {
    const p = await makeDemoProject(n, (msg, progress) => st().setUI({ busy: { msg, progress } }));
    st().commit(() => p);
    st().setUI({ selected: [], selectedBlock: null });
    clock.resync();
    clock.seek(0);
    st().notify("Bài mẫu đã sẵn sàng: bấm Space để phát");
  } catch (e) {
    st().notify(`Không dựng được bài mẫu: ${(e as Error).message}`, { kind: "error" });
  } finally {
    st().setUI({ busy: null });
  }
}

export function EmptyState() {
  const [n, setN] = useState(6);
  const demoOk = canMakeDemo();
  return (
    <div className="empty">
      <div className="card">
        <h1>Xếp đội hình bằng thẻ video</h1>
        <p className="lead">
          Quay từng người múa riêng, xoá phông, rồi đặt mỗi người thành một tấm thẻ trên sân khấu ảo.
          Kéo thẻ để xếp đội hình, app tự cho mọi người trượt theo nhạc.
        </p>
        <div className="steps">
          <div className="step">
            <h3><span className="n">1</span> Có video rồi</h3>
            <p>
              Thả cùng lúc bài nhạc và video từng người (tệp <code>.card.mp4</code> đã xoá phông hoặc video thường).
              App tự khớp từng video với nhạc.
            </p>
            <button className="btn primary" onClick={pickAnyFiles}><Icon name="upload" /> Chọn tệp…</button>
            <div className="dim" style={{ marginTop: 8 }}>hoặc kéo thả tệp vào cửa sổ này</div>
          </div>
          <div className="step">
            <h3><span className="n">2</span> Chưa có video</h3>
            <p>Bắt đầu xếp đội hình với người giữ chỗ, gắn video sau.</p>
            <div className="counter">
              <span className="muted">Có bao nhiêu người múa?</span>
            </div>
            <div className="counter" style={{ marginTop: 6 }}>
              <button className="btn icon" onClick={() => setN(Math.max(1, n - 1))}><Icon name="minus" /></button>
              <input type="number" min={1} max={30} value={n} onChange={(e) => setN(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
              <button className="btn icon" onClick={() => setN(Math.min(30, n + 1))}><Icon name="plus" /></button>
              <button className="btn primary" onClick={() => startWith(n)} style={{ marginLeft: 6 }}>Bắt đầu</button>
            </div>
          </div>
        </div>
        <div className="demo-row">
          <span className="muted">
            Muốn xem app làm được gì trước? Bài mẫu có nhạc, 6 người múa quạt và 6 đội hình, dựng ngay trong trình duyệt.
          </span>
          <button className="btn" onClick={() => loadDemo(6)} disabled={!demoOk} title={demoOk ? "" : "Trình duyệt này không có WebCodecs, hãy dùng Chrome"}>
            <Icon name="play" /> Xem bài mẫu
          </button>
        </div>
      </div>
    </div>
  );
}
