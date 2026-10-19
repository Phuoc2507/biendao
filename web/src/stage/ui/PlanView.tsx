// Sơ đồ sân khấu nhìn từ trên xuống, đơn vị mét. Khán giả ở DƯỚI (z dương
// hướng xuống màn hình), nên trái/phải trên màn hình đúng là trái/phải của
// khán giả. Kéo người để sửa vị trí ở đội hình đang đứng; kéo nền để chọn vùng.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type Vec2, WING, initials, posesAt, prevFormation, nextFormation, segmentAt, snapPos,
  clampToStage, NEAR_M, dist,
} from "../model";
import { st, useProject, useUI } from "../store";
import { groupRingColors } from "../groups";
import { useTime } from "../clock";
import * as clock from "../clock";
import { fixAllWarnings, setPositionsNow } from "../actions";
import { isSoft } from "../checks";
import { fmtTime } from "../timing";
import { dancerLegs, dancerStops, stopLabel } from "../rehearse";
import { describePos, useWarnings } from "./hooks";
import { Icon } from "./icons";
import { MePicker } from "./MePicker";
import { rememberPlanFromStage, topExtra, type Overlay } from "../layout";
import "./rehearse.css";

const R = 0.3; // bán kính chấm người (m)

/** Đoạn a→b rút bớt hai đầu (để mũi tên không đè lên chấm). */
function shorten(a: Vec2, b: Vec2, cut: number): [Vec2, Vec2] {
  const l = dist(a, b);
  const c = Math.min(cut, l / 3);
  const ux = (b[0] - a[0]) / (l || 1), uz = (b[1] - a[1]) / (l || 1);
  return [[a[0] + ux * c, a[1] + uz * c], [b[0] - ux * c, b[1] - uz * c]];
}

interface Drag {
  kind: "move" | "box";
  pointer: number;
  start: Vec2; // điểm bấm (m)
  base: Record<string, Vec2>;
  moved: boolean;
  additive: boolean;
  id?: string;
}

export function PlanView({
  readOnly = false, compact = false, mirror = false, fromStage,
}: {
  readOnly?: boolean; compact?: boolean; mirror?: boolean;
  /** nhìn từ sân khấu ra khán giả (xoay 180°); mặc định theo lựa chọn ở sơ đồ chính */
  fromStage?: boolean;
}) {
  const p = useProject();
  const ui = useUI();
  const t = useTime();
  const issues = useWarnings();
  const rings = useMemo(() => groupRingColors(p), [p.groups, p.groupRings]);
  // nhìn từ sân khấu: khán giả ở trên, trái phải theo người múa (xoay 180°);
  // soi gương: lật trái phải. Cả hai đều tự nghịch đảo nên toM dùng lại được
  const flip = fromStage ?? (!readOnly && ui.planFromStage);
  const X = (x: number) => (mirror !== flip ? -x : x);
  const Z = (z: number) => (flip ? -z : z);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState<[Vec2, Vec2] | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const { width: W, depth: D } = p.stage;
  const hx = W / 2 + WING;
  const pad = compact ? 0.3 : 0.7;
  const padBot = compact ? 0.9 : 1.6; // phía khán giả: chữ KHÁN GIẢ và thước số
  // phía trên: chừa đủ chỗ cho nhãn khung, chip trạng thái và nút (đo bằng px thật)
  const topBase = compact ? 0.3 : 1.2;
  const [over, setOver] = useState<{ w: number; h: number; els: Overlay[]; key: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || compact) return;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const els: Overlay[] = [];
      const nodes = [...root.querySelectorAll(".rh-plan-tools, .state-chip"), ...(root.parentElement?.querySelectorAll(":scope > .pane-label") ?? [])];
      for (const el of nodes) {
        const b = el.getBoundingClientRect();
        if (b.height && b.bottom - r.top < r.height / 2) {
          els.push({ l: Math.round(b.left - r.left), r: Math.round(b.right - r.left), b: Math.round(b.bottom - r.top) });
        }
      }
      const key = `${r.width}x${r.height}:${els.map((e) => `${e.l},${e.r},${e.b}`).join(";")}`;
      setOver((o) => (o && o.key === key ? o : { w: r.width, h: r.height, els, key }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll(".rh-plan-tools, .state-chip").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [compact, flip]);
  const sideTop = flip ? padBot : topBase; // lề đang nằm phía trên màn hình
  const vbw = 2 * (hx + pad);
  const extra = over ? topExtra(over, vbw, D, topBase + padBot, sideTop, flip ? 1.3 : 0.45) : 0;
  const padTop = topBase + (flip ? 0 : extra);
  const padBotV = padBot + (flip ? extra : 0);
  const vb = { x: -hx - pad, y: flip ? -D / 2 - padBotV : -D / 2 - padTop, w: vbw, h: D + padTop + padBotV };

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
    return [X(q.x), Z(q.y)];
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
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: describePos(flip ? -q[0] : q[0], q[1], W, D) + more });
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
        <text key={`n${k}`} x={k} y={Z(D / 2 + 0.38) + (flip ? 0.09 : 0)} fontSize={0.26} textAnchor="middle" fill={k === 0 ? "#ffb86b" : "#6b768a"}>
          {Math.abs(k)}
        </text>,
      );

  const ghosts: JSX.Element[] = [];
  if (prev && ui.showGhosts)
    for (const d of vis) {
      const q = prev.pos[d.id];
      if (!q) continue;
      ghosts.push(<circle key={`g${d.id}`} cx={X(q[0])} cy={Z(q[1])} r={R * 0.85} fill={d.color} opacity={0.14} />);
    }
  const targets: JSX.Element[] = [];
  const paths: JSX.Element[] = [];
  // bóng đội hình kế: chấm mờ ở chỗ đứng của khối kế tiếp
  const nk = seg.kind === "hold" || seg.kind === "gap" ? seg.k + 1 : seg.kind === "before" ? 1 : -1;
  const nextF = ui.showNext && nk >= 0 ? p.formations[nk] ?? null : null;
  if (nextF) {
    for (const d of vis) {
      const a = poses[d.id];
      const b = nextF.pos[d.id];
      if (!b) continue;
      if (a && dist(a, b) >= 0.05) {
        const [s, e] = shorten(a, b, R + 0.05);
        paths.push(
          <line key={`np${d.id}`} x1={X(s[0])} y1={Z(s[1])} x2={X(e[0])} y2={Z(e[1])} stroke={d.color} strokeOpacity={0.6}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="5 3" markerEnd="url(#rhArrG)" />,
        );
      }
      targets.push(
        <g key={`nt${d.id}`} transform={`translate(${X(b[0])} ${Z(b[1])})`} opacity={0.3}>
          <circle r={R} fill={d.color} />
          <text y={0.09} fontSize={0.24} textAnchor="middle" fill="#111" fontWeight={800}>{initials(d.name)}</text>
        </g>,
      );
    }
  } else if (next && (seg.kind === "hold" || seg.kind === "gap" || seg.kind === "before")) {
    for (const d of vis) {
      const a = poses[d.id];
      const b = next.pos[d.id];
      if (!a || !b || dist(a, b) < 0.05) continue;
      if (ui.showPaths)
        paths.push(
          <line key={`p${d.id}`} x1={X(a[0])} y1={Z(a[1])} x2={X(b[0])} y2={Z(b[1])} stroke={d.color} strokeOpacity={0.55}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="4 3" markerEnd="url(#arr)" />,
        );
      targets.push(
        <circle key={`t${d.id}`} cx={X(b[0])} cy={Z(b[1])} r={R * 0.85} fill="none" stroke={d.color} strokeOpacity={0.5}
          strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />,
      );
    }
  }

  // "Tôi là ai": cả đường đi của một người, có số đội hình ở mỗi chỗ đứng
  const meD = vis.find((d) => d.id === ui.me) ?? null;
  const meLayer: JSX.Element[] = [];
  if (meD) {
    const curK = seg.kind === "hold" ? seg.k : -1;
    for (const l of dancerLegs(p.formations, meD.id)) {
      const [s, e] = shorten(l.a, l.b, 0.2);
      meLayer.push(
        <line key={`ml${l.k}`} x1={X(s[0])} y1={Z(s[1])} x2={X(e[0])} y2={Z(e[1])} stroke="#fff" strokeOpacity={0.85}
          strokeWidth={2} vectorEffect="non-scaling-stroke" markerEnd="url(#rhArrMe)" />,
      );
    }
    dancerStops(p.formations, meD.id).forEach((s, i) => {
      const cur = s.ks.includes(curK);
      meLayer.push(
        <g key={`ms${i}`} transform={`translate(${X(s.pos[0])} ${Z(s.pos[1])})`}>
          <circle r={0.16} fill={cur ? meD.color : "#0b0d10"} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {!compact && (
            <text x={0.22} y={-0.2} fontSize={0.22} fill="#fff" fontWeight={700} stroke="#0b0d10" strokeWidth={0.06} paintOrder="stroke">
              {stopLabel(s.ks)}
            </text>
          )}
        </g>,
      );
    });
  }

  // cảnh báo của lúc chuyển sắp tới / đang chuyển: vẽ đỏ trên sơ đồ
  const curFrom = seg.kind === "hold" || seg.kind === "gap" ? p.formations[seg.k]?.id : seg.kind === "before" ? p.formations[0]?.id : undefined;
  const issueLayer: JSX.Element[] = [];
  // bị che trong đội hình đang giữ: vạch đứt xám từ người trước tới người sau
  const curHold = seg.kind === "hold" ? p.formations[seg.k]?.id : undefined;
  if (!compact && curHold)
    issues.forEach((w, i) => {
      if (w.kind !== "blocked" || w.formation !== curHold) return;
      w.paths.forEach(([a, b], j) =>
        issueLayer.push(
          <line key={`ib${i}-${j}`} x1={X(a[0])} y1={Z(a[1])} x2={X(b[0])} y2={Z(b[1])} stroke="#9aa4b4" strokeOpacity={0.8}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />,
        ),
      );
    });
  if (!compact && curFrom)
    issues.forEach((w, i) => {
      if (w.from !== curFrom) return;
      if (w.kind === "collide") {
        w.paths.forEach(([a, b], j) =>
          issueLayer.push(
            <line key={`ip${i}-${j}`} x1={X(a[0])} y1={Z(a[1])} x2={X(b[0])} y2={Z(b[1])} stroke="#ff5d6c" strokeOpacity={0.8}
              strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />,
          ),
        );
        issueLayer.push(
          <g key={`ic${i}`} transform={`translate(${X(w.at[0])} ${Z(w.at[1])})`}>
            <circle r={0.2} fill="#ff5d6c" stroke="#0b0d10" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text y={0.08} fontSize={0.24} textAnchor="middle" fill="#fff" fontWeight={800}>×</text>
          </g>,
        );
      } else if (w.kind === "fast") {
        w.paths.forEach(([a, b], j) =>
          issueLayer.push(
            <line key={`ip${i}-${j}`} x1={X(a[0])} y1={Z(a[1])} x2={X(b[0])} y2={Z(b[1])} stroke="#ff5d6c" strokeOpacity={0.75}
              strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" />,
          ),
        );
        issueLayer.push(
          <text key={`iv${i}`} x={X(w.at[0])} y={Z(w.at[1]) - 0.18} fontSize={0.22} textAnchor="middle" fill="#ff8a95" fontWeight={700}
            stroke="#0b0d10" strokeWidth={0.06} paintOrder="stroke">
            {Number.isFinite(w.value) ? `${w.value.toFixed(1).replace(".", ",")} m/s` : "dịch ngay"}
          </text>,
        );
      }
    });

  return (
    <div style={{ position: "absolute", inset: 0 }} ref={rootRef}>
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
          <marker id="rhArrMe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="0.3" markerHeight="0.3" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="#fff" />
          </marker>
          <marker id="rhArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="#c8d0dc" />
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
            <text x={-W / 2 - WING / 2} y={Z(-D / 2 - 0.15) + (flip ? 0.08 : 0)} fontSize={0.22} textAnchor="middle" fill="#5d6778">CÁNH GÀ</text>
            <text x={W / 2 + WING / 2} y={Z(-D / 2 - 0.15) + (flip ? 0.08 : 0)} fontSize={0.22} textAnchor="middle" fill="#5d6778">CÁNH GÀ</text>
          </>
        )}
        {/* sàn diễn */}
        <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="url(#floor)" />
        {grid}
        <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="none" stroke="#3c4658" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <line x1={-W / 2} y1={Z(D / 2)} x2={W / 2} y2={Z(D / 2)} stroke="#ff9f43" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {!compact && (
          <text x={0} y={Z(-D / 2 - 0.15) + (flip ? 0.08 : 0)} fontSize={0.22} textAnchor="middle" fill="#5d6778">PHÔNG NỀN (CUỐI SÂN)</text>
        )}
        {nums}
        <text x={0} y={Z(D / 2 + (compact ? 0.55 : 1.05)) + (flip ? 0.12 : 0)} fontSize={compact ? 0.32 : 0.34} textAnchor="middle" fill="#ffb86b" fontWeight={700} letterSpacing={0.08}>
          {flip ? "▲ KHÁN GIẢ ▲" : "▼ KHÁN GIẢ ▼"}
        </text>
        {!compact && (
          <>
            {/* trái phải theo người đang nhìn: khán giả (bình thường) hay người múa (nhìn từ sân khấu) */}
            <text x={-W / 2} y={Z(D / 2 + 1.05) + (flip ? 0.09 : 0)} fontSize={0.26} fill="#6b768a">{flip ? "◀ TRÁI người múa" : "◀ TRÁI"}</text>
            <text x={W / 2} y={Z(D / 2 + 1.05) + (flip ? 0.09 : 0)} fontSize={0.26} fill="#6b768a" textAnchor="end">{flip ? "PHẢI người múa ▶" : "PHẢI ▶"}</text>
          </>
        )}

        <g pointerEvents="none">
          {ghosts}
          {targets}
          {paths}
          {issueLayer}
          {meLayer}
        </g>

        {p.dancers.map((d) => {
          const q = poses[d.id];
          if (!q) return null;
          const s = sel.has(d.id);
          return (
            <g
              key={d.id}
              className="dancer"
              transform={`translate(${X(q[0])} ${Z(q[1])})`}
              opacity={d.hidden ? 0.3 : meD && meD.id !== d.id ? 0.35 : 1}
              onPointerDown={(e) => onDancerDown(e, d.id)}
            >
              {meD?.id === d.id && (
                <circle r={R + 0.14} fill="none" stroke="#fff" strokeWidth={3} vectorEffect="non-scaling-stroke" />
              )}
              {near.has(d.id) && !d.hidden && (
                <circle r={R + 0.12} fill="none" stroke="#ff5d6c" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
              )}
              {rings[d.id] && <circle r={R + 0.03} fill="none" stroke={rings[d.id]} strokeWidth={3} vectorEffect="non-scaling-stroke" />}
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
            x={Math.min(X(box[0][0]), X(box[1][0]))} y={Math.min(Z(box[0][1]), Z(box[1][1]))}
            width={Math.abs(box[1][0] - box[0][0])} height={Math.abs(box[1][1] - box[0][1])}
            fill="rgba(79,157,255,.12)" stroke="#4f9dff" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 3"
          />
        )}
      </svg>
      {tip && <div className="drag-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      {!compact && <StateChip seg={seg} hasDancers={p.dancers.length > 0} fsName={(k) => p.formations[k]?.name ?? ""} />}
      {!compact && p.dancers.length > 0 && <PlanTools issues={issues} />}
    </div>
  );
}

type Issues = ReturnType<typeof useWarnings>;

/** Đổi góc sơ đồ: từ khán giả (khán giả ở dưới) hay từ sân khấu (người múa quay mặt ra khán giả ở trên). */
export function togglePlanFrom() {
  const on = !st().ui.planFromStage;
  rememberPlanFromStage(on);
  st().setUI({ planFromStage: on });
}

/** Thanh nhỏ góc phải sơ đồ: Tôi là ai, bóng đội hình kế, danh sách cảnh báo. */
function PlanTools({ issues }: { issues: Issues }) {
  const ui = useUI();
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
  const jump = (w: Issues[number]) => {
    clock.pause();
    clock.seek(w.t);
    st().setUI({ selected: w.ids, selectedBlock: w.formation });
    setOpen(false);
  };
  const mark = (k: string) => (k === "collide" ? "×" : k === "fast" ? "»" : k === "blocked" ? "◐" : "!");
  // chỉ còn chỗ bị che thì Sửa tất cả không làm được gì: ẩn nút
  const fixable = issues.some((w) => !isSoft(w.kind));
  return (
    <div className="rh-plan-tools" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <MePicker small />
      <button
        className={`btn sm${ui.planFromStage ? " on" : ""}`}
        title={ui.planFromStage
          ? "Đang nhìn từ sân khấu ra khán giả (trái phải theo người múa). Bấm để về góc khán giả (O)"
          : "Xoay sơ đồ: nhìn từ sân khấu ra khán giả, trái phải theo người múa (O)"}
        aria-pressed={ui.planFromStage}
        aria-label={ui.planFromStage ? "Từ sân khấu" : "Từ khán giả"}
        onClick={togglePlanFrom}
      >
        <Icon name="turn" /> <span className="rh-hide-narrow">{ui.planFromStage ? "Từ sân khấu" : "Từ khán giả"}</span>
      </button>
      <button
        className={`btn sm${ui.showNext ? " on" : ""}`}
        title="Hiện mờ chỗ đứng của đội hình kế tiếp"
        aria-label="Bóng đội hình kế"
        aria-pressed={ui.showNext}
        onClick={() => st().setUI({ showNext: !ui.showNext })}
      >
        <Icon name="ghost" /> <span className="rh-hide-narrow">Bóng đội hình kế</span>
      </button>
      <button
        className={`btn sm rh-warnbtn${issues.length ? " has" : ""}${open ? " on" : ""}`}
        title="Ai va nhau, chồng lên nhau, bị che hay phải chạy quá nhanh"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="warn" /> Cảnh báo
        {issues.length > 0 && <span className="rh-badge">{issues.length}</span>}
      </button>
      {open && (
        <div className="rh-pop">
          {issues.length === 0 ? (
            <div className="rh-ok">✓ Không thấy ai va nhau, chồng lên nhau, bị che hay phải chạy quá nhanh.</div>
          ) : (
            <>
            <div className="rh-pop-head">
              <span>{issues.length} chỗ cần xem · bấm để tua tới</span>
              {fixable && (
                <button
                  className="btn sm"
                  title="Tự đổi chỗ cho gần và nới khoảng chuyển ở mọi chỗ sửa được (có Hoàn tác)"
                  onClick={fixAllWarnings}
                >
                  Sửa tất cả
                </button>
              )}
            </div>
            {issues.map((w, i) => (
              <button key={i} className="rh-item" onClick={() => jump(w)} title="Tua tới chỗ này">
                <span className={`rh-ic ${w.kind}`}>{mark(w.kind)}</span>
                <span className="rh-msg">{w.msg}</span>
                <span className="rh-t">{fmtTime(w.t)}</span>
              </button>
            ))}
            </>
          )}
        </div>
      )}
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
