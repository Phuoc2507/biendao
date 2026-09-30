"""Tam giác hoá tuyến tính (DLT) đa-view: từ nhiều điểm ảnh 2D -> 1 điểm 3D.

Mỗi camera cho ma trận chiếu P (3x4). Với quan sát (u, v) ở một view, ràng buộc
x = PX (chuẩn hoá) tương đương 2 phương trình tuyến tính theo X (toạ độ thuần nhất):
    u (P2 · X) - (P0 · X) = 0
    v (P2 · X) - (P1 · X) = 0
Gom mọi view thành A X = 0 (A cỡ 2V x 4), nghiệm là vector kỳ dị nhỏ nhất (SVD).

Đây là bước "fuse 2D -> 3D" của pipeline (ở đây thay cho khối hình học lõi mà
EasyMocap/Pose2Sim làm trên GPU) — nhưng chạy thuần numpy để đo được giới hạn
độ chính xác do HÌNH HỌC quyết định, tách khỏi sai số của mạng 2D.
"""

from __future__ import annotations

import numpy as np


def triangulate_dlt(
    proj_mats: np.ndarray, points2d: np.ndarray
) -> np.ndarray:
    """Tam giác hoá N điểm từ V view.

    proj_mats: (V, 3, 4) ma trận chiếu mỗi view.
    points2d:  (V, N, 2) toạ độ pixel mỗi view. NaN = điểm không quan sát được ở
        view đó (bị loại khỏi hệ; cần >=2 view hợp lệ mỗi điểm).
    Trả về: (N, 3) toạ độ 3D trong hệ world.
    """
    P = np.asarray(proj_mats, dtype=np.float64)
    x = np.asarray(points2d, dtype=np.float64)
    if P.ndim != 3 or P.shape[1:] != (3, 4):
        raise ValueError(f"proj_mats phải (V,3,4), nhận {P.shape}")
    if x.ndim != 3 or x.shape[0] != P.shape[0] or x.shape[2] != 2:
        raise ValueError(f"points2d phải (V,N,2) khớp V, nhận {x.shape}")

    V, N = x.shape[0], x.shape[1]
    out = np.full((N, 3), np.nan, dtype=np.float64)

    for j in range(N):
        rows = []
        for v in range(V):
            uv = x[v, j]
            if not np.isfinite(uv).all():
                continue
            u, w = uv
            rows.append(u * P[v, 2] - P[v, 0])
            rows.append(w * P[v, 2] - P[v, 1])
        if len(rows) < 4:  # cần >=2 view (4 phương trình) để định điểm 3D
            continue
        A = np.asarray(rows, dtype=np.float64)
        # Nghiệm = vector kỳ dị ứng với giá trị kỳ dị nhỏ nhất của A.
        _, _, vt = np.linalg.svd(A)
        Xh = vt[-1]
        if abs(Xh[3]) < 1e-12:  # điểm ở vô cực (thoái hoá) -> bỏ
            continue
        out[j] = Xh[:3] / Xh[3]
    return out


def _solve_one(P_sub: np.ndarray, uv_sub: np.ndarray) -> np.ndarray | None:
    """Tam giác hoá MỘT điểm từ một tập view con. P_sub (v,3,4), uv_sub (v,2)."""
    rows = []
    for v in range(P_sub.shape[0]):
        u, w = uv_sub[v]
        rows.append(u * P_sub[v, 2] - P_sub[v, 0])
        rows.append(w * P_sub[v, 2] - P_sub[v, 1])
    if len(rows) < 4:
        return None
    _, _, vt = np.linalg.svd(np.asarray(rows, dtype=np.float64))
    Xh = vt[-1]
    if abs(Xh[3]) < 1e-12:
        return None
    return Xh[:3] / Xh[3]


def _reproj_errs(P_sub: np.ndarray, X: np.ndarray, uv_sub: np.ndarray) -> np.ndarray:
    """Sai số tái chiếu (px) của điểm 3D X về từng view trong tập con."""
    Xh = np.append(X, 1.0)
    proj = P_sub @ Xh                      # (v,3)
    uv = proj[:, :2] / proj[:, 2:3]
    return np.linalg.norm(uv - uv_sub, axis=1)


def triangulate_robust(
    proj_mats: np.ndarray,
    points2d: np.ndarray,
    reproj_thresh_px: float = 20.0,
) -> np.ndarray:
    """Như triangulate_dlt nhưng LOẠI OUTLIER 2D bằng cổng sai số tái chiếu.

    Detector 2D thật thỉnh thoảng cho khớp sai hẳn (lỗi thô). Với DLT thường, một
    quan sát sai làm hỏng cả điểm 3D. Ở đây:
      - Tam giác hoá bằng mọi view hợp lệ, rồi tái chiếu kiểm tra.
      - Nếu view nào lệch > ngưỡng: với >=3 view, LOẠI DẦN view tệ nhất rồi dựng lại;
        với đúng 2 view (không phân biệt được ai sai) -> trả NaN để tầng trên nội suy.
    Trả về (N,3), NaN cho điểm bị loại (sau đó fuse sẽ lấp khoảng trống theo thời gian).
    """
    P = np.asarray(proj_mats, dtype=np.float64)
    x = np.asarray(points2d, dtype=np.float64)
    if P.ndim != 3 or P.shape[1:] != (3, 4):
        raise ValueError(f"proj_mats phải (V,3,4), nhận {P.shape}")
    if x.ndim != 3 or x.shape[0] != P.shape[0] or x.shape[2] != 2:
        raise ValueError(f"points2d phải (V,N,2) khớp V, nhận {x.shape}")

    V, N = x.shape[0], x.shape[1]
    out = np.full((N, 3), np.nan, dtype=np.float64)

    for j in range(N):
        idx = [v for v in range(V) if np.isfinite(x[v, j]).all()]
        while len(idx) >= 2:
            P_sub = P[idx]
            uv_sub = x[idx, j]
            X = _solve_one(P_sub, uv_sub)
            if X is None:
                break
            errs = _reproj_errs(P_sub, X, uv_sub)
            if errs.max() <= reproj_thresh_px:
                out[j] = X                      # đạt -> chấp nhận
                break
            if len(idx) <= 2:
                break                            # 2 view mà lệch -> không cứu được
            idx.pop(int(np.argmax(errs)))        # loại view tệ nhất, thử lại
    return out
