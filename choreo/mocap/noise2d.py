"""Mô hình nhiễu DETECTOR 2D — bơm lỗi kiểu RTMPose/ViTPose vào keypoint "sạch".

Dùng để TIÊN LƯỢNG Gate 0 mà KHÔNG cần GPU: lấy keypoint 2D curated của AIST (coi
như gần-sạch), bơm nhiễu giống đầu ra detector thật, đưa qua cùng lõi fuse rồi đo
MPJPE suy giảm theo mức nhiễu. Đường cong σ_px -> MPJPE cho biết TRƯỚC khi thuê GPU
rằng "giá của detector thật" rơi vào khoảng nào, và lõi chịu nhiễu đến đâu.

Ba nguồn lỗi của pose detector thật (theo tài liệu COCO/OKS):
  (1) JITTER pixel — Gaussian quanh vị trí đúng, NẶNG hơn ở khớp tin cậy thấp
      (bị che/mờ). Đây là lỗi áp đảo ở detector tốt.
  (2) LẪN TRÁI/PHẢI — thi thoảng tráo một cặp khớp đối xứng (cổ tay T<->P...),
      lỗi đặc trưng khi vũ công xoay lưng/nghiêng.
  (3) SÓT KHỚP — một số khớp không được phát hiện ở vài frame -> NaN (fuse lấp).

Thuần numpy, tất định theo rng -> tái lập được, test được, không chạm GPU/mạng.
"""

from __future__ import annotations

import numpy as np

from choreo.datasets.aist import COCO17_NAMES

# Cặp khớp trái/phải (suy ra từ tên l_* / r_*) để mô phỏng lẫn T/P của detector.
COCO_LR_PAIRS: list[tuple[int, int]] = [
    (COCO17_NAMES.index(f"l_{b}"), COCO17_NAMES.index(f"r_{b}"))
    for b in ("eye", "ear", "shoulder", "elbow", "wrist", "hip", "knee", "ankle")
]


def perturb_keypoints2d(
    kp: np.ndarray,
    conf: np.ndarray,
    *,
    sigma_px: float,
    swap_rate: float = 0.0,
    drop_rate: float = 0.0,
    rng: np.random.Generator,
    lr_pairs: list[tuple[int, int]] = COCO_LR_PAIRS,
) -> tuple[np.ndarray, np.ndarray]:
    """Bơm nhiễu detector vào keypoint 2D sạch. Trả (kp_nhiễu, conf_nhiễu).

    kp:  (V,T,J,2) pixel.  conf: (V,T,J) độ tin cậy trong [0,1].
    sigma_px: lệch chuẩn jitter ở khớp tin cậy ĐẦY (conf=1). Khớp conf thấp bị
        nhân tới ×2 (sigma_eff = sigma_px*(2-conf)) — mô phỏng "mờ thì lệch nhiều".
    swap_rate: xác suất mỗi (view,frame) tráo MỘT cặp L/R ngẫu nhiên.
    drop_rate: xác suất mỗi (view,frame,joint) bị sót -> toạ độ NaN, conf 0.
    sigma_px=0, swap_rate=0, drop_rate=0 -> trả lại y nguyên (đồng nhất).
    """
    if sigma_px < 0 or not 0 <= swap_rate <= 1 or not 0 <= drop_rate <= 1:
        raise ValueError("sigma_px>=0, swap_rate/drop_rate trong [0,1]")
    kp = np.asarray(kp, dtype=float)
    conf = np.asarray(conf, dtype=float)
    if kp.ndim != 4 or kp.shape[-1] != 2 or conf.shape != kp.shape[:3]:
        raise ValueError(f"kp phải (V,T,J,2) và conf (V,T,J); nhận {kp.shape}, {conf.shape}")
    V, T, J, _ = kp.shape
    out = kp.copy()
    oconf = conf.copy()

    # (1) jitter Gaussian, biên độ tỉ lệ nghịch độ tin cậy
    if sigma_px > 0:
        sigma_eff = sigma_px * (2.0 - np.clip(conf, 0.0, 1.0))      # (V,T,J)
        out += rng.normal(size=out.shape) * sigma_eff[..., None]

    # (2) lẫn trái/phải: mỗi (view,frame) có xác suất tráo 1 cặp đối xứng
    if swap_rate > 0 and lr_pairs:
        hit = rng.random((V, T)) < swap_rate
        for v, t in zip(*np.nonzero(hit)):
            a, b = lr_pairs[rng.integers(len(lr_pairs))]
            out[v, t, [a, b]] = out[v, t, [b, a]]
            oconf[v, t, [a, b]] = oconf[v, t, [b, a]]

    # (3) sót khớp -> NaN + conf 0 (fuse sẽ lấp bằng nội suy thời gian)
    if drop_rate > 0:
        drop = rng.random((V, T, J)) < drop_rate
        out[drop] = np.nan
        oconf[drop] = 0.0

    return out, oconf
