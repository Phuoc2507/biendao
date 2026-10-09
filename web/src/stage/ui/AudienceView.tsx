// Khung nhìn KHÁN GIẢ: sân khấu 3D, mỗi vũ công là một thẻ video phẳng luôn
// quay về phía máy quay. Vị trí đọc thẳng từ store và đồng hồ mỗi khung hình
// (không render lại React), nên phát mượt với nhiều thẻ.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { type VDancer, type Vec2, WING, poseAt, lineup, snapPos, clampToStage } from "../model";
import { st, useProject, useUI } from "../store";
import * as clock from "../clock";
import { getVideo } from "../media";
import { setPositionsNow } from "../actions";
import { useMediaVersion } from "./hooks";
import { Icon } from "./icons";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// mode 0: ảnh thường (alpha của ảnh), 1: xếp chồng (nửa trên màu, nửa dưới mặt nạ),
// 2: video thường không mặt nạ (đục). Kết cấu để thô (NoColorSpace) nên giá trị
// đọc ra đã là sRGB, ghi thẳng ra màn hình.
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform int mode;
uniform float opacity;
uniform float lift;
varying vec2 vUv;
void main() {
  vec3 c;
  float a;
  if (mode == 1) {
    c = texture2D(map, vec2(vUv.x, 0.5 + vUv.y * 0.5)).rgb;
    a = texture2D(map, vec2(vUv.x, vUv.y * 0.5)).r;
    a = smoothstep(0.04, 0.96, a);
  } else if (mode == 2) {
    c = texture2D(map, vUv).rgb;
    a = 1.0;
  } else {
    vec4 t = texture2D(map, vUv);
    c = t.rgb;
    a = t.a;
  }
  a *= opacity;
  if (a < 0.02) discard;
  c = mix(c, vec3(1.0), lift);
  gl_FragColor = vec4(c, a);
}`;

function placeholderTexture(d: VDancer): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 192;
  cv.height = 416;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = d.color;
  g.globalAlpha = 0.9;
  // dáng người đơn giản
  g.beginPath();
  g.arc(96, 70, 34, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(52, 120);
  g.quadraticCurveTo(96, 104, 140, 120);
  g.lineTo(160, 300);
  g.lineTo(32, 300);
  g.closePath();
  g.fill();
  g.fillRect(60, 300, 26, 110);
  g.fillRect(106, 300, 26, 110);
  g.globalAlpha = 1;
  g.fillStyle = "#111";
  g.font = "bold 30px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.fillText(d.name.slice(0, 8), 96, 220);
  g.font = "18px Segoe UI, sans-serif";
  g.fillText("chưa có video", 96, 250);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

let shadowTex: THREE.Texture | null = null;
function blobShadow(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,0.65)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(cv);
  return shadowTex;
}

function Card({ d, interactive }: { d: VDancer; interactive: boolean }) {
  const group = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const mv = useMediaVersion();
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const dragRef = useRef<{ base: Record<string, Vec2>; hit: THREE.Vector3; moved: boolean } | null>(null);

  const v = getVideo(d.mediaId);
  const { tex, mode } = useMemo(() => {
    if (v) {
      const t = new THREE.VideoTexture(v.el);
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return { tex: t as THREE.Texture, mode: d.stacked ? 1 : 2 };
    }
    return { tex: placeholderTexture(d) as THREE.Texture, mode: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, d.stacked, mv, v ? "" : d.name + d.color]);
  useEffect(() => () => tex.dispose(), [tex]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { map: { value: tex }, mode: { value: mode }, opacity: { value: 1 }, lift: { value: 0 } },
        transparent: true,
        depthWrite: true,
        side: THREE.DoubleSide,
      }),
    [tex, mode],
  );
  useEffect(() => () => mat.dispose(), [mat]);

  const h = d.cardHeight;
  const w = h * (d.aspect || 0.45);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const p = st().project;
    const t = clock.now();
    const q = poseAt(p.formations, d.id, t) ?? lineup(p.dancers.map((x) => x.id), p.stage)[d.id] ?? [0, 0];
    g.position.set(q[0], 0, q[1]);
    if (plane.current) plane.current.rotation.y = Math.atan2(camera.position.x - q[0], camera.position.z - q[1]);
    const selected = st().ui.selected.includes(d.id);
    if (ring.current) ring.current.visible = selected;
    // ngoài khoảng video: làm mờ thẻ để biết người này chưa có hình
    let op = 1;
    if (v) {
      const vt = t - d.offsetSec;
      if (vt < 0 || vt > (d.durationSec || v.duration)) op = 0.35;
    }
    mat.uniforms.opacity.value = op;
    mat.uniforms.lift.value = selected ? 0.06 : 0;
  });

  const groundHit = (e: ThreeEvent<PointerEvent>): THREE.Vector3 | null => {
    const out = new THREE.Vector3();
    return e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    if (clock.isPlaying()) clock.pause();
    const additive = e.shiftKey || e.ctrlKey;
    let sel = st().ui.selected;
    if (additive) sel = sel.includes(d.id) ? sel.filter((x) => x !== d.id) : [...sel, d.id];
    else if (!sel.includes(d.id)) sel = [d.id];
    st().setUI({ selected: sel });
    const hit = groundHit(e);
    if (!hit) return;
    const p = st().project;
    const base: Record<string, Vec2> = {};
    for (const id of sel) {
      const q = poseAt(p.formations, id, clock.now());
      if (q) base[id] = q;
    }
    dragRef.current = { base, hit, moved: false };
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const dr = dragRef.current;
    if (!dr) return;
    const hit = groundHit(e);
    if (!hit) return;
    const dx = hit.x - dr.hit.x;
    const dz = hit.z - dr.hit.z;
    if (!dr.moved && Math.hypot(dx, dz) < 0.05) return;
    if (!dr.moved) {
      dr.moved = true;
      st().beginGesture();
    }
    const p = st().project;
    const moves: Record<string, Vec2> = {};
    for (const [id, b] of Object.entries(dr.base)) {
      let q: Vec2 = [b[0] + dx, b[1] + dz];
      if (st().ui.snap) q = snapPos(q, 0.25);
      moves[id] = clampToStage(q, p.stage);
    }
    setPositionsNow(moves, true);
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const dr = dragRef.current;
    if (!dr) return;
    dragRef.current = null;
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    if (controls) controls.enabled = true;
    if (dr.moved) st().endGesture();
  };

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005} renderOrder={-1}>
        <circleGeometry args={[Math.max(0.28, w * 0.55), 24]} />
        <meshBasicMaterial map={blobShadow()} transparent depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.01} visible={false}>
        <ringGeometry args={[0.36, 0.44, 40]} />
        <meshBasicMaterial color="#ff9f43" />
      </mesh>
      <mesh
        ref={plane}
        material={mat}
        position-y={h / 2}
        scale={[w, h, 1]}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

function StageSet() {
  const p = useProject();
  const { width: W, depth: D } = p.stage;
  const lines = useMemo(() => {
    const pts: number[] = [];
    for (let x = -Math.floor(W / 2); x <= W / 2; x++) pts.push(x, 0.003, -D / 2, x, 0.003, D / 2);
    for (let z = -Math.floor(D / 2); z <= D / 2; z++) pts.push(-W / 2, 0.003, z, W / 2, 0.003, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [W, D]);
  return (
    <group>
      {/* sàn diễn */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#3a2a22" roughness={0.85} />
      </mesh>
      {/* cánh gà */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[s * (W / 2 + WING / 2), -0.002, 0]}>
          <planeGeometry args={[WING, D]} />
          <meshStandardMaterial color="#14161b" roughness={1} />
        </mesh>
      ))}
      {/* màn hai bên che cánh gà */}
      {[-1, 1].map((s) => (
        <mesh key={`c${s}`} position={[s * (W / 2 + 0.05), 2.2, D / 2 - 0.6]} rotation-y={s * 0.15}>
          <planeGeometry args={[0.9, 4.4]} />
          <meshStandardMaterial color="#5a1020" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#5a463a" transparent opacity={0.5} />
      </lineSegments>
      {/* mép trước */}
      <mesh position={[0, 0.006, D / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W, 0.05]} />
        <meshBasicMaterial color="#ff9f43" />
      </mesh>
      {/* phông nền */}
      <mesh position={[0, 2.6, -D / 2 - 0.05]}>
        <planeGeometry args={[W + 2 * WING + 2, 5.2]} />
        <meshStandardMaterial color="#2a0f18" roughness={1} />
      </mesh>
      {/* sàn khán phòng */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.25, D / 2 + 6]}>
        <planeGeometry args={[W + 12, 12]} />
        <meshStandardMaterial color="#0c0d10" />
      </mesh>
    </group>
  );
}

type Preset = "front" | "top" | "side";
const presetPos = (pr: Preset, W: number, D: number): [number, number, number] =>
  pr === "front" ? [0, 2.6, D / 2 + Math.max(7, W * 0.85)] : pr === "top" ? [0, Math.max(10, W * 1.2), D / 2 + 0.5] : [W * 0.75, 3.2, D / 2 + 5];

function CameraRig({ preset, stamp }: { preset: Preset; stamp: number }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update(): void } | null };
  const p = useProject();
  useEffect(() => {
    const [x, y, z] = presetPos(preset, p.stage.width, p.stage.depth);
    camera.position.set(x, y, z);
    if (controls) {
      controls.target.set(0, preset === "top" ? 0 : 0.9, 0);
      controls.update();
    } else camera.lookAt(0, 0.9, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, stamp, controls]);
  return null;
}

export function AudienceView({ interactive = true, showTools = true }: { interactive?: boolean; showTools?: boolean }) {
  const p = useProject();
  const camReset = useUI().camReset;
  const [preset, setPreset] = useState<Preset>("front");
  const [stamp, setStamp] = useState(0);
  const pick = (pr: Preset) => {
    setPreset(pr);
    setStamp((s) => s + 1);
  };
  const W = p.stage.width, D = p.stage.depth;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 38, position: presetPos("front", W, D), near: 0.1, far: 200 }}
        onPointerMissed={() => interactive && st().setUI({ selected: [] })}
        style={{ background: "#07080a" }}
      >
        <ambientLight intensity={0.55} />
        <spotLight position={[0, 8, D / 2 + 4]} angle={0.6} penumbra={0.6} intensity={60} decay={1.6} color="#ffe2c4" />
        <spotLight position={[-W / 2, 6, D / 2]} angle={0.5} penumbra={0.8} intensity={25} decay={1.6} color="#ffb0c0" />
        <StageSet />
        {p.dancers.filter((d) => !d.hidden).map((d) => (
          <Card key={d.id} d={d} interactive={interactive} />
        ))}
        <OrbitControls makeDefault enablePan target={[0, 0.9, 0]} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={2} maxDistance={40} />
        <CameraRig preset={preset} stamp={stamp + camReset} />
      </Canvas>
      {showTools && (
        <div className="pane-tools">
          <div className="seg">
            <button className={preset === "front" ? "on" : ""} onClick={() => pick("front")} title="Góc khán giả">Khán giả</button>
            <button className={preset === "side" ? "on" : ""} onClick={() => pick("side")} title="Góc chéo">Chéo</button>
            <button className={preset === "top" ? "on" : ""} onClick={() => pick("top")} title="Nhìn từ trên">Trên cao</button>
          </div>
          <button className="btn sm icon" title="Đặt lại góc nhìn" onClick={() => pick(preset)}>
            <Icon name="camera" />
          </button>
        </div>
      )}
    </div>
  );
}
