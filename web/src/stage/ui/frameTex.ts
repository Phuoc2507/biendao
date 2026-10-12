// Texture khung video cho thẻ 3D. Đẩy thẳng <video> lên WebGL có lúc ra khung
// rỗng (video tách khỏi trang), nên chép khung qua canvas 2D rồi mới đẩy lên.
// Mỗi element một canvas + một texture, dùng chung giữa các thẻ cùng element
// (bản nhân bản cùng độ lệch). Canvas thu nhỏ (cạnh dài ≤ 1024, nhiều video thì
// 720) và chỉ chép khi khung đổi.

import * as THREE from "three";
import { fitSize } from "../intake";
import { playerCount } from "../media";

interface Slot {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D | null;
  tex: THREE.Texture;
  users: number;
  ready: boolean; // đã chép được ít nhất một khung
  frames: number; // số khung rVFC báo
  seen: number; // khung rVFC đã chép
  lastCb: number; // lúc rVFC báo gần nhất (ms)
  lastT: number; // currentTime lúc chép gần nhất
  lastCopy: number;
  cb: number;
}

type RVFC = HTMLVideoElement & {
  requestVideoFrameCallback(cb: () => void): number;
  cancelVideoFrameCallback(h: number): void;
};

const slots = new WeakMap<HTMLVideoElement, Slot>();

function slotOf(el: HTMLVideoElement): Slot {
  let s = slots.get(el);
  if (!s) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 2;
    const tex = new THREE.Texture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    s = { cv, g: cv.getContext("2d"), tex, users: 0, ready: false, frames: 0, seen: -1, lastCb: 0, lastT: -1, lastCopy: 0, cb: 0 };
    slots.set(el, s);
  }
  return s;
}

export const frameTexture = (el: HTMLVideoElement): THREE.Texture => slotOf(el).tex;

function watch(el: HTMLVideoElement, s: Slot) {
  if (!("requestVideoFrameCallback" in el)) return;
  const v = el as RVFC;
  const on = () => {
    s.frames++;
    s.lastCb = performance.now();
    if (s.users > 0) s.cb = v.requestVideoFrameCallback(on);
  };
  s.cb = v.requestVideoFrameCallback(on);
}

/** Thẻ bắt đầu dùng element; trả hàm nhả. Hết người dùng thì giải phóng bộ nhớ (slot giữ lại). */
export function holdFrame(el: HTMLVideoElement): () => void {
  const s = slotOf(el);
  if (s.users++ === 0) watch(el, s);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--s.users > 0) return;
    if (s.cb && "cancelVideoFrameCallback" in el) (el as RVFC).cancelVideoFrameCallback(s.cb);
    s.cb = 0;
    s.tex.dispose();
    s.cv.width = s.cv.height = 2;
    s.ready = false;
    s.lastT = -1;
    s.seen = -1;
  };
}

/** Chép khung hiện tại nếu khung đã đổi. Gọi mỗi khung hình (useFrame). */
export function copyFrame(el: HTMLVideoElement, stacked: boolean): void {
  const s = slots.get(el);
  if (!s || !s.users || !s.g) return;
  if (el.readyState < 2 || el.seeking || !el.videoWidth) return;
  const nowMs = performance.now();
  const t = el.currentTime;
  let fresh: boolean;
  if (!s.ready) fresh = true;
  else if (s.frames !== s.seen) fresh = true;
  else if (t === s.lastT) fresh = false;
  // rVFC đang chạy (video gắn trang) thì tin nó; tắt tiếng (video tách trang) thì dựa vào currentTime
  else if (nowMs - s.lastCb < 250) fresh = false;
  else fresh = el.paused || nowMs - s.lastCopy >= 30;
  if (!fresh) return;
  const max = playerCount() > 6 ? 720 : 1024;
  const vw = el.videoWidth, vh = el.videoHeight;
  // xếp chồng: nửa trên màu, nửa dưới mặt nạ — thu theo một nửa rồi nhân đôi
  let cw: number, ch: number;
  if (stacked) {
    const [w2, h2] = fitSize(vw, Math.max(1, Math.round(vh / 2)), max);
    cw = w2;
    ch = h2 * 2;
  } else [cw, ch] = fitSize(vw, vh, max);
  if (s.cv.width !== cw || s.cv.height !== ch) {
    s.cv.width = cw;
    s.cv.height = ch;
    s.tex.dispose(); // đổi cỡ thì phải cấp lại bộ nhớ texture
  }
  s.g.drawImage(el, 0, 0, cw, ch);
  s.tex.needsUpdate = true;
  s.ready = true;
  s.seen = s.frames;
  s.lastT = t;
  s.lastCopy = nowMs;
}

/** Element đã có khung trên texture chưa (để thẻ giữ khung cũ, khỏi chớp trắng). */
export function frameReady(el: HTMLVideoElement | undefined): boolean {
  const s = el && slots.get(el);
  return !!s && s.users > 0 && s.ready;
}
