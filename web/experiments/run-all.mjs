// RUNNER TÁI LẬP tầng ĐÁNH GIÁ (web/TS) — song hành với ../../experiments/run_all.py (numpy).
// Chạy lại TẤT CẢ script thực nghiệm headless, xác nhận mỗi cái: (1) thoát 0 (không ném),
// (2) sinh output có nghĩa, (3) TẤT ĐỊNH — chạy 2 lần cho stdout BYTE Y HỆT. Báo bảng + thời gian.
//
// Chạy (trong web/):  node experiments/run-all.mjs
// Không cần cài thêm: dùng esbuild JS API (đã có trong node_modules) để bundle từng script
// ra CJS tạm rồi chạy bằng chính Node này — né wrapper .bin trên Windows.

import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Thứ tự theo vòng nghiên cứu (V35→V42) để đọc như một mạch.
const SCRIPTS = [
  ["phase-sync-validation.ts", "V35 tách pha vs tức thời"],
  ["phase-limits.ts",          "V36 đo giới hạn rigid-τ"],
  ["coarse-to-fine.ts",        "V36 thô→tinh + nới maxLag"],
  ["affine-warp.ts",           "V37 nguyên mẫu affine τ×ρ (cặp)"],
  ["affine-validation.ts",     "V39 affine toàn pipeline (kết quả âm)"],
  ["failure-frontier.ts",      "V40 bản đồ biên gãy"],
  ["breakdown-point.ts",       "V41 điểm sụp — trần 50%"],
  ["absolute-reference.ts",    "V42 chấm tuyệt đối — phá trần 50%"],
  ["gate-sensitivity.ts",      "V44 độ nhạy tham số — đường đặc trưng vận hành"],
  ["ratio-scapegoat.ts",       "V46 độ nhạy RATIO — chống đổ oan, trần 50% hiện hình"],
  ["noise-robustness.ts",      "V47 bền với nhiễu detector — cổng RATIO lọc nhiễu iid"],
  ["structured-noise.ts",      "V48 nhiễu có cấu trúc — điểm mù lỗi hệ thống 1 người + phòng thủ xuyên tầng"],
];

const work = mkdtempSync(join(tmpdir(), "choreo-eval-"));

function bundleAndRun(tsFile) {
  const out = join(work, tsFile.replace(/\.ts$/, ".cjs"));
  buildSync({
    entryPoints: [join(HERE, tsFile)],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  // maxBuffer rộng cho script in nhiều bảng.
  return execFileSync(process.execPath, [out], { encoding: "utf8", maxBuffer: 32 << 20 });
}

// Loại token THỜI GIAN TƯỜNG (vd "  123 ms") khỏi phép so tất định: vài script CÓ CHỦ Ý
// in chi phí đo được (coarse-to-fine benchmark) — dao động hợp lệ, KHÔNG phải phi tất định
// về KẾT QUẢ. Chỉ chuẩn hoá để so, output hiển thị vẫn giữ nguyên số ms thật.
// Thu gọn cả KHOẢNG TRẮNG NGANG sau khi bỏ ms: số ms in bằng padStart(width) cố định, nên khi
// timing vượt mốc chữ số giữa 2 lần (vd 9972→10231, 4↔5 chữ số) phần đệm canh lề đổi 1 space;
// regex ms nuốt chữ số+"ms" nhưng KHÔNG nuốt space đệm phía trước → " <ms>" vs "<ms>" lệch giả.
// Gộp mọi dải space/tab về 1 ký tự triệt tiêu lệch-đệm này mà VẪN bắt khác biệt kết quả thật
// (chữ/số khác nhau vẫn khác sau khi gộp). Đây là lỗi ngắt quãng của RUNNER, không phải script.
const normalize = (s) => s.replace(/\d+(\.\d+)?\s*ms/g, "<ms>").replace(/[ \t]+/g, " ");

let allOk = true;
const rows = [];
const t0 = Date.now();

for (const [file, label] of SCRIPTS) {
  const started = Date.now();
  let status = "OK", note = "";
  try {
    const a = bundleAndRun(file);
    const b = bundleAndRun(file); // lần 2: kiểm tất định
    const lines = a.split("\n").filter((l) => l.trim().length > 0).length;
    if (lines < 3 || !/[#|]/.test(a)) { status = "TRỐNG?"; note = `chỉ ${lines} dòng`; allOk = false; }
    else if (normalize(a) !== normalize(b)) { status = "KHÔNG TẤT ĐỊNH"; note = "stdout 2 lần KHÁC nhau (ngoài timing)"; allOk = false; }
    else { note = `${lines} dòng, tất định`; }
  } catch (e) {
    status = "NÉM LỖI"; note = String(e.message || e).split("\n")[0].slice(0, 80); allOk = false;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  rows.push({ file, label, status, secs, note });
  console.log(`[${status === "OK" ? "✓" : "✗"}] ${file.padEnd(26)} ${secs.padStart(5)}s  ${label} — ${note}`);
}

const total = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${rows.filter((r) => r.status === "OK").length}/${rows.length} script tái lập sạch (chạy 2 lần) — tổng ${total}s.`);
rmSync(work, { recursive: true, force: true });

if (!allOk) {
  console.error("CÓ script hỏng — xem cột trạng thái ở trên.");
  process.exit(1);
}
console.log("Tất cả thực nghiệm tầng đánh giá tái lập được và TẤT ĐỊNH.");
