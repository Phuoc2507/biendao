// Đạo cụ và mốc sàn trên sơ đồ: lớp vẽ (nằm dưới chấm người), nút thêm theo
// mẫu nhanh và thanh nhỏ khi chọn một món (tên, kích thước, xoay, giữ yên, xoá).

import { useEffect, useMemo, useRef, useState } from "react";
import type { StageProp } from "../model";
import { PROP_MAX, PROP_MIN, PROP_PRESETS, layoutPropLabels, propCorners, propMoves } from "../props";
import { addPropPreset, holdPropStill, removePropById, renamePropTo, resizePropTo, turnPropNow } from "../actions";
import { useProject } from "../store";
import { targetKind } from "./keys";
import { useHoldIndex } from "./hooks";
import { Icon } from "./icons";
import { NumField } from "./NumField";

const FONT = 0.2;

/** Lớp đạo cụ trên sơ đồ. X, Z là phép đổi toạ độ của sơ đồ (lật khi nhìn từ sân khấu, soi gương). tip: chữ hiện khi rê chuột. */
export function PropLayer({
  props, X, Z, sel, readOnly, compact, onDown, tip,
}: {
  props: readonly StageProp[];
  X: (x: number) => number;
  Z: (z: number) => number;
  sel: string | null;
  readOnly: boolean;
  compact: boolean;
  onDown: (e: React.PointerEvent, id: string) => void;
  tip?: string;
}) {
  // hai món sát nhau: tên dời sang chỗ trống, hết chỗ thì ẩn (món đang chọn được ưu tiên)
  const flipX = X(1) < X(0), flipZ = Z(1) < Z(0);
  const labels = useMemo(
    () => (compact ? null : layoutPropLabels(props, X, Z, FONT, sel ? [sel] : undefined)),
    // X, Z chỉ đổi theo hai chiều lật
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props, compact, sel, flipX, flipZ],
  );
  if (!props.length) return null;
  return (
    <g pointerEvents={readOnly ? "none" : undefined}>
      {props.map((o) => {
        const on = o.id === sel;
        const stroke = on ? "#fff" : "#7d8798";
        const cx = X(o.x), cz = Z(o.z);
        const down = (e: React.PointerEvent) => onDown(e, o.id);
        const lb = labels?.get(o.id) ?? null;
        const title = tip ? <title>{`${o.name}. ${tip}`}</title> : null;
        if (o.kind === "mark") {
          // mốc sàn: dấu cộng băng dính kèm số, có vùng bấm tròn trong suốt cho dễ chạm
          const s = 0.16;
          return (
            <g key={o.id} className="prop" transform={`translate(${cx} ${cz})`} onPointerDown={down}>
              {title}
              <circle r={0.22} fill="transparent" />
              {on && <circle r={0.24} fill="none" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
              <line x1={-s} y1={0} x2={s} y2={0} stroke="#e8d27a" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1={0} y1={-s} x2={0} y2={s} stroke="#e8d27a" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              {lb && (
                <text x={lb.x - cx} y={lb.y - cz} fontSize={FONT} textAnchor="middle" fill="#e8d27a" fontWeight={700} stroke="#0b0d10"
                  strokeWidth={0.05} paintOrder="stroke" pointerEvents="none">
                  {o.name}
                </text>
              )}
            </g>
          );
        }
        const shape = o.kind === "round" ? (
          <circle cx={cx} cy={cz} r={o.w / 2} fill="#8a93a3" fillOpacity={0.28} stroke={stroke} strokeWidth={on ? 2 : 1.2}
            vectorEffect="non-scaling-stroke" />
        ) : (
          <polygon points={propCorners(o).map(([x, z]) => `${X(x)},${Z(z)}`).join(" ")} fill="#8a93a3" fillOpacity={0.28}
            stroke={stroke} strokeWidth={on ? 2 : 1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        );
        // tên: trong món lớn (bục), dưới món nhỏ (micro); đụng tên khác thì dời (layoutPropLabels)
        return (
          <g key={o.id} className="prop" onPointerDown={down}>
            {title}
            {shape}
            {lb && (
              <text x={lb.x} y={lb.y} fontSize={FONT} textAnchor="middle"
                fill={on ? "#fff" : "#aab3c2"} stroke="#0b0d10" strokeWidth={0.05} paintOrder="stroke" pointerEvents="none">
                {o.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Nút "Đạo cụ" trong thanh công cụ sơ đồ: bật danh sách mẫu nhanh. */
export function PropMenu({ onAdd }: { onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);
  const add = (key: string) => {
    const id = addPropPreset(key);
    setOpen(false);
    if (id) onAdd(id);
  };
  return (
    <div className="rh-prop-menu" ref={ref}>
      <button
        className={`btn sm${open ? " on" : ""}`}
        title="Thêm đạo cụ đứng yên (micro, bục, ghế) hay mốc sàn đánh số"
        aria-label="Đạo cụ"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="cube" /> <span className="rh-hide-narrow">Đạo cụ</span>
      </button>
      {open && (
        <div className="rh-pop rh-prop-pop">
          <div className="rh-pop-head"><span>Thêm vào giữa sân, rồi kéo tới chỗ đặt</span></div>
          {PROP_PRESETS.map((pr) => (
            <button key={pr.key} className="rh-item" onClick={() => add(pr.key)}>
              <span className={`rh-ic prop`}>{pr.kind === "mark" ? "+" : pr.kind === "round" ? "○" : "□"}</span>
              <span className="rh-msg">{pr.name}</span>
              <span className="rh-t">
                {pr.kind === "mark" ? "đánh số" : pr.kind === "round" ? `Ø ${fmt(pr.w)} m` : `${fmt(pr.w)} × ${fmt(pr.d)} m`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const fmt = (v: number) => String(v).replace(".", ",");

/** Thanh nhỏ dưới sơ đồ khi đang chọn một đạo cụ. Delete xoá, Esc bỏ chọn. */
export function PropHud({ id, onClose }: { id: string; onClose: () => void }) {
  const p = useProject();
  const o = p.props?.find((x) => x.id === id) ?? null;
  const [name, setName] = useState<string | null>(null);
  // vạch phát trong khối nào thì kéo, xoay chỉ đổi ở khối đó
  const k = useHoldIndex(p.formations);
  const scope = k >= 0 ? p.formations[k]?.name : null;
  const moves = o ? propMoves(p.formations, o.id) : false;
  useEffect(() => {
    if (!o) onClose();
  }, [o, onClose]);
  useEffect(() => {
    // pha bắt: chặn trước phím tắt chung (Delete ở đó xoá đội hình đang chọn)
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || targetKind(e.target) === "text") return;
      if (e.key === "Delete") {
        e.preventDefault();
        removePropById(id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [id, onClose]);
  if (!o) return null;
  const doneName = () => {
    if (name !== null) renamePropTo(o.id, name);
    setName(null);
  };
  const size = { min: PROP_MIN, max: PROP_MAX, quantum: 0.05, style: { width: 52 } };
  return (
    <div className="hud prop-hud" onPointerDown={(e) => e.stopPropagation()}>
      <input
        className="prop-name" type="text" value={name ?? o.name} aria-label="Tên đạo cụ" maxLength={30}
        onChange={(e) => setName(e.target.value)} onBlur={doneName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setName(null);
            e.currentTarget.blur();
          }
        }}
      />
      {o.kind !== "mark" && (
        <>
          <span className="sep" />
          {o.kind === "round" ? (
            <label className="lbl">
              Ø <NumField {...size} value={o.w} aria-label="Đường kính (m)" onCommit={(v) => v !== null && resizePropTo(o.id, { w: v })} /> m
            </label>
          ) : (
            <>
              <label className="lbl">
                <NumField {...size} value={o.w} aria-label="Rộng (m)" onCommit={(v) => v !== null && resizePropTo(o.id, { w: v })} />
                {" × "}
                <NumField {...size} value={o.d} aria-label="Sâu (m)" onCommit={(v) => v !== null && resizePropTo(o.id, { d: v })} /> m
              </label>
              <button className="btn sm icon"
                title={scope ? `Xoay 90° chỉ ở ${scope} (Shift bấm: cả bài)` : "Xoay 90° cả bài"} aria-label="Xoay 90°"
                onClick={(e) => turnPropNow(o.id, e.shiftKey)}>
                <Icon name="turn" />
              </button>
            </>
          )}
        </>
      )}
      <span className="sep" />
      <span className="lbl prop-scope" title="Giữ Shift khi kéo để dời cả bài">
        {scope ? `Kéo: chỉ ở ${scope} · Shift: cả bài` : "Kéo: cả bài"}
      </span>
      {moves && (
        <button className="btn sm" title="Bỏ chỗ riêng ở các đội hình: đứng yên suốt bài ở chỗ đang thấy" onClick={() => holdPropStill(o.id)}>
          Giữ yên cả bài
        </button>
      )}
      <span className="sep" />
      <button className="btn sm" title="Xoá đạo cụ này (Delete)" onClick={() => removePropById(o.id)}>
        <Icon name="trash" /> Xoá
      </button>
      <button className="btn sm icon ghost" title="Bỏ chọn (Esc)" aria-label="Bỏ chọn" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
