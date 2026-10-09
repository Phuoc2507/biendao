// Vũ công mẫu và nhạc mẫu sinh ngay trong trình duyệt (không tải gì về):
// để người dùng thử app trước khi quay, và để tự kiểm tra đường đi video thật.
//
// Nhạc: tổng hợp bằng OfflineAudioContext (trống, mõ, giai điệu ngũ cung).
// Video: vẽ người múa cầm quạt lên canvas, mã hoá VP8/VP9 bằng WebCodecs rồi
// đóng gói .webm bằng webm-muxer, dạng XẾP CHỒNG (nửa trên màu, nửa dưới mặt nạ),
// đúng định dạng thẻ mà công cụ Python xuất ra.

import { Muxer, ArrayBufferTarget } from "webm-muxer";
import { type Project, type Vec2, emptyProject, newDancer, arrangeShape, lineup, WING } from "./model";
import { storeBlob, registerVideo, setMusic, uid } from "./media";

export const DEMO_BPM = 100;
const BEAT = 60 / DEMO_BPM;
const MUSIC_SEC = 8 * 8 * BEAT; // 8 lượt 8 = 38.4 s
const FPS = 24;
const VW = 192;
const VH = 352;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- nhạc ----------

function wav(buf: AudioBuffer): Blob {
  const ch = buf.getChannelData(0);
  const n = ch.length;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
  w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true);
  return new Blob([out.buffer], { type: "audio/wav" });
}

export async function makeDemoMusic(): Promise<Blob> {
  const sr = 22050;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * MUSIC_SEC), sr);
  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, sr * 0.2, sr);
  const nd = noise.getChannelData(0);
  const r = rng(11);
  for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;

  const drum = (t: number, v: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.4);
  };
  const block = (t: number, v: number) => {
    // mõ: tiếng gõ gỗ ngắn
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + 0.08);
  };
  const pluck = (t: number, freq: number, v: number) => {
    // dây gảy kiểu đàn tranh
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine"; o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2).connect(g); g.connect(master);
    o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
  };

  const scale = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25]; // ngũ cung Rê
  const nBeats = Math.round(MUSIC_SEC / BEAT);
  let note = 3;
  for (let b = 0; b < nBeats; b++) {
    const t = b * BEAT;
    const inBar = b % 8;
    if (inBar === 0) drum(t, 0.9);
    else if (inBar === 4) drum(t, 0.6);
    block(t, inBar % 2 === 0 ? 0.5 : 0.3);
    // giai điệu: nhịp ngẫu nhiên tất định để tương quan chéo có đỉnh rõ
    if (r() < 0.75) {
      note = Math.max(0, Math.min(scale.length - 1, note + Math.round((r() - 0.5) * 3)));
      pluck(t + (r() < 0.3 ? BEAT / 2 : 0), scale[note], 0.35);
    }
    if (r() < 0.25) block(t + BEAT / 2, 0.2);
  }
  const buf = await ctx.startRendering();
  return wav(buf);
}

// ---------- người múa ----------

interface Look {
  skin: string;
  dress: string;
  pants: string;
  fan: string;
  phase: number;
  style: number;
}

function drawDancer(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, tMusic: number, look: Look) {
  const beat = tMusic / BEAT;
  const ph = beat * Math.PI + look.phase; // một chu kỳ mỗi 2 phách
  const sway = Math.sin(ph) * 6;
  const bob = Math.abs(Math.sin(ph)) * 4;
  const cx = VW / 2 + sway;
  const top = 34 + bob;
  const s = VH / 352;
  g.save();
  g.scale(s, s);
  g.lineCap = "round";
  g.lineJoin = "round";
  // chân
  const step = Math.sin(ph) * 10;
  g.strokeStyle = look.pants;
  g.lineWidth = 15;
  g.beginPath();
  g.moveTo(cx - 9, top + 160); g.lineTo(cx - 12 - step, top + 300);
  g.moveTo(cx + 9, top + 160); g.lineTo(cx + 12 - step, top + 300);
  g.stroke();
  // áo dài: thân + tà áo bay
  g.fillStyle = look.dress;
  g.beginPath();
  g.moveTo(cx - 22, top + 52);
  g.lineTo(cx + 22, top + 52);
  g.lineTo(cx + 28, top + 150);
  g.quadraticCurveTo(cx + 34 + sway * 2, top + 230, cx + 26 + sway * 3, top + 262);
  g.lineTo(cx - 26 + sway * 3, top + 262);
  g.quadraticCurveTo(cx - 34 + sway * 2, top + 230, cx - 28, top + 150);
  g.closePath();
  g.fill();
  // tay cầm quạt
  const arm = (side: -1 | 1) => {
    // góc tính từ phương thẳng xuống, dương là giơ ra phía ngoài
    const lift = 0.5 + 0.5 * Math.sin(ph + (side < 0 ? Math.PI * look.style : 0));
    const a = side * (0.5 + 1.9 * lift);
    const a2 = a + side * 0.6;
    const sx = cx + side * 20, sy = top + 60;
    const ex = sx + Math.sin(a) * 44, ey = sy + Math.cos(a) * 44;
    const hx = ex + Math.sin(a2) * 40, hy = ey + Math.cos(a2) * 40;
    g.strokeStyle = look.dress;
    g.lineWidth = 12;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = look.skin;
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy); g.stroke();
    // quạt nan mở
    const open = 0.9 + 0.35 * Math.sin(ph * 2);
    const dir = Math.atan2(hy - ey, hx - ex);
    g.fillStyle = look.fan;
    g.beginPath();
    g.moveTo(hx, hy);
    g.arc(hx, hy, 34, dir - open / 2 - 0.4, dir + open / 2 + 0.4);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 1;
    for (let k = -3; k <= 3; k++) {
      const aa = dir + (k / 3) * (open / 2 + 0.4);
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(aa) * 34, hy + Math.sin(aa) * 34); g.stroke();
    }
  };
  arm(-1);
  arm(1);
  // cổ, đầu, tóc
  g.fillStyle = look.skin;
  g.fillRect(cx - 5, top + 38, 10, 16);
  g.beginPath(); g.arc(cx, top + 24, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1b1410";
  g.beginPath(); g.arc(cx, top + 19, 18, Math.PI, 0); g.fill();
  g.beginPath(); g.ellipse(cx + 4, top + 8, 9, 7, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

async function pickCodec(w: number, h: number): Promise<string> {
  for (const c of ["vp8", "vp09.00.10.08"]) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h });
      if (s.supported) return c;
    } catch {
      /* thử tiếp */
    }
  }
  return "";
}

export const canMakeDemo = () => typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !== "undefined";

/** Video xếp chồng cho một người, bắt đầu ở thời điểm nhạc offset (âm: quay trước nhạc). */
async function makeDancerVideo(look: Look, offset: number, seconds: number, onFrame: () => void): Promise<Blob> {
  const W = VW, H = VH * 2;
  const codec = await pickCodec(W, H);
  if (!codec) throw new Error("Trình duyệt không mã hoá được video");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codec === "vp8" ? "V_VP8" : "V_VP9", width: W, height: H, frameRate: FPS },
    firstTimestampBehavior: "offset",
  });
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error(e),
  });
  enc.configure({ codec, width: W, height: H, bitrate: 900_000, framerate: FPS, latencyMode: "realtime" });
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext("2d")!;
  const fig = new OffscreenCanvas(VW, VH);
  const fg = fig.getContext("2d")!;
  const N = Math.round(seconds * FPS);
  for (let i = 0; i < N; i++) {
    const tMusic = offset + i / FPS;
    fg.globalCompositeOperation = "source-over";
    fg.clearRect(0, 0, VW, VH);
    drawDancer(fg, tMusic, look);
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    g.drawImage(fig, 0, 0);
    fg.globalCompositeOperation = "source-in";
    fg.fillStyle = "#fff";
    fg.fillRect(0, 0, VW, VH);
    g.drawImage(fig, 0, VH);
    const frame = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS) });
    enc.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    if (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 0));
    onFrame();
  }
  await enc.flush();
  enc.close();
  muxer.finalize();
  return new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: "video/webm" });
}

const NAMES = ["Lan", "Mai", "Hùng", "Thảo", "Minh", "Vy", "Khoa", "Ngọc"];
const LOOKS: Omit<Look, "phase" | "style">[] = [
  { skin: "#f1c7a5", dress: "#d7263d", pants: "#f4f1e8", fan: "#ffd23f" },
  { skin: "#e9b98f", dress: "#1b98e0", pants: "#f4f1e8", fan: "#ff6f59" },
  { skin: "#d9a57b", dress: "#2e933c", pants: "#f4f1e8", fan: "#ffd23f" },
  { skin: "#f1c7a5", dress: "#f49d37", pants: "#3a3a3a", fan: "#d7263d" },
  { skin: "#e9b98f", dress: "#8e44ad", pants: "#f4f1e8", fan: "#ffd23f" },
  { skin: "#d9a57b", dress: "#e84a8a", pants: "#f4f1e8", fan: "#1b98e0" },
  { skin: "#f1c7a5", dress: "#16a5a5", pants: "#3a3a3a", fan: "#ff6f59" },
  { skin: "#e9b98f", dress: "#c0392b", pants: "#f4f1e8", fan: "#ffd23f" },
];

/** Tạo dự án mẫu đầy đủ (nhạc, n vũ công có video, 5 đội hình). */
export async function makeDemoProject(
  n: number, progress: (msg: string, p: number) => void,
): Promise<Project> {
  progress("Đang soạn nhạc mẫu…", 0);
  const mBlob = await makeDemoMusic();
  const mRec = await storeBlob("nhac-mau.wav", mBlob);
  const musicDuration = await setMusic(mRec);

  const p: Project = {
    ...emptyProject(),
    title: "Múa quạt (mẫu)",
    musicId: mRec.id, musicName: "nhac-mau.wav", musicDuration,
    bpm: DEMO_BPM, downbeat: 0,
  };
  const r = rng(5);
  const total = n * Math.round((MUSIC_SEC + 3) * FPS);
  let done = 0;
  for (let i = 0; i < n; i++) {
    const look: Look = { ...LOOKS[i % LOOKS.length], phase: (i % 2) * Math.PI, style: i % 3 === 0 ? 1 : 0 };
    const offset = -Math.round((1 + r() * 2) * 100) / 100; // bấm quay trước nhạc 1 đến 3 s
    const seconds = MUSIC_SEC - offset + 0.5;
    const blob = await makeDancerVideo(look, offset, seconds, () => {
      done++;
      if (done % 24 === 0) progress(`Đang dựng video vũ công ${i + 1}/${n}…`, 0.1 + 0.85 * (done / total));
    });
    const rec = await storeBlob(`${NAMES[i % NAMES.length]}.card.webm`, blob);
    const v = await registerVideo(rec);
    const d = newDancer(uid("d"), NAMES[i % NAMES.length], LOOKS[i % LOOKS.length].dress);
    Object.assign(d, {
      mediaId: rec.id, mediaName: rec.name, stacked: true, offsetSec: offset,
      durationSec: v.duration || seconds, aspect: VW / VH, cardHeight: 1.6, alignConfident: true,
    });
    p.dancers.push(d);
  }
  progress("Đang xếp đội hình…", 0.97);
  const ids = p.dancers.map((d) => d.id);
  const bar = 8 * BEAT;
  const half = Math.ceil(n / 2);
  const wings: Record<string, Vec2> = {};
  ids.forEach((id, i) => {
    const left = i < half;
    const k = left ? i : i - half;
    wings[id] = [(left ? -1 : 1) * (p.stage.width / 2 + WING / 2), 2 - k * 1.1];
  });
  const line = lineup(ids, p.stage);
  const v = arrangeShape(line, ids, "v", p.stage);
  const stag = arrangeShape(v, ids, "stagger", p.stage);
  const circ = arrangeShape(stag, ids, "circle", p.stage);
  const front = lineup(ids, p.stage);
  p.formations = [
    { id: uid("f"), name: "Vào sân", start: 0, end: 0.5 * bar, pos: wings },
    { id: uid("f"), name: "Hàng ngang", start: 1.5 * bar, end: 2.5 * bar, pos: line },
    { id: uid("f"), name: "Chữ V", start: 3.25 * bar, end: 4.25 * bar, pos: v },
    { id: uid("f"), name: "So le", start: 5 * bar, end: 5.75 * bar, pos: stag },
    { id: uid("f"), name: "Vòng tròn", start: 6.25 * bar, end: 7 * bar, pos: circ },
    { id: uid("f"), name: "Chào", start: 7.5 * bar, end: 8 * bar, pos: front },
  ];
  progress("Xong", 1);
  return p;
}
