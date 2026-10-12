// Lịch sử hoàn tác: gộp các bước liền nhau cùng loại, dọn lựa chọn hỏng.

/** Cùng khoá gộp và chưa quá windowMs từ lần ghi trước thì gộp vào bước cũ. */
export function canMerge(prevKey: string | null, prevAt: number, key: string | undefined, now: number, windowMs = 2500): boolean {
  return !!key && key === prevKey && now - prevAt >= 0 && now - prevAt <= windowMs;
}

interface Sel {
  selected: string[];
  selectedBlock: string | null;
}

/** Bỏ khỏi lựa chọn những người và khối không còn trong dự án. Không đổi gì thì trả lại đúng đối tượng cũ. */
export function pruneSelection<U extends Sel>(ui: U, p: { dancers: { id: string }[]; formations: { id: string }[] }): U {
  const ids = new Set(p.dancers.map((d) => d.id));
  const selected = ui.selected.filter((id) => ids.has(id));
  const blockOk = ui.selectedBlock === null || p.formations.some((f) => f.id === ui.selectedBlock);
  if (selected.length === ui.selected.length && blockOk) return ui;
  return { ...ui, selected, selectedBlock: blockOk ? ui.selectedBlock : null };
}

// --- Gộp nhiều commit thành MỘT bước hoàn tác (thuần, để test bằng node --test).

export interface Hist<P> {
  project: P;
  past: P[];
}

/**
 * Sau một loạt commit bắt đầu từ `base`: cắt `past` về đúng chỗ có `base` để cả
 * loạt chỉ còn một bước. null = không cần đổi (không có gì mới, hoặc lịch sử
 * đã bị nạp lại / undo lùi quá base).
 */
export function collapseBatch<P>(base: P, now: Hist<P>): { past: P[]; future: P[] } | null {
  if (now.project === base) return null;
  const k = now.past.lastIndexOf(base);
  if (k < 0 || k === now.past.length - 1) return null;
  return { past: now.past.slice(0, k + 1), future: [] };
}

/** Bộ gộp lồng nhau được và chịu được hàm async (đếm độ sâu). */
export function makeBatcher<P>(get: () => Hist<P>, set: (s: { past: P[]; future: P[] }) => void) {
  let depth = 0;
  let base: P | null = null;
  const begin = () => {
    if (depth++ === 0) base = get().project;
  };
  const end = () => {
    if (depth === 0) return;
    if (--depth > 0) return;
    const b = base as P;
    base = null;
    const r = collapseBatch(b, get());
    if (r) set(r);
  };
  function batch<T>(fn: () => T): T {
    begin();
    let r: T;
    try {
      r = fn();
    } catch (e) {
      end();
      throw e;
    }
    if (r && typeof (r as { then?: unknown }).then === "function") {
      return (r as unknown as Promise<unknown>).finally(end) as unknown as T;
    }
    end();
    return r;
  }
  return { begin, end, batch, active: () => depth > 0 };
}
