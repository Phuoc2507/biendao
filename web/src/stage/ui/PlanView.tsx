// Sơ đồ sân khấu nhìn từ trên xuống, đơn vị mét. Khán giả ở DƯỚI (z dương
// hướng xuống màn hình), nên trái/phải trên màn hình đúng là trái/phải của
// khán giả. Kéo người để sửa vị trí ở đội hình đang đứng; kéo nền để chọn vùng.

import { useMemo, useRef, useState } from "react";
import {
  type Vec2, WING, initials, posesAt, prevFormation, nextFormation, segmentAt, snapPos,
  clampToStage, NEAR_M, dist,
} from "../model";
import { st, useProject, useUI } from "../store";
import { useTime } from "../clock";
import * as clock from "../clock";
import { setPositionsNow } from "../actions";
import { describePos } from "./hooks";

const R = 0.3; // bán kính chấm người (m)

interface Drag {
  kind: "move" | "box";
  pointer: number;
  start: Vec2; // điểm bấm (m)
  base: Record<string, Vec2>;
  moved: boolean;
  additive: boolean;
  id?: string;
}

export function PlanView({ readOnly = false, compact = false }: { readOnly?: boolean; compact?: boolean }) {
  const p = useProject();
  const ui = useUI();
  const t = useTime();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState<[Vec2, Vec2] | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const { width: W, depth: D } = p.stage;
  const hx = W / 2 + WING;
  const pad = compact ? 0.3 : 0.7;
  const padTop = compact ? 0.3 : 1.2; // chừa chỗ cho chip trạng thái phía trên
  const vb = { x: -hx - pad, y: -D / 2 - padTop, w: 2 * (hx + pad), h: D + padTop + (compact ? 0.9 : 1.6) };

  const ids = useMemo(() => p.dancers.map((d) => d.id), [p.dancers]);
  const poses = posesAt(p.formations, ids, t, p.stage);
  const seg = segmentAt(p.formations, t);
  const prev = ui.showGhosts ? prevFormation(p.formations, t) : null;
  const next = nextFormation(p.formations, t);
  const sel = new Set(ui.selected);

  // người đứng quá gần nhau ngay lúc này
  const near = new Set<string>();
  const vis = p.dancers.filter((d) => !d.hidden);
  for (let i = 0; i < vis.length; i++)
    for (let j = i + 1; j < vis.length; j++)
      if (dist(poses[vis[i].id], poses[vis[j].id]) < NEAR_M) {
        near.add(vis[i].id);
        near.add(vis[j].id);
      }

  const toM = (e: { clientX: number; clientY: number }): Vec2 => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };

  const onDancerDown = (e: React.PointerEvent, id: string) => {
    if (readOnly || e.button !== 0) return;
    e.stopPropagation();
    if (clock.isPlaying()) clock.pause();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let selected = st().ui.selected;
    if (additive) {
      selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    } else if (!selected.includes(id)) selected = [id];
    st().setUI({ selected });
    const base: Record<string, Vec2> = {};
    for (const s of selected) if (poses[s]) base[s] = poses[s];
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind: "move", pointer: e.pointerId, start: toM(e), base, moved: false, additive, id };
  };

  const onBgDown = (e: React.PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const m = toM(e);
    drag.current = { kind: "box", pointer: e.pointerId, start: m, base: {}, moved: false, additive: e.shiftKey || e.ctrlKey };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const m = toM(e);
    const dx = m[0] - d.start[0];
    const dz = m[1] - d.start[1];
    if (!d.moved && Math.hypot(dx, dz) < 0.06) return;
    if (!d.moved) {
      d.moved = true;
      if (d.kind === "move") {
        st().beginGesture();
        setDragging(true);
      }
    }
    if (d.kind === "box") {
      setBox([d.start, m]);
      return;
    }
    const moves: Record<string, Vec2> = {};
    const snap = st().ui.snap && !e.altKey;
    for (const [id, b] of Object.entries(d.base)) {
      let q: Vec2 = [b[0] + dx, b[1] + dz];
      if (snap) q = snapPos(q, 0.25);
      moves[id] = clampToStage(q, p.stage);
    }
    setPositionsNow(moves, true);
    const lead = Object.keys(d.base)[0];
    if (lead) {
      const r = svgRef.current!.getBoundingClientRect();
      const q = moves[lead];
      const more = Object.keys(d.base).length > 1 ? ` (+${Object.keys(d.base).length - 1})` : "";
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: describePos(q[0], q[1], W, D) + more });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setTip(null);
    setDragging(false);
    if (d.kind === "move") {
      if (d.moved) st().endGesture();
      else if (!d.additive) {
        // bấm không kéo vào người đang nằm trong nhóm chọn: chỉ chọn người đó
        if (d.id && st().ui.selected.length > 1) st().setUI({ selected: [d.id] });
      }
      return;
    }
    // chọn vùng
    setBox(null);
    if (!d.moved) {
      if (!d.additive) st().setUI({ selected: [] });
      return;
    }
    const m = toM(e);
    const x0 = Math.min(d.start[0], m[0]), x1 = Math.max(d.start[0], m[0]);
    const z0 = Math.min(d.start[1], m[1]), z1 = Math.max(d.start[1], m[1]);
    const inside = p.dancers
      .filter((dd) => !dd.hidden)
      .map((dd) => dd.id)
      .filter((id) => {
        const q = poses[id];
        return q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1;
      });
    const cur = d.additive ? st().ui.selected : [];
    st().setUI({ selected: Array.from(new Set([...cur, ...inside])) });
  };

  // ---------- vẽ ----------
  const grid: JSX.Element[] = [];
  for (let x = -W / 2; x <= W / 2 + 1e-6; x += 0.5) {
    const major = Math.abs(x - Math.round(x)) < 1e-6;
    grid.push(
      <line key={`gx${x}`} x1={x} y1={-D / 2} x2={x} y2={D / 2}
        stroke={Math.abs(x) < 1e-6 ? "#4a5468" : major ? "#2b3340" : "#1f252f"}
        strokeWidth={Math.abs(x) < 1e-6 ? 1.5 : 1} vectorEffect="non-scaling-stroke"
        strokeDasharray={Math.abs(x) < 1e-6 ? "6 4" : undefined} />,
    );
  }
  for (let z = -D / 2; z <= D / 2 + 1e-6; z += 0.5) {
    const major = Math.abs(z - Math.round(z)) < 1e-6;
    grid.push(
      <line key={`gz${z}`} x1={-W / 2} y1={z} x2={W / 2} y2={z}
        stroke={major ? "#2b3340" : "#1f252f"} strokeWidth={1} vectorEffect="non-scaling-stroke" />,
    );
  }
  const nums: JSX.Element[] = [];
  if (!compact)
    for (let k = -Math.floor(W / 2); k <= Math.floor(W / 2); k++)
      nums.push(
        <text key={`n${k}`} x={k} y={D / 2 + 0.38} fontSize={0.26} textAnchor="middle" fill={k === 0 ? "#ffb86b" : "#6b768a"}>
          {Math.abs(k)}
        </text>,
      );

  const ghosts: JSX.Element[] = [];
  if (prev && ui.showGhosts)
    for (const d of vis) {
      const q = prev.pos[d.id];
      if (!q) continue;
      ghosts.push(<circle key={`g${d.id}`} cx={q[0]} cy={q[1]} r={R * 0.85} fill={d.color} opacity={0.14} />);
    }
  const targets: JSX.Element[] = [];
  const paths: JSX.Element[] = [];
  if (next && (seg.kind === "hold" || seg.kind === "gap" || seg.kind === "before")) {
    for (const d of vis) {
      const a = poses[d.id];
      const b = next.pos[d.id];
      if (!a || !b || dist(a, b) < 0.05) continue;
      if (ui.showPaths)
        paths.push(
          <line key={`p${d.id}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={d.color} strokeOpacity={0.55}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="4 3" markerEnd="url(#arr)" />,
        );
      targets.push(
        <circle key={`t${d.id}`} cx={b[0]} cy={b[1]} r={R * 0.85} fill="none" stroke={d.color} strokeOpacity={0.5}
          strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />,
      );
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg
        ref={svgRef}
        className={`plan-svg${dragging ? " dragging" : ""}`}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <pattern id="hatch" width="0.25" height="0.25" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.25" stroke="#252b36" strokeWidth="0.08" />
          </pattern>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#8b95a7" />
          </marker>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141820" />
            <stop offset="1" stopColor="#1a1f29" />
          </linearGradient>
        </defs>
        {/* cánh gà */}
        <rect x={-hx} y={-D / 2} width={WING} height={D} fill="url(#hatch)" stroke="#2a313d" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={W / 2} y={-D / 2} width={WING} height={D} fill="url(#hatch)" stroke="#2a313d" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {!compact && (
          <>
            <text x={-W / 2 - WING / 2} y={-D / 2 - 0.15} fontSize={0.22} textAnchor="middle" fill="#5d6778">CÁNH GÀ</text>
            <text x={W / 2 + WING / 2} y={-D / 2 - 0.15} fontSize={0.22} textAnchor="middle" fill="#5d6778">CÁNH GÀ</text>
          </>
        )}
        {/* sàn diễn */}
        <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="url(#floor)" />
        {grid}
        <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="none" stroke="#3c4658" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <line x1={-W / 2} y1={D / 2} x2={W / 2} y2={D / 2} stroke="#ff9f43" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {!compact && (
          <text x={0} y={-D / 2 - 0.15} fontSize={0.22} textAnchor="middle" fill="#5d6778">PHÔNG NỀN (CUỐI SÂN)</text>
        )}
        {nums}
        <text x={0} y={D / 2 + (compact ? 0.55 : 1.05)} fontSize={compact ? 0.32 : 0.34} textAnchor="middle" fill="#ffb86b" fontWeight={700} letterSpacing={0.08}>
          ▼ KHÁN GIẢ ▼
        </text>
        {!compact && (
          <>
            <text x={-W / 2} y={D / 2 + 1.05} fontSize={0.26} fill="#6b768a">◀ TRÁI</text>
            <text x={W / 2} y={D / 2 + 1.05} fontSize={0.26} fill="#6b768a" textAnchor="end">PHẢI ▶</text>
          </>
        )}

        <g pointerEvents="none">
          {ghosts}
          {targets}
          {paths}
        </g>

        {p.dancers.map((d) => {
          const q = poses[d.id];
          if (!q) return null;
          const s = sel.has(d.id);
          return (
            <g
              key={d.id}
              className="dancer"
              transform={`translate(${q[0]} ${q[1]})`}
              opacity={d.hidden ? 0.3 : 1}
              onPointerDown={(e) => onDancerDown(e, d.id)}
            >
              {near.has(d.id) && !d.hidden && (
                <circle r={R + 0.12} fill="none" stroke="#ff5d6c" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
              )}
              {s && <circle r={R + 0.08} fill="none" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              <circle r={R} fill={d.color} stroke="#0008" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {!d.mediaId && <circle r={R - 0.07} fill="none" stroke="#0006" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />}
              <text y={0.09} fontSize={0.24} textAnchor="middle" fill="#111" fontWeight={800} pointerEvents="none">
                {initials(d.name)}
              </text>
              {ui.showNames && !compact && (
                <text y={R + 0.3} fontSize={0.22} textAnchor="middle" fill={s ? "#fff" : "#aab3c2"} pointerEvents="none"
                  stroke="#0b0d10" strokeWidth={0.06} paintOrder="stroke">
                  {d.name}
                </text>
              )}
            </g>
          );
        })}

        {box && (
          <rect
            x={Math.min(box[0][0], box[1][0])} y={Math.min(box[0][1], box[1][1])}
            width={Math.abs(box[1][0] - box[0][0])} height={Math.abs(box[1][1] - box[0][1])}
            fill="rgba(79,157,255,.12)" stroke="#4f9dff" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 3"
          />
        )}
      </svg>
      {tip && <div className="drag-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      {!compact && <StateChip seg={seg} hasDancers={p.dancers.length > 0} fsName={(k) => p.formations[k]?.name ?? ""} />}
    </div>
  );
}

function StateChip(props: {
  seg: ReturnType<typeof segmentAt>;
  hasDancers: boolean;
  fsName: (k: number) => string;
}) {
  const { seg, fsName } = props;
  if (!props.hasDancers) return null;
  if (seg.kind === "hold")
    return (
      <div className="state-chip">
        <span>Đang đứng</span> <b>{fsName(seg.k)}</b>
        <span className="dim">kéo người để sửa</span>
      </div>
    );
  if (seg.kind === "gap")
    return (
      <div className="state-chip gap">
        <span>Đang chuyển</span> <b>{fsName(seg.k)} → {fsName(seg.k + 1)}</b>
        <span className="dim">kéo ở đây sẽ tạo đội hình mới</span>
      </div>
    );
  if (seg.kind === "none")
    return (
      <div className="state-chip">
        <span className="dim">Kéo người để xếp đội hình đầu tiên</span>
      </div>
    );
  return (
    <div className="state-chip">
      <span>{seg.kind === "before" ? "Trước" : "Sau"}</span> <b>{fsName(seg.k)}</b>
      <span className="dim">kéo ở đây sẽ tạo đội hình mới</span>
    </div>
  );
}
