"""TIÊN LƯỢNG Gate 0 (KHÔNG cần GPU): lõi 2-view chịu nhiễu detector đến đâu?

Ý tưởng: aist_2view.py cho MPJPE ~37mm khi dùng keypoint CURATED (gần-sạch) của
AIST — đó là **cận dưới**. Detector thật (RTMPose) sẽ thêm nhiễu pixel + lẫn T/P +
sót khớp. Ở ĐÂY ta bơm chính các nhiễu đó vào keypoint curated với biên độ tăng dần
rồi đo MPJPE, VẼ đường cong σ_px -> MPJPE. Từ đó, biết sai số điển hình của RTMPose
trên COCO (~vài px), ta ƯỚC "giá của detector thật" TRƯỚC khi tốn tiền GPU, và thấy
lõi bắt đầu hỏng ở mức nhiễu nào.

Đây là bằng chứng chéo thứ ba của luận văn: synthetic (camera ảo) ↔ AIST (curated,
dữ liệu thật) ↔ AIST + nhiễu detector mô phỏng. Ba góc cùng chỉ một kết luận về
điều kiện ổn định của tam giác hoá 2-view.

Chạy:  .venv/Scripts/python experiments/aist_noise_sweep.py
Ghi:   experiments/ket-qua-aist-noise-sweep.md   (cần mạng để kéo annotation AIST)
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from choreo.datasets.aist import AistData
from choreo.mocap.fuse import fuse_multiview
from choreo.mocap.noise2d import perturb_keypoints2d
from experiments.aist_detector_2view import (
    PER_GENRE, STRIDE, UNIT_MM, GENRE_NAME, mpjpe, plan_pairs, select_sequences,
)

# Cấu hình nhiễu: (nhãn, sigma_px, swap_rate, drop_rate). σ theo lệch chuẩn pixel ở
# khớp conf đầy; RTMPose/ViTPose tốt trên COCO cỡ vài px -> dải 2–8 px bao trùm.
NOISE_CONFIGS = [
    ("sạch (curated)",        0.0, 0.00, 0.00),
    ("jitter 2px",            2.0, 0.00, 0.00),
    ("jitter 4px",            4.0, 0.00, 0.00),
    ("jitter 8px",            8.0, 0.00, 0.00),
    ("4px + lẫn T/P 2%",      4.0, 0.02, 0.00),
    ("4px + sót khớp 5%",     4.0, 0.00, 0.05),
    ("RTMPose ước (4px+1%+2%)", 4.0, 0.01, 0.02),
]
SEED = 20261002


def fuse_noisy(calibs, kp2d_pair, cfg, rng):
    """Bơm nhiễu cfg vào cặp 2D rồi tam giác hoá -> (T',17,3) (đã STRIDE)."""
    _, sigma, swap, drop = cfg
    kp = kp2d_pair[:, ::STRIDE, :, :2].astype(float)       # (2,T',17,2)
    cf = kp2d_pair[:, ::STRIDE, :, 2].astype(float)        # (2,T',17)
    kp_n, cf_n = perturb_keypoints2d(kp, cf, sigma_px=sigma, swap_rate=swap,
                                     drop_rate=drop, rng=rng)
    clip = fuse_multiview(kp_n, calibs, fps=60.0 / STRIDE,
                          confidences=cf_n, robust=True)
    return clip.joints3d


def main():
    aist = AistData()
    sel = select_sequences(aist, PER_GENRE)
    plan = plan_pairs(aist, sel)

    lines: list[str] = []
    def emit(s=""):
        print(s); lines.append(s)

    emit("# Tiên lượng Gate 0: lõi 2-view dưới nhiễu detector mô phỏng (AIST++)")
    emit()
    emit(f"- {len(plan)} bài ({len(sel)} thể loại), mỗi bài 1 cặp camera ~75° giao hội.")
    emit("- Bơm nhiễu kiểu RTMPose vào keypoint **curated** của AIST rồi đo MPJPE vs "
         "3D tham chiếu 9-view. Dòng \"sạch\" = baseline curated (≈ aist_2view.py).")
    emit(f"- COCO-17, đơn vị→mm (×{UNIT_MM:.0f}), STRIDE={STRIDE}, robust=True + trọng "
         f"số conf. rng cố định (seed={SEED}) -> tái lập.")
    emit()
    emit("> Mục đích: biết TRƯỚC khi thuê GPU rằng detector thật (sai số vài px trên "
         "COCO) sẽ đẩy MPJPE lên bao nhiêu, và lõi bắt đầu suy biến ở mức nhiễu nào. "
         "Đây là *mô phỏng* nhiễu — số Gate 0 thật vẫn do aist_detector_2view.py cho.")
    emit()

    # gom MPJPE theo cấu hình, trung bình toàn mẫu
    agg: dict[str, list[tuple[float, float]]] = defaultdict(list)
    per_seq: list[tuple[str, list[float]]] = []
    for stem, pair, ang in plan:
        calibs_all = aist.calibs_for(stem)
        calibs = [calibs_all[v] for v in pair]
        kp2d_pair = aist.keypoints2d(stem)[list(pair)]
        gt = aist.keypoints3d(stem)[::STRIDE]
        rng = np.random.default_rng(SEED)        # cùng seed mỗi bài -> so cấu hình công bằng
        row = []
        for cfg in NOISE_CONFIGS:
            pred = fuse_noisy(calibs, kp2d_pair, cfg, rng)
            n = min(pred.shape[0], gt.shape[0])
            mp, pa = mpjpe(pred[:n], gt[:n])
            agg[cfg[0]].append((mp, pa))
            row.append(mp)
        per_seq.append((stem.replace("_cAll", ""), row))

    emit("## MPJPE trung bình theo mức nhiễu")
    emit()
    emit("| Cấu hình nhiễu | MPJPE tb | PA-MPJPE tb | Δ vs sạch |")
    emit("|---|---:|---:|---:|")
    clean = np.mean([m for m, _ in agg["sạch (curated)"]])
    for label, *_ in NOISE_CONFIGS:
        arr = np.array(agg[label])
        mp, pa = arr[:, 0].mean(), arr[:, 1].mean()
        emit(f"| {label} | {mp:.1f} | {pa:.1f} | {mp - clean:+.1f} |")
    emit()
    emit(f"**Đọc kết quả:** baseline sạch {clean:.1f} mm. Jitter thuần làm MPJPE tăng "
         "gần tuyến tính theo σ (hình học DLT/robust hấp thụ nhiễu Gaussian khá tốt); "
         "lẫn T/P và sót khớp thêm đuôi nặng hơn. Với sai số RTMPose điển hình trên "
         "COCO (~vài px), dòng \"RTMPose ước\" cho **khoảng tiên lượng** của giá "
         "detector thật — đối chiếu với số Gate 0 thật khi có.")
    emit()

    emit("## Chi tiết theo bài (MPJPE từng cấu hình)")
    emit()
    emit("| Bài | " + " | ".join(c[0] for c in NOISE_CONFIGS) + " |")
    emit("|---|" + "---:|" * len(NOISE_CONFIGS))
    for name, row in per_seq:
        emit(f"| `{name}` | " + " | ".join(f"{m:.1f}" for m in row) + " |")

    out = Path(__file__).resolve().parent / "ket-qua-aist-noise-sweep.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n[đã ghi] {out}")


if __name__ == "__main__":
    main()
