// Các thao tác cấp cao: nối store, đồng hồ và media.

import {
  type Project, type VDancer, type Vec2, type ShapeKind,
  PALETTE, newDancer, cloneDancer, lineup, posesAt, ensureFormationAt, setPositions,
  addFormationAfter, deleteFormation, addDancerToAll, removeDancerFromAll,
  arrangeShape, mirrorPositions, distributeX, holdIndexAt, segmentAt,
  snapPos, emptyProject, renameFormation, wingSpot, placeClones, canonOffsets as canonPatch, SHAPE_LABEL,
} from "./model";
import { defaultLens, snapTime } from "./timing";
import { st, useStore } from "./store";
import * as clock from "./clock";
import {
  classify, registerVideo, setMusic, storeBlob, stripName, uid, getVideo,
  decodeAudio, music, monoOf, loadMediaFor,
} from "./media";
import { estimateOffset, CONFIDENT } from "./align";
import { saveProject, loadProject, allMediaIds, deleteMedia } from "./db";
import { planDance, energyChangeScore } from "./autoplan";
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
    if (!cur[id]) continue; // người đã bị xoá mà còn trong lựa chọn
    const p: Vec2 = [cur[id][0] + dx, cur[id][1] + dz];
    moves[id] = st().ui.snap ? snapPos(p, 0.25) : p;
  }
  if (!Object.keys(moves).length) return;
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

export function setBpm(bpm: number | null, downbeat?: number, merge?: string) {
  st().commit((q) => ({ ...q, bpm, downbeat: downbeat ?? q.downbeat }), merge);
}

// ---------- nhập tệp ----------

async function attachVideo(file: File, meta: import("./media").CardMeta | null, intoId: string | null) {
  const rec = await storeBlob(file.name, file);
  const v = await registerVideo(rec);
  const stacked = meta?.stacked ?? /\.card\./i.test(file.name);
  const frameH = stacked ? v.height / 2 : v.height;
  const aspect = v.width && frameH ? v.width / frameH : 0.5;
  let offsetSec = meta?.offsetSec ?? 0;
  let alignConfident = meta?.alignConfident ?? false;
  let aligned = !!meta;
  if (!meta && music.buffer) {
    const r = await alignBlob(file);
    if (r) {
      offsetSec = Math.round(r.offset * 1000) / 1000;
      alignConfident = r.confidence >= CONFIDENT;
      aligned = true;
    }
  }
  const patch: Partial<VDancer> = {
    mediaId: rec.id, mediaName: file.name, stacked, aspect,
    durationSec: meta?.durationSec ?? v.duration, offsetSec, alignConfident,
  };
  const label = meta?.name ?? stripName(file.name);
  let id = intoId;
  if (!id) id = addDancer(label);
  const d = proj().dancers.find((x) => x.id === id)!;
  if (/^D\d+$/.test(d.name)) patch.name = label;
  updateDancer(id, patch);
  return { id, aligned, confident: alignConfident };
}

/** Gắn (hoặc thay) video cho đúng một vũ công. */
export async function replaceVideo(id: string, file: File) {
  const d = proj().dancers.find((x) => x.id === id);
  if (!d) return;
  st().setUI({ busy: { msg: `Đang nạp video cho ${d.name}…`, progress: -1 } });
  try {
    const r = await attachVideo(file, null, id);
    st().notify(
      r.aligned && !r.confident ? `${d.name}: khớp nhạc chưa chắc, hãy nghe thử và căn tay` : `Đã gắn video cho ${d.name}`,
      { kind: r.aligned && !r.confident ? "warn" : "info", undo: true },
    );
  } catch (e) {
    st().notify(errText(e, "Không đọc được video"), { kind: "error" });
  } finally {
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

export async function realign(id: string) {
  const d = proj().dancers.find((x) => x.id === id);
  const v = getVideo(d?.mediaId);
  if (!d || !v) return;
  if (!music.buffer) {
    st().notify("Cần thả bài nhạc trước rồi mới tự khớp được");
    return;
  }
  st().setUI({ busy: { msg: `Đang khớp nhạc cho ${d.name}…`, progress: -1 } });
  try {
    const blob = await fetch(v.url).then((r) => r.blob());
    const r = await alignBlob(blob);
    if (!r) st().notify("Video không có tiếng, hãy kéo thanh video để căn tay", { kind: "warn" });
    else {
      updateDancer(id, { offsetSec: Math.round(r.offset * 1000) / 1000, alignConfident: r.confidence >= CONFIDENT });
      st().notify(
        r.confidence >= CONFIDENT
          ? `${d.name}: khớp nhạc lệch ${r.offset.toFixed(2)} s`
          : `${d.name}: khớp chưa chắc, hãy nghe thử và căn tay`,
        { kind: r.confidence >= CONFIDENT ? "info" : "warn" },
      );
    }
  } finally {
    st().setUI({ busy: null });
  }
}

export async function importFiles(files: File[]) {
  if (!files.length) return;
  const zip = files.find((f) => /\.zip$/i.test(f.name)); // gói .zip có đủ video: mở riêng
  if (zip) return void (await openBundleFile(zip));
  const c = await classify(files);
  const msgs: string[] = [];
  try {
    if (c.project) {
      await openProjectFile(c.project);
      msgs.push("đã mở dự án");
    }
    if (c.music) {
      st().setUI({ busy: { msg: "Đang đọc nhạc…", progress: -1 } });
      const rec = await storeBlob(c.music.name, c.music);
      const dur = await setMusic(rec);
      st().commit((q) => ({ ...q, musicId: rec.id, musicName: c.music!.name, musicDuration: dur }));
      msgs.push(`nhạc "${c.music.name}"`);
    }
    let i = 0;
    let weak = 0;
    for (const { file, meta } of c.videos) {
      i++;
      st().setUI({ busy: { msg: `Đang nạp video ${i}/${c.videos.length}: ${file.name}`, progress: (i - 1) / c.videos.length } });
      const key = stripName(file.name).toLowerCase();
      const p = proj();
      const sel = st().ui.selected.length === 1 ? p.dancers.find((d) => d.id === st().ui.selected[0] && !d.mediaId) : undefined;
      const target =
        p.dancers.find((d) => !d.mediaId && stripName(d.mediaName).toLowerCase() === key && d.mediaName) ??
        p.dancers.find((d) => d.name.toLowerCase() === (meta?.name ?? key).toLowerCase()) ??
        (c.videos.length === 1 ? sel : undefined) ??
        p.dancers.find((d) => !d.mediaId);
      const r = await attachVideo(file, meta, target?.id ?? null);
      if (r.aligned && !r.confident) weak++;
    }
    if (c.videos.length) msgs.push(`${c.videos.length} video`);
    if (weak) st().notify(`${weak} video khớp nhạc chưa chắc: xem dấu ⚠ ở danh sách vũ công`, { kind: "warn" });
    else if (msgs.length) st().notify(`Đã nạp ${msgs.join(", ")}`);
    if (c.unknown.length) st().notify(`Bỏ qua ${c.unknown.length} tệp không nhận ra: ${c.unknown.map((f) => f.name).join(", ")}`, { kind: "warn" });
  } catch (e) {
    st().notify(errText(e, "Lỗi khi nạp tệp"), { kind: "error" });
  } finally {
    st().setUI({ busy: null });
    clock.resync();
  }
}

// ---------- lưu / mở ----------

let saveTimer = 0;
export function startAutosave() {
  let last = proj();
  useStore.subscribe((s) => {
    if (s.project === last || !s.ui.loaded) return;
    last = s.project;
    if (s.ui.saveState !== "saving") st().setUI({ saveState: "saving" });
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveProject(st().project)
        .then(() => st().setUI({ saveState: "saved", saveError: null }))
        .catch((e) => st().setUI({ saveState: "error", saveError: errText(e, "Trình duyệt báo lỗi") }));
    }, 400);
  });
}

export async function boot() {
  initClock();
  try {
    const p = await loadProject();
    if (p && p.version === 1) {
      const full = { ...emptyProject(), ...p, dancers: p.dancers.map((d) => ({ ...newDancer(d.id, d.name, d.color), ...d })) };
      st().load(full);
      await loadMediaFor(full.musicId, full.dancers.map((d) => d.mediaId).filter((x): x is string => !!x));
      // dọn media không còn dùng
      const used = new Set([full.musicId, ...full.dancers.map((d) => d.mediaId)]);
      for (const k of await allMediaIds()) if (!used.has(String(k))) deleteMedia(String(k)).catch(() => {});
    }
  } catch (e) {
    console.warn("Không mở được dự án đã lưu", e);
  }
  st().setUI({ loaded: true });
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
  setMusic(null);
  st().commit(() => emptyProject());
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
