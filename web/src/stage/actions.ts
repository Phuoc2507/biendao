// Các thao tác cấp cao: nối store, đồng hồ và media.

import {
  type Project, type VDancer, type Vec2, type ShapeKind,
  PALETTE, newDancer, cloneDancer, lineup, posesAt, ensureFormationAt, setPositions,
  addFormationAfter, deleteFormation, addDancerToAll, removeDancerFromAll,
  arrangeShape, mirrorPositions, distributeX, rotateGroup, scaleGroup, inWings, holdIndexAt, segmentAt,
  fitFormationsToStage,
  snapPos, emptyProject, renameFormation, setFormationNote, wingSpot, placeClones, canonOffsets as canonPatch, SHAPE_LABEL,
  type CanonOrder, canonRanks, rightSide, type SavedShape, captureShape, fitSavedShape,
  setPersonNote as putPersonNote, cleanPersonNote, personNote,
} from "./model";
import { defaultLens, snapTime, putCanon, fmtTime, fmtCounts } from "./timing";
import { st, useStore, batch } from "./store";
import * as clock from "./clock";
import {
  classify, registerVideo, setMusic, storeFile, discardMedia, failCode, stripName, uid, getVideo,
  decodeAudio, music, monoOf, loadMediaFor, loadMediaDetailed, loadMusicId, type CardMeta,
} from "./media";
import { estimateOffset, CONFIDENT } from "./align";
import { saveProject, loadProject, allMediaIds, deleteMedia, saveKey, loadKey } from "./db";
import {
  offsetPlan, emptyReport, importSummary, normalizeProject, ALIGN_MAX_BYTES,
  type OffsetHow, type ImportReport,
} from "./intake";
import { claimTab, canAutosave, setBootProblem, otherTabsOpen, onTakeOver, subscribeGuard } from "./guard";
import { planDance, energyChangeScore, suggestMarkTimes } from "./autoplan";
import { addMark, markJump, markNear, mergeSuggested, moveMark, nextMarkLabel, removeMark, renameMark, withMarks } from "./marks";
import {
  PROP_PRESETS, addProp, fitPropsToStage, moveProp, propFromPreset, removeProp, renameProp, resizeProp, withProps,
} from "./props";
import { findIssues, isSoft } from "./checks";
import { fixAll, reassignFix, staggerFix, widenFix } from "./fixes";
import { errText } from "./storage";
import { quickSave, openProjectJson, openBundleFile } from "./export/save";

export const proj = () => st().project;
const ids = (p: Project = proj()) => p.dancers.map((d) => d.id);

export function projectEnd(p: Project = proj()): number {
  let e = Math.max(10, p.musicDuration);
  const last = p.formations[p.formations.length - 1];
  if (last) e = Math.max(e, last.end + 2);
  for (const d of p.dancers) if (d.mediaId) e = Math.max(e, d.offsetSec + d.durationSec);
  return e;
}

export function initClock() {
  clock.configureClock({ dancers: () => proj().dancers, end: () => projectEnd() });
  followMusic();
}

// ---------- vũ công ----------

function nextColor(p: Project): string {
  const used = new Set(p.dancers.map((d) => d.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[p.dancers.length % PALETTE.length];
}

function nextDefaultName(p: Project): string {
  let n = p.dancers.length + 1;
  const names = new Set(p.dancers.map((d) => d.name));
  while (names.has(`D${n}`)) n++;
  return `D${n}`;
}

/** Bắt đầu nhanh: n người giữ chỗ, đội hình 1 là hàng ngang phía trước. */
export function startWith(n: number) {
  const p0 = proj();
  const dancers: VDancer[] = [];
  let p: Project = { ...p0, dancers: [] };
  for (let i = 0; i < n; i++) {
    const d = newDancer(uid("d"), `D${i + 1}`, PALETTE[i % PALETTE.length]);
    dancers.push(d);
    p = { ...p, dancers: [...dancers] };
  }
  const { hold } = defaultLens(p.bpm);
  const pos = lineup(dancers.map((d) => d.id), p.stage);
  st().commit(() => ({
    ...p,
    formations: [{ id: uid("f"), name: "Đội hình 1", start: 0, end: hold, pos }],
  }));
  clock.seek(0);
  st().setUI({ selected: [], selectedBlock: null });
}

export function addDancer(name?: string): string {
  const p = proj();
  const d = newDancer(uid("d"), name ?? nextDefaultName(p), nextColor(p));
  st().commit((q) => {
    const dancers = [...q.dancers, d];
    let formations = addDancerToAll(q.formations, d.id, q.stage);
    if (formations.length === 0) {
      const { hold } = defaultLens(q.bpm);
      formations = [{ id: uid("f"), name: "Đội hình 1", start: 0, end: hold, pos: lineup(dancers.map((x) => x.id), q.stage) }];
    }
    return { ...q, dancers, formations };
  });
  return d.id;
}

/**
 * Nhân bản vũ công thành n bản: bản sao dùng chung tệp video (mỗi bản một
 * <video> riêng, chỉnh lệch nhạc riêng được), đứng CẠNH bản gốc ở mọi đội
 * hình nếu sân còn chỗ, không thì ở cánh gà. Trả id bản sao đầu tiên.
 */
export function duplicateDancer(id: string, n = 1): string | null {
  const p = proj();
  const src = p.dancers.find((d) => d.id === id);
  n = Math.max(1, Math.min(30, Math.floor(n)));
  if (!src) return null;
  const warnBefore = warnCount(p);
  const clones: VDancer[] = [];
  let q0 = p;
  for (let i = 0; i < n; i++) {
    const d = cloneDancer(src, uid("d"), q0.dancers.map((x) => x.name), nextColor(q0));
    clones.push(d);
    q0 = { ...q0, dancers: [...q0.dancers, d] };
  }
  st().commit((q) => {
    // xếp sau bản cuối cùng của cùng video: "Lan, Lan 2, Lan 3" đúng thứ tự
    let k = q.dancers.findIndex((x) => x.id === id);
    q.dancers.forEach((x, i) => { if (src.mediaId && x.mediaId === src.mediaId) k = Math.max(k, i); });
    const dancers = [...q.dancers.slice(0, k + 1), ...clones, ...q.dancers.slice(k + 1)];
    return { ...q, dancers, formations: placeClones(q.formations, id, clones.map((d) => d.id), q.stage) };
  });
  clock.resync();
  hintWarn(warnBefore, n > 1 ? `Đã nhân bản ${src.name} thành ${n} người` : `Đã nhân bản ${src.name}`, n > 1);
  return clones[0].id;
}

/**
 * Múa canon: người thứ k trong lựa chọn (theo thứ tự danh sách) lệch thêm
 * k·step giây. Chỉ áp cho những người dùng chung video với người dẫn.
 */
export function canonOffsets(sel: string[], step: number) {
  const p = proj();
  const picked = p.dancers.filter((d) => sel.includes(d.id)).length;
  const patch = canonPatch(p.dancers, sel, step);
  const n = Object.keys(patch).length;
  if (n < 2) {
    st().notify(
      picked >= 2
        ? "Lệch canon chỉ dành cho những người dùng chung một video — nhân bản (×N) một người rồi lệch"
        : "Chọn ít nhất 2 người để lệch canon",
    );
    return;
  }
  st().commit((q) => ({
    ...q,
    dancers: q.dancers.map((d) => (d.id in patch ? { ...d, offsetSec: patch[d.id] } : d)),
  }));
  clock.resync();
  const skipped = picked - n;
  st().notify(
    `Lệch canon ${n} người, mỗi người sau ${step.toFixed(2)} s` +
      (skipped > 0 ? ` — giữ nguyên ${skipped} người dùng video khác` : ""),
    { undo: true },
  );
}

/**
 * Canon theo đoạn: trong [start, end) người vào lượt k trễ k·step giây so với
 * cả nhóm (đứng yên chờ rồi múa đúng động tác của mình), hết đoạn thì khớp lại
 * đồng loạt. Áp cho mọi người đang chọn, kể cả khác video: mỗi người trễ so
 * với chính video đã khớp nhạc của mình.
 */
export function canonSection(sel: string[], start: number, end: number, step: number, how: CanonOrder) {
  const p = proj();
  const ids = p.dancers.filter((d) => sel.includes(d.id)).map((d) => d.id);
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  if (ids.length < 2) return st().notify("Chọn ít nhất 2 người để múa canon");
  if (b - a < 0.5) return st().notify("Đoạn canon quá ngắn: chọn đoạn dài hơn nửa giây");
  if (!(step > 0)) return st().notify("Khoảng trễ mỗi người phải lớn hơn 0");
  const ranks = canonRanks(ids, p.dancers, posesAt(p.formations, ids, a, p.stage), how);
  const last = Math.max(...Object.values(ranks));
  st().commit((q) => ({
    ...q,
    dancers: q.dancers.map((d) => {
      if (!(d.id in ranks)) return d;
      const canon = putCanon(d.canon, { start: a, end: b, lag: ranks[d.id] * step });
      const { canon: _old, ...rest } = d;
      return canon.length ? { ...rest, canon } : rest;
    }),
  }));
  clock.resync();
  const over = last * step >= b - a - 0.1;
  st().notify(
    `Canon ${ids.length} người (${last + 1} lượt) từ ${fmtTime(a)} tới ${fmtTime(b)}, mỗi lượt trễ ${step.toFixed(2)} s` +
      (over ? ". Người vào cuối gần như hết đoạn: nên kéo dài đoạn hoặc giảm khoảng trễ" : ""),
    { undo: true, kind: over ? "warn" : undefined },
  );
}

/** Bỏ canon trong [start, end) của những người đang chọn (không chọn ai: cả đội). */
export function clearCanonSection(sel: string[], start: number, end: number) {
  const p = proj();
  const ids = new Set(sel.length ? sel : p.dancers.map((d) => d.id));
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  const hit = p.dancers.filter((d) => ids.has(d.id) && d.canon?.some((s) => s.end > a && s.start < b));
  if (!hit.length) return st().notify("Đoạn này không có canon");
  st().commit((q) => ({
    ...q,
    dancers: q.dancers.map((d) => {
      if (!hit.some((h) => h.id === d.id)) return d;
      const canon = putCanon(d.canon, { start: a, end: b, lag: 0 });
      const { canon: _old, ...rest } = d;
      return canon.length ? { ...rest, canon } : rest;
    }),
  }));
  clock.resync();
  st().notify(`Bỏ canon của ${hit.length} người trong đoạn này`, { undo: true });
}

/** Lật gương thẻ: on undefined thì đảo theo người đầu. */
export function setFlip(sel: string[], on?: boolean) {
  const p = proj();
  const ds = p.dancers.filter((d) => sel.includes(d.id));
  if (!ds.length) return;
  const v = on ?? !ds[0].flip;
  st().commit((q) => ({ ...q, dancers: q.dancers.map((d) => (sel.includes(d.id) ? { ...d, flip: v } : d)) }));
}

/**
 * Tổ hợp đối xứng: người bên phải giữa nhóm (khán giả nhìn, ở đội hình hiện
 * tại) lật gương, người bên trái và người giữa giữ nguyên. Ba người cùng một
 * video thành một cặp soi gương hai bên người giữa.
 */
export function mirrorGroup(sel: string[]) {
  const p = proj();
  const ids = p.dancers.filter((d) => sel.includes(d.id)).map((d) => d.id);
  if (ids.length < 2) return st().notify("Chọn ít nhất 2 người để múa đối xứng");
  const right = new Set(rightSide(ids, currentPoses()));
  if (!right.size) return st().notify("Mọi người đang đứng cùng một hàng dọc: dàn ra hai bên rồi bấm lại");
  st().commit((q) => ({
    ...q,
    dancers: q.dancers.map((d) => (ids.includes(d.id) ? { ...d, flip: right.has(d.id) } : d)),
  }));
  st().notify(`Đối xứng: lật gương ${right.size} người bên phải, ${ids.length - right.size} người giữ nguyên`, { undo: true });
}

export function updateDancer(id: string, patch: Partial<VDancer>) {
  st().commit((q) => ({ ...q, dancers: q.dancers.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  clock.resync();
}

export function liveDancer(id: string, patch: Partial<VDancer>) {
  st().live((q) => ({ ...q, dancers: q.dancers.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  clock.resync();
}

export function removeDancer(id: string) {
  const d = proj().dancers.find((x) => x.id === id);
  if (!d) return;
  st().commit((q) => ({
    ...q,
    dancers: q.dancers.filter((x) => x.id !== id),
    formations: removeDancerFromAll(q.formations, id),
  }));
  st().setUI({ selected: st().ui.selected.filter((x) => x !== id) });
  st().notify(`Đã xoá ${d.name}`, { undo: true });
}

export function moveDancerOrder(id: string, dir: -1 | 1) {
  st().commit((q) => {
    const i = q.dancers.findIndex((d) => d.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= q.dancers.length) return q;
    const ds = [...q.dancers];
    [ds[i], ds[j]] = [ds[j], ds[i]];
    return { ...q, dancers: ds };
  });
}

// ---------- vị trí ----------

/** Lấy id khối đứng tại thời điểm hiện tại, tạo nếu cần (trong một cử chỉ). */
export function ensureHoldNow(live = false): string {
  const p = proj();
  const t = clock.now();
  const { hold } = defaultLens(p.bpm);
  const r = ensureFormationAt(p.formations, t, ids(p), p.stage, uid("f"), hold);
  if (r.created) {
    const fn = (q: Project) => ({ ...q, formations: r.formations });
    if (live) st().live(fn);
    else st().commit(fn);
    const f = r.formations.find((x) => x.id === r.id)!;
    st().notify(`Đã tạo ${f.name} tại vạch phát`);
  }
  st().setUI({ selectedBlock: r.id });
  return r.id;
}

export function currentPoses(): Record<string, Vec2> {
  const p = proj();
  return posesAt(p.formations, ids(p), clock.now(), p.stage);
}

export function setPositionsNow(moves: Record<string, Vec2>, live: boolean) {
  const run = () => {
    const fid = ensureHoldNow(live);
    const fn = (q: Project) => ({ ...q, formations: setPositions(q.formations, fid, moves, q.stage) });
    if (live) st().live(fn);
    else st().commit(fn);
  };
  // vạch phát giữa khoảng chuyển: tạo khối mới và đặt chỗ là MỘT bước hoàn tác
  // (nút Hoàn tác trên thông báo chỉ lùi một bước, không thì còn sót khối mới tạo)
  if (live) run();
  else batch(run);
}

export function nudgeSelected(dx: number, dz: number) {
  const sel = st().ui.selected;
  if (!sel.length) return;
  const cur = currentPoses();
  const moves: Record<string, Vec2> = {};
  for (const id of sel) {
    if (!cur[id]) continue; // người đã bị xoá mà còn trong lựa chọn
    const p: Vec2 = [cur[id][0] + dx, cur[id][1] + dz];
    moves[id] = st().ui.snap ? snapPos(p, 0.25) : p;
  }
  if (!Object.keys(moves).length) return;
  setPositionsNow(moves, false);
}

// Không đếm cảnh báo nhẹ (bị che): xếp hai hàng, đưa ai ra sau hay thu đội
// hình thường cố ý tạo người đứng sau người, báo động mỗi lần thì phiền. Bị che
// vẫn hiện trong danh sách Cảnh báo; thông báo này chỉ nói về lúc chuyển, khớp
// với nút Sửa tất cả đi kèm (vốn không sửa chỗ bị che).
const hardIssues = (p: Project) => findIssues(p.formations, p.dancers, p.stage, p.bpm).filter((w) => !isSoft(w.kind));
const warnCount = (p: Project = proj()) => hardIssues(p).length;

/** Sau một thao tác xếp chỗ: sinh thêm cảnh báo thì báo kèm nút Sửa tất cả. */
function hintWarn(before: number, what: string, always = false, offerFix = true) {
  const added = warnCount() - before;
  if (added > 0) {
    st().notify(`${what} · thêm ${added} cảnh báo lúc chuyển đội hình`, {
      undo: true, kind: "warn", action: offerFix ? { label: "Sửa tất cả", run: fixAllWarnings } : undefined,
    });
  } else if (always) st().notify(what, { undo: true });
}

export function applyShape(kind: ShapeKind) {
  const p = proj();
  let sel = st().ui.selected.filter((id) => p.dancers.some((d) => d.id === id));
  if (sel.length < 2) sel = p.dancers.filter((d) => !d.hidden).map((d) => d.id);
  if (!sel.length) return;
  const cur = currentPoses();
  const w = warnCount(p);
  setPositionsNow(arrangeShape(cur, sel, kind, p.stage), false);
  hintWarn(w, `Đã xếp ${SHAPE_LABEL[kind].toLowerCase()}`);
}

export function mirrorSelected() {
  const p = proj();
  // lựa chọn cũ có thể còn id người đã xoá: lọc trước khi tính
  const cur = currentPoses();
  let sel = st().ui.selected.filter((id) => id in cur);
  if (!sel.length) sel = ids(p);
  const w = warnCount(p);
  setPositionsNow(mirrorPositions(cur, sel), false);
  hintWarn(w, "Đã lật trái phải");
}

export function distributeSelected() {
  const cur = currentPoses();
  const sel = st().ui.selected.filter((id) => id in cur);
  if (sel.length < 3) {
    st().notify("Chọn ít nhất 3 người để dàn đều");
    return;
  }
  const w = warnCount();
  setPositionsNow(distributeX(cur, sel), false);
  hintWarn(w, "Đã dàn đều");
}

/** Hai người đang chọn đổi chỗ cho nhau trong đội hình tại vạch phát. */
export function swapSelected() {
  const p = proj();
  const sel = st().ui.selected.filter((id) => p.dancers.some((d) => d.id === id));
  if (sel.length !== 2) {
    st().notify("Chọn đúng 2 người để đổi chỗ");
    return;
  }
  const cur = currentPoses();
  const [a, b] = sel;
  const w = warnCount(p);
  setPositionsNow({ [a]: cur[b], [b]: cur[a] }, false);
  const nm = (id: string) => p.dancers.find((d) => d.id === id)!.name;
  // không mời Sửa tất cả: đổi chỗ cho gần sẽ trả hai người về như cũ
  hintWarn(w, `Đã đổi chỗ ${nm(a)} và ${nm(b)}`, true, false);
}

/** Người đang chọn, chưa chọn ai thì mọi người đang hiện trên sân (không tính cánh gà). */
function groupNow(p: Project, cur: Record<string, Vec2>): string[] {
  const sel = st().ui.selected.filter((id) => cur[id]);
  if (sel.length) return sel;
  return p.dancers.filter((d) => !d.hidden && cur[d.id] && !inWings(cur[d.id], p.stage)).map((d) => d.id);
}

/** Xoay nhóm một phần tư vòng quanh tâm nhóm (dir = 1 theo chiều kim đồng hồ trên sơ đồ). */
export function rotateSelected(dir: 1 | -1) {
  const p = proj();
  const cur = currentPoses();
  const g = groupNow(p, cur);
  if (g.length < 2) {
    st().notify("Chọn ít nhất 2 người để xoay");
    return;
  }
  const w = warnCount(p);
  setPositionsNow(rotateGroup(cur, g, dir, p.stage), false);
  hintWarn(w, `Đã xoay ${dir === 1 ? "theo" : "ngược"} chiều kim đồng hồ`);
}

/** Giãn (grow) hay thu nhóm quanh tâm nhóm, mỗi lần 15%. */
export function scaleSelected(grow: boolean) {
  const p = proj();
  const cur = currentPoses();
  const g = groupNow(p, cur);
  if (g.length < 2) {
    st().notify(`Chọn ít nhất 2 người để ${grow ? "giãn" : "thu"}`);
    return;
  }
  const moves = scaleGroup(cur, g, grow ? 1.15 : 1 / 1.15, p.stage);
  if (!moves) {
    st().notify(grow ? "Nhóm đã chạm mép sân khấu, không giãn thêm được" : "Hai người đã sát nhau, không thu thêm được");
    return;
  }
  const w = warnCount(p);
  setPositionsNow(moves, false);
  hintWarn(w, grow ? "Đã giãn đội hình" : "Đã thu đội hình");
}

export function sendToWings(side: -1 | 1) {
  const p = proj();
  const sel = st().ui.selected;
  if (!sel.length) return;
  const cur = currentPoses();
  const moves: Record<string, Vec2> = {};
  const taken: Vec2[] = Object.entries(cur).filter(([id]) => !sel.includes(id)).map(([, v]) => v);
  for (const id of sel) {
    const spot = wingSpot(taken, p.stage, side);
    moves[id] = spot;
    taken.push(spot);
  }
  const w = warnCount(p);
  setPositionsNow(moves, false);
  hintWarn(w, "Đã đưa vào cánh gà");
}

// ---------- chép / dán chỗ đứng ----------

let copied: { poses: Record<string, Vec2>; notes: Record<string, string>; from: string } | null = null;

/** Ctrl C: nhớ chỗ đứng lúc này của người đang chọn (không chọn ai: cả đội). */
export function copyPositions() {
  const p = proj();
  let sel = st().ui.selected.filter((id) => p.dancers.some((d) => d.id === id));
  if (!sel.length) sel = ids(p);
  if (!sel.length) return;
  const cur = currentPoses();
  const poses: Record<string, Vec2> = {};
  for (const id of sel) if (cur[id]) poses[id] = [cur[id][0], cur[id][1]];
  const t = clock.now();
  const f = p.formations.find((x) => t >= x.start && t <= x.end);
  // ghi chú riêng đi theo chỗ đứng (chỉ khi vạch phát nằm trong một đội hình)
  const notes: Record<string, string> = {};
  for (const id of Object.keys(poses)) if (personNote(f, id)) notes[id] = personNote(f, id);
  copied = { poses, notes, from: f ? f.name : "vạch phát" };
  const n = Object.keys(poses).length;
  st().notify(`Đã chép chỗ đứng của ${n === p.dancers.length ? "cả đội" : `${n} người`}. Tua tới chỗ khác rồi Ctrl V để dán`);
}

/** Ctrl V: đặt lại đúng các chỗ đã chép vào đội hình tại vạch phát. */
export function pastePositions() {
  const p = proj();
  if (!copied) {
    st().notify("Chưa chép chỗ đứng nào. Chọn người (hoặc không chọn ai cho cả đội) rồi bấm Ctrl C");
    return;
  }
  const moves: Record<string, Vec2> = {};
  for (const [id, v] of Object.entries(copied.poses)) if (p.dancers.some((d) => d.id === id)) moves[id] = v;
  const n = Object.keys(moves).length;
  if (!n) {
    st().notify("Những người đã chép không còn trong bài");
    return;
  }
  const w = warnCount(p);
  const notes = copied.notes;
  // dán chỗ đứng và ghi chú riêng là một bước hoàn tác; người không có ghi chú ở chỗ chép thì giữ ghi chú cũ
  batch(() => {
    setPositionsNow(moves, false);
    const fid = st().ui.selectedBlock;
    const put = Object.keys(moves).filter((id) => notes[id]);
    if (fid && put.length)
      st().commit((q) => ({ ...q, formations: put.reduce((fs, id) => putPersonNote(fs, fid, id, notes[id]), q.formations) }));
  });
  st().setUI({ selected: Object.keys(moves) });
  hintWarn(w, `Đã dán chỗ đứng (từ ${copied.from}) cho ${n === p.dancers.length ? "cả đội" : `${n} người`}`, true, false);
}

// ---------- hình của tôi ----------

/** Nhóm cho Lưu hình và áp hình đã lưu: từ 2 người đang chọn trở lên, không thì cả đội trên sân. */
function shapeGroup(p: Project, cur: Record<string, Vec2>): string[] {
  const sel = st().ui.selected.filter((id) => cur[id]);
  if (sel.length >= 2) return sel;
  return p.dancers.filter((d) => !d.hidden && cur[d.id] && !inWings(cur[d.id], p.stage)).map((d) => d.id);
}

/** Lưu hình dạng nhóm tại vạch phát vào thư viện của dự án (hỏi tên bằng hộp nhập). */
export function saveMyShape() {
  const p = proj();
  const cur = currentPoses();
  const g = shapeGroup(p, cur);
  if (g.length < 2) {
    st().notify("Cần ít nhất 2 người trên sân để lưu hình");
    return;
  }
  const t = clock.now();
  const f = p.formations.find((x) => t >= x.start && t <= x.end);
  const def = f ? f.name : `Hình ${(p.myShapes?.length ?? 0) + 1}`;
  const asked = window.prompt(`Tên hình (${g.length} người)`, def);
  if (asked === null) return;
  const name = asked.trim() || def;
  const shape: SavedShape = { id: uid("h"), name, pts: captureShape(cur, g) };
  st().commit((q) => ({ ...q, myShapes: [...(q.myShapes ?? []), shape] }));
  st().notify(`Đã lưu hình "${name}" (${g.length} chỗ) vào Hình của tôi`, { undo: true });
}

/** Xếp nhóm theo một hình đã lưu, như Xếp nhanh. */
export function applyMyShape(id: string) {
  const p = proj();
  const s = p.myShapes?.find((x) => x.id === id);
  if (!s) return;
  const cur = currentPoses();
  const g = shapeGroup(p, cur);
  if (!g.length) {
    st().notify("Chưa có ai trên sân để xếp");
    return;
  }
  const r = fitSavedShape(cur, g, s.pts, p.stage);
  const w = warnCount(p);
  setPositionsNow(r.moves, false);
  let what = `Đã xếp theo hình "${s.name}"`;
  if (r.kept.length) what += `. Hình có ${s.pts.length} chỗ mà nhóm có ${g.length} người: ${r.kept.length} người ở xa nhất giữ chỗ cũ`;
  else if (r.unused) what += `. Hình có ${s.pts.length} chỗ mà nhóm chỉ có ${g.length} người: dùng ${g.length} chỗ gần tâm nhất`;
  hintWarn(w, what, r.kept.length > 0 || r.unused > 0);
}

export function removeMyShape(id: string) {
  const s = proj().myShapes?.find((x) => x.id === id);
  if (!s) return;
  st().commit((q) => {
    const rest = (q.myShapes ?? []).filter((x) => x.id !== id);
    const { myShapes: _m, ...base } = q;
    return rest.length ? { ...base, myShapes: rest } : base;
  });
  st().notify(`Đã xoá hình "${s.name}"`, { undo: true });
}

// ---------- đội hình ----------

export function addFormation() {
  const p = proj();
  const { hold, gap } = defaultLens(p.bpm);
  const r = addFormationAfter(p.formations, clock.now(), ids(p), p.stage, uid("f"), hold, gap);
  st().commit((q) => ({ ...q, formations: r.formations }));
  clock.seek(r.jumpTo + 0.001);
  st().setUI({ selectedBlock: r.id });
  const f = r.formations.find((x) => x.id === r.id)!;
  if (r.shifted > 0.01)
    st().notify(`Đã thêm ${f.name}, các đội hình sau lùi ${r.shifted.toFixed(1)} s cho đủ chỗ`, { undo: true });
  else st().notify(`Đã thêm ${f.name}: kéo người sang vị trí mới`);
}

export function removeFormation(id: string) {
  const f = proj().formations.find((x) => x.id === id);
  if (!f) return;
  st().commit((q) => ({ ...q, formations: deleteFormation(q.formations, id) }));
  if (st().ui.selectedBlock === id) st().setUI({ selectedBlock: null });
  st().notify(`Đã xoá ${f.name}`, { undo: true });
}

export function renameBlock(id: string, name: string) {
  st().commit((q) => ({ ...q, formations: renameFormation(q.formations, id, name) }));
}

export function setNote(id: string, note: string) {
  const f = proj().formations.find((x) => x.id === id);
  if (!f || (f.note ?? "") === note.trim()) return;
  st().commit((q) => ({ ...q, formations: setFormationNote(q.formations, id, note) }));
}

/** Ghi chú riêng của một người ở một đội hình (chuỗi rỗng thì xoá); một bước hoàn tác. */
export function setPersonNote(formationId: string, dancerId: string, text: string) {
  const f = proj().formations.find((x) => x.id === formationId);
  if (!f || personNote(f, dancerId) === cleanPersonNote(text)) return;
  st().commit((q) => ({ ...q, formations: putPersonNote(q.formations, formationId, dancerId, text) }));
}

export function jumpFormation(dir: -1 | 1) {
  const fs = proj().formations;
  if (!fs.length) return;
  const t = clock.now();
  let target;
  if (dir > 0) target = fs.find((f) => f.start > t + 0.01);
  else {
    const s = segmentAt(fs, t);
    const k = s.kind === "hold" ? s.k - 1 : s.kind === "none" ? -1 : s.k;
    target = fs[Math.max(0, Math.min(fs.length - 1, k))];
    if (s.kind === "hold" && t - fs[s.k].start > 0.3) target = fs[s.k];
  }
  if (!target) return;
  clock.seek(target.start + 0.001);
  st().setUI({ selectedBlock: target.id });
}

// ---------- mốc đoạn nhạc ----------

/** Thêm mốc ở vạch phát (bám phách khi đang bật bám lưới). Trả id, đã có mốc ở đó thì null. */
export function addMarkNow(label?: string): string | null {
  const p = proj();
  let t = clock.now();
  if (st().ui.snap) t = snapTime(t, p.bpm, p.downbeat);
  if (markNear(p.marks, t)) {
    st().notify(`Đã có mốc ở ${fmtTime(t)}`);
    return null;
  }
  const id = uid("m");
  const name = label ?? nextMarkLabel(p.marks);
  st().commit((q) => withMarks(q, addMark(q.marks, { id, t, label: name }, q.musicDuration)));
  st().notify(`Đã thêm mốc "${name}" ở ${fmtTime(t)}: bấm đúp vào nhãn để đổi tên`, { undo: true });
  return id;
}

export function renameMarkTo(id: string, label: string) {
  const m = proj().marks?.find((x) => x.id === id);
  if (!m || m.label === label.trim()) return;
  st().commit((q) => withMarks(q, renameMark(q.marks, id, label)));
}

/** Dời mốc (kéo trên dòng thời gian dùng st().live trong một cử chỉ). */
export function moveMarkTo(id: string, t: number, live = false) {
  const f = (q: Project) => withMarks(q, moveMark(q.marks, id, t, q.musicDuration));
  if (live) st().live(f);
  else st().commit(f);
}

export function removeMarkById(id: string) {
  const m = proj().marks?.find((x) => x.id === id);
  if (!m) return;
  st().commit((q) => withMarks(q, removeMark(q.marks, id)));
  st().notify(`Đã xoá mốc "${m.label}"`, { undo: true });
}

/** Nhảy vạch phát tới mốc đoạn kế tiếp / trước đó. */
export function jumpMark(dir: -1 | 1) {
  const p = proj();
  if (!p.marks?.length) return st().notify("Chưa có mốc đoạn nhạc nào: bấm B để thêm mốc ở vạch phát");
  const t = markJump(p.marks, clock.now(), dir);
  if (t === null) return;
  clock.seek(t + 0.001);
}

/** Gợi ý mốc ở chỗ nhạc đổi mạnh (bám vạch lượt 8 nếu có nhịp), không đè mốc đã có gần đó. */
export function suggestMarks() {
  const p = proj();
  const buf = music.buffer;
  if (!buf) return st().notify("Nạp nhạc trước rồi mới gợi ý mốc được");
  const duration = Number.isFinite(p.musicDuration) && p.musicDuration > 0 ? p.musicDuration : buf.duration;
  const times = suggestMarkTimes({
    duration, bpm: p.bpm, downbeat: p.downbeat, score: energyChangeScore(monoOf(buf), buf.sampleRate),
  });
  const near = p.bpm ? (60 / p.bpm) * 8 : 4;
  const r = mergeSuggested(p.marks, times, () => uid("m"), near, p.musicDuration);
  if (!r.added) {
    st().notify(times.length ? "Các chỗ nhạc đổi đều đã có mốc" : "Không thấy chỗ nhạc đổi rõ: hãy đặt mốc tay bằng phím B");
    return;
  }
  st().commit((q) => withMarks(q, r.marks));
  st().notify(`Đã thêm ${r.added} mốc ở chỗ nhạc đổi: bấm đúp vào nhãn để đặt tên (Điệp khúc, Rap...)`, { undo: true });
}

// ---------- đạo cụ và mốc sàn ----------

/** Thêm đạo cụ theo mẫu nhanh ở chỗ trống gần giữa sân. Trả id. */
export function addPropPreset(key: string): string | null {
  const pr = PROP_PRESETS.find((x) => x.key === key);
  if (!pr) return null;
  const id = uid("pr");
  let name = "";
  st().commit((q) => {
    const o = propFromPreset(q.props, pr, id, q.stage);
    name = pr.kind === "mark" ? `mốc sàn ${o.name}` : `"${o.name}"`;
    return withProps(q, addProp(q.props, o, q.stage));
  });
  st().notify(`Đã thêm ${name}: kéo trên sơ đồ để đặt chỗ`, { undo: true });
  return id;
}

/** Dời đạo cụ (kéo trên sơ đồ dùng st().live trong một cử chỉ). */
export function movePropTo(id: string, x: number, z: number, live = false) {
  const f = (q: Project) => withProps(q, moveProp(q.props, id, x, z, q.stage));
  if (live) st().live(f);
  else st().commit(f);
}

export function renamePropTo(id: string, name: string) {
  const o = proj().props?.find((x) => x.id === id);
  if (!o || o.name === name.trim() || !name.trim()) return;
  st().commit((q) => withProps(q, renameProp(q.props, id, name)));
}

export function resizePropTo(id: string, ch: { w?: number; d?: number; rot?: number }) {
  if (!proj().props?.some((x) => x.id === id)) return;
  st().commit((q) => withProps(q, resizeProp(q.props, id, ch, q.stage)));
}

export function removePropById(id: string) {
  const o = proj().props?.find((x) => x.id === id);
  if (!o) return;
  st().commit((q) => withProps(q, removeProp(q.props, id)));
  st().notify(`Đã xoá ${o.kind === "mark" ? `mốc sàn ${o.name}` : `"${o.name}"`}`, { undo: true });
}

export function selectBlockAt(t: number) {
  const fs = proj().formations;
  const k = holdIndexAt(fs, t);
  st().setUI({ selectedBlock: k >= 0 ? fs[k].id : null });
}

export function stepBeat(n: number) {
  const p = proj();
  const step = p.bpm ? 60 / p.bpm : 0.1;
  const t = clock.now() + n * step;
  clock.seek(p.bpm ? snapTime(t, p.bpm, p.downbeat) : t);
}

export function setBpm(bpm: number | null, downbeat?: number, merge?: string) {
  st().commit((q) => ({ ...q, bpm, downbeat: downbeat ?? q.downbeat }), merge);
}

// ---------- nhập tệp ----------

let cancelReq = false;
let working = false; // đang nạp / đang khớp: không cho chạy chồng lượt khác

/** Nút "Dừng" trong hộp đang xử lý: dừng sau tệp / video đang làm. */
export function cancelBusy() {
  cancelReq = true;
  const b = st().ui.busy;
  if (b) st().setUI({ busy: { ...b, msg: "Đang dừng…", cancel: false } });
}
const busy = (msg: string, progress = -1, cancel = true) => st().setUI({ busy: { msg, progress, cancel } });
const round3 = (x: number) => Math.round(x * 1000) / 1000;

interface Attached {
  id: string;
  how: OffsetHow;
  confident: boolean;
  noAudio: boolean;
}

async function attachVideo(
  file: File, meta: CardMeta | null, intoId: string | null, onlyTarget = false,
): Promise<Attached | "same"> {
  const { rec, fresh } = await storeFile(file);
  // cùng tệp đã gắn rồi: không gắn lần hai
  if (!fresh && proj().dancers.some((d) => d.mediaId === rec.id && (!onlyTarget || d.id === intoId))) return "same";
  let v;
  try {
    v = await registerVideo(rec);
  } catch (e) {
    if (fresh) await discardMedia(rec.id);
    throw e;
  }
  const stacked = meta?.stacked ?? /\.card\./i.test(file.name);
  const frameH = stacked ? v.height / 2 : v.height;
  const aspect = v.width && frameH ? v.width / frameH : 0.5;
  const durationSec = meta?.durationSec ?? v.duration;
  const prev = intoId ? proj().dancers.find((x) => x.id === intoId) : undefined;
  const plan = offsetPlan({ prev, fileName: file.name, fileSize: file.size, durationSec, meta, hasMusic: !!music.buffer });
  let { offsetSec, confident } = plan;
  let noAudio = false;
  if (plan.how === "align") {
    const r = await alignBlob(rec.blob).catch(() => null);
    if (r) {
      offsetSec = round3(r.offset);
      confident = r.confidence >= CONFIDENT;
    } else noAudio = true;
  }
  const patch: Partial<VDancer> = {
    mediaId: rec.id, mediaName: file.name, stacked, aspect, durationSec, offsetSec, alignConfident: confident,
  };
  const label = meta?.name ?? stripName(file.name);
  const id = intoId ?? addDancer(label);
  const d = proj().dancers.find((x) => x.id === id)!;
  if (/^D\d+$/.test(d.name)) patch.name = label;
  updateDancer(id, patch);
  // bản nhân bản mở từ tệp dự án (cùng tên tệp, chưa có video): gắn luôn,
  // giữ độ lệch riêng (canon) nếu đã tin được
  const fname = file.name.toLowerCase();
  for (const o of proj().dancers) {
    if (o.id === id || o.mediaId || o.mediaName.toLowerCase() !== fname) continue;
    const keep = offsetPlan({ prev: o, fileName: file.name, fileSize: file.size, durationSec, meta: null, hasMusic: true }).how === "keep";
    updateDancer(o.id, {
      mediaId: rec.id, mediaName: file.name, stacked, aspect, durationSec,
      offsetSec: keep ? o.offsetSec : offsetSec, alignConfident: keep || confident,
    });
  }
  return { id, how: plan.how, confident, noAudio };
}

const dancerName = (id: string) => proj().dancers.find((d) => d.id === id)?.name ?? "";

/** Ghi kết quả gắn một video vào bản tổng kết. */
function tally(rep: ImportReport, file: File, r: Attached | "same") {
  if (r === "same") return void rep.same.push(file.name);
  const name = dancerName(r.id) || file.name;
  rep.added.push(name);
  if (r.how === "none") rep.noMusic++;
  else if (r.how === "big") rep.big.push(name);
  else if (r.noAudio) rep.noAudio.push(name);
  else if (!r.confident) rep.weak.push(name);
}

/** Gắn (hoặc thay) video cho đúng một vũ công. */
export async function replaceVideo(id: string, file: File) {
  const d = proj().dancers.find((x) => x.id === id);
  if (!d) return;
  if (working) return void st().notify("Đang xử lý tệp khác, chờ xong rồi thử lại", { kind: "warn" });
  working = true;
  cancelReq = false;
  busy(`Đang nạp video cho ${d.name}…`, -1, false);
  const p0 = proj();
  const rep = emptyReport();
  try {
    const r = await batch(() => attachVideo(file, null, id, true));
    if (r === "same") st().notify(`${d.name} đã dùng đúng video này`);
    else {
      tally(rep, file, r);
      const s = importSummary(rep);
      st().notify(rep.weak.length || rep.noAudio.length || rep.big.length ? s.msg : `Đã gắn video cho ${d.name}`, {
        kind: s.kind, undo: proj() !== p0,
      });
      askPersist();
    }
  } catch (e) {
    rep.bad.push({ name: file.name, code: failCode(e) });
    st().notify(importSummary(rep).msg, { kind: "error" });
  } finally {
    working = false;
    st().setUI({ busy: null });
    clock.resync();
  }
}

export async function alignBlob(blob: Blob): Promise<{ offset: number; confidence: number } | null> {
  if (!music.buffer) return null;
  const a = await decodeAudio(blob);
  if (!a) return null;
  return estimateOffset(monoOf(a), a.sampleRate, monoOf(music.buffer), music.buffer.sampleRate);
}

interface AlignOut {
  ok: string[];
  weak: string[];
  noAudio: string[];
  big: string[];
  cancelled: boolean;
}

/**
 * Khớp lại theo nhạc cho các vũ công `ids`: mỗi tệp giải mã một lần. Bản nhân
 * bản cùng tệp giữ nguyên khoảng lệch giữa nhau (canon), cả nhóm dời theo.
 */
async function alignDancers(ids: string[]): Promise<AlignOut> {
  const out: AlignOut = { ok: [], weak: [], noAudio: [], big: [], cancelled: false };
  const groups = new Map<string, VDancer[]>();
  for (const d of proj().dancers) {
    if (!ids.includes(d.id) || !d.mediaId || !getVideo(d.mediaId)) continue;
    groups.set(d.mediaId, [...(groups.get(d.mediaId) ?? []), d]);
  }
  let i = 0;
  for (const [mid, ds] of groups) {
    if (cancelReq) {
      out.cancelled = true;
      break;
    }
    i++;
    const names = ds.map((d) => d.name);
    busy(`Đang khớp nhạc ${i}/${groups.size}: ${names[0]}…`, (i - 1) / groups.size);
    const v = getVideo(mid)!;
    if (v.blob.size > ALIGN_MAX_BYTES) {
      out.big.push(...names);
      continue;
    }
    const r = await alignBlob(v.blob).catch(() => null);
    if (!r) {
      out.noAudio.push(...names);
      continue;
    }
    const conf = r.confidence >= CONFIDENT;
    const ref = ds[0].offsetSec;
    const next = new Map(ds.map((d) => [d.id, round3(r.offset + d.offsetSec - ref)]));
    st().commit((q) => ({
      ...q,
      dancers: q.dancers.map((d) => (next.has(d.id) ? { ...d, offsetSec: next.get(d.id)!, alignConfident: conf } : d)),
    }));
    (conf ? out.ok : out.weak).push(...names);
  }
  clock.resync();
  return out;
}

export async function realign(id: string) {
  const d = proj().dancers.find((x) => x.id === id);
  const v = getVideo(d?.mediaId);
  if (!d || !v) return;
  if (!music.buffer) {
    st().notify("Cần thả bài nhạc trước rồi mới tự khớp được");
    return;
  }
  if (working) return void st().notify("Đang xử lý tệp khác, chờ xong rồi thử lại", { kind: "warn" });
  if (v.blob.size > ALIGN_MAX_BYTES) {
    st().notify(`${d.name}: tệp quá lớn để tự khớp. Hãy kéo thanh video để căn tay, hoặc dùng thẻ .card.mp4`, { kind: "warn" });
    return;
  }
  working = true;
  st().setUI({ busy: { msg: `Đang khớp nhạc cho ${d.name}…`, progress: -1 } });
  try {
    const r = await alignBlob(v.blob);
    if (!r) st().notify(`${d.name}: video không có tiếng, hãy kéo thanh video để căn tay`, { kind: "warn" });
    else {
      updateDancer(id, { offsetSec: round3(r.offset), alignConfident: r.confidence >= CONFIDENT });
      st().notify(
        r.confidence >= CONFIDENT
          ? `${d.name}: khớp nhạc lệch ${r.offset.toFixed(2)} s`
          : `${d.name}: khớp chưa chắc, hãy nghe thử và căn tay`,
        { kind: r.confidence >= CONFIDENT ? "info" : "warn", undo: true },
      );
    }
  } catch (e) {
    st().notify(`${d.name}: không tự khớp được (${(e as Error)?.message || "lỗi đọc tệp"}). Hãy căn tay.`, { kind: "error" });
  } finally {
    working = false;
    st().setUI({ busy: null });
  }
}

/** "Khớp tất cả": người chưa chắc; không ai chưa chắc thì khớp lại hết. Một bước hoàn tác. */
export async function realignAll() {
  if (!music.buffer) return void st().notify("Cần thả bài nhạc trước rồi mới tự khớp được");
  if (working) return void st().notify("Đang xử lý tệp khác, chờ xong rồi thử lại", { kind: "warn" });
  const withMedia = proj().dancers.filter((d) => d.mediaId && getVideo(d.mediaId));
  const untrusted = withMedia.filter((d) => !d.alignConfident);
  const pick = untrusted.length ? untrusted : withMedia;
  if (!pick.length) return void st().notify("Chưa có video nào để khớp");
  working = true;
  cancelReq = false;
  const p0 = proj();
  try {
    const r = await batch(() => alignDancers(pick.map((d) => d.id)));
    const s = importSummary({
      ...emptyReport(), realigned: r.ok.length + r.weak.length, weak: r.weak, noAudio: r.noAudio, big: r.big,
      cancelled: r.cancelled,
    });
    st().notify(s.msg, { kind: s.kind, undo: proj() !== p0 });
  } catch (e) {
    st().notify(`Không tự khớp được: ${(e as Error)?.message || "lỗi đọc tệp"}. Hãy căn tay.`, { kind: "error" });
  } finally {
    working = false;
    cancelReq = false;
    st().setUI({ busy: null });
  }
}

/** Vũ công nhận video vừa thả (giữ nguyên thứ tự ưu tiên cũ). */
function pickTarget(file: File, meta: CardMeta | null, count: number): VDancer | undefined {
  const key = stripName(file.name).toLowerCase();
  const p = proj();
  const sel = st().ui.selected.length === 1 ? p.dancers.find((d) => d.id === st().ui.selected[0] && !d.mediaId) : undefined;
  return (
    p.dancers.find((d) => !d.mediaId && stripName(d.mediaName).toLowerCase() === key && d.mediaName) ??
    p.dancers.find((d) => d.name.toLowerCase() === (meta?.name ?? key).toLowerCase()) ??
    (count === 1 ? sel : undefined) ??
    p.dancers.find((d) => !d.mediaId)
  );
}

/** Thả / chọn nhiều tệp: mỗi tệp lỗi riêng không chặn tệp khác; cả lượt là một bước hoàn tác. */
export async function importFiles(files: File[]) {
  if (!files.length) return;
  const zip = files.find((f) => /\.zip$/i.test(f.name)); // gói .zip có đủ video: mở riêng
  if (zip) return void (await openBundleFile(zip));
  if (working) return void st().notify("Đang nạp tệp khác, chờ xong rồi thả tiếp", { kind: "warn" });
  working = true;
  cancelReq = false;
  const rep = emptyReport();
  const p0 = proj();
  try {
    await batch(async () => {
      busy("Đang đọc tệp…");
      const c = await classify(files);
      rep.skipped = c.unknown.map((f) => f.name);
      if (c.project) {
        try {
          await openProjectFile(c.project);
          rep.project = true;
        } catch {
          rep.projectError = true;
        }
      }
      let musicChanged = false;
      if (c.music && !cancelReq) {
        const f = c.music;
        busy(`Đang đọc nhạc ${f.name}…`);
        let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
        try {
          stored = await storeFile(f);
          const { rec } = stored;
          if (rec.id === proj().musicId && music.id === rec.id) rep.musicSame = true;
          else {
            if (clock.isPlaying()) clock.pause();
            const dur = await setMusic(rec);
            st().commit((q) => ({ ...q, musicId: rec.id, musicName: f.name, musicDuration: dur }));
            rep.music = f.name;
            musicChanged = true;
          }
        } catch (e) {
          if (stored?.fresh) await discardMedia(stored.rec.id);
          rep.bad.push({ name: f.name, code: failCode(e) });
        }
      }
      const fresh = new Set<string>(); // vũ công vừa khớp với nhạc mới trong lượt này
      const n = c.videos.length;
      for (let i = 0; i < n; i++) {
        if (cancelReq) {
          rep.cancelled = true;
          break;
        }
        const { file, meta } = c.videos[i];
        busy(`Đang nạp video ${i + 1}/${n}: ${file.name}`, i / n);
        try {
          const r = await attachVideo(file, meta, pickTarget(file, meta, n)?.id ?? null);
          if (r !== "same") fresh.add(r.id);
          tally(rep, file, r);
        } catch (e) {
          rep.bad.push({ name: file.name, code: failCode(e) });
        }
      }
      // đổi nhạc: tự khớp lại những người chưa chắc (đã căn tay thì giữ)
      if (musicChanged && !cancelReq) {
        const ids = proj().dancers.filter((d) => d.mediaId && !d.alignConfident && !fresh.has(d.id)).map((d) => d.id);
        if (ids.length) {
          const r = await alignDancers(ids);
          rep.realigned = r.ok.length + r.weak.length;
          rep.weak.push(...r.weak);
          rep.noAudio.push(...r.noAudio);
          rep.big.push(...r.big);
          if (r.cancelled) rep.cancelled = true;
        }
      }
      if (cancelReq) rep.cancelled = true;
    });
    const s = importSummary(rep);
    st().notify(s.msg, { kind: s.kind, undo: proj() !== p0 });
    if (rep.added.length || rep.music) askPersist();
  } catch (e) {
    st().notify(errText(e, "Lỗi khi nạp tệp"), { kind: "error" });
  } finally {
    working = false;
    cancelReq = false;
    st().setUI({ busy: null });
    clock.resync();
  }
}

/** Xin trình duyệt giữ dữ liệu lâu dài (khỏi tự xoá khi máy thiếu chỗ). Hỏi một lần. */
let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persist) return;
  s.persisted()
    .then((ok) => ok || s.persist())
    .catch(() => {});
}

// ---------- nhạc theo dự án ----------

let followHooked = false;
/** Nhạc đang mở luôn theo project.musicId (hoàn tác, bài mới, mở dự án). */
function followMusic() {
  if (followHooked) return;
  followHooked = true;
  useStore.subscribe((s, prev) => {
    const id = s.project.musicId;
    if (id === prev.project.musicId || id === music.id) return;
    if (clock.isPlaying()) clock.pause();
    loadMusicId(id).then((ok) => {
      if (!ok && id && st().project.musicId === id)
        st().notify(`Không mở được nhạc "${st().project.musicName}". Hãy thả lại tệp nhạc.`, { kind: "warn" });
    });
  });
}

// ---------- lưu / mở ----------

let saveTimer = 0;
let dirty = false;

async function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!dirty || !st().ui.loaded) return;
  if (!canAutosave()) {
    st().setUI({ saveState: "error", saveError: "Bài đang mở ở thẻ khác hoặc bản lưu cũ đọc lỗi, chưa tự lưu" });
    return;
  }
  dirty = false;
  try {
    await saveProject(st().project);
    if (!dirty) st().setUI({ saveState: "saved", saveError: null });
  } catch (e) {
    dirty = true;
    // thông báo nổi do App.tsx báo một lần mỗi đợt lỗi; ô đỏ ở thanh trên giữ lý do
    st().setUI({ saveState: "error", saveError: errText(e, "Trình duyệt báo lỗi") });
  }
}

/** Lưu ngay phần còn chờ (đóng thẻ, chuyển thẻ). */
export function flushSave() {
  if (dirty) void writeNow();
}

let autosaveOn = false;
export function startAutosave() {
  if (autosaveOn) return;
  autosaveOn = true;
  let last = proj();
  useStore.subscribe((s) => {
    if (s.project === last || !s.ui.loaded) return;
    last = s.project;
    dirty = true;
    if (!canAutosave()) {
      if (s.ui.saveState !== "error") st().setUI({ saveState: "error" });
      return;
    }
    if (s.ui.saveState !== "saving") st().setUI({ saveState: "saving" });
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void writeNow(), 400);
  });
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
  // giành quyền lưu từ thẻ khác / người dùng chọn "vẫn tự lưu": lưu bản của thẻ này
  onTakeOver(() => {
    dirty = true;
    void writeNow();
  });
  subscribeGuard(() => {
    if (dirty && canAutosave()) void writeNow();
  });
}

const mediaIdsOf = (p: Project | null) => (p ? [p.musicId, ...p.dancers.map((d) => d.mediaId)] : []);

export async function boot() {
  initClock();
  await claimTab();
  let readOk = true;
  let raw: unknown = null;
  try {
    raw = await loadProject();
  } catch (e) {
    console.warn("Không đọc được dự án đã lưu", e);
    readOk = false;
    setBootProblem("unreadable");
  }
  let full: Project | null = null;
  if (readOk && raw != null) {
    full = normalizeProject(raw);
    if (!full) {
      // dữ liệu hỏng: cất riêng trước, không để tự lưu đè mất
      let backedUp = false;
      try {
        await saveKey("current-backup", raw);
        backedUp = true;
      } catch { /* cất không được thì chặn tự lưu */ }
      setBootProblem("invalid", { backedUp, raw });
    }
  }
  if (full) {
    st().load(full);
    const vids = full.dancers.map((d) => d.mediaId).filter((x): x is string => !!x);
    if (vids.length || full.musicId) st().setUI({ busy: { msg: "Đang nạp bài…", progress: -1 } });
    const r = await loadMediaDetailed(full.musicId, vids, (i, n) =>
      st().setUI({ busy: { msg: `Đang nạp ${i}/${n} video…`, progress: (i - 1) / n } }),
    );
    // mất hẳn trong máy: bỏ liên kết, giữ tên tệp để thả lại là tự ghép
    const miss = new Set(r.missing);
    if (miss.size) {
      const p = proj();
      st().load({
        ...p,
        musicId: p.musicId && miss.has(p.musicId) ? null : p.musicId,
        dancers: p.dancers.map((d) => (d.mediaId && miss.has(d.mediaId) ? { ...d, mediaId: null } : d)),
      });
    }
    const lost = r.missing.length + r.failed.length;
    if (lost)
      st().notify(`${lost} tệp video/nhạc đã lưu không mở được. Hãy thả lại các tệp đó, app tự ghép theo tên.`, { kind: "warn" });
  }
  // dọn media không còn dùng (chỉ thẻ chính, đọc được bài, không thẻ nào khác đang mở)
  if (readOk && canAutosave() && !(await otherTabsOpen())) {
    try {
      const backup = await loadKey("current-backup").catch(() => null);
      const used = new Set<string | null>([...mediaIdsOf(proj()), ...mediaIdsOf(normalizeProject(backup))]);
      for (const k of await allMediaIds()) if (!used.has(String(k))) deleteMedia(String(k)).catch(() => {});
    } catch { /* bỏ qua, lần sau dọn */ }
  }
  st().setUI({ loaded: true, busy: null });
  startAutosave();
  clock.seek(0);
}

/** Ctrl S: lưu ngay vào trình duyệt và ghi tệp .choreo.json (xem export/save.ts). */
export function exportProject() {
  return quickSave();
}

/** Mở tệp .choreo.json (một commit, Hoàn tác được). */
export function openProjectFile(f: File): Promise<string[]> {
  return openProjectJson(f);
}

export function newProject() {
  clock.pause();
  st().commit(() => emptyProject()); // nhạc tự đóng theo musicId (followMusic)
  st().setUI({ selected: [], selectedBlock: null });
  clock.seek(0);
}

export function setTitle(title: string) {
  st().commit((q) => ({ ...q, title }));
}

export function setStage(width: number, depth: number) {
  // thu nhỏ sân: kéo người đứng ngoài sân và cánh gà mới vào trong, khỏi mất khỏi sơ đồ
  st().commit((q) => {
    const stage = { width, depth };
    const out = { ...q, stage, formations: fitFormationsToStage(q.formations, stage) };
    return q.props ? { ...out, props: fitPropsToStage(q.props, stage) ?? q.props } : out;
  });
}

export { clock };

// ---------- tự chia đội hình ----------

/** Thay toàn bộ đội hình bằng kế hoạch tự chia (một commit, Ctrl Z hoàn tác được). */
export function autoFormations(o: { count?: number; everyEights?: number }) {
  const p = proj();
  if (!p.dancers.length) {
    st().notify("Thêm vũ công trước rồi mới tự chia đội hình");
    return;
  }
  // chỉ chia cho người đang hiện, như khi xếp hình nhanh
  const vis = p.dancers.filter((d) => !d.hidden).map((d) => d.id);
  if (!vis.length) {
    st().notify("Mọi vũ công đang ẩn — hiện ít nhất một người rồi mới tự chia đội hình");
    return;
  }
  // webm ghi từ máy có thể chưa biết độ dài (Infinity): bỏ qua số đó
  const fin = (v: number) => (Number.isFinite(v) ? v : 0);
  let duration = fin(p.musicDuration);
  if (!(duration > 0)) {
    duration = 32;
    const last = p.formations[p.formations.length - 1];
    if (last) duration = Math.max(duration, fin(last.end));
    for (const d of p.dancers) if (d.mediaId) duration = Math.max(duration, fin(d.offsetSec + d.durationSec));
  }
  const buf = music.buffer;
  const r = planDance({
    ids: vis, stage: p.stage, duration, bpm: p.bpm, downbeat: p.downbeat,
    count: o.count, everyEights: o.everyEights,
    start: p.formations[0]?.pos,
    changeScore: buf ? energyChangeScore(monoOf(buf), buf.sampleRate) : undefined,
    newId: () => uid("f"),
  });
  // người đang ẩn đứng yên ở chỗ cũ trong đội hình đầu, chưa có chỗ thì vào cánh gà
  const park: Record<string, Vec2> = {};
  const parked: Vec2[] = [];
  for (const d of p.dancers) {
    if (!d.hidden) continue;
    const q = p.formations[0]?.pos[d.id] ?? wingSpot(parked, p.stage);
    park[d.id] = q;
    parked.push(q);
  }
  const formations = r.formations.map((f) => ({ ...f, pos: { ...f.pos, ...park } }));
  const had = p.formations.length;
  st().commit((q) => ({ ...q, formations }));
  clock.seek(formations[0].start + 0.001);
  st().setUI({ selectedBlock: formations[0].id });
  const notes: string[] = [];
  if (r.merged > 0) notes.push(`bớt ${r.merged} vì đoạn quá ngắn, đi kịp phải chạy quá nhanh`);
  if (r.crowded.length)
    notes.push(`bỏ hình ${r.crowded.map((k) => SHAPE_LABEL[k].toLowerCase()).join(", ")} vì quá chật cho ${vis.length} người`);
  const how = (buf ? ", điểm đổi theo nhạc" : "") + (notes.length ? ` (${notes.join("; ")})` : "");
  if (had > 1)
    st().notify(`Đã thay ${had} đội hình cũ bằng ${formations.length} đội hình mới${how} — Ctrl Z để hoàn tác`, { undo: true, kind: "warn" });
  else st().notify(`Đã tạo ${formations.length} đội hình${how} — Ctrl Z để hoàn tác`, { undo: true });
}

// ---------- sửa nhanh cảnh báo ----------

/** Đổi ai đứng chỗ nào trong đội hình `fid` cho gần đội hình trước. */
export function fixReassign(fid: string) {
  const p = proj();
  const k = p.formations.findIndex((f) => f.id === fid);
  const fx = reassignFix(p.formations, k, p.dancers, p.stage, p.bpm);
  if (!fx) return st().notify("Đổi chỗ không đỡ hơn ở đội hình này");
  st().commit((q) => ({ ...q, formations: fx.fs }));
  const name = p.formations[k].name;
  const what = fx.carry ? "đổi vai từ đội hình này về sau" : "đổi ai đứng chỗ nào cho gần";
  const where = fx.carry ? "cả bài" : "quanh đội hình này";
  st().notify(
    fx.after
      ? `${name}: ${what}, cảnh báo ${where} còn ${fx.after} (trước ${fx.before})`
      : `${name}: ${what}, hết cảnh báo ${where}`,
    { undo: true },
  );
}

/** Rời đội hình trước `fid` sớm hơn để kịp đi tới. */
export function fixWiden(fid: string) {
  const p = proj();
  const k = p.formations.findIndex((f) => f.id === fid);
  const fx = widenFix(p.formations, k, p.dancers, p.stage, p.bpm, p.downbeat);
  if (!fx) return st().notify("Không nới thêm được: đội hình trước đã quá ngắn");
  st().commit((q) => ({ ...q, formations: fx.fs }));
  const prev = p.formations[k - 1].name;
  st().notify(
    `Rời ${prev} sớm hơn ${p.bpm ? fmtCounts(fx.sec, p.bpm) : fx.sec.toFixed(1).replace(".", ",") + " s"}${fx.partial ? ", vẫn chưa đủ: thử đổi chỗ hoặc kéo dài khối" : ""}`,
    { undo: true },
  );
}

/** Đứng so le: dời người `a` (bị `b` che) sang ngang vừa đủ trong đội hình `fid`. */
export function fixStagger(fid: string, a: string, b: string) {
  const p = proj();
  const k = p.formations.findIndex((f) => f.id === fid);
  const fx = staggerFix(p.formations, k, a, b, p.dancers, p.stage, p.bpm);
  if (!fx) return st().notify("Không có chỗ dời ngang mà không vướng người khác: hãy kéo tay");
  st().commit((q) => ({ ...q, formations: fx.fs }));
  const nm = (id: string) => p.dancers.find((d) => d.id === id)?.name ?? id;
  const cm = Math.round(fx.dx * 100);
  st().notify(
    `${p.formations[k].name}: dời ${nm(a)} sang ngang ${cm} cm${fx.after ? `, còn ${fx.after} chỗ bị che` : ", hết bị che"}`,
    { undo: true },
  );
}

/** Sửa mọi khoảng chuyển một lần (đổi chỗ cho gần, rời sớm hơn). */
export function fixAllWarnings() {
  const p = proj();
  // chỉ đếm loại Sửa tất cả lo được; bị che giữ nguyên (đổi chỗ không đổi tập chỗ đứng)
  const before = hardIssues(p).length;
  const fs = fixAll(p.formations, p.dancers, p.stage, p.bpm, p.downbeat);
  const after = hardIssues({ ...p, formations: fs }).length;
  if (after >= before) return st().notify("Không tự sửa được thêm: hãy kéo người hoặc kéo dài khối chuyển");
  st().commit((q) => ({ ...q, formations: fs }));
  st().notify(after ? `Đã sửa ${before - after} cảnh báo, còn ${after} phải sửa tay` : `Đã sửa hết ${before} cảnh báo`, { undo: true });
}
