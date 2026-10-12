// Ghi/đọc tệp .zip tối giản, THUẦN (chỉ Blob, TextEncoder, DecompressionStream)
// để chạy được cả trong trình duyệt lẫn `node --test`.
//
// Ghi: kiểu STORE (không nén: video và nhạc vốn đã nén), cờ UTF-8 (bit 11) cho
// tên tiếng Việt, giờ DOS. Gói là một Blob ghép từ nhiều mảnh (đầu mục + blob
// gốc) nên không chép cả gói vào một ArrayBuffer; CRC-32 tính bằng cách đọc dần
// từng blob. Không có ZIP64 nên gói phải dưới 4 GB.
//
// Đọc: lấy mục lục ở cuối tệp (central directory), hỗ trợ STORE lẫn DEFLATE và
// cả ZIP64, để mở được gói đã bị Windows, Zalo hay Drive nén lại.

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_LOC64 = 0x07064b50;
const FLAG_UTF8 = 0x0800;

export const ZIP_MAX_BYTES = 0xffffffff; // giới hạn của zip thường (không ZIP64)
export const ZIP_MAX_ENTRIES = 0xffff;

export const ERR_TOO_BIG =
  "Gói nặng quá 4 GB nên không đóng được. Hãy bớt video, hoặc dùng Lưu ra tệp rồi chép video riêng.";
const ERR_BROKEN = "Tệp .zip bị hỏng hoặc chưa tải xong.";

// ---------- CRC-32 ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Cập nhật CRC đang chạy (giá trị thô, bắt đầu từ 0xFFFFFFFF, chưa đảo bit cuối). */
export function crc32Update(crc: number, buf: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

export const crc32 = (buf: Uint8Array): number => (crc32Update(0xffffffff, buf) ^ 0xffffffff) >>> 0;

/** CRC-32 của một blob, đọc dần từng khúc (không nạp cả tệp vào bộ nhớ). */
export async function crc32Blob(b: Blob, onBytes?: (n: number) => void): Promise<number> {
  let c = 0xffffffff;
  const r = b.stream().getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    c = crc32Update(c, value);
    onBytes?.(value.length);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- ghi ----------

/** Giờ kiểu DOS (độ phân giải 2 giây, năm 1980–2107). */
export function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipInput {
  name: string; // đường dẫn trong gói, dùng "/" (vd "video/Hương.card.mp4")
  data: Blob | Uint8Array<ArrayBuffer> | string;
  date?: Date;
  crc?: number; // đã tính sẵn thì khỏi đọc lại blob
}

/** Cỡ gói STORE: mỗi mục có đầu mục 30 byte + tên, mục lục 46 byte + tên; đuôi 22 byte. */
export function zipSize(items: { nameBytes: number; size: number }[]): number {
  let n = 22;
  for (const it of items) n += 30 + 46 + 2 * it.nameBytes + it.size;
  return n;
}

/** Ném lỗi tiếng Việt nếu gói vượt giới hạn zip thường. */
export function checkZipLimits(items: { nameBytes: number; size: number }[]): void {
  if (items.length > ZIP_MAX_ENTRIES) throw new Error("Quá nhiều tệp để đóng gói (tối đa 65 535 tệp).");
  for (const it of items) if (it.nameBytes > 0xffff) throw new Error("Có tên tệp quá dài, không đóng gói được.");
  if (zipSize(items) >= ZIP_MAX_BYTES) throw new Error(ERR_TOO_BIG);
}

export interface MakeZipOpts {
  date?: Date;
  /** Tiến độ tính CRC: số byte đã đọc / tổng. */
  onProgress?: (done: number, total: number) => void;
}

export async function makeZip(items: ZipInput[], o: MakeZipOpts = {}): Promise<Blob> {
  const enc = new TextEncoder();
  const list = items.map((it) => {
    const data = typeof it.data === "string" ? enc.encode(it.data) : it.data;
    const size = data instanceof Uint8Array ? data.length : data.size;
    return { name: enc.encode(it.name), data, size, date: it.date ?? o.date ?? new Date(), crc: it.crc };
  });
  checkZipLimits(list.map((x) => ({ nameBytes: x.name.length, size: x.size })));
  const total = list.reduce((s, x) => s + x.size, 0);
  let done = 0;
  const tick = (n: number) => {
    done += n;
    o.onProgress?.(done, total);
  };

  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const x of list) {
    let crc: number;
    if (x.crc !== undefined) {
      crc = x.crc >>> 0;
      tick(x.size);
    } else if (x.data instanceof Uint8Array) {
      crc = crc32(x.data);
      tick(x.size);
    } else crc = await crc32Blob(x.data, tick);
    const { time, date } = dosDateTime(x.date);

    const lh = new Uint8Array(30 + x.name.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, SIG_LOCAL, true);
    l.setUint16(4, 20, true); // cần bản 2.0
    l.setUint16(6, FLAG_UTF8, true);
    l.setUint16(8, 0, true); // STORE
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, x.size, true);
    l.setUint32(22, x.size, true);
    l.setUint16(26, x.name.length, true);
    l.setUint16(28, 0, true);
    lh.set(x.name, 30);
    parts.push(lh, x.data);

    const ch = new Uint8Array(46 + x.name.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, SIG_CENTRAL, true);
    c.setUint16(4, 20, true); // tạo bởi: MS-DOS, bản 2.0
    c.setUint16(6, 20, true);
    c.setUint16(8, FLAG_UTF8, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, x.size, true);
    c.setUint32(24, x.size, true);
    c.setUint16(28, x.name.length, true);
    // 30 extra, 32 chú thích, 34 đĩa, 36 thuộc tính trong, 38 thuộc tính ngoài: đều 0
    c.setUint32(42, offset, true);
    ch.set(x.name, 46);
    central.push(ch);
    offset += lh.length + x.size;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, SIG_END, true);
  e.setUint16(8, list.length, true);
  e.setUint16(10, list.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  parts.push(...central, end);
  return new Blob(parts, { type: "application/zip" });
}

// ---------- đọc ----------

export interface ZipEntry {
  name: string;
  method: number; // 0 STORE, 8 DEFLATE
  flags: number;
  crc: number;
  compSize: number;
  size: number;
  offset: number; // vị trí đầu mục (local header) trong tệp
  dir: boolean;
}

const u64 = (v: DataView, at: number) => v.getUint32(at, true) + v.getUint32(at + 4, true) * 0x100000000;

async function sigAt(b: Blob, at: number, sig: number): Promise<boolean> {
  const v = new DataView(await b.slice(at, at + 4).arrayBuffer());
  return v.byteLength === 4 && v.getUint32(0, true) === sig;
}

function decodeName(raw: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder().decode(raw);
  try {
    // nhiều trình nén ghi UTF-8 mà không bật cờ
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    // trang mã cũ (CP437...): chỉ cần đúng phần ASCII như đuôi tệp để ghép
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    return s;
  }
}

/** Đọc mục lục của gói. Ném lỗi tiếng Việt nếu không phải zip hợp lệ. */
export async function listZip(zip: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(zip.size, 22 + 0xffff + 20);
  const tailStart = zip.size - tailLen;
  const tail = new Uint8Array(await zip.slice(tailStart).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === SIG_END && i + 22 + tv.getUint16(i + 20, true) <= tail.length) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new Error("Đây không phải tệp .zip, hoặc tệp bị hỏng.");
  let count = tv.getUint16(at + 10, true);
  let cdSize = tv.getUint32(at + 12, true);
  let cdOffset = tv.getUint32(at + 16, true);
  let delta = 0;

  const loc = at - 20;
  const zip64 = loc >= 0 && tv.getUint32(loc, true) === SIG_LOC64;
  if (!zip64 && (tv.getUint16(at + 4, true) !== 0 || tv.getUint16(at + 6, true) !== 0)) {
    throw new Error("Gói bị chia thành nhiều phần, app chưa mở được. Hãy nén lại thành một tệp.");
  }
  if (zip64) {
    const recAt = u64(tv, loc + 8);
    const rec = new DataView(await zip.slice(recAt, recAt + 56).arrayBuffer());
    if (rec.byteLength < 56 || rec.getUint32(0, true) !== SIG_END64) throw new Error(ERR_BROKEN);
    count = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOffset = u64(rec, 48);
  } else {
    // gói bị chèn thêm dữ liệu phía trước (vd tệp tự giải nén): dời mọi vị trí
    const d = tailStart + at - cdSize - cdOffset;
    if (d > 0 && !(await sigAt(zip, cdOffset, SIG_CENTRAL))) delta = d;
  }

  const cd = new Uint8Array(await zip.slice(cdOffset + delta, cdOffset + delta + cdSize).arrayBuffer());
  if (cd.length < cdSize) throw new Error(ERR_BROKEN);
  const v = new DataView(cd.buffer);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== SIG_CENTRAL) throw new Error(ERR_BROKEN);
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    let compSize = v.getUint32(p + 20, true);
    let size = v.getUint32(p + 24, true);
    const nLen = v.getUint16(p + 28, true);
    const xLen = v.getUint16(p + 30, true);
    const cLen = v.getUint16(p + 32, true);
    let offset = v.getUint32(p + 42, true);
    const raw = cd.subarray(p + 46, p + 46 + nLen);
    let name = decodeName(raw, (flags & FLAG_UTF8) !== 0);
    // các trường phụ: ZIP64 (0x0001) và tên Unicode của Info-ZIP (0x7075)
    let x = p + 46 + nLen;
    const xEnd = x + xLen;
    while (x + 4 <= xEnd) {
      const tag = v.getUint16(x, true);
      const len = v.getUint16(x + 2, true);
      const d = x + 4;
      if (tag === 0x0001) {
        let q = d;
        if (size === 0xffffffff && q + 8 <= d + len) { size = u64(v, q); q += 8; }
        if (compSize === 0xffffffff && q + 8 <= d + len) { compSize = u64(v, q); q += 8; }
        if (offset === 0xffffffff && q + 8 <= d + len) { offset = u64(v, q); q += 8; }
      } else if (tag === 0x7075 && len >= 5 && v.getUint8(d) === 1 && v.getUint32(d + 1, true) === crc32(raw)) {
        name = new TextDecoder().decode(cd.subarray(d + 5, d + len));
      }
      x = d + len;
    }
    p = xEnd + cLen;
    out.push({
      name: name.replace(/\\/g, "/"),
      method, flags, crc, compSize, size,
      offset: offset + delta,
      dir: name.endsWith("/") || name.endsWith("\\"),
    });
  }
  return out;
}

async function inflateRaw(b: Blob, type: string, name: string): Promise<Blob> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Trình duyệt này không giải nén được gói. Hãy giải nén rồi thả các tệp vào.");
  }
  try {
    const ds = new DecompressionStream("deflate-raw");
    // đọc đầu ra song song với lúc ghi vào, nếu không sẽ tắc khi bộ đệm đầy
    const [, out] = await Promise.all([b.stream().pipeTo(ds.writable), new Response(ds.readable).blob()]);
    return new Blob([out], { type });
  } catch {
    throw new Error(`Tệp "${name}" trong gói bị hỏng, không giải nén được.`);
  }
}

/** Lấy nội dung một mục thành Blob (STORE: cắt thẳng, không chép). */
export async function readEntry(zip: Blob, e: ZipEntry, type = ""): Promise<Blob> {
  if (e.flags & 1) throw new Error(`Tệp "${e.name}" trong gói có mật khẩu, app không mở được.`);
  const h = new DataView(await zip.slice(e.offset, e.offset + 30).arrayBuffer());
  if (h.byteLength < 30 || h.getUint32(0, true) !== SIG_LOCAL) throw new Error(ERR_BROKEN);
  const start = e.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  if (start + e.compSize > zip.size) throw new Error(ERR_BROKEN);
  const raw = zip.slice(start, start + e.compSize, type);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw, type, e.name);
  throw new Error(`Tệp "${e.name}" nén theo kiểu app chưa đọc được. Hãy giải nén rồi thả các tệp vào.`);
}
