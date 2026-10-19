// Lưu và mở tệp. Ctrl S: lưu ngay vào trình duyệt rồi ghi tệp .choreo.json
// (Chrome/Edge: hỏi chỗ lưu một lần, sau đó ghi đè im lặng; trình duyệt khác:
// tải xuống một lần). Gói .zip mang đủ nhạc và video sang máy khác.

import { st, useStore } from "../store";
import * as clock from "../clock";
import { music, setMusic, loadMediaFor } from "../media";
import { getMedia, putMedia, saveProject } from "../db";
import type { Project } from "../model";
import { buildBundle, readBundle, checkProject, slugTitle } from "./bundle";

// File System Access (Chrome, Edge): khai báo tối thiểu
interface Writable {
  write(b: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
interface FileHandle {
  name: string;
  createWritable(): Promise<Writable>;
}
interface PickType {
  description: string;
  accept: Record<string, string[]>;
}
type SavePicker = (o: { suggestedName?: string; types?: PickType[] }) => Promise<FileHandle>;

const JSON_TYPE: PickType = { description: "Dự án sân khấu", accept: { "application/json": [".json"] } };
const ZIP_TYPE: PickType = { description: "Gói bài múa (có video)", accept: { "application/zip": [".zip"] } };

let target: FileHandle | null = null; // tệp Ctrl S đang ghi đè
let downloaded = false; // không có hộp chọn tệp: Ctrl S chỉ tải xuống lần đầu
let declined = false; // đã bấm Huỷ ở hộp chọn tệp

export const saveTargetName = (): string | null => target?.name ?? null;

/** Bài khác (mở tệp, bài mới): Ctrl S không được ghi đè tệp của bài cũ. */
export function forgetSaveTarget() {
  target = null;
  downloaded = false;
  declined = false;
}

const isAbort = (e: unknown) => (e as Error | null)?.name === "AbortError";
const errMsg = (e: unknown) => (e as Error | null)?.message || String(e);

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/** Hỏi chỗ lưu. FileHandle: đã chọn; null: bấm Huỷ; undefined: không hỏi được (tải xuống). */
async function pickFile(suggestedName: string, type: PickType): Promise<FileHandle | null | undefined> {
  const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (typeof pick !== "function") return undefined;
  try {
    return await pick.call(window, { suggestedName, types: [type] });
  } catch (e) {
    return isAbort(e) ? null : undefined; // bị chặn (vd. trong khung nhúng): tải xuống
  }
}

async function writeTo(h: FileHandle, blob: Blob) {
  const w = await h.createWritable();
  try {
    await w.write(blob);
    await w.close();
  } catch (e) {
    await w.abort?.().catch(() => {});
    throw e;
  }
}

const projectBlob = () => new Blob([JSON.stringify(st().project, null, 2)], { type: "application/json" });
const jsonName = () => `${slugTitle(st().project.title)}.choreo.json`;

/** Lưu ngay vào trình duyệt, không chờ tự lưu. */
function saveNow(): Promise<boolean> {
  st().setUI({ saveState: "saving" });
  return saveProject(st().project).then(
    () => (st().setUI({ saveState: "saved" }), true),
    () => (st().setUI({ saveState: "error" }), false),
  );
}

async function savedInBrowser(p: Promise<boolean>, extra = "") {
  if (await p) st().notify(`Đã tự lưu trong trình duyệt ✓${extra}`);
  else st().notify("Không lưu được vào trình duyệt. Hãy Lưu thành tệp hoặc Đóng gói để giữ bài.", { kind: "error" });
}

/** Ctrl S. */
export async function quickSave() {
  const inBrowser = saveNow();
  if (target) {
    const h = target;
    try {
      await writeTo(h, projectBlob());
      st().notify(`Đã lưu vào ${h.name}`);
      return;
    } catch {
      target = null; // tệp bị chuyển, xoá hoặc mất quyền: hỏi lại bên dưới
    }
  }
  if (declined || downloaded || st().ui.busy) return savedInBrowser(inBrowser);
  const name = jsonName();
  const h = await pickFile(name, JSON_TYPE);
  if (h === null) {
    declined = true;
    return savedInBrowser(inBrowser, ". Muốn lưu ra tệp: Tệp ▸ Lưu thành tệp khác…");
  }
  if (h === undefined) {
    download(projectBlob(), name);
    downloaded = true;
    st().notify(`Đã tải xuống ${name} (không kèm video). Ctrl S lần sau chỉ lưu trong trình duyệt.`);
    return;
  }
  try {
    await writeTo(h, projectBlob());
    target = h;
    st().notify(`Đã lưu vào ${h.name}. Ctrl S lần sau ghi đè tệp này.`);
  } catch (e) {
    st().notify(`Không ghi được tệp: ${errMsg(e)}`, { kind: "error" });
  }
}

/** Tệp ▸ Lưu thành tệp khác…: luôn hỏi chỗ lưu; tệp mới thành tệp của Ctrl S. */
export async function saveAs() {
  void saveNow();
  const name = jsonName();
  const h = await pickFile(name, JSON_TYPE);
  if (h === null) return;
  if (h === undefined) {
    download(projectBlob(), name);
    downloaded = true;
    st().notify(`Đã tải xuống ${name} (không kèm video).`);
    return;
  }
  try {
    await writeTo(h, projectBlob());
    target = h;
    declined = false;
    st().notify(`Đã lưu vào ${h.name}. Ctrl S lần sau ghi đè tệp này.`);
  } catch (e) {
    st().notify(`Không ghi được tệp: ${errMsg(e)}`, { kind: "error" });
  }
}

const mb = (n: number) => (n < 10 << 20 ? (n / 1048576).toFixed(1) : String(Math.round(n / 1048576))).replace(".", ",");

/** Tệp ▸ Đóng gói cả video (.zip)…: một tệp có dự án, nhạc và mọi video. */
export async function saveBundle() {
  if (st().ui.busy) return;
  void saveNow();
  const p = st().project;
  const name = `${slugTitle(p.title)}.zip`;
  // hỏi chỗ lưu trước (cần đang trong cú bấm), rồi mới đọc video
  const h = await pickFile(name, ZIP_TYPE);
  if (h === null) return;
  const busy = (msg: string, progress: number) => st().setUI({ busy: { msg, progress } });
  busy("Đang đóng gói…", 0);
  try {
    const r = await buildBundle(p, (id) => getMedia(id), { onProgress: (f) => busy("Đang đóng gói…", f) });
    busy("Đang ghi tệp…", -1);
    if (h) await writeTo(h, r.blob);
    else download(r.blob, name);
    const nv = r.media.filter((m) => m.kind === "video").length;
    const what = `${nv} video${r.media.some((m) => m.kind === "music") ? " + nhạc" : ""}, ${mb(r.blob.size)} MB`;
    const where = h ? `Đã lưu gói ${h.name}` : `Đã tải xuống gói ${name}`;
    if (r.skipped.length) {
      st().notify(`${where} (${what}). Máy không còn ${r.skipped.length} tệp nên gói thiếu: ${r.skipped.join(", ")}`, { kind: "warn" });
    } else st().notify(`${where} (${what}).`);
  } catch (e) {
    st().notify(`Không đóng gói được: ${errMsg(e)}`, { kind: "error" });
  } finally {
    st().setUI({ busy: null });
  }
}

// ---------- mở ----------

export const isBlankProject = (p: Project) => !p.dancers.length && !p.formations.length && !p.musicId;

/** Mở tệp .choreo.json (không kèm video). */
export async function openProjectJson(f: File): Promise<string[]> {
  let j: unknown;
  try {
    j = JSON.parse(await f.text());
  } catch {
    throw new Error("Tệp dự án bị hỏng (không đọc được nội dung).");
  }
  return applyProject(checkProject(j));
}

/** Mở gói .zip: chép media vào trình duyệt rồi thay dự án (Hoàn tác được). false: không mở. */
export async function openBundleFile(f: File): Promise<boolean> {
  if (st().ui.busy) return false;
  if (!isBlankProject(st().project) && !confirm(`Mở gói "${f.name}"? Bài hiện tại sẽ bị thay (có thể Hoàn tác).`)) return false;
  const busy = (msg: string, progress: number) => st().setUI({ busy: { msg, progress } });
  busy("Đang mở gói…", 0);
  try {
    const r = await readBundle(f, (x) => busy("Đang mở gói…", x * 0.5));
    for (let i = 0; i < r.media.length; i++) {
      const m = r.media[i];
      busy(`Đang chép vào máy: ${m.name}`, 0.5 + (0.4 * i) / r.media.length);
      try {
        await putMedia({ id: m.id, name: m.name, type: m.type, blob: m.blob });
      } catch (e) {
        if ((e as Error | null)?.name === "QuotaExceededError") {
          throw new Error("máy không còn đủ chỗ cho trình duyệt lưu video. Hãy dọn bớt ổ đĩa rồi thử lại.");
        }
        throw e;
      }
    }
    busy("Đang nạp video…", 0.9);
    const lost = new Set([...r.missing, ...(await applyProject(r.project))]).size;
    if (lost) st().notify(`Đã mở gói, nhưng thiếu ${lost} tệp nhạc/video: thả chúng vào để gắn lại.`, { kind: "warn", undo: true });
    else st().notify(`Đã mở gói "${r.project.title}".`, { undo: true });
    return true;
  } catch (e) {
    st().notify(`Không mở được gói: ${errMsg(e)}`, { kind: "error" });
    return false;
  } finally {
    st().setUI({ busy: null });
    clock.resync();
  }
}

/**
 * Thay dự án đang mở (một commit). Trả id media không có trong máy (đã bỏ liên kết).
 * keepSaveTarget: vẫn là bài đó (mở một phương án) nên Ctrl S ghi tiếp vào tệp
 * đang lưu, không hỏi lại chỗ lưu.
 */
export async function applyProject(p: Project, o: { keepSaveTarget?: boolean } = {}): Promise<string[]> {
  watchMusic();
  clock.pause();
  const full: Project = { ...p };
  const missing = await loadMediaFor(full.musicId, full.dancers.map((d) => d.mediaId).filter((x): x is string => !!x));
  const miss = new Set(missing);
  // media không có trong máy: bỏ liên kết, giữ tên tệp để ghép khi thả vào
  full.dancers = full.dancers.map((d) => (d.mediaId && miss.has(d.mediaId) ? { ...d, mediaId: null } : d));
  if (full.musicId && miss.has(full.musicId)) full.musicId = null;
  if (!full.musicId && music.id) await setMusic(null);
  st().commit(() => full);
  st().setUI({ selected: [], selectedBlock: null });
  if (!o.keepSaveTarget) forgetSaveTarget();
  clock.seek(0);
  return missing;
}

// ---------- nhạc theo Hoàn tác ----------

/** Giữ để không đổi chỗ gọi: nhạc theo project.musicId đã do followMusic
 * (actions.ts, đăng ký lúc mở app) lo, kể cả khi Hoàn tác/Làm lại. */
export function watchMusic() {}
