// Tệp ▸ Xuất ảnh đội hình: vẽ lên canvas, canvas.toBlob PNG rồi tải xuống.
// Một ảnh (đội hình tại vạch phát) hoặc mọi đội hình gói trong một .zip.

import { st } from "../store";
import * as clock from "../clock";
import type { Project } from "../model";
import type { Ctx2D } from "./planRender";
import { imageLayout, drawImage, formationIndexAt, imageFileName, imagesZipName, canShareImage, canCopyImage } from "./imageSheet";
import { personSheets, personLayout, drawPersonSheet, personZipName, type PersonSheet } from "./personSheet";
import { makeZip } from "./zip";
import { download } from "./save";

export function renderPng(p: Project, k: number): Promise<Blob> {
  const L = imageLayout(p, k);
  const c = document.createElement("canvas");
  c.width = L.w;
  c.height = L.h;
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Trình duyệt không vẽ được canvas."));
  drawImage(ctx as unknown as Ctx2D, p, k, L);
  return new Promise((ok, fail) =>
    c.toBlob((b) => (b ? ok(b) : fail(new Error("Không tạo được ảnh PNG."))), "image/png"),
  );
}

function noFormation(): boolean {
  if (st().project.formations.length) return false;
  st().notify("Chưa có đội hình nào để xuất ảnh. Thêm đội hình ở dải thời gian trước.", { kind: "warn" });
  return true;
}

/** Ảnh PNG của đội hình tại vạch phát. */
export async function exportCurrentImage() {
  if (noFormation()) return;
  const p = st().project;
  const k = formationIndexAt(p, clock.now());
  try {
    await document.fonts?.ready;
    const name = imageFileName(p, k);
    download(await renderPng(p, k), name);
    st().notify(`Đã xuất ảnh ${name} (xem trong thư mục Tải xuống).`);
  } catch (e) {
    st().notify(`Không xuất được ảnh: ${(e as Error).message}`, { kind: "error" });
  }
}

/** Mỗi đội hình một ảnh PNG, gói chung một tệp .zip. */
export async function exportAllImages() {
  if (noFormation()) return;
  const p = st().project;
  try {
    await document.fonts?.ready;
    const items = [];
    for (let k = 0; k < p.formations.length; k++) items.push({ name: imageFileName(p, k), data: await renderPng(p, k) });
    const name = imagesZipName(p);
    download(await makeZip(items), name);
    st().notify(`Đã xuất ${items.length} ảnh trong ${name} (xem trong thư mục Tải xuống).`);
  } catch (e) {
    st().notify(`Không xuất được ảnh: ${(e as Error).message}`, { kind: "error" });
  }
}

/** Ảnh trang page của người trong sheet. */
function renderPersonPng(p: Project, sh: PersonSheet, page: number): Promise<Blob> {
  const L = personLayout(p, sh.id, sh.pages, page);
  const c = document.createElement("canvas");
  c.width = L.w;
  c.height = L.h;
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Trình duyệt không vẽ được canvas."));
  drawPersonSheet(ctx as unknown as Ctx2D, p, sh.id, L);
  return new Promise((ok, fail) =>
    c.toBlob((b) => (b ? ok(b) : fail(new Error("Không tạo được ảnh PNG."))), "image/png"),
  );
}

async function personItems(p: Project, sheets: PersonSheet[]) {
  const items = [];
  for (const sh of sheets) for (let j = 0; j < sh.files.length; j++) items.push({ name: sh.files[j], data: await renderPersonPng(p, sh, j) });
  return items;
}

/** Người duy nhất đang chọn (không ẩn) thì trả về người đó, để hiện mục ảnh vị trí riêng. */
export function selectedPerson(): { id: string; name: string } | null {
  const sel = st().ui.selected;
  if (sel.length !== 1) return null;
  const d = st().project.dancers.find((x) => x.id === sel[0]);
  return d && !d.hidden ? { id: d.id, name: d.name.trim() || "?" } : null;
}

/** Mỗi người (không ẩn) một hoặc vài ảnh vị trí, gói chung một tệp .zip. */
export async function exportPersonImages() {
  if (noFormation()) return;
  const p = st().project;
  const sheets = personSheets(p);
  if (!sheets.length) {
    st().notify("Chưa có người nào trên sân để xuất ảnh vị trí.", { kind: "warn" });
    return;
  }
  try {
    await document.fonts?.ready;
    const items = await personItems(p, sheets);
    const name = personZipName(p);
    download(await makeZip(items), name);
    st().notify(`Đã xuất ${items.length} ảnh vị trí của ${sheets.length} người trong ${name} (xem trong thư mục Tải xuống).`);
  } catch (e) {
    st().notify(`Không xuất được ảnh: ${(e as Error).message}`, { kind: "error" });
  }
}

/** Ảnh vị trí của một người: một trang thì tải .png, nhiều trang thì gói .zip. */
export async function exportPersonImage(id: string) {
  if (noFormation()) return;
  const p = st().project;
  const sh = personSheets(p, [id])[0];
  if (!sh) return;
  try {
    await document.fonts?.ready;
    const items = await personItems(p, [sh]);
    const one = items.length === 1;
    const name = one ? items[0].name : personZipName(p, sh);
    download(one ? items[0].data : await makeZip(items), name);
    st().notify(`Đã xuất ${one ? "ảnh" : `${items.length} ảnh trong`} ${name} (xem trong thư mục Tải xuống).`);
  } catch (e) {
    st().notify(`Không xuất được ảnh: ${(e as Error).message}`, { kind: "error" });
  }
}

const pngProbe = () => [new File([new Uint8Array(1)], "thu.png", { type: "image/png" })];

/** Trình duyệt này chia sẻ được ảnh PNG (điện thoại) thì hiện mục Chia sẻ. */
export const shareSupported = () =>
  typeof navigator !== "undefined" && typeof File !== "undefined" && canShareImage(navigator, pngProbe());

/** Trình duyệt này chép được ảnh vào bộ nhớ tạm thì hiện mục Chép ảnh. */
export const copySupported = () =>
  typeof navigator !== "undefined" && canCopyImage(navigator, (globalThis as { ClipboardItem?: unknown }).ClipboardItem);

/** Chia sẻ ảnh đội hình tại vạch phát qua bảng chia sẻ của máy (Zalo, Messenger...). */
export async function shareCurrentImage() {
  if (noFormation()) return;
  const p = st().project;
  const k = formationIndexAt(p, clock.now());
  const name = imageFileName(p, k);
  let blob: Blob;
  try {
    await document.fonts?.ready;
    blob = await renderPng(p, k);
  } catch (e) {
    st().notify(`Không tạo được ảnh: ${(e as Error).message}`, { kind: "error" });
    return;
  }
  const files = [new File([blob], name, { type: "image/png" })];
  try {
    if (!canShareImage(navigator, files)) throw Object.assign(new Error("không hỗ trợ"), { name: "NotAllowedError" });
    await navigator.share({ files, title: p.formations[k].name || p.title || "Đội hình" });
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") return; // người dùng đóng bảng chia sẻ
    // máy từ chối (hết lượt bấm, không nhận tệp): tải ảnh xuống thay vì mất ảnh
    download(blob, name);
    st().notify(`Không mở được bảng chia sẻ, đã tải ảnh ${name} xuống thay.`, { kind: "warn" });
  }
}

/** Chép ảnh đội hình tại vạch phát vào bộ nhớ tạm, để dán thẳng vào Zalo, Messenger. */
export async function copyCurrentImage() {
  if (noFormation()) return;
  const p = st().project;
  const k = formationIndexAt(p, clock.now());
  try {
    // đưa Promise vào ClipboardItem ngay trong lượt bấm (Safari đòi vậy), vẽ xong sau
    const png = (async () => {
      await document.fonts?.ready;
      return renderPng(p, k);
    })();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    st().notify("Đã chép ảnh, dán vào Zalo bằng Ctrl V.");
  } catch {
    // trình duyệt không cho ghi bộ nhớ tạm: tải ảnh xuống thay vì mất ảnh
    try {
      const name = imageFileName(p, k);
      download(await renderPng(p, k), name);
      st().notify(`Trình duyệt không cho chép ảnh, đã tải ${name} xuống thay.`, { kind: "warn" });
    } catch (e) {
      st().notify(`Không tạo được ảnh: ${(e as Error).message}`, { kind: "error" });
    }
  }
}
