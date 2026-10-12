// Lưu cục bộ bằng IndexedDB: tệp media (video, nhạc) và dự án hiện tại.
// Tách khỏi bộ lưu của app 3D cũ (cơ sở dữ liệu khác tên).

import type { Project } from "./model";

const DB = "choreo-stage";
const VER = 1;

export interface MediaRec {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  key?: string; // tên|cỡ|ngày sửa của tệp gốc, để nhận ra tệp thả lại
}

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
      if (!db.objectStoreNames.contains("project")) db.createObjectStore("project");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    dbp = null; // lần sau thử mở lại
    throw e;
  });
  return dbp;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        // ghi: chỉ coi là xong khi cả giao dịch xong (lỗi đầy bộ nhớ báo ở bước này)
        if (mode === "readwrite") {
          tx.oncomplete = () => resolve(req.result as T);
          tx.onabort = tx.onerror = () => reject(tx.error ?? req.error ?? new Error("Ghi IndexedDB thất bại"));
        } else {
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error);
        }
      }),
  );
}

export const isQuotaError = (e: unknown): boolean =>
  !!e && typeof e === "object" && /quota/i.test(`${(e as Error).name} ${(e as Error).message}`);

export const putMedia = (m: MediaRec) => run<IDBValidKey>("media", "readwrite", (s) => s.put(m));
export const getMedia = (id: string) => run<MediaRec | undefined>("media", "readonly", (s) => s.get(id));
export const deleteMedia = (id: string) => run<undefined>("media", "readwrite", (s) => s.delete(id));
export const allMediaIds = () => run<IDBValidKey[]>("media", "readonly", (s) => s.getAllKeys());
export const saveProject = (p: Project) => run<IDBValidKey>("project", "readwrite", (s) => s.put(p, "current"));
/** Dữ liệu thô đã lưu (chưa kiểm), phải kiểm trước khi dùng. */
export const loadProject = () => run<unknown>("project", "readonly", (s) => s.get("current"));
export const saveKey = (key: string, v: unknown) => run<IDBValidKey>("project", "readwrite", (s) => s.put(v, key));
export const loadKey = (key: string) => run<unknown>("project", "readonly", (s) => s.get(key));
