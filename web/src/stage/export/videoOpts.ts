// Phần thuần của Xuất video: chọn định dạng, đoạn ghi, cỡ khung, tên tệp.

import { slugTitle, safeName } from "./bundle.ts";

export type VideoView = "audience" | "plan";
export type RangeKind = "all" | "loop" | "playhead";
export type Res = 480 | 720 | 1080;

/** Thứ tự ưu tiên: MP4 (mở được mọi nơi, kể cả Zalo/điện thoại) rồi WebM. */
export const MIME_ORDER = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMime(isSupported: (m: string) => boolean): string | null {
  for (const m of MIME_ORDER) {
    try {
      if (isSupported(m)) return m;
    } catch {
      /* trình duyệt cũ ném lỗi với chuỗi lạ */
    }
  }
  return null;
}

export const extFor = (mime: string) => (mime.startsWith("video/mp4") ? "mp4" : "webm");

export interface RangeCtx {
  end: number; // hết bài
  loop: { a: number; b: number } | null;
  t: number; // vạch phát
}

/** Đoạn cần ghi [a, b], hoặc lý do không ghi được. */
export function rangeFor(kind: RangeKind, c: RangeCtx): { a: number; b: number } | { error: string } {
  let a = 0, b = c.end;
  if (kind === "loop") {
    if (!c.loop) return { error: "Chưa đặt đoạn lặp." };
    a = c.loop.a;
    b = Math.min(c.loop.b, c.end);
  } else if (kind === "playhead") a = c.t;
  a = Math.max(0, a);
  if (b - a < 0.5) return { error: kind === "playhead" ? "Vạch phát đang ở cuối bài." : "Đoạn quá ngắn để ghi." };
  return { a, b };
}

/** Cỡ khung chẵn (bộ mã H.264 cần), vừa trong hộp 16:9 của độ phân giải chọn. */
export function outputSize(res: Res, aspect: number): { w: number; h: number } {
  const bh = res, bw = Math.round((res * 16) / 9);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  let w = bw, h = bw / a;
  if (h > bh) {
    h = bh;
    w = bh * a;
  }
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(w), h: even(h) };
}

/** Bit/giây theo độ phân giải. */
export const bitrateFor = (res: Res) => (res >= 1080 ? 8e6 : res >= 720 ? 5e6 : 2.5e6);

/** Tên tệp: "<tên bài>.mp4" hoặc "<tên bài>-<tên vũ công>.webm". */
export function videoFileName(title: string, ext: string, who?: string): string {
  const base = slugTitle(title) + (who ? `-${slugTitle(who)}` : "");
  return safeName(`${base}.${ext}`);
}

/** Thời gian ghi dạng "1 phút 05 giây". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m ? `${m} phút ${String(s % 60).padStart(2, "0")} giây` : `${s} giây`;
}
