// Đạo cụ và mốc sàn trên sơ đồ: lớp vẽ (nằm dưới chấm người), nút thêm theo
// mẫu nhanh và thanh nhỏ khi chọn một món (tên, kích thước, xoay, xoá).

import { useEffect, useRef, useState } from "react";
import type { StageProp } from "../model";
import { PROP_MAX, PROP_MIN, PROP_PRESETS, propCorners } from "../props";
import { addPropPreset, removePropById, renamePropTo, resizePropTo } from "../actions";
import { useProject } from "../store";
import { targetKind } from "./keys";
import { Icon } from "./icons";
import { NumField } from "./NumField";

/** Lớp đạo cụ trên sơ đồ. X, Z là phép đổi toạ độ của sơ đồ (lật khi nhìn từ sân khấu, soi gương). */
export function PropLayer({
  props, X, Z, sel, readOnly, compact, onDown,
}: {
  props: readonly StageProp[];
  X: (x: number) => number;
  Z: (z: number) => number;
  sel: string | null;
  readOnly: boolean;
  compact: boolean;
  onDown: (e: React.PointerEvent, id: string) => void;
}) {
  if (!props.length) return null;
  return (
    <g pointerEvents={readOnly ? "none" : undefined}>
      {props.map((o) => {
        const on = o.id === sel;
        const stroke = on ? "#fff" : "#7d8798";
        const cx = X(o.x), cz = Z(o.z);
        const down = (e: React.PointerEvent) => onDown(e, o.id);
        if (o.kind === "mark") {
          // mốc sàn: dấu cộng băng dính kèm số, có vùng bấm tròn trong suốt cho dễ chạm
          const s = 0.16;
          return (
            <g key={o.id} className="prop" transform={`translate(${cx} ${cz})`} onPointerDown={down}>
              <circle r={0.22} fill="transparent" />
              {on && <circle r={0.24} fill="none" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
              <line x1={-s} y1={0} x2={s} y2={0} stroke="#e8d27a" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1={0} y1={-s} x2={0} y2={s} stroke="#e8d27a" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              {!compact && (
                <text x={0.2} y={-0.14} fontSize={0.2} fill="#e8d27a" fontWeight={700} stroke="#0b0d10" strokeWidth={0.05} paintOrder="stroke">
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
        // tên đặt dưới món nhỏ (micro), trong món lớn (bục)
        const small = Math.min(o.w, o.d) < 0.7;
        return (
          <g key={o.id} className="prop" onPointerDown={down}>
            {shape}
            {!compact && (
              <text x={cx} y={small ? cz + Math.max(o.w, o.d) / 2 + 0.22 : cz + 0.07} fontSize={0.2} textAnchor="middle"
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
              <button className="btn sm icon" title="Xoay 90°" aria-label="Xoay 90°"
                onClick={() => resizePropTo(o.id, { rot: (o.rot ?? 0) + 90 })}>
                <Icon name="turn" />
              </button>
            </>
          )}
        </>
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
