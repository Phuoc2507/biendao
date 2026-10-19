// Người dự bị và thay vai (học từ ArrangeUs "casts"). THUẦN, chỉ import model/facing.
//
// Mô hình: mỗi VDancer là MỘT VAI (chỗ đứng, đường cong, hướng mặt, ghi chú,
// video, canon đều gắn với id của vai). `name` và `color` là NGƯỜI ĐANG ĐÓNG
// vai đó, nên mọi chỗ hiện tên (sơ đồ, 3D, ảnh, bản in, Tôi là ai) tự ra tên
// người thay mà không phải sửa. Khi có người dự bị đóng thay, `lead` cất tên
// và màu của người chính để đổi lại. Dự án cũ không có `subs`, `lead`: người
// chính đang đóng, y như trước.
//
// Đổi chỗ hai vai cả bài: hai vai đổi trọn đường đi cho nhau trên mọi đội hình
// (chỗ đứng, đường cong, hướng mặt, ghi chú riêng); video, canon, lật gương,
// nhóm thì vẫn theo người.

import type { Formation, Project, VDancer, Vec2 } from "./model.ts";
import { withFacing } from "./facing.ts";

export interface Understudy {
  name: string;
  /** màu riêng khi người này đóng; không có thì giữ màu của vai */
  color?: string;
}

export const SUB_MAX = 8;
export const SUB_NAME_MAX = 40;

const norm = (s: string) => s.trim().toLocaleLowerCase("vi");

/** Tên người chính của vai (người đang đóng nếu không ai thay). */
export const mainName = (d: VDancer): string => d.lead?.name ?? d.name;

/** Có người dự bị đang đóng vai này không. */
export const isStandIn = (d: VDancer): boolean => !!d.lead;

/** Có ghi "(thay A)" cạnh tên người thay không (Project.castNote, mặc định có). */
export const showCastNote = (p: Pick<Project, "castNote">): boolean => p.castNote !== false;

/** Tên hiện cho người đọc: "B (thay A)" khi có người thay và đang bật ghi chú, không thì tên người đang đóng. */
export function castLabel(d: VDancer, note = true): string {
  return note && d.lead ? `${d.name} (thay ${d.lead.name})` : d.name;
}

/** Dòng nhắc Tôi là ai cho người thay: "Mai đóng thay Lan" (người chính đang đóng: null). */
export const standInText = (d: VDancer): string | null => (d.lead ? `${d.name} đóng thay ${d.lead.name}` : null);

/** castLabel theo cài đặt của dự án. */
export const castLabelIn = (p: Pick<Project, "castNote">, d: VDancer): string => castLabel(d, showCastNote(p));

/** Chỉ số người dự bị đang đóng vai (theo tên), -1 nếu người chính đang đóng. */
export function activeSub(d: VDancer): number {
  if (!d.lead) return -1;
  const n = norm(d.name);
  return (d.subs ?? []).findIndex((s) => norm(s.name) === n);
}

/** Cho người dự bị sub đóng vai d (giữ nguyên mọi thứ khác). Tên trùng người chính thì là đổi lại người chính. */
export function castIn(d: VDancer, sub: Understudy): VDancer {
  const lead = d.lead ?? { name: d.name, color: d.color };
  const name = sub.name.trim();
  if (!name || norm(name) === norm(lead.name)) return castBack(d);
  return { ...d, name, color: sub.color ?? lead.color, lead };
}

/** Đổi lại người chính. Không ai thay thì trả đúng d. */
export function castBack(d: VDancer): VDancer {
  if (!d.lead) return d;
  const { lead, ...rest } = d;
  return { ...rest, name: lead.name, color: lead.color };
}

/**
 * Đổi tên người ĐANG ĐÓNG vai (nút Đổi tên trong danh sách). Người thay đang
 * đóng thì sửa luôn tên trong danh sách dự bị; gõ đúng tên người chính thì là
 * đổi lại người chính.
 */
export function renameCast(d: VDancer, name: string): VDancer {
  const n = name.trim();
  if (!n || n === d.name) return d;
  if (!d.lead) return { ...d, name: n };
  if (norm(n) === norm(d.lead.name)) return castBack(d);
  const i = activeSub(d);
  const subs = d.subs?.map((s, j) => (j === i ? { ...s, name: n } : s));
  return subs ? { ...d, name: n, subs } : { ...d, name: n };
}

/** Thêm người dự bị. Tên rỗng, trùng (cả trùng người chính), hay đã đủ SUB_MAX thì trả đúng d. */
export function addSub(d: VDancer, name: string, color?: string): VDancer {
  const n = name.trim().slice(0, SUB_NAME_MAX);
  const subs = d.subs ?? [];
  if (!n || subs.length >= SUB_MAX) return d;
  if (norm(n) === norm(mainName(d)) || subs.some((s) => norm(s.name) === norm(n))) return d;
  return { ...d, subs: [...subs, color ? { name: n, color } : { name: n }] };
}

/** Bỏ người dự bị thứ i; nếu người đó đang đóng thì đổi lại người chính trước. */
export function removeSub(d: VDancer, i: number): VDancer {
  const subs = d.subs ?? [];
  if (i < 0 || i >= subs.length) return d;
  const base = activeSub(d) === i ? castBack(d) : d;
  const rest = subs.filter((_, j) => j !== i);
  const { subs: _old, ...out } = base;
  return rest.length ? { ...out, subs: rest } : out;
}

/** Đổi màu riêng của người dự bị thứ i (undefined: bỏ màu riêng). Đang đóng thì chấm đổi màu theo. */
export function recolorSub(d: VDancer, i: number, color: string | undefined): VDancer {
  const subs = d.subs ?? [];
  if (i < 0 || i >= subs.length) return d;
  const next = subs.map((s, j) => (j === i ? (color ? { name: s.name, color } : { name: s.name }) : s));
  const out = { ...d, subs: next };
  if (activeSub(d) === i && d.lead) out.color = color ?? d.lead.color;
  return out;
}

const okColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c);

/** Làm sạch subs và lead khi nạp tệp (intake.ts). Sửa tại chỗ trên bản sao x. */
export function cleanCast(x: VDancer, raw: Partial<VDancer>) {
  const subs: Understudy[] = [];
  if (Array.isArray(raw.subs)) {
    for (const s of raw.subs as unknown[]) {
      if (!s || typeof s !== "object") continue;
      const o = s as { name?: unknown; color?: unknown };
      if (typeof o.name !== "string") continue;
      const n = o.name.trim().slice(0, SUB_NAME_MAX);
      if (!n || subs.some((q) => norm(q.name) === norm(n)) || subs.length >= SUB_MAX) continue;
      subs.push(okColor(o.color) ? { name: n, color: o.color } : { name: n });
    }
  }
  if (subs.length) x.subs = subs;
  else delete x.subs;
  const l = raw.lead as { name?: unknown; color?: unknown } | undefined;
  if (l && typeof l === "object" && typeof l.name === "string" && l.name.trim() && norm(l.name) !== norm(x.name)) {
    x.lead = { name: l.name.trim(), color: typeof l.color === "string" ? l.color : x.color };
  } else delete x.lead;
}

// ---------- đổi chỗ ----------

function swapKeys<T>(r: Record<string, T> | undefined, a: string, b: string): Record<string, T> | null {
  if (!r || (!(a in r) && !(b in r))) return null;
  const o = { ...r };
  const va = r[a], vb = r[b];
  delete o[a];
  delete o[b];
  if (vb !== undefined) o[a] = vb;
  if (va !== undefined) o[b] = va;
  return o;
}

const cp = (v: Vec2): Vec2 => [v[0], v[1]];

/** Đổi hướng mặt của a và b trong một đội hình (hướng mặt đi theo chỗ đứng). */
export function swapFacingOf(f: Formation, a: string, b: string): Formation {
  const fc = swapKeys(f.facing, a, b);
  return fc ? withFacing(f, fc) : f;
}

/** Đổi hướng mặt của a và b ở đội hình fid. Không ai quay khác 0 thì trả đúng mảng cũ. */
export function swapFacingIn(fs: Formation[], fid: string, a: string, b: string): Formation[] {
  const f = fs.find((x) => x.id === fid);
  if (!f) return fs;
  const g = swapFacingOf(f, a, b);
  return g === f ? fs : fs.map((x) => (x === f ? g : x));
}

/**
 * Hai vai a và b đổi trọn đường đi cho nhau trên MỌI đội hình: chỗ đứng, đường
 * cong vào, hướng mặt, ghi chú riêng. Hình từng đội hình và mọi khoảng chuyển
 * giữ y nguyên, chỉ đổi ai đi đường nào, nên không sinh cảnh báo mới.
 */
export function swapRolesAll(fs: Formation[], a: string, b: string): Formation[] {
  if (a === b) return fs;
  return fs.map((f) => {
    const pos = swapKeys(f.pos, a, b);
    if (!pos) return f;
    let g: Formation = { ...f, pos: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, cp(v)])) };
    const via = swapKeys(f.via, a, b);
    if (via) g = { ...g, via };
    const notes = swapKeys(f.notes, a, b);
    if (notes) g = { ...g, notes };
    return swapFacingOf(g, a, b);
  });
}
