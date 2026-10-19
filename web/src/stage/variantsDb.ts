// Kho phương án thật: variants.ts trên IndexedDB (khoá "variants" của kho
// "project", cạnh dự án đang mở). Báo cho hộp Phương án mỗi lần đổi.

import { loadKey, saveKey } from "./db";
import { type Variant, type VariantRepo, variantRepo } from "./variants";

const base = variantRepo({ get: loadKey, set: saveKey });
const subs = new Set<() => void>();
const emit = <T>(x: T): T => {
  for (const f of subs) f();
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
