// Màn đầu tiên khi chưa có ai: hai cách bắt đầu và nút xem thử bài mẫu.

import { useState } from "react";
import { st, useProject } from "../store";
import * as clock from "../clock";
import { startWith } from "../actions";
import { canMakeDemo, makeDemoProject } from "../demo";
import { pickAnyFiles } from "./SidePanel";
import { Icon } from "./icons";
import { openLearn } from "./Learn";

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

/** "3:12" */
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function EmptyState() {
  const p = useProject();
  const [n, setN] = useState(6);
  const demoOk = canMakeDemo();
  const hasMusic = !!p.musicId;
  const facts = [p.musicDuration > 0 ? mmss(p.musicDuration) : "", p.bpm ? `${Math.round(p.bpm)} BPM` : ""].filter(Boolean);
  return (
    <div className="empty">
      <div className="card">
        <h1>Xếp đội hình bằng thẻ video</h1>
        <p className="lead">
          Quay từng người múa riêng, xoá phông, rồi đặt mỗi người thành một tấm thẻ trên sân khấu ảo.
          Kéo thẻ để xếp đội hình, app tự cho mọi người trượt theo nhạc.
        </p>
        {hasMusic && (
          <div className="music-ok" role="status">
            <Icon name="music" />
            <div>
              <div>
                Đã có nhạc: <b>{p.musicName || "bài nhạc"}</b>
                {facts.length > 0 && <span className="muted"> ({facts.join(" · ")})</span>}
              </div>
              <div className="muted">Giờ thả video thẻ của từng người vào đây, hoặc bấm Bắt đầu để xếp trước với người giữ chỗ.</div>
            </div>
          </div>
        )}
        <div className="steps">
          <div className="step">
            <h3><span className="n">1</span> {hasMusic ? "Thả video từng người" : "Có video rồi"}</h3>
            <p>
              {hasMusic ? (
                <>Thả video của từng người (tệp <code>.card.mp4</code> đã xoá phông hoặc video thường). App tự khớp từng video với bài nhạc đã nạp.</>
              ) : (
                <>
                  Thả cùng lúc bài nhạc và video từng người (tệp <code>.card.mp4</code> đã xoá phông hoặc video thường).
                  App tự khớp từng video với nhạc.
                </>
              )}
            </p>
            <button className="btn primary" onClick={pickAnyFiles}><Icon name="upload" /> {hasMusic ? "Chọn video…" : "Chọn tệp…"}</button>
            <div className="dim drop-or" style={{ marginTop: 8 }}>hoặc kéo thả tệp vào cửa sổ này</div>
          </div>
          <div className="step">
            <h3><span className="n">2</span> Chưa có video</h3>
            <p>Bắt đầu xếp đội hình với người giữ chỗ, gắn video sau.</p>
            <div className="counter">
              <span className="muted">Có bao nhiêu người múa?</span>
            </div>
            <div className="counter" style={{ marginTop: 6 }}>
              <button className="btn icon" onClick={() => setN(Math.max(1, n - 1))} aria-label="Bớt một người" title="Bớt một người"><Icon name="minus" /></button>
              <input
                type="number" min={1} max={30} value={n} aria-label="Số người múa"
                onChange={(e) => setN(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              />
              <button className="btn icon" onClick={() => setN(Math.min(30, n + 1))} aria-label="Thêm một người" title="Thêm một người"><Icon name="plus" /></button>
              <button className="btn primary" onClick={() => startWith(n)} style={{ marginLeft: 6 }}>Bắt đầu với {n} người</button>
            </div>
          </div>
        </div>
        <div className="demo-row">
          <span className="muted">
            Chỉ cần học phần của mình? Mở video cả đội múa (quay từ phía trước) để soi gương, xem chậm, lặp đoạn và phóng to theo bạn.
          </span>
          <button className="btn" onClick={openLearn}>
            <Icon name="learn" /> Học động tác
          </button>
        </div>
        <div className="demo-row">
          <span className="muted">
            Muốn xem app làm được gì trước? Bài mẫu có nhạc, 6 người múa quạt và 6 đội hình, dựng ngay trong trình duyệt.
          </span>
          <button className="btn" onClick={() => loadDemo(6)} disabled={!demoOk} title={demoOk ? "" : "Trình duyệt này không có WebCodecs, hãy dùng Chrome"}>
            <Icon name="play" /> Xem bài mẫu
          </button>
        </div>
        <p className="empty-note">
          Bài và video lưu ngay trong trình duyệt này, không tải lên mạng; app xin trình duyệt giữ lâu dài.
          Vẫn nên Lưu ra tệp sau mỗi buổi tập để có bản dự phòng.
        </p>
      </div>
    </div>
  );
}
