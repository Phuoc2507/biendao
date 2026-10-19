// Cột trái: ba thẻ VŨ CÔNG / ĐỘI HÌNH / CẢNH BÁO.

import { useEffect, useRef, useState } from "react";
import {
  type Project, type ShapeKind, type VDancer, type Vec2, type CanonOrder, SHAPE_LABEL, CANON_ORDER_LABEL, shapePoints, initials, PALETTE,
  segmentAt, personNote, PERSON_NOTE_MAX,
} from "../model";
import { fmtCounts, fmtTime, tapTempo } from "../timing";
import { st, useProject, useUI } from "../store";
import * as clock from "../clock";
import {
  addDancer, duplicateDancer, canonOffsets, updateDancer, removeDancer, moveDancerOrder, realign, realignAll, replaceVideo,
  importFiles, applyShape, mirrorSelected, distributeSelected, swapSelected, rotateSelected, scaleSelected, sendToWings,
  addFormation, removeFormation, renameBlock, setNote, setPersonNote, setStage, setBpm, saveMyShape, applyMyShape, removeMyShape,
  canonSection, clearCanonSection, mirrorGroup, setFlip, fixReassign, fixWiden, fixStagger, fixAllWarnings,
  saveGroup, selectGroup, renameGroupTo, recolorGroupTo, updateGroupFromSelection, addSelectedToGroup, removeGroup, setGroupRings,
} from "../actions";
import { groupPick, isGroupPicked } from "../groups";
import { rowKeys, useHoldIndex, useNoteIndex, useWarnings } from "./hooks";
import { reassignFix, staggerFix, widenFix } from "../fixes";
import { isSoft } from "../checks";
import { AutoPlanSection } from "./AutoPlanSection";
import { LibrarySection } from "./LibrarySection";
import { NumField } from "./NumField";
import { commaDec, fmtNum, fmtSigned } from "./num";
import { Icon } from "./icons";
import { FACINGS, faceVec, facingName, facingOf } from "../facing";
import { setFacingNow } from "../actions";

const patchDancer = (id: string, patch: Partial<VDancer>) => (q: Project): Project => ({
  ...q,
  dancers: q.dancers.map((d) => (d.id === id ? { ...d, ...patch } : d)),
});

const COLOR_NAME: Record<string, string> = {
  "#ff5d6c": "đỏ hồng", "#4f9dff": "xanh dương", "#3ad07a": "xanh lá", "#ffb020": "vàng", "#b07cff": "tím",
  "#2fd3d3": "xanh ngọc", "#ff7ac6": "hồng", "#c7e04a": "vàng chanh", "#ff8a3d": "cam", "#8fa3c0": "xám xanh",
  "#e05252": "đỏ", "#5b6cff": "chàm",
};

export function SidePanel() {
  const ui = useUI();
  const warnings = useWarnings();
  const p = useProject();
  const tab = ui.tab;
  const set = (t: typeof tab) => st().setUI({ tab: t });
  return (
    <aside className="side">
      <div className="tabs" role="tablist" aria-label="Bảng bên">
        <button role="tab" aria-selected={tab === "dancers"} className={tab === "dancers" ? "on" : ""} onClick={() => set("dancers")}>
          Vũ công <span className="badge ok">{p.dancers.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "formations"} className={tab === "formations" ? "on" : ""} onClick={() => set("formations")}>
          Đội hình <span className="badge ok">{p.formations.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "warnings"} className={tab === "warnings" ? "on" : ""} onClick={() => set("warnings")}>
          Cảnh báo <span className={`badge${warnings.length ? "" : " ok"}`}>{warnings.length}</span>
        </button>
      </div>
      <div className="scroll" role="tabpanel">
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
            <div className="dim">{fmtTime(p.musicDuration)}{p.bpm ? ` · ${fmtNum(p.bpm)} BPM` : " · chưa đặt nhịp"}</div>
          </div>
          <button className="btn sm" onClick={() => pickFiles("audio/*", false, importFiles)} title="Đổi bài nhạc">Đổi</button>
        </div>
      ) : (
        <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => pickFiles("audio/*", false, importFiles)}>
          <Icon name="upload" /> Chọn bài nhạc
        </button>
      )}
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <label className="field bpm-field" title="Số phách mỗi phút (30 đến 300). Gõ số rồi Enter">
          Nhịp
          <NumField
            value={p.bpm} min={30} max={300} quantum={0.1} step={1} allowEmpty placeholder="BPM"
            style={{ width: 52 }} aria-label="Nhịp (BPM)"
            onCommit={(v) => setBpm(v)}
          />
        </label>
        <button
          className="btn sm" title="Gõ theo nhạc 4 đến 8 lần để đo nhịp"
          onClick={() => {
            const t = performance.now();
            const taps = [...tapT.filter((x) => t - x < 2500), t].slice(-8);
            setTapT(taps);
            const b = tapTempo(taps);
            // cả loạt gõ chỉ là một bước hoàn tác
            if (b) setBpm(Math.max(30, Math.min(300, Math.round(b))), undefined, "tap");
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
      : { txt: `video ${fmtTime(d.durationSec)} · lệch ${fmtSigned(d.offsetSec)} s`, cls: "" };
  // dòng là group chứ không phải button vì trong dòng còn các nút Đổi tên, Ẩn, Xoá
  const select = (add = false) => {
    const cur = st().ui.selected;
    if (add) st().setUI({ selected: cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id] });
    else st().setUI({ selected: [d.id] });
  };
  return (
    <div
      className={`ditem${sel ? " sel" : ""}${d.hidden ? " hid" : ""}`}
      role="group" aria-label={`${d.name}${sel ? ", đang chọn" : ""}. Enter để chọn`}
      {...rowKeys(() => select())}
      onClick={(e) => select(e.shiftKey || e.ctrlKey || e.metaKey)}
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
        <button className="btn sm icon ghost" title="Đổi tên" aria-label={`Đổi tên ${d.name}`} onClick={() => setEditing(true)}><Icon name="edit" /></button>
        <button
          className="btn sm icon ghost" title={d.hidden ? "Hiện" : "Ẩn (không tính cảnh báo)"}
          aria-label={`${d.hidden ? "Hiện" : "Ẩn"} ${d.name}`} onClick={() => updateDancer(d.id, { hidden: !d.hidden })}
        >
          <Icon name={d.hidden ? "eyeOff" : "eye"} />
        </button>
        <button
          className="btn sm icon ghost" title="Nhân bản (dùng chung video, đứng cạnh). Shift-bấm: nhân bản nhiều người"
          aria-label={`Nhân bản ${d.name}`}
          onClick={(e) => {
            if (!e.shiftKey) return void duplicateDancer(d.id);
            const n = Number(window.prompt(`Nhân bản ${d.name} thêm bao nhiêu người?`, "3"));
            if (n >= 1) duplicateDancer(d.id, n);
          }}
        >
          <Icon name="copy" />
        </button>
        <button className="btn sm icon ghost danger" title="Xoá vũ công" aria-label={`Xoá ${d.name}`} onClick={() => removeDancer(d.id)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}

/**
 * Ghi chú riêng của người d ở đội hình tại vạch phát (đang chuyển: đội hình sắp
 * tới). Đang gõ thì giữ chặt đội hình lúc bấm vào ô, để nhạc chạy sang khối
 * khác không làm mất chữ đang gõ hay ghi nhầm chỗ.
 */
function PersonNoteField({ d }: { d: VDancer }) {
  const p = useProject();
  const k = useNoteIndex(p.formations);
  const [pin, setPin] = useState<string | null>(null);
  const f = (pin && p.formations.find((x) => x.id === pin)) || (k >= 0 ? p.formations[k] : null);
  if (!f) return null;
  const note = personNote(f, d.id);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="dim">Ghi chú riêng ở {f.name}</div>
      <label className="field note-field" style={{ marginTop: 2 }}>
        <textarea
          key={f.id + d.id + note} defaultValue={note} rows={2} maxLength={PERSON_NOTE_MAX}
          aria-label={`Ghi chú riêng cho ${d.name} ở ${f.name}`}
          placeholder="Ghi chú riêng cho bạn này ở đội hình này (cầm quạt, quỳ nhịp 7...)"
          onFocus={() => setPin(f.id)}
          onBlur={(e) => {
            setPersonNote(f.id, d.id, e.currentTarget.value);
            setPin(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </label>
    </div>
  );
}

// mũi tên theo hướng trên màn hình (cột, hàng lệch khỏi ô giữa)
const FACE_ARROW: Record<string, string> = {
  "-1,-1": "↖", "0,-1": "↑", "1,-1": "↗", "-1,0": "←", "1,0": "→", "-1,1": "↙", "0,1": "↓", "1,1": "↘",
};

/** Tám nút hướng mặt của một người ở đội hình tại vạch phát (đang chuyển: đội hình sắp tới). */
function FacingPicker({ d }: { d: VDancer }) {
  const p = useProject();
  const ui = useUI();
  const k = useNoteIndex(p.formations);
  const f = k >= 0 ? p.formations[k] : null;
  if (!f || !(d.id in f.pos)) return null;
  const cur = facingOf(f, d.id);
  // mũi tên chỉ đúng chiều như trên sơ đồ: xem từ sân khấu thì lật cả hai trục
  const s = ui.planFromStage ? -1 : 1;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="dim">Hướng mặt ở {f.name}: {facingName(cur)} (Q quay 45 độ)</div>
      <div role="radiogroup" aria-label={`Hướng mặt của ${d.name} ở ${f.name}`}
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 30px)", gridTemplateRows: "repeat(3, 30px)", gap: 2, marginTop: 2 }}>
        {FACINGS.map((a) => {
          const [vx, vz] = faceVec(a);
          const dc = Math.round(vx) * s + 0, dr = Math.round(vz) * s + 0;
          const on = a === cur;
          return (
            <button key={a} type="button" role="radio" aria-checked={on} className={`btn sm${on ? " on" : ""}`}
              style={{ gridColumn: dc + 2, gridRow: dr + 2, padding: 0, width: 30, height: 30, justifyContent: "center" }}
              title={facingName(a)} aria-label={facingName(a)} onClick={() => setFacingNow(f.id, d.id, a)}>
              {FACE_ARROW[`${dc},${dr}`]}
            </button>
          );
        })}
        <span className="dim" aria-hidden="true" style={{ gridColumn: 2, gridRow: 2, textAlign: "center", lineHeight: "30px", fontSize: 11 }}>
          {d.name.slice(0, 3)}
        </span>
      </div>
    </div>
  );
}

function DancerInspector({ d }: { d: VDancer }) {
  const [copies, setCopies] = useState(2);
  const drag = useRef(false);
  const nudge = (v: number) => updateDancer(d.id, { offsetSec: Math.round((d.offsetSec + v) * 1000) / 1000, alignConfident: true });
  // kéo thanh Cao thẻ bằng chuột: cả lần kéo là một bước hoàn tác
  const startDrag = () => {
    drag.current = true;
    st().beginGesture();
    const up = () => {
      drag.current = false;
      st().endGesture();
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return (
    <div className="section">
      <h4>
        <span className="dot" style={{ width: 10, height: 10, borderRadius: 5, background: d.color, display: "inline-block" }} />
        {d.name}
        <span className="grow" />
        <button className="btn sm icon ghost" title="Lên trên" aria-label="Đưa lên trên trong danh sách" onClick={() => moveDancerOrder(d.id, -1)}><Icon name="up" /></button>
        <button className="btn sm icon ghost" title="Xuống dưới" aria-label="Đưa xuống dưới trong danh sách" onClick={() => moveDancerOrder(d.id, 1)}><Icon name="down" /></button>
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
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSigned(d.offsetSec)} s</b>
          </div>
          <div className="row">
            {[-0.1, -0.01, 0.01, 0.1].map((v) => (
              <button
                key={v} className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => nudge(v)}
                aria-label={`Lệch thêm ${v > 0 ? "+" : "−"}${fmtNum(Math.abs(v))} giây`}
              >
                {v > 0 ? "+" : "−"}{fmtNum(Math.abs(v))}
              </button>
            ))}
          </div>
          <label className="field" style={{ marginTop: 8 }} title="Bật khi đây là tệp .card.mp4 do công cụ tách nền xuất ra (nửa dưới là mặt nạ)">
            <input type="checkbox" checked={d.stacked} onChange={(e) => updateDancer(d.id, { stacked: e.target.checked })} />
            Thẻ đã tách nền (tệp .card.mp4)
          </label>
          <label className="field" style={{ marginTop: 4 }} title="Lật ngang hình như soi gương: người múa đối xứng với bản gốc (tay trái thành tay phải)">
            <input type="checkbox" checked={!!d.flip} onChange={(e) => updateDancer(d.id, { flip: e.target.checked })} />
            Lật gương (múa đối xứng)
          </label>
          {!!d.canon?.length && (
            <div className="dim" style={{ marginTop: 4 }}>
              Canon: {d.canon.map((s) => `${fmtTime(s.start)} tới ${fmtTime(s.end)} trễ ${fmtNum(s.lag)} s`).join("; ")}
            </div>
          )}
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
        <label className="field">
          <NumField
            value={copies} min={1} max={30} quantum={1} step={1} style={{ width: 52 }} aria-label="Số bản sao"
            onCommit={(v) => setCopies(v ?? 1)}
          />
          người
        </label>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="dim" style={{ width: 70 }}>Cao thẻ</span>
        <input
          type="range" min={1.2} max={2.2} step={0.05} value={d.cardHeight} style={{ flex: 1 }} aria-label="Cao thẻ (m)"
          onPointerDown={startDrag}
          onChange={(e) => {
            const fn = patchDancer(d.id, { cardHeight: Number(e.target.value) });
            // phím mũi tên trên thanh: các lần bấm liền nhau gộp một bước
            if (drag.current) st().live(fn);
            else st().commit(fn, "cardH:" + d.id);
          }}
        />
        <span style={{ width: 42, textAlign: "right" }}>{fmtNum(d.cardHeight, 2)} m</span>
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }} role="group" aria-label="Màu">
        {PALETTE.map((c) => (
          <button
            key={c} title={COLOR_NAME[c] ?? c} aria-label={`Màu ${COLOR_NAME[c] ?? c}`} aria-pressed={c === d.color}
            onClick={() => updateDancer(d.id, { color: c })}
            style={{ width: 18, height: 18, borderRadius: 9, border: c === d.color ? "2px solid #fff" : "1px solid #0006", background: c, cursor: "pointer", padding: 0 }}
          />
        ))}
      </div>
      <FacingPicker d={d} />
      <PersonNoteField d={d} />
    </div>

  );
}

/** Đoạn mặc định cho canon: vùng lặp, không thì khối đội hình đang đứng, không thì 2×8 từ đây. */
function defaultRange(p: Project): [number, number] {
  const loop = clock.getLoop();
  if (loop) return [loop.a, loop.b];
  const t = clock.now();
  const s = segmentAt(p.formations, t);
  if (s.kind === "hold") return [p.formations[s.k].start, p.formations[s.k].end];
  const len = p.bpm ? (16 * 60) / p.bpm : 8;
  return [t, t + len];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Chọn nhiều người: canon theo đoạn, đối xứng gương, canon cả bài. */
function CanonSection({ sel }: { sel: string[] }) {
  const p = useProject();
  const beat = p.bpm ? Math.round((60 / p.bpm) * 1000) / 1000 : 0.5;
  const [step, setStep] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number]>(() => defaultRange(p));
  const [how, setHow] = useState<CanonOrder>("ltr");
  const v = step ?? beat;
  const order = p.dancers.filter((d) => sel.includes(d.id));
  const anyFlip = order.some((d) => d.flip);
  const nCanon = order.filter((d) => d.canon?.some((s) => s.end > range[0] && s.start < range[1])).length;
  const stepTitle = p.bpm ? `1 phách = ${fmtNum(beat)} s` : "Chưa đặt nhịp: mặc định 0,5 s";
  return (
    <div className="section">
      <h4>{order.length} người đang chọn: tổ hợp</h4>
      <div className="dim" style={{ marginBottom: 6 }}>
        Canon theo đoạn: trong đoạn nhạc này từng lượt vào trễ dần (người sau đứng chờ rồi múa
        đúng động tác), hết đoạn cả nhóm khớp lại đồng loạt.
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <label className="field">
          Từ
          <NumField value={r2(range[0])} min={0} max={36000} quantum={0.01} step={0.1} style={{ width: 58 }} aria-label="Canon bắt đầu (giây)"
            onCommit={(x) => x !== null && setRange([x, range[1]])} /> s
        </label>
        <label className="field">
          tới
          <NumField value={r2(range[1])} min={0} max={36000} quantum={0.01} step={0.1} style={{ width: 58 }} aria-label="Canon kết thúc (giây)"
            onCommit={(x) => x !== null && setRange([range[0], x])} /> s
        </label>
        <button className="btn sm" onClick={() => setRange(defaultRange(st().project))}
          title="Lấy vùng lặp A B nếu có, không thì khối đội hình đang đứng ở vạch phát">
          Lấy đoạn hiện tại
        </button>
      </div>
      <div className="row" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
        <label className="field">
          Thứ tự
          <select value={how} onChange={(e) => setHow(e.target.value as CanonOrder)} aria-label="Thứ tự vào canon">
            {(Object.keys(CANON_ORDER_LABEL) as CanonOrder[]).map((k) => (
              <option key={k} value={k}>{CANON_ORDER_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label className="field" title={stepTitle}>
          Mỗi lượt trễ
          <NumField
            value={v} min={0.05} max={10} quantum={0.001} step={0.05} style={{ width: 58 }} aria-label="Mỗi lượt trễ hơn (giây)"
            onCommit={(x) => setStep(x ?? beat)}
          /> s
        </label>
        {p.bpm && (
          <>
            <button className="btn sm" title={stepTitle} onClick={() => setStep(beat)}>1 phách</button>
            <button className="btn sm" title="Đặt bằng 2 phách" onClick={() => setStep(Math.round(beat * 2000) / 1000)}>2 phách</button>
          </>
        )}
      </div>
      <div className="row" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
        <button className="btn sm primary" onClick={() => canonSection(sel, range[0], range[1], v, how)}
          title="Đặt canon cho những người đang chọn trong đoạn này">
          Canon đoạn này
        </button>
        {nCanon > 0 && (
          <button className="btn sm" onClick={() => clearCanonSection(sel, range[0], range[1])}
            title="Những người đang chọn múa đồng loạt lại trong đoạn này">
            Bỏ canon ({nCanon})
          </button>
        )}
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>
        <button className="btn sm" onClick={() => mirrorGroup(sel)}
          title="Người bên phải giữa nhóm (khán giả nhìn) lật gương: một video thành cặp múa đối xứng">
          Đối xứng hai bên
        </button>
        {anyFlip && (
          <button className="btn sm" onClick={() => setFlip(sel, false)} title="Thôi lật gương những người đang chọn">
            Bỏ lật gương
          </button>
        )}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="dim">Canon cả bài (lệch video)</summary>
        <div className="dim" style={{ margin: "6px 0" }}>
          Theo thứ tự danh sách, người sau lệch video trễ hơn người trước suốt cả bài
          (chỉ những người dùng chung video với {order[0]?.name ?? "người đầu"}).
        </div>
        <button className="btn sm" onClick={() => canonOffsets(sel, v)} title="Đặt lệch nhạc lần lượt cho những người đang chọn">
          Lệch cả bài {fmtNum(v)} s mỗi người
        </button>
      </details>
    </div>
  );
}

/**
 * Hàng chip nhóm lưu sẵn: chạm chip là chọn cả nhóm (chạm lại thì bỏ chọn),
 * nút mũi tên mở menu sửa nhóm. Menu nằm ngay dưới hàng chip (không bật nổi)
 * để không bị cột cuộn cắt mất; có lớp .menu .pop nên Esc chỉ đóng menu.
 */
function GroupChips() {
  const p = useProject();
  const ui = useUI();
  const [menu, setMenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const groups = p.groups ?? [];
  const all = p.dancers.map((d) => d.id);
  const nSel = ui.selected.filter((id) => all.includes(id)).length;
  const open = groups.find((g) => g.id === menu);
  useEffect(() => {
    if (!open) return;
    const f = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(null);
    // Esc đóng menu (bắt trước phím tắt chung)
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(null);
    };
    window.addEventListener("pointerdown", f);
    window.addEventListener("keydown", k, true);
    return () => {
      window.removeEventListener("pointerdown", f);
      window.removeEventListener("keydown", k, true);
    };
  }, [open]);
  if (!groups.length && nSel < 2) return null;
  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };
  return (
    <div className="menu gmenu" ref={ref}>
      <div className="gchips" role="group" aria-label="Nhóm lưu sẵn">
        {groups.map((g, k) => {
          const on = isGroupPicked(g, ui.selected, all);
          const n = groupPick(g, all).length;
          return (
            <span key={g.id} className={`gchip${on ? " on" : ""}`} style={on ? { borderColor: g.color } : undefined}>
              <button
                className="gpick" aria-pressed={on} onClick={() => selectGroup(g.id)}
                title={`${on ? "Bỏ chọn" : "Chọn cả"} nhóm "${g.name}" (${n} người)${k < 9 ? `. Phím Alt ${k + 1}` : ""}`}
              >
                <span className="gdot" style={{ background: g.color }} />
                <span className="gname">{g.name}</span>
                <span className="gnum">{n}</span>
              </button>
              <button
                className={`gmore${menu === g.id ? " on" : ""}`} aria-label={`Sửa nhóm ${g.name}`} aria-expanded={menu === g.id}
                title="Đổi tên, đổi màu, cập nhật, xoá nhóm" onClick={() => setMenu(menu === g.id ? null : g.id)}
              >
                <Icon name="chevron" size={12} />
              </button>
            </span>
          );
        })}
        {nSel >= 2 && (
          <button className="btn sm gsave" onClick={() => saveGroup()} title="Lưu những người đang chọn thành nhóm (nam, nữ, nhóm hát, cánh A...) để lần sau chạm một lần là chọn cả nhóm">
            <Icon name="bookmark" /> Lưu nhóm ({nSel})
          </button>
        )}
      </div>
      {open && (
        <div className="pop gpop" role="menu" aria-label={`Nhóm ${open.name}`}>
          <div className="hint">Nhóm "{open.name}" · {groupPick(open, all).length} người</div>
          <button onClick={run(() => {
            const v = window.prompt("Tên nhóm", open.name);
            if (v !== null) renameGroupTo(open.id, v);
          })}><Icon name="edit" size={16} /> Đổi tên…</button>
          <div className="gcolors" role="group" aria-label="Màu nhóm">
            {PALETTE.map((c) => (
              <button
                key={c} className={c === open.color ? "on" : ""} style={{ background: c }}
                aria-label={`Màu ${COLOR_NAME[c] ?? c}`} aria-pressed={c === open.color} title={COLOR_NAME[c] ?? c}
                onClick={() => recolorGroupTo(open.id, c)}
              />
            ))}
          </div>
          <hr />
          <button disabled={!nSel} onClick={run(() => updateGroupFromSelection(open.id))}>
            <Icon name="sync" size={16} /> Chỉ giữ {nSel ? `${nSel} người đang chọn` : "người đang chọn"}
          </button>
          <button disabled={!nSel} onClick={run(() => addSelectedToGroup(open.id, true))}><Icon name="plus" size={16} /> Thêm người đang chọn</button>
          <button disabled={!nSel} onClick={run(() => addSelectedToGroup(open.id, false))}><Icon name="minus" size={16} /> Bớt người đang chọn</button>
          <hr />
          <button className="danger" onClick={run(() => removeGroup(open.id))}><Icon name="trash" size={16} /> Xoá nhóm (giữ người)</button>
        </div>
      )}
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
          {p.musicId && p.dancers.some((d) => d.mediaId) && (
            <button className="btn sm" onClick={() => realignAll()} title="Tự khớp lại video với nhạc (người chưa chắc; không ai chưa chắc thì khớp hết)">Khớp tất cả</button>
          )}
          <button className="btn sm" onClick={() => st().setUI({ selected: [addDancer()] })} title="Thêm người giữ chỗ (chưa có video)">
            <Icon name="userPlus" /> Thêm
          </button>
        </h4>
      </div>
      <GroupChips />
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
  return <PtsMini pts={shapePoints(kind, 6, [0, 0], 4)} />;
}

/** Hình thu nhỏ của một dãy điểm (dùng cho hình dựng sẵn lẫn hình tự lưu). */
function PtsMini({ pts }: { pts: Vec2[] }) {
  if (!pts.length) return <svg viewBox="-14 -9 28 18" />;
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
        <circle key={i} cx={(q[0] - cx) * s} cy={(q[1] - cz) * s} r={pts.length > 12 ? 1.2 : 1.8} fill="currentColor" />
      ))}
    </svg>
  );
}

function FormationsTab() {
  const p = useProject();
  const ui = useUI();
  const hk = useHoldIndex(p.formations);
  const sel = p.formations.find((f) => f.id === ui.selectedBlock);
  const nSel = ui.selected.length;
  const target = nSel >= 2 ? `${nSel} người đang chọn` : "mọi người";
  const mine = p.myShapes ?? [];
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
            const cur = k === hk;
            const pick = () => {
              st().setUI({ selectedBlock: f.id });
              clock.seek(f.start + 0.001);
            };
            return (
              <div
                key={f.id}
                className={`fitem${ui.selectedBlock === f.id ? " sel" : ""}${cur ? " cur" : ""}`}
                data-formation={f.id} role="button" aria-pressed={ui.selectedBlock === f.id}
                aria-label={`${k + 1}. ${f.name}, ${fmtTime(f.start)}${f.note ? ", có ghi chú" : ""}${cur ? ", đang ở vạch phát" : ""}`}
                {...rowKeys(pick)}
                onClick={pick}
              >
                <span className="fnum">{k + 1}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                {f.note && <span className="bnote" title={`Ghi chú: ${f.note}`} aria-hidden="true">✎</span>}
                <span className="meta">{fmtTime(f.start)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {sel && (
        <div className="section">
          <h4>{sel.name} <span className="grow" />
            <button
              className="btn sm icon ghost danger" title="Xoá đội hình (Delete)" aria-label={`Xoá đội hình ${sel.name}`}
              data-formation={sel.id} onClick={() => removeFormation(sel.id)}
            >
              <Icon name="trash" />
            </button>
          </h4>
          <label className="field">
            Tên
            <input
              type="text" key={sel.id + sel.name} defaultValue={sel.name} style={{ flex: 1, width: "auto" }}
              onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== sel.name && renameBlock(sel.id, e.currentTarget.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          <label className="field note-field">
            Ghi chú
            <textarea
              key={sel.id + (sel.note ?? "")} defaultValue={sel.note ?? ""} rows={2} maxLength={300}
              placeholder="Vd: nhịp 5 quay người, nhịp 7 giơ quạt"
              onBlur={(e) => setNote(sel.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          </label>
          <div className="dim" style={{ marginTop: 6 }}>
            Đứng {fmtTime(sel.start)} → {fmtTime(sel.end)} · {commaDec(fmtCounts(sel.end - sel.start, p.bpm))}
          </div>
        </div>
      )}
      <AutoPlanSection />
      <div className="section">
        <h4>Xếp nhanh<span className="grow" /><span className="dim" style={{ textTransform: "none", letterSpacing: 0 }}>cho {target}</span></h4>
        <div className="shape-grid">
          {SHAPES.map((k) => (
            <button key={k} onClick={() => applyShape(k)} title={`Xếp ${SHAPE_LABEL[k].toLowerCase()} tại vạch phát`}>
              <ShapeMini kind={k} />
              {SHAPE_LABEL[k]}
            </button>
          ))}
        </div>
        <h4 style={{ marginTop: 10 }}>
          Hình của tôi<span className="grow" />
          <button
            className="btn sm" onClick={saveMyShape}
            title="Lưu hình dạng của nhóm đang chọn tại vạch phát (chưa chọn ai thì cả đội trên sân) để dùng lại cho đội hình khác"
          >
            <Icon name="bookmark" /> Lưu hình
          </button>
        </h4>
        {mine.length === 0
          ? <div className="dim">Chưa lưu hình nào. Xếp xong một đội hình ưng ý thì bấm Lưu hình.</div>
          : (
            <div className="shape-grid">
              {mine.map((s) => (
                <div key={s.id} className="mine">
                  <button onClick={() => applyMyShape(s.id)} title={`Xếp theo hình "${s.name}" (${s.pts.length} chỗ) tại vạch phát`}>
                    <PtsMini pts={s.pts} />
                    <span className="nm">{s.name}</span>
                  </button>
                  <button className="shape-del" onClick={() => removeMyShape(s.id)} title={`Xoá hình "${s.name}"`} aria-label={`Xoá hình ${s.name}`}>
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}
        <LibrarySection />
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn sm" onClick={mirrorSelected} title="Lật trái phải (M)"><Icon name="mirror" /> Lật</button>
          <button className="btn sm" onClick={distributeSelected} disabled={nSel < 3} title="Dàn đều theo chiều ngang"><Icon name="distribute" /> Dàn đều</button>
          <button className="btn sm" onClick={swapSelected} disabled={nSel !== 2} title="Hai người đang chọn đổi chỗ cho nhau (X)"><Icon name="swap" /> Đổi chỗ</button>
          <button className="btn sm" onClick={() => rotateSelected(1)} title="Xoay một phần tư vòng quanh tâm nhóm, theo chiều kim đồng hồ (R, Shift R để xoay ngược). Chưa chọn ai thì xoay cả đội trên sân"><Icon name="rotate" /> Xoay</button>
          <button className="btn sm" onClick={() => scaleSelected(true)} title="Giãn nhóm ra quanh tâm, mỗi lần 15%, dừng ở mép sân. Chưa chọn ai thì cả đội trên sân"><Icon name="grow" /> Giãn</button>
          <button className="btn sm" onClick={() => scaleSelected(false)} title="Thu nhóm lại quanh tâm, mỗi lần 15%, không để ai sát nhau dưới nửa mét"><Icon name="shrink" /> Thu</button>
          <button className="btn sm" onClick={() => sendToWings(-1)} disabled={!nSel} title="Đưa vào cánh gà trái"><Icon name="wingL" /> Cánh trái</button>
          <button className="btn sm" onClick={() => sendToWings(1)} disabled={!nSel} title="Đưa vào cánh gà phải"><Icon name="wingR" /> Cánh phải</button>
        </div>
      </div>
      <div className="section">
        <h4>Hiển thị</h4>
        <label className="field"><input type="checkbox" checked={ui.showPaths} onChange={(e) => st().setUI({ showPaths: e.target.checked })} /> Đường đi tới đội hình sau</label>
        <label className="field"><input type="checkbox" checked={ui.showGhosts} onChange={(e) => st().setUI({ showGhosts: e.target.checked })} /> Bóng mờ đội hình trước</label>
        <label className="field"><input type="checkbox" checked={ui.showNames} onChange={(e) => st().setUI({ showNames: e.target.checked })} /> Tên dưới mỗi người</label>
        {!!p.groups?.length && (
          <label className="field" title="Vòng viền màu nhóm quanh chấm mỗi người, cả trong ảnh, bản in và video sơ đồ. Người ở nhiều nhóm lấy màu nhóm đầu">
            <input type="checkbox" checked={p.groupRings !== false} onChange={(e) => setGroupRings(e.target.checked)} /> Viền theo nhóm
          </label>
        )}
        <label className="field"><input type="checkbox" checked={ui.snap} onChange={(e) => st().setUI({ snap: e.target.checked })} /> Bám lưới 25 cm và phách (N)</label>
      </div>
      <div className="section">
        <h4>Sân khấu</h4>
        <div className="row">
          <label className="field" title="Từ 4 đến 30 m. Gõ số rồi Enter">Rộng
            <NumField
              value={p.stage.width} min={4} max={30} quantum={0.1} step={0.5} aria-label="Rộng sân khấu (m)"
              onCommit={(v) => v !== null && setStage(v, p.stage.depth)}
            /> m
          </label>
          <label className="field" title="Từ 3 đến 20 m. Gõ số rồi Enter">Sâu
            <NumField
              value={p.stage.depth} min={3} max={20} quantum={0.1} step={0.5} aria-label="Sâu sân khấu (m)"
              onCommit={(v) => v !== null && setStage(p.stage.width, v)}
            /> m
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
        ✓ Không thấy ai va nhau, chồng lên nhau, bị che hay phải chạy quá nhanh.
        {p.formations.length < 2 && <div className="dim" style={{ marginTop: 6 }}>Thêm đội hình thứ hai để kiểm tra đường chuyển.</div>}
      </div>
    );
  const icon = { collide: "×", overlap: "!", fast: "»", blocked: "◐", prop: "□" } as const;
  // cách sửa có được cho từng đội hình đích (chỉ đề nghị khi đỡ hơn thật)
  const fx: Record<string, { swap: boolean; carry: boolean; widen: boolean }> = {};
  for (const w of ws) {
    if (w.kind === "overlap" || isSoft(w.kind) || fx[w.formation]) continue;
    const k = p.formations.findIndex((f) => f.id === w.formation);
    const r = reassignFix(p.formations, k, p.dancers, p.stage, p.bpm);
    fx[w.formation] = {
      swap: !!r,
      carry: !!r?.carry,
      widen: !!widenFix(p.formations, k, p.dancers, p.stage, p.bpm, p.downbeat),
    };
  }
  return (
    <div style={{ padding: 6 }}>
      <div className="warn-head">
        <span className="dim">Bấm một dòng để tua tới đúng lúc đó.</span>
        {Object.values(fx).some((f) => f.swap || f.widen) && (
          <button className="btn sm" onClick={fixAllWarnings} title="Đổi chỗ cho gần và rời sớm hơn ở mọi khoảng chuyển còn lỗi (có Hoàn tác)">
            Sửa tất cả
          </button>
        )}
      </div>
      {ws.map((w, i) => {
        const go = () => {
          clock.pause();
          clock.seek(w.t);
          st().setUI({ selected: w.ids, selectedBlock: w.formation });
        };
        const msg = commaDec(w.msg);
        // bị che: chỉ có Đứng so le (dời người đứng sau sang ngang), tính riêng từng dòng
        const sf = w.kind === "blocked" &&
          !!staggerFix(p.formations, p.formations.findIndex((f) => f.id === w.formation), w.ids[0], w.ids[1], p.dancers, p.stage, p.bpm);
        const tf = isSoft(w.kind) ? undefined : fx[w.formation];
        return (
          <div key={i} className="warn-item" role="button" aria-label={`${msg}, lúc ${fmtTime(w.t)}`} {...rowKeys(go)} onClick={go}>
            <span className={`ic ${w.kind}`} aria-hidden="true">{icon[w.kind]}</span>
            <div>
              <div>{msg}</div>
              <div className="dim">{fmtTime(w.t)}</div>
              {sf && (
                <div className="warn-fix">
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); fixStagger(w.formation, w.ids[0], w.ids[1]); }}
                    title="Dời người đứng sau sang ngang vừa đủ để khán giả thấy, giữ nguyên hàng trước sau">
                    Đứng so le
                  </button>
                </div>
              )}
              {(tf?.swap || (w.kind === "fast" && tf?.widen)) && (
                <div className="warn-fix">
                  {tf?.swap && (
                    <button className="btn sm" onClick={(e) => { e.stopPropagation(); fixReassign(w.formation); }}
                      title={fx[w.formation]?.carry
                        ? "Đổi vai: từ đội hình này về sau, mỗi người nhận luôn các chỗ của người kia cho đường đi gần nhất"
                        : "Giữ các chỗ đứng của đội hình này, chỉ đổi ai đứng chỗ nào cho mỗi người đi gần nhất"}>
                      {fx[w.formation]?.carry ? "Đổi vai từ đây" : "Đổi chỗ cho gần"}
                    </button>
                  )}
                  {w.kind === "fast" && fx[w.formation]?.widen && (
                    <button className="btn sm" onClick={(e) => { e.stopPropagation(); fixWiden(w.formation); }}
                      title="Rời đội hình trước sớm hơn, vẫn tới đội hình này đúng phách cũ">
                      Nới khoảng chuyển
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
