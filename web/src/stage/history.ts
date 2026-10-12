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
