// Cột trái: ba thẻ VŨ CÔNG / ĐỘI HÌNH / CẢNH BÁO.

import { useState } from "react";
import {
  type ShapeKind, type VDancer, SHAPE_LABEL, shapePoints, initials, PALETTE,
} from "../model";
import { fmtCounts, fmtTime, tapTempo } from "../timing";
import { st, useProject, useUI } from "../store";
import * as clock from "../clock";
import { useTime } from "../clock";
import {
  addDancer, duplicateDancer, canonOffsets, updateDancer, removeDancer, moveDancerOrder, realign, replaceVideo,
  importFiles, applyShape, mirrorSelected, distributeSelected, sendToWings,
  addFormation, removeFormation, renameBlock, setStage, setBpm,
} from "../actions";
import { useWarnings } from "./hooks";
import { Icon } from "./icons";

export function SidePanel() {
  const ui = useUI();
  const warnings = useWarnings();
  const p = useProject();
  const tab = ui.tab;
  const set = (t: typeof tab) => st().setUI({ tab: t });
  return (
    <aside className="side">
      <div className="tabs" role="tablist">
        <button className={tab === "dancers" ? "on" : ""} onClick={() => set("dancers")}>
          Vũ công <span className="badge ok">{p.dancers.length}</span>
        </button>
        <button className={tab === "formations" ? "on" : ""} onClick={() => set("formations")}>
          Đội hình <span className="badge ok">{p.formations.length}</span>
        </button>
        <button className={tab === "warnings" ? "on" : ""} onClick={() => set("warnings")}>
          Cảnh báo <span className={`badge${warnings.length ? "" : " ok"}`}>{warnings.length}</span>
        </button>
      </div>
      <div className="scroll">
        {tab === "dancers" && <DancersTab />}
        {tab === "formations" && <FormationsTab />}
        {tab === "warnings" && <WarningsTab />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- vũ công

function pickFiles(accept: string, multiple: boolean, cb: (fs: File[]) => void) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = accept;
  inp.multiple = multiple;
  inp.onchange = () => cb(Array.from(inp.files ?? []));
  inp.click();
}
export const pickAnyFiles = () =>
  pickFiles("video/*,audio/*,.json,.webm,.mp4,.mov,.mp3,.wav,.m4a", true, (fs) => importFiles(fs));

function MusicSection() {
  const p = useProject();
  const [tapT, setTapT] = useState<number[]>([]);
  return (
    <div className="section">
      <h4><Icon name="music" size={13} /> Nhạc <span className="grow" /></h4>
      {p.musicId ? (
        <div className="row" style={{ minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.musicName}>
            {p.musicName}
            <div className="dim">{fmtTime(p.musicDuration)}{p.bpm ? ` · ${p.bpm} BPM` : " · chưa đặt nhịp"}</div>
          </div>
          <button className="btn sm" onClick={() => pickFiles("audio/*", false, importFiles)} title="Đổi bài nhạc">Đổi</button>
        </div>
      ) : (
        <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => pickFiles("audio/*", false, importFiles)}>
          <Icon name="upload" /> Chọn bài nhạc
        </button>
      )}
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <label className="field bpm-field" title="Số phách mỗi phút">
          Nhịp
          <input
            type="number" min={40} max={240} step={1} value={p.bpm ?? ""} placeholder="BPM"
            onChange={(e) => setBpm(e.target.value ? Math.max(30, Math.min(300, Number(e.target.value))) : null)}
          />
        </label>
        <button
          className="btn sm" title="Gõ theo nhạc 4 đến 8 lần để đo nhịp"
          onClick={() => {
            const t = performance.now();
            const taps = [...tapT.filter((x) => t - x < 2500), t].slice(-8);
            setTapT(taps);
            const b = tapTempo(taps);
            if (b) setBpm(Math.round(b));
          }}
        >
          Gõ nhịp{tapT.length ? ` (${tapT.length})` : ""}
        </button>
        <button
          className="btn sm" disabled={!p.bpm}
          title="Đặt phách 1 của lượt 8 tại vạch phát hiện tại"
          onClick={() => {
            setBpm(p.bpm, Math.round(clock.now() * 1000) / 1000);
            st().notify("Đã đặt phách 1 tại vạch phát");
          }}
        >
          Đặt phách 1
        </button>
      </div>
    </div>
  );
}

function DancerRow({ d, sel }: { d: VDancer; sel: boolean }) {
  const [editing, setEditing] = useState(false);
  const status = !d.mediaId
    ? { txt: "chưa có video", cls: "" }
    : !d.alignConfident
      ? { txt: "⚠ khớp nhạc chưa chắc", cls: "warn" }
      : { txt: `video ${fmtTime(d.durationSec)} · lệch ${d.offsetSec >= 0 ? "+" : ""}${d.offsetSec.toFixed(2)} s`, cls: "" };
  return (
    <div
      className={`ditem${sel ? " sel" : ""}${d.hidden ? " hid" : ""}`}
      onClick={(e) => {
        const cur = st().ui.selected;
        if (e.shiftKey || e.ctrlKey || e.metaKey)
          st().setUI({ selected: cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id] });
        else st().setUI({ selected: [d.id] });
      }}
      onDoubleClick={() => setEditing(true)}
    >
      <span className="dot" style={{ background: d.color }}>{initials(d.name)}</span>
      <div className="nm">
        {editing ? (
          <input
            className="rename" autoFocus defaultValue={d.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== d.name) updateDancer(d.id, { name: v });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <div>{d.name}</div>
        )}
        <small className={status.cls}>{status.txt}</small>
      </div>
      <div className="acts" onClick={(e) => e.stopPropagation()}>
        <button className="btn sm icon ghost" title="Đổi tên" onClick={() => setEditing(true)}><Icon name="edit" /></button>
        <button className="btn sm icon ghost" title={d.hidden ? "Hiện" : "Ẩn (không tính cảnh báo)"} onClick={() => updateDancer(d.id, { hidden: !d.hidden })}>
          <Icon name={d.hidden ? "eyeOff" : "eye"} />
        </button>
        <button
          className="btn sm icon ghost" title="Nhân bản (dùng chung video, đứng cạnh). Shift-bấm: nhân bản nhiều người"
          onClick={(e) => {
            if (!e.shiftKey) return void duplicateDancer(d.id);
            const n = Number(window.prompt(`Nhân bản ${d.name} thêm bao nhiêu người?`, "3"));
            if (n >= 1) duplicateDancer(d.id, n);
          }}
        >
          <Icon name="copy" />
        </button>
        <button className="btn sm icon ghost danger" title="Xoá vũ công" onClick={() => removeDancer(d.id)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}

function DancerInspector({ d }: { d: VDancer }) {
  const [copies, setCopies] = useState(2);
  const nudge = (v: number) => updateDancer(d.id, { offsetSec: Math.round((d.offsetSec + v) * 1000) / 1000, alignConfident: true });
  return (
    <div className="section">
      <h4>
        <span className="dot" style={{ width: 10, height: 10, borderRadius: 5, background: d.color, display: "inline-block" }} />
        {d.name}
        <span className="grow" />
        <button className="btn sm icon ghost" title="Lên trên" onClick={() => moveDancerOrder(d.id, -1)}><Icon name="up" /></button>
        <button className="btn sm icon ghost" title="Xuống dưới" onClick={() => moveDancerOrder(d.id, 1)}><Icon name="down" /></button>
      </h4>
      <div className="row">
        <button
          className="btn sm" style={{ flex: 1, justifyContent: "center" }}
          onClick={() => pickFiles("video/*", false, (fs) => fs[0] && replaceVideo(d.id, fs[0]))}
        >
          <Icon name="video" /> {d.mediaId ? "Thay video" : "Gắn video"}
        </button>
        {d.mediaId && (
          <button className="btn sm" onClick={() => realign(d.id)} title="Tự khớp video với nhạc bằng tiếng">
            <Icon name="sync" /> Tự khớp
          </button>
        )}
      </div>
      {d.mediaId && (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="dim" style={{ flex: 1 }}>Lệch so với nhạc</span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{d.offsetSec >= 0 ? "+" : ""}{d.offsetSec.toFixed(2)} s</b>
          </div>
          <div className="row">
            {[-0.1, -0.01, 0.01, 0.1].map((v) => (
              <button key={v} className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => nudge(v)}>
                {v > 0 ? "+" : "−"}{Math.abs(v)}
              </button>
            ))}
          </div>
          <label className="field" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={d.stacked} onChange={(e) => updateDancer(d.id, { stacked: e.target.checked })} />
            Video đã xoá phông (nửa dưới là mặt nạ)
          </label>
        </>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn sm" style={{ flex: 1, justifyContent: "center" }}
          title="Thêm bản sao dùng chung video, đứng cạnh người này; mỗi bản chỉnh lệch nhạc riêng được"
          onClick={() => duplicateDancer(d.id, copies)}
        >
          <Icon name="copy" /> Nhân bản thêm
        </button>
        <input
          type="number" min={1} max={30} step={1} value={copies} style={{ width: 52 }}
          onChange={(e) => setCopies(Math.max(1, Math.min(30, Math.floor(Number(e.target.value) || 1))))}
        />
        <span className="dim">người</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="dim" style={{ width: 70 }}>Cao thẻ</span>
        <input
          type="range" min={1.2} max={2.2} step={0.05} value={d.cardHeight} style={{ flex: 1 }}
          onChange={(e) => updateDancer(d.id, { cardHeight: Number(e.target.value) })}
        />
        <span style={{ width: 42, textAlign: "right" }}>{d.cardHeight.toFixed(2)} m</span>
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        {PALETTE.map((c) => (
          <button
            key={c} title={c} onClick={() => updateDancer(d.id, { color: c })}
            style={{ width: 18, height: 18, borderRadius: 9, border: c === d.color ? "2px solid #fff" : "1px solid #0006", background: c, cursor: "pointer", padding: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

/** Chọn nhiều người: lệch video lần lượt (múa canon). */
function CanonSection({ sel }: { sel: string[] }) {
  const p = useProject();
  const beat = p.bpm ? Math.round((60 / p.bpm) * 1000) / 1000 : 0.5;
  const [step, setStep] = useState<number | null>(null);
  const v = step ?? beat;
  const order = p.dancers.filter((d) => sel.includes(d.id));
  return (
    <div className="section">
      <h4>{order.length} người đang chọn</h4>
      <div className="dim" style={{ marginBottom: 6 }}>
        Múa canon: theo thứ tự danh sách, mỗi người sau vào trễ hơn người trước một khoảng
        (giữ lệch của {order[0]?.name ?? "người đầu"}).
      </div>
      <div className="row">
        <label className="field" title={p.bpm ? `1 phách = ${beat} s` : "Chưa đặt nhịp: mặc định 0.5 s"}>
          Mỗi người
          <input
            type="number" step={0.05} value={v} style={{ width: 64 }}
            onChange={(e) => setStep(Number(e.target.value))}
          /> s
        </label>
        {p.bpm && (
          <button className="btn sm" title="Đặt bằng 1 phách" onClick={() => setStep(beat)}>1 phách</button>
        )}
        <button className="btn sm primary" onClick={() => canonOffsets(sel, v)} title="Đặt lệch nhạc lần lượt cho những người đang chọn">
          Lệch canon
        </button>
      </div>
    </div>
  );
}

function DancersTab() {
  const p = useProject();
  const ui = useUI();
  const one = ui.selected.length === 1 ? p.dancers.find((d) => d.id === ui.selected[0]) : undefined;
  return (
    <>
      <MusicSection />
      <div className="section" style={{ paddingBottom: 4 }}>
        <h4>
          Vũ công <span className="grow" />
          <button className="btn sm" onClick={() => st().setUI({ selected: [addDancer()] })} title="Thêm người giữ chỗ (chưa có video)">
            <Icon name="userPlus" /> Thêm
          </button>
        </h4>
      </div>
      <div className="dlist">
        {p.dancers.map((d) => (
          <DancerRow key={d.id} d={d} sel={ui.selected.includes(d.id)} />
        ))}
      </div>
      <div className="drop-hint" onClick={pickAnyFiles}>
        <Icon name="upload" size={16} /><br />
        Thả video từng người và bài nhạc vào bất kỳ đâu,<br />hoặc bấm để chọn tệp
      </div>
      {one && <DancerInspector d={one} />}
      {ui.selected.length >= 2 && <CanonSection sel={ui.selected} />}
    </>
  );
}

// ---------------------------------------------------------------- đội hình

const SHAPES: ShapeKind[] = ["line", "twoLines", "stagger", "arc", "v", "circle", "diagonal"];

function ShapeMini({ kind }: { kind: ShapeKind }) {
  const pts = shapePoints(kind, 6, [0, 0], 4);
  const xs = pts.map((q) => q[0]);
  const zs = pts.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const sx = 24 / Math.max(0.5, maxX - minX);
  const sz = 14 / Math.max(0.5, maxZ - minZ);
  const s = Math.min(sx, sz);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return (
    <svg viewBox="-14 -9 28 18">
      {pts.map((q, i) => (
        <circle key={i} cx={(q[0] - cx) * s} cy={(q[1] - cz) * s} r={1.8} fill="currentColor" />
      ))}
    </svg>
  );
}

function FormationsTab() {
  const p = useProject();
  const ui = useUI();
  const t = useTime();
  const sel = p.formations.find((f) => f.id === ui.selectedBlock);
  const nSel = ui.selected.length;
  const target = nSel >= 2 ? `${nSel} người đang chọn` : "mọi người";
  return (
    <>
      <div className="section">
        <h4>
          Đội hình <span className="grow" />
          <button className="btn sm primary" onClick={addFormation} title="Thêm đội hình sau vạch phát (Enter)">
            <Icon name="plus" /> Thêm
          </button>
        </h4>
        {p.formations.length === 0 && <div className="dim">Chưa có đội hình. Kéo người trên sơ đồ để tạo đội hình đầu tiên.</div>}
        <div className="flist">
          {p.formations.map((f, k) => {
            const cur = t >= f.start && t <= f.end;
            return (
              <div
                key={f.id}
                className={`fitem${ui.selectedBlock === f.id ? " sel" : ""}${cur ? " cur" : ""}`}
                onClick={() => {
                  st().setUI({ selectedBlock: f.id });
                  clock.seek(f.start + 0.001);
                }}
              >
                <span className="fnum">{k + 1}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="meta">{fmtTime(f.start)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {sel && (
        <div className="section">
          <h4>{sel.name} <span className="grow" />
            <button className="btn sm icon ghost danger" title="Xoá đội hình (Delete)" onClick={() => removeFormation(sel.id)}><Icon name="trash" /></button>
          </h4>
          <label className="field">
            Tên
            <input
              type="text" key={sel.id + sel.name} defaultValue={sel.name} style={{ flex: 1, width: "auto" }}
              onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== sel.name && renameBlock(sel.id, e.currentTarget.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          <div className="dim" style={{ marginTop: 6 }}>
            Đứng {fmtTime(sel.start)} → {fmtTime(sel.end)} · {fmtCounts(sel.end - sel.start, p.bpm)}
          </div>
        </div>
      )}
      <div className="section">
        <h4>Xếp nhanh <span className="grow" /><span className="dim" style={{ textTransform: "none", letterSpacing: 0 }}>cho {target}</span></h4>
        <div className="shape-grid">
          {SHAPES.map((k) => (
            <button key={k} onClick={() => applyShape(k)} title={`Xếp ${SHAPE_LABEL[k].toLowerCase()} tại vạch phát`}>
              <ShapeMini kind={k} />
              {SHAPE_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn sm" onClick={mirrorSelected} title="Lật trái phải (M)"><Icon name="mirror" /> Lật</button>
          <button className="btn sm" onClick={distributeSelected} disabled={nSel < 3} title="Dàn đều theo chiều ngang"><Icon name="distribute" /> Dàn đều</button>
          <button className="btn sm" onClick={() => sendToWings(-1)} disabled={!nSel} title="Đưa vào cánh gà trái"><Icon name="wingL" /> Cánh trái</button>
          <button className="btn sm" onClick={() => sendToWings(1)} disabled={!nSel} title="Đưa vào cánh gà phải"><Icon name="wingR" /> Cánh phải</button>
        </div>
      </div>
      <div className="section">
        <h4>Hiển thị</h4>
        <label className="field"><input type="checkbox" checked={ui.showPaths} onChange={(e) => st().setUI({ showPaths: e.target.checked })} /> Đường đi tới đội hình sau</label>
        <label className="field"><input type="checkbox" checked={ui.showGhosts} onChange={(e) => st().setUI({ showGhosts: e.target.checked })} /> Bóng mờ đội hình trước</label>
        <label className="field"><input type="checkbox" checked={ui.showNames} onChange={(e) => st().setUI({ showNames: e.target.checked })} /> Tên dưới mỗi người</label>
        <label className="field"><input type="checkbox" checked={ui.snap} onChange={(e) => st().setUI({ snap: e.target.checked })} /> Bám lưới 25 cm và phách (N)</label>
      </div>
      <div className="section">
        <h4>Sân khấu</h4>
        <div className="row">
          <label className="field">Rộng
            <input type="number" min={4} max={30} step={0.5} value={p.stage.width} onChange={(e) => setStage(Math.max(4, Number(e.target.value) || 4), p.stage.depth)} /> m
          </label>
          <label className="field">Sâu
            <input type="number" min={3} max={20} step={0.5} value={p.stage.depth} onChange={(e) => setStage(p.stage.width, Math.max(3, Number(e.target.value) || 3))} /> m
          </label>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- cảnh báo

function WarningsTab() {
  const ws = useWarnings();
  const p = useProject();
  if (!ws.length)
    return (
      <div className="ok-box">
        ✓ Không thấy ai va nhau, chồng lên nhau hay phải chạy quá nhanh.
        {p.formations.length < 2 && <div className="dim" style={{ marginTop: 6 }}>Thêm đội hình thứ hai để kiểm tra đường chuyển.</div>}
      </div>
    );
  const icon = { collide: "×", overlap: "!", fast: "»" } as const;
  return (
    <div style={{ padding: 6 }}>
      <div className="dim" style={{ padding: "4px 8px 8px" }}>Bấm một dòng để tua tới đúng lúc đó.</div>
      {ws.map((w, i) => (
        <div
          key={i}
          className="warn-item"
          onClick={() => {
            clock.pause();
            clock.seek(w.t);
            st().setUI({ selected: w.ids, selectedBlock: w.formation });
          }}
        >
          <span className={`ic ${w.kind}`}>{icon[w.kind]}</span>
          <div>
            <div>{w.msg}</div>
            <div className="dim">{fmtTime(w.t)}{w.kind === "fast" ? " · nới khoảng chuyển hoặc đứng gần hơn" : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
