// Chế độ tập: đếm vào "5 6 7 8", chữ "còn bao lâu" không nhảy mỗi khung hình,
// đường đi và dòng nhắc riêng của "Tôi là ai". THUẦN, chỉ import model/timing.

import { type Formation, type Vec2, clipChars, dist, personNote, segmentAt } from "./model.ts";
import { beatLen, fmtCounts } from "./timing.ts";

export const COUNT_IN = ["5", "6", "7", "8"];

/** Độ dài một số đếm vào (giây thật): một phách theo BPM, không có BPM thì 0,6 s;
 *  phát chậm thì đếm chậm theo. */
export function countInBeat(bpm: number | null, speed = 1): number {
  const b = (bpm && bpm > 0 ? beatLen(bpm) : 0.6) / (speed > 0 ? speed : 1);
  return Math.min(2, Math.max(0.2, b));
}

/** Còn bao lâu (giây nhạc) từ t tới phách gần nhất phía sau; 0 nếu không có BPM. */
export function leadIn(t: number, bpm: number | null, downbeat = 0): number {
  if (!bpm || bpm <= 0) return 0;
  const b = beatLen(bpm);
  const k = Math.ceil((t - downbeat) / b - 1e-6);
  return Math.max(0, downbeat + k * b - t);
}

/** "còn 1×8 + 4" (có BPM, đổi theo từng phách) hoặc "còn 3 s" (đổi theo từng giây).
 *  Làm tròn lên để không báo "còn 0" khi vẫn còn thời gian. */
export function untilText(sec: number, bpm: number | null): string {
  if (bpm && bpm > 0) {
    const b = beatLen(bpm);
    const beats = Math.max(1, Math.ceil(sec / b - 1e-6));
    return `còn ${fmtCounts(beats * b, bpm)}`;
  }
  return `còn ${Math.max(1, Math.ceil(sec - 1e-6))} s`;
}

/** Một chỗ đứng của một người, ks là các đội hình (chỉ số) đứng ở đó. */
export interface Stop {
  pos: Vec2;
  ks: number[];
}

/** Các chỗ đứng khác nhau của một người qua cả bài (gộp chỗ trùng trong 5 cm). */
export function dancerStops(fs: Formation[], id: string): Stop[] {
  const out: Stop[] = [];
  fs.forEach((f, k) => {
    const q = f.pos[id];
    if (!q) return;
    const s = out.find((x) => dist(x.pos, q) < 0.05);
    if (s) s.ks.push(k);
    else out.push({ pos: q, ks: [k] });
  });
  return out;
}

/** Nhãn số đội hình (đếm từ 1): [0,1,2,5] → "1–3, 6". */
export function stopLabel(ks: number[]): string {
  const xs = [...ks].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    parts.push(j > i ? `${xs[i] + 1}–${xs[j] + 1}` : `${xs[i] + 1}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** Các chặng đi của một người: từ đội hình k sang k+1 (bỏ chặng đứng yên). */
export function dancerLegs(fs: Formation[], id: string): { k: number; a: Vec2; b: Vec2; c?: Vec2 }[] {
  const out: { k: number; a: Vec2; b: Vec2; c?: Vec2 }[] = [];
  for (let k = 0; k + 1 < fs.length; k++) {
    const a = fs[k].pos[id];
    const b = fs[k + 1].pos[id];
    const c = fs[k + 1].via?.[id]; // điểm điều khiển nếu chặng này đi đường cong
    if (a && b && dist(a, b) >= 0.05) out.push(c ? { k, a, b, c } : { k, a, b });
  }
  return out;
}

/** Dòng nhắc trình chiếu dài vừa phải: ghi chú riêng dài hơn thì cắt (theo ký tự thật). */
export const CUE_NOTE_MAX = 80;

/** " · ✎ cầm quạt đỏ" nếu người id có ghi chú riêng ở đội hình f, không thì "". */
const noteTail = (f: Formation, id: string) => {
  const n = personNote(f, id);
  return n ? ` · ✎ ${clipChars(n, CUE_NOTE_MAX)}` : "";
};

/** Dòng nhắc riêng cho một người tại t, ví dụ
 *  "Đội hình 3 · bạn đứng: phải 1,5 m · cách mép 2 m · còn 1×8 thì đi tới …".
 *  describe mô tả một chỗ đứng (bên gọi lo việc lật trái phải khi soi gương).
 *  Có ghi chú riêng ở đội hình đang đứng (đang chuyển: đội hình sắp tới) thì nối vào cuối. */
export function meCue(
  fs: Formation[], id: string, t: number, bpm: number | null, describe: (q: Vec2) => string,
): string | null {
  const s = segmentAt(fs, t);
  if (s.kind === "none") return null;
  if (s.kind === "before") {
    const q = fs[0].pos[id];
    return q ? `Chuẩn bị · vào chỗ: ${describe(q)}${noteTail(fs[0], id)}` : null;
  }
  if (s.kind === "gap") {
    const g = fs[s.k + 1];
    const q = g.pos[id];
    return q ? `→ ${g.name} · đi tới: ${describe(q)} · ${untilText(g.start - t, bpm)}${noteTail(g, id)}` : null;
  }
  const f = fs[s.k];
  const q = f.pos[id];
  if (!q) return null;
  let out = `${f.name} · bạn đứng: ${describe(q)}`;
  const g = s.kind === "hold" ? fs[s.k + 1] : undefined;
  const r = g?.pos[id];
  if (g && r)
    out += dist(q, r) < 0.05
      ? ` · ${g.name}: đứng yên`
      : ` · ${untilText(f.end - t, bpm)} thì đi tới ${describe(r)}`;
  return out + noteTail(f, id);
}
