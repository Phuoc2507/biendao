// "Tôi là ai": chọn một vũ công để làm nổi người đó, làm mờ người khác, hiện
// đường đi và dòng nhắc riêng. Chỉ là cách xem (ui), không đổi dự án.

import { st, useProject, useUI } from "../store";

export function MePicker({ small = false }: { small?: boolean }) {
  const p = useProject();
  const me = useUI().me;
  const ds = p.dancers.filter((d) => !d.hidden);
  const cur = ds.some((d) => d.id === me) ? (me as string) : "";
  return (
    <select
      className={`btn rh-me${small ? " sm" : ""}${cur ? " on" : ""}`}
      value={cur}
      title="Tôi là ai: làm nổi một người và hiện đường đi của người đó"
      onChange={(e) => {
        st().setUI({ me: e.target.value || null });
        e.target.blur(); // để phím cách vẫn là phát / dừng
      }}
    >
      <option value="">Tôi là ai…</option>
      {ds.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}
