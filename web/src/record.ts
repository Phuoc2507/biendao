// Ghi video góc nhìn hiện tại ra tệp .webm — mục tiêu "góc nhìn tập cá nhân hoá"
// của luận văn: mỗi vũ công nhận một clip soi gương/bám lưng riêng.
//
// GHI TẤT ĐỊNH bằng WebCodecs: tự bơm từng khung bằng advance() của R3F rồi mã hoá
// trực tiếp VideoFrame(canvas) qua VideoEncoder (VP9) và đóng gói .webm bằng
// webm-muxer. Cách này KHÔNG phụ thuộc requestAnimationFrame hay việc trình duyệt
// compositing canvas — nên vẫn cho video đầy đủ khung dù tab bị ẩn/mất nét, và
// nhanh hơn thời gian thực (không phải chờ phát đủ 8 giây).

import { Muxer, ArrayBufferTarget } from "webm-muxer";
import { useStore } from "./store";

let canvasEl: HTMLCanvasElement | null = null;
let advanceFn: ((timestampMs: number) => void) | null = null;

export function setCanvas(el: HTMLCanvasElement | null): void {
  canvasEl = el;
}
// R3F advance(timestamp): chạy một khung (mọi useFrame + render) theo yêu cầu.
export function setAdvance(fn: ((timestampMs: number) => void) | null): void {
  advanceFn = fn;
}

export function canRecord(): boolean {
  return (
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !==
    "undefined"
  );
}

// Chọn codec VP9/VP8 mà VideoEncoder hỗ trợ ở kích thước canvas hiện tại.
async function pickCodec(w: number, h: number): Promise<string> {
  const cands = ["vp09.00.10.08", "vp8"];
  for (const c of cands) {
    try {
      const sup = await VideoEncoder.isConfigSupported({
        codec: c,
        width: w,
        height: h,
      });
      if (sup.supported) return c;
    } catch {
      /* thử codec kế tiếp */
    }
  }
  return "";
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface RecordOpts {
  fps?: number;
  warmup?: number; // số khung "làm nóng" cho camera lerp hội tụ về khung đầu
}

// Thu trọn một vòng lặp clip theo góc nhìn hiện tại rồi tải về `filename`.
export async function recordCurrentView(
  seconds: number,
  filename: string,
  opts: RecordOpts = {}
): Promise<Blob> {
  if (!canvasEl) throw new Error("Chưa sẵn sàng canvas để ghi");
  if (!advanceFn) throw new Error("Chưa sẵn sàng bộ dựng khung");
  if (!canRecord()) throw new Error("Trình duyệt không hỗ trợ WebCodecs");

  const w = canvasEl.width;
  const h = canvasEl.height;
  if (w < 2 || h < 2) throw new Error("Canvas chưa có kích thước");

  const fps = opts.fps ?? 30;
  const warmup = opts.warmup ?? 20;
  const st = useStore.getState();
  const dur = st.duration > 0 ? st.duration : seconds;
  const N = Math.max(1, Math.round(fps * dur));

  const codec = await pickCodec(w, h);
  if (!codec) throw new Error("Không có codec video phù hợp");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codec.startsWith("vp09") ? "V_VP9" : "V_VP8", width: w, height: h, frameRate: fps },
    firstTimestampBehavior: "offset",
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("VideoEncoder:", e),
  });
  encoder.configure({ codec, width: w, height: h, bitrate: 6_000_000, framerate: fps });

  const wasPlaying = st.playing;
  st.setPlaying(false); // ta tự điều khiển thời gian
  const frameMs = 1000 / fps;
  const t0 = performance.now();

  try {
    // Làm nóng: giữ khung đầu để camera lerp hội tụ, tránh cảnh "camera bay vào".
    useStore.setState({ time: 0 });
    for (let i = 0; i < warmup; i++) advanceFn(t0 + i * frameMs);

    const usPerFrame = 1_000_000 / fps;
    for (let i = 0; i < N; i++) {
      useStore.setState({ time: (i / fps) % dur });
      advanceFn(t0 + (warmup + i) * frameMs);
      const frame = new VideoFrame(canvasEl, { timestamp: Math.round(i * usPerFrame) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      // Chống dồn hàng đợi mã hoá: nhường khi hàng đợi dài.
      if (encoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await encoder.flush();
    muxer.finalize();
    const { buffer } = muxer.target as ArrayBufferTarget;
    const blob = new Blob([buffer], { type: "video/webm" });
    download(blob, filename);
    return blob;
  } finally {
    encoder.close();
    const st2 = useStore.getState();
    st2.setPlaying(wasPlaying);
    useStore.setState({ time: 0 });
  }
}
