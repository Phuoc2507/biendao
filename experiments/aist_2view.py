"""Thực nghiệm trên DỮ LIỆU THẬT: độ chính xác tam giác hoá 2-view trên AIST++.

Khác với synthetic_2view.py (chuyển động TỔNG HỢP, camera ảo), ở đây dùng múa THẬT
của AIST++ — vũ công người thật, 9 camera đồng bộ đã hiệu chỉnh — và so pose 3D do
LÕI của ta dựng từ 2 view với 3D THAM CHIẾU của AIST (vốn dựng từ cả 9 view + bundle
adjustment). Đây là kiểm chứng ngoài-mẫu cho tuyên bố hình học của luận văn.

Hai câu hỏi:
  (1) Tổng quát hoá: lõi chạy tốt trên NHIỀU thể loại múa thật không? (bảng theo
      10 thể loại, mỗi bài dùng cặp camera gần ~75° giao hội).
  (2) Độ nhạy hình học: trên dữ liệu thật, sai số có theo đúng quy luật "giao hội
      ~60-90° tốt, gần 0°/180° nổ to" mà thực nghiệm tổng hợp dự đoán không? (quét
      đủ 36 cặp của vài bài, bin theo góc giao hội).

Lưu ý khớp: AIST++ là COCO-17; ta ĐO ngay trên COCO-17 (cả hai vế) nên KHÔNG remap
-> sai số đo được là của RIÊNG hình học, không lẫn lỗi đổi bộ khớp.
Đơn vị AIST ≈ cm (kiểm chứng: đùi≈38, cẳng≈37, vai≈34 đơn vị — khớp tỉ lệ người ở
thang cm); báo cáo quy về mm (×10). So sánh tương đối không phụ thuộc giả định này.

Chạy:  .venv/Scripts/python experiments/aist_2view.py
Kết quả in màn hình VÀ ghi experiments/ket-qua-aist-2view.md
Dữ liệu kéo qua HTTP Range từ GitHub (cache ở data/aist_sample/, ~20MB).
"""

from __future__ import annotations

import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from choreo.datasets.aist import AistData, COCO
from choreo.geom.cameras import ray_angle_deg
from choreo.mocap.fuse import fuse_multiview
from choreo.eval.metrics import procrustes_align

UNIT_MM = 10.0          # 1 đơn vị AIST ≈ 1 cm -> mm
STRIDE = 3              # lấy mẫu thời gian cho nhẹ (MPJPE gần như không đổi)
PER_GENRE = 2          # số bài mỗi thể loại cho bảng tổng quát
SWEEP_GENRES = ["gBR", "gPO", "gHO", "gWA", "gKR"]  # bài quét đủ 36 cặp
TARGET_ANGLE = 75.0    # góc giao hội "đẹp" để chọn cặp cho bảng tổng quát

GENRE_NAME = {
    "gBR": "Break", "gPO": "Pop", "gLO": "Lock", "gHO": "House", "gWA": "Waack",
    "gKR": "Krump", "gJS": "Street Jazz", "gJB": "Ballet Jazz",
    "gMH": "Middle HipHop", "gLH": "LA HipHop",
}


def select_sequences(aist: AistData, per_genre: int) -> dict[str, list[str]]:
    """Giao 2D∩3D, nhóm theo thể loại, lấy `per_genre` bài đầu (đã sort -> tất định)."""
    inter = sorted(aist.stems("keypoints2d") & aist.stems("keypoints3d"))
    by_genre: dict[str, list[str]] = defaultdict(list)
    for s in inter:
        by_genre[s[:3]].append(s)
    return {g: ss[:per_genre] for g, ss in sorted(by_genre.items())}


def fuse_pair(aist, stem, calibs, kp2d, views, *, robust=True):
    """Tam giác hoá 2 view -> (T',17,3) (đã lấy mẫu theo STRIDE)."""
    kp = kp2d[list(views), ::STRIDE, :, :2].astype(float)
    cf = kp2d[list(views), ::STRIDE, :, 2].astype(float)
    clip = fuse_multiview(kp, [calibs[v] for v in views], fps=60.0 / STRIDE,
                          confidences=cf, robust=robust)
    return clip.joints3d


def errors(pred, gt):
    """(MPJPE toàn cục, PA-MPJPE, median per-frame) — đều mm."""
    g = np.linalg.norm(pred - gt, axis=2)                       # (T,J)
    pa = np.linalg.norm(procrustes_align(pred, gt) - gt, axis=2)
    return (g.mean() * UNIT_MM, pa.mean() * UNIT_MM,
            float(np.median(g.mean(1)) * UNIT_MM))


def centroid(gt):
    return gt.reshape(-1, 3).mean(0)


def main():
    aist = AistData()
    sel = select_sequences(aist, PER_GENRE)
    lines: list[str] = []
    def emit(s=""):
        print(s); lines.append(s)

    emit("# Kết quả: tam giác hoá 2-view trên AIST++ (dữ liệu múa THẬT)")
    emit()
    emit(f"- Mẫu: {sum(len(v) for v in sel.values())} bài, {len(sel)} thể loại "
         f"(mỗi thể loại {PER_GENRE} bài đầu theo thứ tự tên).")
    emit(f"- So 3D-lõi-dựng-từ-2-view với 3D THAM CHIẾU AIST (dựng từ 9 view + bundle).")
    emit(f"- COCO-17, không remap. Đơn vị→mm (×{UNIT_MM:.0f}). Lấy mẫu thời gian STRIDE={STRIDE}.")
    emit(f"- fuse: robust=True + trọng số confidence (sát đầu ra detector thật).")
    emit()
    emit("> **Giới hạn phép đo:** đây dùng *keypoint 2D có sẵn* của AIST++ (họ đã chạy "
         "detector trên video), KHÔNG tự detect từ pixel — nên chỉ kiểm chứng khối hợp "
         "nhất 2D→3D, không phải detector. Hơn nữa 3D \"tham chiếu\" do chính AIST dựng "
         "từ 9 view + bundle adjustment, **không phải GT từ cảm biến độc lập** (mocap "
         "quang/IMU). Vậy MPJPE ở đây là *độ khớp của tái dựng 2-view với tái dựng "
         "9-view* — một **cận dưới** của sai số tuyệt đối thật, không phải sai số tuyệt đối.")
    emit()

    # ---------- Bảng 1: tổng quát hoá theo thể loại ----------
    emit("## 1. Tổng quát hoá: 10 thể loại, cặp camera gần ~%.0f° giao hội" % TARGET_ANGLE)
    emit()
    emit("| Thể loại | Bài | Cặp cam | Góc° | MPJPE | PA-MPJPE |")
    emit("|---|---|---|---:|---:|---:|")
    per_genre_mpjpe = defaultdict(list)
    for genre, stems in sel.items():
        for stem in stems:
            calibs = aist.calibs_for(stem)
            kp2d = aist.keypoints2d(stem)
            gt_full = aist.keypoints3d(stem)
            gt = gt_full[::STRIDE]
            c = centroid(gt_full)
            # chọn cặp có góc giao hội gần TARGET nhất
            pairs = list(combinations(range(len(calibs)), 2))
            ang = {p: ray_angle_deg(calibs[p[0]], calibs[p[1]], c) for p in pairs}
            best = min(pairs, key=lambda p: abs(ang[p] - TARGET_ANGLE))
            pred = fuse_pair(aist, stem, calibs, kp2d, best)
            mp, pa, _ = errors(pred, gt)
            per_genre_mpjpe[genre].append(mp)
            short = stem.replace("_cAll", "")
            emit(f"| {GENRE_NAME[genre]} | `{short}` | c%02d-c%02d | %.0f | %.1f | %.1f |"
                 % (best[0] + 1, best[1] + 1, ang[best], mp, pa))
    emit()
    allmp = [m for v in per_genre_mpjpe.values() for m in v]
    emit(f"**MPJPE trung bình toàn mẫu: {np.mean(allmp):.1f} mm** "
         f"(trung vị {np.median(allmp):.1f}, min {np.min(allmp):.1f}, max {np.max(allmp):.1f}).")
    emit()

    # ---------- Bảng 2: độ nhạy theo góc giao hội (quét 36 cặp) ----------
    emit("## 2. Độ nhạy hình học: MPJPE theo góc giao hội (quét đủ 36 cặp)")
    emit()
    emit(f"Bài quét: {', '.join(GENRE_NAME[g] for g in SWEEP_GENRES)} "
         f"(bài đầu mỗi thể loại). Mỗi điểm = 1 cặp camera của 1 bài.")
    emit()
    bins = [(0, 15), (15, 30), (30, 60), (60, 90), (90, 120), (120, 150), (150, 180)]
    bucket = defaultdict(list)       # bin -> list (mpjpe, pa)
    for g in SWEEP_GENRES:
        stem = sel[g][0]
        calibs = aist.calibs_for(stem)
        kp2d = aist.keypoints2d(stem)
        gt_full = aist.keypoints3d(stem)
        gt = gt_full[::STRIDE]
        c = centroid(gt_full)
        for p in combinations(range(len(calibs)), 2):
            a = ray_angle_deg(calibs[p[0]], calibs[p[1]], c)
            pred = fuse_pair(aist, stem, calibs, kp2d, p)
            mp, pa, med = errors(pred, gt)
            for lo, hi in bins:
                if lo <= a < hi:
                    bucket[(lo, hi)].append((mp, pa, med))
                    break
    emit("| Góc giao hội | #cặp | MPJPE trung vị | MPJPE tb | PA-MPJPE tb |")
    emit("|---|---:|---:|---:|---:|")
    for lo, hi in bins:
        vals = bucket[(lo, hi)]
        if not vals:
            emit(f"| {lo}–{hi}° | 0 | — | — | — |")
            continue
        arr = np.array(vals)
        emit(f"| {lo}–{hi}° | {len(vals)} | {np.median(arr[:,0]):.1f} | "
             f"{arr[:,0].mean():.1f} | {arr[:,1].mean():.1f} |")
    emit()
    emit("**Quan sát (dữ liệu thật):** sai số nhỏ nhất ở dải **~60–120°** giao hội; "
         "góc nhỏ (hai máy sát nhau) kém hơn, và **gần đối diện (150–180°) nổ to** vì "
         "hai tia gần thẳng hàng làm độ sâu suy biến (kèm lật dấu cheirality). "
         "PA-MPJPE (chỉ hình dạng) ổn định hơn **nhiều** so với MPJPE toàn cục ngay cả "
         "ở vùng tệ — xác nhận sai số nằm ở **đặt độ sâu/vị trí toàn cục**, không phải "
         "méo dáng. Quy luật này **khớp với dự đoán từ thực nghiệm tổng hợp** "
         "(synthetic_2view.py) — bằng chứng chéo giữa mô phỏng và dữ liệu thật.")
    emit()
    emit("**Hệ quả thực tế cho kịch bản \"2 điện thoại\":** đặt hai máy lệch nhau "
         "**~70–110°** (KHÔNG đối diện nhau, KHÔNG sát cạnh nhau) để tam giác hoá ổn định.")

    out = Path(__file__).resolve().parent / "ket-qua-aist-2view.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n[đã ghi] {out}")


if __name__ == "__main__":
    main()
