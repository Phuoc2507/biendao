// Kho phương án thật: variants.ts trên IndexedDB (khoá "variants" của kho
// "project", cạnh dự án đang mở). Báo cho hộp Phương án mỗi lần đổi.
// Hai thẻ cùng mở: mỗi lần ghi giữ khoá navigator.locks rồi đọc lại bản mới
// nhất trước khi ghi (không ghi đè phương án thẻ kia vừa lưu), và báo qua
// BroadcastChannel để hộp Phương án ở thẻ kia đọc lại danh sách.

import { loadKey, saveKey } from "./db";
import { type Lock, type Variant, type VariantRepo, variantRepo } from "./variants";

const LOCK = "choreo-stage-variants";
const webLock: Lock = (fn) =>
  typeof navigator !== "undefined" && navigator.locks
    ? (navigator.locks.request(LOCK, fn) as ReturnType<typeof fn>)
    : fn();

const base = variantRepo({ get: loadKey, set: saveKey }, webLock);
const subs = new Set<() => void>();
const notify = () => {
  for (const f of subs) f();
};
const bc: BroadcastChannel | null = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOCK) : null;
if (bc) bc.onmessage = notify; // thẻ khác vừa đổi danh sách
const emit = <T>(x: T): T => {
  notify();
  bc?.postMessage("changed");
  return x;
};

export const variants: VariantRepo = {
  list: base.list,
  mediaIds: base.mediaIds,
  add: (n, p, now) => base.add(n, p, now).then(emit),
  restore: (v: Variant) => base.restore(v).then(emit),
  rename: (id, n) => base.rename(id, n).then(emit),
  remove: (id) => base.remove(id).then(emit),
};

export function onVariantsChange(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}
