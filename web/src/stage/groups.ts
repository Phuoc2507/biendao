// Nhóm lưu sẵn (nam nữ, nhóm múa và nhóm hát, cánh A cánh B): chạm một chip là
// chọn cả nhóm, khỏi Shift bấm từng người trên điện thoại.
// THUẦN, chỉ import kiểu và hằng để chạy được cả trong Vite lẫn `node --test`.
//
// members giữ theo thứ tự danh sách vũ công. Mọi hàm sửa trả mảng MỚI, không
// đột biến đầu vào; nhóm hết người thì bỏ luôn (không có chip "0 người").

import { type DancerGroup, type Project, PALETTE } from "./model.ts";

/** Tên nhóm dài hơn mức này thì cắt (chip nằm trên một hàng hẹp). */
export const GROUP_NAME_MAX = 30;

const HEX = /^#[0-9a-f]{6}$/i;

/** Tên sạch: bỏ khoảng trắng thừa, cắt độ dài. Rỗng thì "". */
export function cleanGroupName(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX).trim();
}

/** "Nhóm n" chưa có, n nhỏ nhất từ số nhóm + 1. */
export function nextGroupName(gs: readonly DancerGroup[] | undefined): string {
  const used = new Set((gs ?? []).map((g) => g.name));
  let n = (gs?.length ?? 0) + 1;
  while (used.has(`Nhóm ${n}`)) n++;
  return `Nhóm ${n}`;
}

/** Màu đầu tiên trong bảng chưa nhóm nào dùng; dùng hết thì xoay vòng. */
export function nextGroupColor(gs: readonly DancerGroup[] | undefined): string {
  const used = new Set((gs ?? []).map((g) => g.color.toLowerCase()));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[(gs?.length ?? 0) % PALETTE.length];
}

/** Id còn tồn tại, bỏ trùng, xếp theo thứ tự danh sách vũ công. */
export function orderMembers(members: readonly unknown[], ids: readonly string[]): string[] {
  const want = new Set(members.filter((m): m is string => typeof m === "string"));
  return ids.filter((id) => want.has(id));
}

/**
 * Nhóm đọc từ tệp: bỏ nhóm hỏng (không phải object, id không phải chữ, trùng id),
 * bỏ người không còn trong bài và người trùng, bỏ nhóm hết người, tên rỗng thì
 * "Nhóm n", màu không phải #rrggbb thì lấy từ bảng màu.
 */
export function cleanGroups(raw: unknown, ids: readonly string[]): DancerGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DancerGroup[] = [];
  for (const g of raw as Partial<DancerGroup>[]) {
    if (!g || typeof g !== "object" || typeof g.id !== "string" || seen.has(g.id)) continue;
    seen.add(g.id);
    const members = orderMembers(Array.isArray(g.members) ? g.members : [], ids);
    if (!members.length) continue;
    const name = cleanGroupName(g.name) || `Nhóm ${out.length + 1}`;
    const color = typeof g.color === "string" && HEX.test(g.color) ? g.color.toLowerCase() : PALETTE[out.length % PALETTE.length];
    out.push({ id: g.id, name, color, members });
  }
  return out;
}

/** Dự án với danh sách nhóm mới: rỗng thì bỏ hẳn trường (tệp cũ không đổi). */
export function withGroups(p: Project, gs: DancerGroup[]): Project {
  const { groups: _g, ...rest } = p;
  return gs.length ? { ...rest, groups: gs } : rest;
}

/** Sửa một nhóm; hết người thì bỏ nhóm. */
function patch(gs: readonly DancerGroup[] | undefined, id: string, f: (g: DancerGroup) => DancerGroup): DancerGroup[] {
  return (gs ?? []).map((g) => (g.id === id ? f(g) : g)).filter((g) => g.members.length > 0);
}

export function addGroup(gs: readonly DancerGroup[] | undefined, g: DancerGroup, ids: readonly string[]): DancerGroup[] {
  const members = orderMembers(g.members, ids);
  if (!members.length) return [...(gs ?? [])];
  return [...(gs ?? []), { ...g, name: cleanGroupName(g.name) || nextGroupName(gs), members }];
}

export function renameGroup(gs: readonly DancerGroup[] | undefined, id: string, name: string): DancerGroup[] {
  const n = cleanGroupName(name);
  return n ? patch(gs, id, (g) => ({ ...g, name: n })) : [...(gs ?? [])];
}

export function recolorGroup(gs: readonly DancerGroup[] | undefined, id: string, color: string): DancerGroup[] {
  return HEX.test(color) ? patch(gs, id, (g) => ({ ...g, color: color.toLowerCase() })) : [...(gs ?? [])];
}

/** Đặt lại người trong nhóm (cập nhật theo lựa chọn); rỗng thì bỏ nhóm. */
export function setGroupMembers(gs: readonly DancerGroup[] | undefined, id: string, members: readonly string[], ids: readonly string[]): DancerGroup[] {
  return patch(gs, id, (g) => ({ ...g, members: orderMembers(members, ids) }));
}

export function addToGroup(gs: readonly DancerGroup[] | undefined, id: string, add: readonly string[], ids: readonly string[]): DancerGroup[] {
  return patch(gs, id, (g) => ({ ...g, members: orderMembers([...g.members, ...add], ids) }));
}

export function removeFromGroup(gs: readonly DancerGroup[] | undefined, id: string, drop: readonly string[]): DancerGroup[] {
  const d = new Set(drop);
  return patch(gs, id, (g) => ({ ...g, members: g.members.filter((m) => !d.has(m)) }));
}

export function deleteGroup(gs: readonly DancerGroup[] | undefined, id: string): DancerGroup[] {
  return (gs ?? []).filter((g) => g.id !== id);
}

/** Xoá vũ công: bỏ khỏi mọi nhóm, nhóm hết người thì bỏ. */
export function dropFromGroups(gs: readonly DancerGroup[] | undefined, dancerId: string): DancerGroup[] {
  return (gs ?? [])
    .map((g) => (g.members.includes(dancerId) ? { ...g, members: g.members.filter((m) => m !== dancerId) } : g))
    .filter((g) => g.members.length > 0);
}

/** Nhân bản: bản sao vào đúng các nhóm có bản gốc, xếp theo thứ tự danh sách mới (ids). */
export function cloneIntoGroups(
  gs: readonly DancerGroup[] | undefined, srcId: string, cloneIds: readonly string[], ids: readonly string[],
): DancerGroup[] {
  return (gs ?? []).map((g) => (g.members.includes(srcId) ? { ...g, members: orderMembers([...g.members, ...cloneIds], ids) } : g));
}

/** Người của nhóm còn trong bài (bỏ id chết), theo thứ tự danh sách. */
export function groupPick(g: DancerGroup, ids: readonly string[]): string[] {
  return orderMembers(g.members, ids);
}

/** Đang chọn đúng cả nhóm này (không thừa không thiếu). */
export function isGroupPicked(g: DancerGroup, selected: readonly string[], ids: readonly string[]): boolean {
  const m = groupPick(g, ids);
  const s = new Set(selected);
  return m.length > 0 && s.size === m.length && m.every((x) => s.has(x));
}

/** Chạm chip: chọn cả nhóm; đang chọn đúng nhóm đó rồi thì bỏ chọn. */
export function toggleGroupPick(g: DancerGroup, selected: readonly string[], ids: readonly string[]): string[] {
  return isGroupPicked(g, selected, ids) ? [] : groupPick(g, ids);
}

/** Màu viền theo nhóm của từng người (người ở nhiều nhóm lấy nhóm đầu). Tắt viền thì rỗng. */
export function groupRingColors(p: Pick<Project, "groups" | "groupRings">): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.groupRings === false) return out;
  for (const g of p.groups ?? []) for (const m of g.members) if (!(m in out)) out[m] = g.color;
  return out;
}
