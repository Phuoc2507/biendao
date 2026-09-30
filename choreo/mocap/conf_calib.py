"""Hiệu chuẩn confidence của detector 2D thành phương sai nhiễu (px) — KHÔNG cần 3D GT.

Vòng 10 kết luận: trọng số nghịch-phương-sai w=1/σ² là cách đúng để dùng confidence,
NHƯNG chỉ đúng khi σ là **phương sai thật** của nhiễu 2D. Confidence sống (raw) của
detector KHÔNG phải phương sai: nó là một điểm số đơn điệu-nhưng-méo (thang phi tuyến,
lệch giữa các detector). Đưa thẳng raw confidence vào 1/conf² là **giả định hiệu chuẩn
sai** → lợi ích tan biến hoặc âm.

Module này hiệu chuẩn ánh xạ confidence → σ(px) từ **sai số tái chiếu** trên tập
validation. Điểm hay: sai số tái chiếu **đo được mà không cần 3D ground-truth** (chiếu
điểm 3D đã dựng về lại từng view rồi so với 2D quan sát) — nên hiệu chuẩn này chạy được
ngay trên dữ liệu thật ở Cổng 0, không cần hệ mocap tham chiếu.

Ràng buộc đơn điệu (σ giảm khi confidence tăng) áp bằng hồi quy đơn điệu PAV
(pool-adjacent-violators) để bản đồ ổn định dù mỗi bin ít mẫu.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def per_view_reproj_residual(
    joints3d: np.ndarray,
    keypoints2d: np.ndarray,
    proj_mats: np.ndarray,
) -> np.ndarray:
    """Sai số tái chiếu mỗi quan sát (px), KHÔNG cần 3D GT.

    joints3d: (T, J, 3) điểm 3D đã dựng (hệ world).
    keypoints2d: (V, T, J, 2) toạ độ 2D quan sát mỗi view (NaN = thiếu).
    proj_mats: (V, 3, 4) ma trận chiếu mỗi view.
    Trả về (V, T, J) khoảng cách pixel giữa chiếu-lại và 2D quan sát; NaN ở đâu 2D
    thiếu hoặc 3D không dựng được (NaN).
    """
    X = np.asarray(joints3d, dtype=np.float64)
    kp = np.asarray(keypoints2d, dtype=np.float64)
    P = np.asarray(proj_mats, dtype=np.float64)
    V, T, J, _ = kp.shape
    if X.shape != (T, J, 3):
        raise ValueError(f"joints3d phải (T,J,3)={(T, J, 3)}, nhận {X.shape}")
    if P.shape != (V, 3, 4):
        raise ValueError(f"proj_mats phải (V,3,4)={(V, 3, 4)}, nhận {P.shape}")

    Xh = np.concatenate([X, np.ones((T, J, 1))], axis=-1)     # (T,J,4)
    res = np.full((V, T, J), np.nan, dtype=np.float64)
    for v in range(V):
        proj = np.einsum("ab,tjb->tja", P[v], Xh)            # (T,J,3)
        z = proj[..., 2]
        ok = np.abs(z) > 1e-9
        uv = np.full((T, J, 2), np.nan)
        uv[ok] = proj[ok][:, :2] / z[ok][:, None]
        d = np.linalg.norm(uv - kp[v], axis=-1)              # (T,J)
        res[v] = d
    return res


def _pav_nonincreasing(y: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Hồi quy đơn điệu KHÔNG TĂNG theo trọng số (pool-adjacent-violators).

    Trả về dãy khớp gần y nhất (bình phương có trọng số) mà không tăng dần. Dùng để
    ép σ(confidence) giảm khi confidence tăng (bin xếp theo confidence tăng dần).
    """
    # PAV cho không-giảm rồi lật dấu để thành không-tăng.
    yy = -y.astype(np.float64)
    vals = list(yy)
    wts = list(w.astype(np.float64))
    idx = [[i] for i in range(len(yy))]
    i = 0
    while i < len(vals) - 1:
        if vals[i] > vals[i + 1] + 1e-15:                    # vi phạm không-giảm -> gộp
            tw = wts[i] + wts[i + 1]
            vals[i] = (vals[i] * wts[i] + vals[i + 1] * wts[i + 1]) / tw
            wts[i] = tw
            idx[i] = idx[i] + idx[i + 1]
            del vals[i + 1], wts[i + 1], idx[i + 1]
            if i > 0:
                i -= 1
        else:
            i += 1
    out = np.empty_like(yy)
    for block_val, block_idx in zip(vals, idx):
        for k in block_idx:
            out[k] = block_val
    return -out


@dataclass
class ConfCalibration:
    """Bản đồ confidence → σ(px) đã hiệu chuẩn (nội suy tuyến tính theo tâm bin)."""
    conf_centers: np.ndarray     # (B,) tâm bin, tăng dần
    sigma: np.ndarray            # (B,) σ px đã ép đơn điệu không tăng

    def sigma_of(self, conf: np.ndarray) -> np.ndarray:
        c = np.asarray(conf, dtype=np.float64)
        return np.interp(c, self.conf_centers, self.sigma)

    def weight_of(self, conf: np.ndarray, floor_px: float = 0.5) -> np.ndarray:
        """Bội số hàng DLT cho khớp Gauss–Markov (nghịch-phương-sai) từ σ đã hiệu chuẩn.

        `triangulate_dlt` nhân MỖI HÀNG của một view với trọng số, nên đóng góp bình
        phương của view đó tỉ lệ (bội số)². Muốn khớp bình phương tối thiểu có trọng số
        1/σ² (tối ưu Gauss–Markov cho nhiễu Gaussian) thì bội số hàng = **1/σ**, không
        phải 1/σ². Chặn dưới σ (floor_px) để tránh chia 0 khi confidence rất cao.
        """
        s = np.maximum(self.sigma_of(conf), floor_px)
        return 1.0 / s


def calibrate_confidence(
    conf: np.ndarray,
    residual_px: np.ndarray,
    n_bins: int = 12,
    min_count: int = 20,
) -> ConfCalibration:
    """Học bản đồ confidence → σ(px) từ (confidence, sai số tái chiếu) trên validation.

    conf, residual_px: cùng shape bất kỳ; làm phẳng. Bỏ cặp có NaN.
    Chia confidence thành n_bins theo phân vị (mỗi bin ~đều số mẫu), ước σ mỗi bin =
    RMS của residual trong bin (proxy độ lệch chuẩn nhiễu 2D). Ép σ **không tăng** theo
    confidence bằng PAV. Bin quá ít mẫu (<min_count) bị gộp trọng số nhỏ, PAV tự làm mượt.
    """
    c = np.asarray(conf, dtype=np.float64).ravel()
    r = np.asarray(residual_px, dtype=np.float64).ravel()
    ok = np.isfinite(c) & np.isfinite(r)
    c, r = c[ok], r[ok]
    if c.size < n_bins:
        raise ValueError(f"Cần >= {n_bins} mẫu hợp lệ, chỉ có {c.size}")

    # Bin theo phân vị để mỗi bin ~đều số mẫu (ổn định hơn bin đều theo giá trị).
    qs = np.quantile(c, np.linspace(0.0, 1.0, n_bins + 1))
    qs = np.unique(qs)
    if qs.size < 3:                                          # confidence gần như hằng
        s = float(np.sqrt(np.mean(r ** 2)))
        return ConfCalibration(np.array([c.min(), c.max() + 1e-9]), np.array([s, s]))
    idx = np.clip(np.digitize(c, qs[1:-1]), 0, qs.size - 2)

    centers, sig, wts = [], [], []
    for b in range(qs.size - 1):
        m = idx == b
        n = int(m.sum())
        if n == 0:
            continue
        centers.append(float(np.mean(c[m])))
        sig.append(float(np.sqrt(np.mean(r[m] ** 2))))       # RMS residual = σ ước lượng
        wts.append(float(max(n, 1)) * (1.0 if n >= min_count else 0.3))
    centers = np.array(centers)
    sig = np.array(sig)
    order = np.argsort(centers)
    centers, sig = centers[order], sig[order]
    wts = np.array(wts)[order]
    sig_mono = _pav_nonincreasing(sig, wts)
    return ConfCalibration(centers, sig_mono)
