"""Bộ chạy tái lập: chạy lại TOÀN BỘ thực nghiệm tầng nhận thức, kiểm mỗi
script có tái sinh đúng file kết quả của nó, đo thời gian và trạng thái.

Mục đích (Vòng 15 — hợp nhất): biến 9 thực nghiệm rời rạc thành MỘT quy trình
tái lập duy nhất. Chạy:

    .venv/Scripts/python experiments/run_all.py

Với mỗi script: ghi lại mtime của file ket-qua-*.md TRƯỚC khi chạy, gọi script
như tiến trình con, rồi xác nhận file kết quả đã được ghi mới (mtime tăng) và
tiến trình thoát mã 0. In bảng tổng hợp và ghi experiments/bao-cao-tai-lap.md
để đính kèm phần phụ lục tái lập của luận văn.

Không tự bịa số: báo cáo chỉ nói script CHẠY ĐƯỢC và doc ĐÃ TÁI SINH; các con số
khoa học vẫn nằm trong từng ket-qua-*.md (được chính script sinh ra từ đo đạc).
"""

import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# (tên script, file kết quả kỳ vọng, vai trò Cổng 0 — một dòng).
# Thứ tự = trình tự lập luận trong §5.4 (hình học -> khử nhiễu -> đánh giá).
EXPERIMENTS = [
    ("synthetic_2view",   "ket-qua-2view-tong-hop.md",
     "Hình học đặt máy: sai số tam giác hoá theo góc/số máy/nhiễu/che khuất."),
    ("ban_do_dat_may",    "ket-qua-ban-do-dat-may.md",
     "Bản đồ 2D cặp góc phương vị -> vùng đặt 2 máy an toàn."),
    ("do_nhay_sync_calib","ket-qua-do-nhay-sync-calib.md",
     "Độ nhạy với sai số đồng bộ (lệch khung) và sai số hiệu chỉnh."),
    ("robust_outliers",   "ket-qua-robust-outliers.md",
     "Bền outlier 2D: DLT thường vs tam giác hoá bền (cổng tái chiếu)."),
    ("rang_buoc_xuong",   "ket-qua-rang-buoc-xuong.md",
     "Ràng buộc độ dài xương (PBD) khử nhiễu jitter, giữ đối xứng."),
    ("trong_so_tin_cay",  "ket-qua-trong-so-tin-cay.md",
     "Tam giác hoá có trọng số confidence: khử nhiễu mềm theo detector."),
    ("hieu_chuan_tin_cay","ket-qua-hieu-chuan-tin-cay.md",
     "Hiệu chuẩn confidence -> phương sai (điều kiện để trọng số có ích)."),
    ("tong_hop_khu_nhieu","ket-qua-tong-hop-khu-nhieu.md",
     "Capstone: cộng dồn 3 lớp khử nhiễu trên nhiễu hỗn hợp hiện thực."),
    ("danh_gia_khong_gt", "ket-qua-danh-gia-khong-gt.md",
     "Thước đo GT-free: tái chiếu camera held-out bám sát MPJPE thật."),
    ("danh_gia_loco",     "ket-qua-danh-gia-loco.md",
     "LOCO: bỏ-một-máy luân phiên -> ước lượng ổn định + chẩn đoán QA."),
    ("phan_biet_lech_he_thong", "ket-qua-phan-biet-lech.md",
     "V49: tái chiếu held-out tách detector lệch hệ thống khỏi múa sai thật (khép điểm mù V48)."),
    ("phong_thu_bo_tuc",  "ket-qua-phong-thu-bo-tuc.md",
     "V50: robust vs held-out — bổ túc, không dư thừa; robust còn HẠI ở bias hệ thống lớn."),
    ("sua_bang_held_out", "ket-qua-sua-bang-held-out.md",
     "V51: SỬA bằng loại-từng-view (LOVO) chẩn đoán held-out — đóng đúng khe bias-vừa robust để hở."),
    ("tran_dong_thuan",   "ket-qua-tran-dong-thuan.md",
     "V52: TRẦN chọn-view-đồng-thuận = floor((V-1)/2); LOVO-ngây-thơ phụ-thuộc-hướng, LOVO-bền khử confound."),
    ("moc_tuyet_doi",     "ket-qua-moc-tuyet-doi.md",
     "V53: mốc tuyệt-đối phá trần V52 CHỈ cho bias toàn-camera (mù bias 1-khớp) — hai thước bù nhau theo nguồn."),
    ("bias_tron",         "ket-qua-bias-tron.md",
     "V54: bias TRỘN — giao thức 2-tầng (anchor→LOVO) compose CÓ ĐIỀU KIỆN (envelope V−k_cam≥4), thứ tự bất-hoán."),
    ("kiem_dinh_envelope","ket-qua-kiem-dinh-envelope.md",
     "V55: kiểm định Monte-Carlo envelope V54 (gồm confound) — đếm chỉ đúng bậc-một (81.6%), phần hở rơi đúng vào vùng phụ-thuộc-hình-học."),
    ("hinh_hoc_frontier", "ket-qua-hinh-hoc-frontier.md",
     "V56: phần dư FRONTIER có phân-tách bằng hình-học rig? — tính-đoán-được pooled là ảo ảnh confound đếm (Simpson), không scalar đơn nào sống sót điều-kiện-hoá."),
]


def _run_one(name: str, doc_name: str) -> dict:
    """Chạy một script, xác nhận nó tái sinh doc. Trả về bản ghi trạng thái."""
    script = HERE / f"{name}.py"
    doc = HERE / doc_name
    before = doc.stat().st_mtime if doc.exists() else 0.0

    t0 = time.perf_counter()
    proc = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    elapsed = time.perf_counter() - t0

    after = doc.stat().st_mtime if doc.exists() else 0.0
    regenerated = after > before
    ok = proc.returncode == 0 and regenerated

    # Dòng tiêu đề đầu tiên của doc (để đối chiếu nhanh doc đúng nội dung).
    head = ""
    if doc.exists():
        for line in doc.read_text(encoding="utf-8").splitlines():
            if line.strip():
                head = line.strip().lstrip("# ").strip()
                break

    return {
        "name": name,
        "doc": doc_name,
        "ok": ok,
        "returncode": proc.returncode,
        "regenerated": regenerated,
        "elapsed": elapsed,
        "head": head,
        "stderr_tail": "\n".join(proc.stderr.strip().splitlines()[-3:]),
    }


def _fmt_report(rows: list[dict], total: float) -> str:
    npass = sum(r["ok"] for r in rows)
    L = []
    L.append("# Báo cáo tái lập — tầng nhận thức\n")
    L.append(
        "Sinh tự động bởi `experiments/run_all.py`. Mỗi dòng xác nhận script "
        "chạy được (mã thoát 0) VÀ tái sinh đúng file kết quả của nó. Các con "
        "số khoa học nằm trong từng `ket-qua-*.md` tương ứng.\n"
    )
    L.append(f"**Kết quả: {npass}/{len(rows)} thực nghiệm tái lập thành công.** "
             f"Tổng thời gian {total:.1f}s.\n")
    L.append("| # | Script | File kết quả | Trạng thái | Thời gian |")
    L.append("|---|--------|--------------|-----------|-----------|")
    for i, r in enumerate(rows, 1):
        status = "✅ OK" if r["ok"] else f"❌ (mã {r['returncode']}, tái sinh={r['regenerated']})"
        L.append(f"| {i} | `{r['name']}.py` | `{r['doc']}` | {status} | {r['elapsed']:.1f}s |")
    L.append("")
    L.append("## Tiêu đề từng doc (đối chiếu nội dung)\n")
    for i, r in enumerate(rows, 1):
        L.append(f"{i}. **{r['name']}** → {r['head']}")
    fails = [r for r in rows if not r["ok"]]
    if fails:
        L.append("\n## Lỗi\n")
        for r in fails:
            L.append(f"- `{r['name']}.py`: mã {r['returncode']}\n  ```\n  {r['stderr_tail']}\n  ```")
    L.append("")
    return "\n".join(L)


def main() -> int:
    print(f"Chạy lại {len(EXPERIMENTS)} thực nghiệm bằng {sys.executable}\n")
    rows = []
    t_all = time.perf_counter()
    for name, doc_name, role in EXPERIMENTS:
        print(f"  ▶ {name} ... ", end="", flush=True)
        r = _run_one(name, doc_name)
        rows.append(r)
        mark = "OK" if r["ok"] else f"LỖI (mã {r['returncode']}, tái sinh={r['regenerated']})"
        print(f"{mark}  ({r['elapsed']:.1f}s)")
        if not r["ok"] and r["stderr_tail"]:
            print(f"      {r['stderr_tail']}")
    total = time.perf_counter() - t_all

    out = HERE / "bao-cao-tai-lap.md"
    out.write_text(_fmt_report(rows, total), encoding="utf-8")

    npass = sum(r["ok"] for r in rows)
    print(f"\n→ {npass}/{len(rows)} thành công, tổng {total:.1f}s")
    print(f"→ Đã ghi {out}")
    return 0 if npass == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
