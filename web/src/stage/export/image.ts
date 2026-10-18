// Tệp ▸ Xuất ảnh đội hình: vẽ lên canvas, canvas.toBlob PNG rồi tải xuống.
// Một ảnh (đội hình tại vạch phát) hoặc mọi đội hình gói trong một .zip.

import { st } from "../store";
import * as clock from "../clock";
import type { Project } from "../model";
import type { Ctx2D } from "./planRender";
import { imageLayout, drawImage, formationIndexAt, imageFileName, imagesZipName } from "./imageSheet";
import { makeZip } from "./zip";
import { download } from "./save";

function renderPng(p: Project, k: number): Promise<Blob> {
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
