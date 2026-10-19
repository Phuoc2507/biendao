// Phần thuần của Xuất video: chọn định dạng, cỡ khung, tên tệp, số khung, OpusHead.
// Khoảng Từ / Tới nằm ở videoRange.ts.

import { slugTitle, safeName } from "./bundle.ts";

export type VideoView = "audience" | "plan";
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

/** Tên tệp: "<tên bài>.mp4", "<tên bài>-<đoạn>.webm", "<tên bài>-<đoạn>-<tên vũ công>.webm". */
export function videoFileName(title: string, ext: string, who?: string, part?: string): string {
  const has = (x?: string): x is string => !!x && /[\p{L}\p{N}]/u.test(x);
  const base = slugTitle(title) + (has(part) ? `-${slugTitle(part)}` : "") + (has(who) ? `-${slugTitle(who)}` : "");
  return safeName(`${base}.${ext}`);
}

/** Số khung của đoạn [a, b] ở fps (ít nhất 1). */
export const frameCount = (a: number, b: number, fps: number) => Math.max(1, Math.round((b - a) * fps));

/**
 * Khối "OpusHead" (RFC 7845 mục 5.1) làm CodecPrivate của rãnh Opus trong WebM,
 * dùng khi AudioEncoder không trả decoderConfig.description.
 */
export function opusHead(channels: number, sampleRate: number, preSkip = 312): Uint8Array {
  const b = new Uint8Array(19);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  const v = new DataView(b.buffer);
  v.setUint8(8, 1); // phiên bản
  v.setUint8(9, channels);
  v.setUint16(10, preSkip, true);
  v.setUint32(12, sampleRate, true);
  v.setInt16(16, 0, true); // tăng âm
  v.setUint8(18, 0); // ánh xạ kênh 0: mono hoặc stereo
  return b;
}

/** Thời gian ghi dạng "1 phút 05 giây". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m ? `${m} phút ${String(s % 60).padStart(2, "0")} giây` : `${s} giây`;
}
