import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  crc32, crc32Update, crc32Blob, dosDateTime, makeZip, listZip, readEntry,
  zipSize, checkZipLimits, ERR_TOO_BIG,
} from "./zip.ts";

const enc = new TextEncoder();
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const text = async (b: Blob) => new TextDecoder().decode(await bytes(b));

function noise(n: number, seed = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

// ---- dựng tay gói zip kiểu khác (DEFLATE, ZIP64, không cờ UTF-8...) ----
const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const u64 = (n: number) => [...u32(n >>> 0), ...u32(Math.floor(n / 2 ** 32))];

interface RawEntry {
  name: string | Uint8Array;
  flags?: number;
  method: number;
  stored: Uint8Array; // dữ liệu đúng như nằm trong gói (đã nén nếu DEFLATE)
  size: number;
  crc: number;
  extra?: number[]; // trường phụ trong mục lục
  localExtra?: number[];
  descriptor?: boolean; // bit 3: cỡ và CRC nằm sau dữ liệu
}

function rawZip(list: RawEntry[], o: { zip64?: boolean; prefix?: number } = {}): Blob {
  const out: number[] = Array.from({ length: o.prefix ?? 0 }, (_, i) => i & 0xff);
  const cd: number[] = [];
  for (const e of list) {
    const name = [...(typeof e.name === "string" ? enc.encode(e.name) : e.name)];
    const flags = (e.flags ?? 0) | (e.descriptor ? 8 : 0);
    const lx = e.localExtra ?? [];
    const offset = out.length;
    const big = o.zip64 ? 0xffffffff : -1;
    out.push(
      ...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(e.method), ...u16(0), ...u16(0x21),
      ...u32(e.descriptor ? 0 : e.crc), ...u32(e.descriptor ? 0 : e.stored.length), ...u32(e.descriptor ? 0 : e.size),
      ...u16(name.length), ...u16(lx.length), ...name, ...lx, ...e.stored,
    );
    if (e.descriptor) out.push(...u32(0x08074b50), ...u32(e.crc), ...u32(e.stored.length), ...u32(e.size));
    const x = [...(e.extra ?? [])];
    if (o.zip64) x.push(...u16(1), ...u16(24), ...u64(e.size), ...u64(e.stored.length), ...u64(offset));
    cd.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(e.method), ...u16(0), ...u16(0x21),
      ...u32(e.crc), ...u32(big >= 0 ? big : e.stored.length), ...u32(big >= 0 ? big : e.size),
      ...u16(name.length), ...u16(x.length), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(big >= 0 ? big : offset), ...name, ...x,
    );
  }
  const cdOffset = out.length;
  out.push(...cd);
  if (o.zip64) {
    const rec = out.length;
    out.push(
      ...u32(0x06064b50), ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0),
      ...u64(list.length), ...u64(list.length), ...u64(cd.length), ...u64(cdOffset),
    );
    out.push(...u32(0x07064b50), ...u32(0), ...u64(rec), ...u32(1));
    out.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(0xffff), ...u16(0xffff), ...u32(0xffffffff), ...u32(0xffffffff), ...u16(0));
  } else {
    out.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(list.length), ...u16(list.length), ...u32(cd.length), ...u32(cdOffset), ...u16(0));
  }
  return new Blob([new Uint8Array(out)]);
}

// ---------- CRC ----------

test("CRC-32 chuẩn: \"123456789\" = 0xCBF43926", () => {
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("CRC-32 tính dần từng khúc và đọc từ blob khớp cả khối", async () => {
  const d = noise(70000, 7);
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i += 4096) c = crc32Update(c, d.subarray(i, i + 4096));
  assert.equal((c ^ 0xffffffff) >>> 0, crc32(d));
  let seen = 0;
  const b = new Blob([d.slice(0, 1000), d.slice(1000)]);
  assert.equal(await crc32Blob(b, (n) => (seen += n)), crc32(d));
  assert.equal(seen, d.length);
});

test("giờ DOS: giây làm tròn xuống số chẵn, năm kẹp từ 1980", () => {
  const { time, date } = dosDateTime(new Date(2026, 9, 12, 14, 30, 47));
  assert.equal(time, (14 << 11) | (30 << 5) | 23);
  assert.equal(date, (46 << 9) | (10 << 5) | 12);
  assert.equal(dosDateTime(new Date(1970, 0, 1)).date >> 9, 0);
});

// ---------- ghi rồi đọc lại ----------

test("ghi rồi đọc lại: tên tiếng Việt UTF-8, đủ byte, đúng CRC", async () => {
  const music = noise(5000, 3);
  const vidA = noise(3000, 4), vidB = noise(2500, 5);
  const items = [
    { name: "ĐỌC-TÔI.txt", data: "Xin chào, đây là gói bài múa.\r\n" },
    { name: "nhac/Bài múa Hương Sen.mp3", data: new Blob([music], { type: "audio/mpeg" }) },
    { name: "video/Hương.card.mp4", data: new Blob([vidA, vidB]) },
    { name: "video/rỗng.txt", data: new Uint8Array(0) },
  ];
  const seen: number[] = [];
  const zip = await makeZip(items, { date: new Date(2026, 9, 12, 9, 0, 0), onProgress: (d) => seen.push(d) });
  assert.equal(zip.type, "application/zip");
  const nameBytes = items.map((it) => enc.encode(it.name).length);
  const sizes = [enc.encode(items[0].data as string).length, music.length, vidA.length + vidB.length, 0];
  assert.equal(zip.size, zipSize(nameBytes.map((n, i) => ({ nameBytes: n, size: sizes[i] }))));
  assert.equal(seen[seen.length - 1], sizes.reduce((a, b) => a + b, 0));

  const head = await bytes(zip.slice(0, 4));
  assert.deepEqual([...head], [0x50, 0x4b, 0x03, 0x04]);

  const list = await listZip(zip);
  assert.deepEqual(list.map((e) => e.name), items.map((it) => it.name));
  for (const e of list) {
    assert.equal(e.method, 0);
    assert.equal(e.flags & 0x0800, 0x0800);
    assert.equal(e.dir, false);
  }
  assert.equal(await text(await readEntry(zip, list[0])), "Xin chào, đây là gói bài múa.\r\n");
  const m = await readEntry(zip, list[1], "audio/mpeg");
  assert.equal(m.type, "audio/mpeg");
  assert.deepEqual(await bytes(m), music);
  assert.equal(list[1].crc, crc32(music));
  const v = await bytes(await readEntry(zip, list[2]));
  assert.deepEqual(v, new Uint8Array([...vidA, ...vidB]));
  assert.equal(list[2].size, 5500);
  assert.equal((await readEntry(zip, list[3])).size, 0);
});

test("gói rỗng vẫn đọc được", async () => {
  const zip = await makeZip([]);
  assert.equal(zip.size, 22);
  assert.deepEqual(await listZip(zip), []);
});

test("gói bị chèn dữ liệu phía trước (kiểu tệp tự giải nén) vẫn mở được", async () => {
  const d = noise(1234, 9);
  const zip = await makeZip([{ name: "video/Lan.mp4", data: d }]);
  const fat = new Blob([noise(777, 2), zip]);
  const [e] = await listZip(fat);
  assert.equal(e.name, "video/Lan.mp4");
  assert.deepEqual(await bytes(await readEntry(fat, e)), d);
});

// ---------- gói do trình khác nén lại ----------

test("đọc mục DEFLATE (như Windows/Zalo nén lại), kể cả có data descriptor", async () => {
  const plain = enc.encode("Đội hình 1: chữ V\n".repeat(200));
  const packed = new Uint8Array(deflateRawSync(plain));
  assert.ok(packed.length < plain.length);
  const json = enc.encode('{"version":1,"title":"Bài múa"}');
  const zip = rawZip([
    { name: "Bài múa/project.choreo.json", flags: 0x0800, method: 8, stored: new Uint8Array(deflateRawSync(json)), size: json.length, crc: crc32(json) },
    { name: "Bài múa/ghi-chú.txt", flags: 0x0800, method: 8, stored: packed, size: plain.length, crc: crc32(plain), descriptor: true, localExtra: [0x55, 0x54, 5, 0, 1, 0, 0, 0, 0] },
  ]);
  const list = await listZip(zip);
  assert.deepEqual(list.map((e) => [e.name, e.method]), [["Bài múa/project.choreo.json", 8], ["Bài múa/ghi-chú.txt", 8]]);
  assert.equal(await text(await readEntry(zip, list[0], "application/json")), '{"version":1,"title":"Bài múa"}');
  const out = await readEntry(zip, list[1], "text/plain");
  assert.equal(out.type, "text/plain");
  assert.deepEqual(await bytes(out), plain);
});

test("tên không bật cờ UTF-8: vẫn đọc UTF-8, tên Unicode của Info-ZIP được ưu tiên, \\ thành /", async () => {
  const d = enc.encode("abc");
  const latin = new Uint8Array([0x48, 0x75, 0x6f, 0x6e, 0x67, 0x9f, 0x2e, 0x6d, 0x70, 0x34]); // "Huong?.mp4" trang mã cũ
  const uni = enc.encode("video/Hương.mp4");
  const zip = rawZip([
    { name: "nhac\\Bài.mp3", method: 0, stored: d, size: 3, crc: crc32(d) },
    { name: latin, method: 0, stored: d, size: 3, crc: crc32(d), extra: [...u16(0x7075), ...u16(5 + uni.length), 1, ...u32(crc32(latin)), ...uni] },
    { name: latin, method: 0, stored: d, size: 3, crc: crc32(d) },
  ]);
  const list = await listZip(zip);
  assert.equal(list[0].name, "nhac/Bài.mp3");
  assert.equal(list[1].name, "video/Hương.mp4");
  assert.ok(list[2].name.startsWith("Huong") && list[2].name.endsWith(".mp4"));
  assert.equal(await text(await readEntry(zip, list[2])), "abc");
});

test("đọc gói ZIP64", async () => {
  const a = noise(300, 11), b = enc.encode("Thành viên: Hà, Hương");
  const zip = rawZip(
    [
      { name: "video/Hà.mp4", flags: 0x0800, method: 0, stored: a, size: a.length, crc: crc32(a) },
      { name: "ĐỌC-TÔI.txt", flags: 0x0800, method: 0, stored: b, size: b.length, crc: crc32(b) },
    ],
    { zip64: true },
  );
  const list = await listZip(zip);
  assert.deepEqual(list.map((e) => [e.name, e.size, e.compSize]), [["video/Hà.mp4", 300, 300], ["ĐỌC-TÔI.txt", b.length, b.length]]);
  assert.deepEqual(await bytes(await readEntry(zip, list[0])), a);
  assert.equal(await text(await readEntry(zip, list[1])), "Thành viên: Hà, Hương");
});

// ---------- lỗi ----------

test("không phải zip, mục có mật khẩu, kiểu nén lạ: báo lỗi tiếng Việt", async () => {
  await assert.rejects(listZip(new Blob(["chỉ là chữ thường"])), /không phải tệp \.zip/);
  const d = enc.encode("xyz");
  const zip = rawZip([
    { name: "kín.mp4", flags: 1, method: 0, stored: d, size: 3, crc: crc32(d) },
    { name: "lạ.mp4", method: 14, stored: d, size: 3, crc: crc32(d) },
  ]);
  const [locked, odd] = await listZip(zip);
  await assert.rejects(readEntry(zip, locked), /mật khẩu/);
  await assert.rejects(readEntry(zip, odd), /chưa đọc được/);
  // cắt cụt giữa chừng: mục lục chỉ tới chỗ không còn dữ liệu
  const full = await makeZip([{ name: "a.mp4", data: noise(500) }]);
  await assert.rejects(listZip(full.slice(0, 200)), /zip/);
});

test("giới hạn 4 GB và 65 535 tệp", () => {
  assert.doesNotThrow(() => checkZipLimits([{ nameBytes: 20, size: 3.9e9 }]));
  assert.throws(() => checkZipLimits([{ nameBytes: 20, size: 3e9 }, { nameBytes: 20, size: 1.3e9 }]), (e: Error) => e.message === ERR_TOO_BIG);
  assert.throws(() => checkZipLimits(Array.from({ length: 70000 }, () => ({ nameBytes: 5, size: 1 }))), /65 535/);
  assert.equal(zipSize([]), 22);
  assert.equal(zipSize([{ nameBytes: 3, size: 10 }]), 22 + 30 + 46 + 6 + 10);
});
