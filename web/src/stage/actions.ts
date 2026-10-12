// Các thao tác cấp cao: nối store, đồng hồ và media.

import {
  type Project, type VDancer, type Vec2, type ShapeKind,
  PALETTE, newDancer, cloneDancer, lineup, posesAt, ensureFormationAt, setPositions,
  addFormationAfter, deleteFormation, addDancerToAll, removeDancerFromAll,
  arrangeShape, mirrorPositions, distributeX, holdIndexAt, segmentAt,
  snapPos, emptyProject, renameFormation, wingSpot, placeClones, canonOffsets as canonPatch,
} from "./model";
import { defaultLens, snapTime } from "./timing";
import { st, useStore, batch } from "./store";
import * as clock from "./clock";
import {
  classify, registerVideo, setMusic, storeFile, discardMedia, failCode, stripName, uid, getVideo,
  decodeAudio, music, monoOf, loadMediaFor, loadMediaDetailed, loadMusicId, type CardMeta,
} from "./media";
import { estimateOffset, CONFIDENT } from "./align";
import { saveProject, loadProject, allMediaIds, deleteMedia, saveKey, loadKey, isQuotaError } from "./db";
import {
  offsetPlan, emptyReport, importSummary, normalizeProject, ALIGN_MAX_BYTES, QUOTA_MSG,
  type OffsetHow, type ImportReport,
} from "./intake";
import { claimTab, canAutosave, setBootProblem, otherTabsOpen, onTakeOver, subscribeGuard } from "./guard";
import { autoPlan, energyChangeScore } from "./autoplan";

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
  if (n > 1) st().notify(`Đã nhân bản ${src.name} thành ${n} người`, { undo: true });
  return clones[0].id;
}

/** Múa canon: người thứ k trong lựa chọn (theo thứ tự danh sách) lệch thêm k·step giây. */
export function canonOffsets(sel: string[], step: number) {
  const p = proj();
  const patch = canonPatch(p.dancers, sel, step);
  const n = Object.keys(patch).length;
  if (n < 2) {
    st().notify("Chọn ít nhất 2 người để lệch canon");
    return;
  }
  st().commit((q) => ({
    ...q,
    dancers: q.dancers.map((d) => (d.id in patch ? { ...d, offsetSec: patch[d.id] } : d)),
  }));
  clock.resync();
  st().notify(`Lệch canon ${n} người, mỗi người sau ${step.toFixed(2)} s`, { undo: true });
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
  const fid = ensureHoldNow(live);
  const fn = (q: Project) => ({ ...q, formations: setPositions(q.formations, fid, moves, q.stage) });
  if (live) st().live(fn);
  else st().commit(fn);
}

export function nudgeSelected(dx: number, dz: number) {
  const sel = st().ui.selected;
  if (!sel.length) return;
  const cur = currentPoses();
  const moves: Record<string, Vec2> = {};
  for (const id of sel) {
    const p: Vec2 = [cur[id][0] + dx, cur[id][1] + dz];
    moves[id] = st().ui.snap ? snapPos(p, 0.25) : p;
  }
  setPositionsNow(moves, false);
}

export function applyShape(kind: ShapeKind) {
  const p = proj();
  let sel = st().ui.selected.filter((id) => p.dancers.some((d) => d.id === id));
  if (sel.length < 2) sel = p.dancers.filter((d) => !d.hidden).map((d) => d.id);
  if (!sel.length) return;
  const cur = currentPoses();
  setPositionsNow(arrangeShape(cur, sel, kind, p.stage), false);
}

export function mirrorSelected() {
  const p = proj();
  let sel = st().ui.selected;
  if (!sel.length) sel = ids(p);
  setPositionsNow(mirrorPositions(currentPoses(), sel), false);
}

export function distributeSelected() {
  const sel = st().ui.selected;
  if (sel.length < 3) {
    st().notify("Chọn ít nhất 3 người để dàn đều");
    return;
  }
  setPositionsNow(distributeX(currentPoses(), sel), false);
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
  setPositionsNow(moves, false);
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

export function setBpm(bpm: number | null, downbeat?: number) {
  st().commit((q) => ({ ...q, bpm, downbeat: downbeat ?? q.downbeat }));
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
    st().notify(`Lỗi khi nạp tệp: ${(e as Error)?.message || "không rõ"}`, { kind: "error" });
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
let saveErrShown = false;

async function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!dirty || !st().ui.loaded) return;
  if (!canAutosave()) {
    st().setUI({ saveState: "error" });
    return;
  }
  dirty = false;
  try {
    await saveProject(st().project);
    if (!dirty) st().setUI({ saveState: "saved" });
    saveErrShown = false;
  } catch (e) {
    dirty = true;
    st().setUI({ saveState: "error" });
    if (!saveErrShown) {
      saveErrShown = true;
      st().notify(isQuotaError(e) ? QUOTA_MSG : "Không tự lưu được bài. Hãy dùng Tệp ▸ Lưu ra tệp để giữ bài.", { kind: "error" });
    }
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

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportProject() {
  const p = proj();
  const safe = (p.title || "bai-mua").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  download(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }), `${safe}.choreo.json`);
  st().notify("Đã lưu tệp dự án. Video và nhạc giữ riêng, khi mở lại thả chúng vào cùng lúc.");
}

export async function openProjectFile(f: File) {
  const j = JSON.parse(await f.text()) as Project;
  if (!j || j.version !== 1 || !Array.isArray(j.dancers)) throw new Error("Không phải tệp dự án sân khấu");
  const full: Project = {
    ...emptyProject(), ...j,
    dancers: j.dancers.map((d) => ({ ...newDancer(d.id, d.name, d.color), ...d })),
  };
  const missing = await loadMediaFor(full.musicId, full.dancers.map((d) => d.mediaId).filter((x): x is string => !!x));
  const miss = new Set(missing);
  // media không có trong máy: bỏ liên kết, giữ tên tệp để ghép khi thả vào
  full.dancers = full.dancers.map((d) => (d.mediaId && miss.has(d.mediaId) ? { ...d, mediaId: null } : d));
  if (full.musicId && miss.has(full.musicId)) full.musicId = null;
  st().commit(() => full);
  st().setUI({ selected: [], selectedBlock: null });
  clock.seek(0);
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
  st().commit((q) => ({ ...q, stage: { width, depth } }));
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
  let duration = p.musicDuration;
  if (!(duration > 0)) {
    duration = 32;
    const last = p.formations[p.formations.length - 1];
    if (last) duration = Math.max(duration, last.end);
    for (const d of p.dancers) if (d.mediaId) duration = Math.max(duration, d.offsetSec + d.durationSec);
  }
  const buf = music.buffer;
  const formations = autoPlan({
    ids: ids(p), stage: p.stage, duration, bpm: p.bpm, downbeat: p.downbeat,
    count: o.count, everyEights: o.everyEights,
    start: p.formations[0]?.pos,
    changeScore: buf ? energyChangeScore(monoOf(buf), buf.sampleRate) : undefined,
    newId: () => uid("f"),
  });
  const had = p.formations.length;
  st().commit((q) => ({ ...q, formations }));
  clock.seek(formations[0].start + 0.001);
  st().setUI({ selectedBlock: formations[0].id });
  const how = buf ? ", điểm đổi theo nhạc" : "";
  if (had > 1)
    st().notify(`Đã thay ${had} đội hình cũ bằng ${formations.length} đội hình mới${how} — Ctrl Z để hoàn tác`, { undo: true, kind: "warn" });
  else st().notify(`Đã tạo ${formations.length} đội hình${how} — Ctrl Z để hoàn tác`, { undo: true });
}
