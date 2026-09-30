"""M5 — Metric đánh giá mocap, thuần numpy.

Đây là "thước đo" của Gate 0 và của chương kết quả. Mọi hàm nhận mảng numpy
đơn vị **mét**, trả về số **milimet** (mm) cho các metric khoảng cách — để bảng
kết quả khớp trực tiếp ngưỡng trong gate0-thiet-ke-thuc-nghiem.md.

Quy ước shape:
  pred, gt : (T, J, 3) hoặc (J, 3). Cùng thứ tự khớp (canh joint layout trước!).
"""

from __future__ import annotations

import numpy as np

_M_TO_MM = 1000.0


def _as_frames(x: np.ndarray) -> np.ndarray:
    """Chuẩn hoá về (T, J, 3); nếu đưa vào (J, 3) thì thêm trục thời gian."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x[None, ...]
    if x.ndim != 3 or x.shape[-1] != 3:
        raise ValueError(f"Kỳ vọng shape (T,J,3) hoặc (J,3), nhận {x.shape}")
    return x


def align_root(
    pred: np.ndarray, gt: np.ndarray, root: int = 0
) -> tuple[np.ndarray, np.ndarray]:
    """Dời cả hai về gốc chung (trừ toạ độ khớp `root`) trước khi tính MPJPE.

    MPJPE tiêu chuẩn (Human3.6M) là *root-relative*: bỏ sai số vị trí toàn cục,
    chỉ đo sai số dáng người.
    """
    pred = _as_frames(pred)
    gt = _as_frames(gt)
    pred_a = pred - pred[:, root : root + 1, :]
    gt_a = gt - gt[:, root : root + 1, :]
    return pred_a, gt_a


def per_joint_error(
    pred: np.ndarray, gt: np.ndarray, root: int | None = 0
) -> np.ndarray:
    """Sai số Euclid từng khớp theo thời gian, (T, J), đơn vị mm.

    root=None → không căn gốc (dùng cho toạ độ đã ở chung hệ). root=int → căn gốc.
    """
    if root is None:
        pred_a, gt_a = _as_frames(pred), _as_frames(gt)
    else:
        pred_a, gt_a = align_root(pred, gt, root=root)
    return np.linalg.norm(pred_a - gt_a, axis=2) * _M_TO_MM


def mpjpe(pred: np.ndarray, gt: np.ndarray, root: int | None = 0) -> float:
    """Mean Per-Joint Position Error (mm). Metric chính của Đường A."""
    return float(per_joint_error(pred, gt, root=root).mean())


def procrustes_align(pred: np.ndarray, gt: np.ndarray) -> np.ndarray:
    """Căn `pred` về `gt` bằng phép biến đổi tương tự (scale+rotation+translation)
    tối ưu theo từng frame (Procrustes / thuật toán Umeyama).

    Trả về pred đã căn, cùng shape. Đây là bước cho PA-MPJPE — loại bỏ sai khác
    về hướng/tỉ lệ toàn cục, chỉ còn sai số hình dạng dáng.
    """
    pred = _as_frames(pred)
    gt = _as_frames(gt)
    out = np.empty_like(pred)

    for i in range(pred.shape[0]):
        X = pred[i]  # (J,3) nguồn
        Y = gt[i]    # (J,3) đích
        muX, muY = X.mean(0), Y.mean(0)
        X0, Y0 = X - muX, Y - muY

        varX = (X0 ** 2).sum()
        # Ma trận hiệp phương sai chéo
        C = X0.T @ Y0
        U, S, Vt = np.linalg.svd(C)
        d = np.sign(np.linalg.det(Vt.T @ U.T))
        D = np.diag([1.0, 1.0, d])  # chống lật gương (reflection)
        Rmat = Vt.T @ D @ U.T
        scale = (S * np.array([1.0, 1.0, d])).sum() / (varX + 1e-12)
        t = muY - scale * (Rmat @ muX)
        out[i] = scale * (X @ Rmat.T) + t

    return out


def pa_mpjpe(pred: np.ndarray, gt: np.ndarray) -> float:
    """Procrustes-Aligned MPJPE (mm). Metric chính khi hệ toạ độ giữa 2 nguồn
    (vd AIST++ vs pipeline của mình) không cùng hướng/tỉ lệ."""
    pred_a = procrustes_align(pred, gt)
    return float(np.linalg.norm(pred_a - _as_frames(gt), axis=2).mean() * _M_TO_MM)


def jitter(joints3d: np.ndarray, fps: float) -> float:
    """Độ rung = độ lớn gia tốc khớp trung bình (m/s²).

    Cao = giật/rung. Dùng so 1-cam vs 2-cam vs sau-cleanup (Đường B). Không cần GT.
    """
    x = _as_frames(joints3d)
    if x.shape[0] < 3:
        return 0.0
    accel = np.diff(x, n=2, axis=0) * (fps ** 2)  # (T-2, J, 3)
    return float(np.linalg.norm(accel, axis=2).mean())


def foot_slip(
    joints3d: np.ndarray,
    contacts: np.ndarray,
    fps: float,
    foot_joints: tuple[int, ...] = (7, 8),
) -> float:
    """Độ trượt bàn chân trung bình (mm) TRONG các frame chân được đánh dấu chạm sàn.

    Chân đang chạm sàn mà dịch ngang (mặt phẳng XZ) = trượt = lỗi. Không cần GT.
    contacts: (T, len(foot_joints)) bool.
    """
    x = _as_frames(joints3d)
    contacts = np.asarray(contacts, dtype=bool)
    T = x.shape[0]
    if contacts.shape[0] != T:
        raise ValueError("contacts phải cùng số frame với joints3d")

    slips: list[float] = []
    for fi, joint in enumerate(foot_joints):
        pos = x[:, joint, :]                       # (T,3)
        horiz = pos[:, [0, 2]]                      # XZ (Y-up)
        step = np.linalg.norm(np.diff(horiz, axis=0), axis=1)  # (T-1,)
        # frame t->t+1 tính là trượt nếu chân chạm sàn ở cả hai đầu
        c = contacts[:, fi]
        moving_contact = c[:-1] & c[1:]
        if moving_contact.any():
            slips.append(step[moving_contact].mean() * _M_TO_MM)

    return float(np.mean(slips)) if slips else 0.0


def bone_length_std(
    joints3d: np.ndarray,
    edges: tuple[tuple[int, int], ...] | None = None,
) -> float:
    """Độ lệch chuẩn độ dài xương theo thời gian, trung bình trên các xương (mm).

    Xương của một người là cứng → độ dài phải HẰNG SỐ theo khung. Tam giác hoá độc
    lập từng khớp khiến độ dài dao động (xương "co giãn") — đây là dấu hiệu nhiễu
    trực tiếp, KHÔNG cần ground-truth. Đo trước/sau `enforce_bone_lengths` để lượng
    hoá hiệu quả bước ràng buộc.

    joints3d: (T,J,3), mét. edges: mặc định lấy SKELETON_EDGES. Trả về mm.
    """
    x = _as_frames(joints3d)
    if edges is None:
        from choreo.schema import SKELETON_EDGES
        edges = SKELETON_EDGES
    stds = []
    for p, c in edges:
        lengths = np.linalg.norm(x[:, c] - x[:, p], axis=1)  # (T,)
        stds.append(np.std(lengths))
    return float(np.mean(stds) * _M_TO_MM) if stds else 0.0


def reprojection_error(
    joints3d: np.ndarray,
    joints2d: np.ndarray,
    P: np.ndarray,
    bbox_height_px: float | None = None,
) -> float:
    """Sai số tái chiếu (Đường B, mẹo camera held-out).

    Chiếu 3D (dựng từ 2 máy) về camera thứ 3 (không dùng để dựng) bằng ma trận
    chiếu P (3x4), so với keypoint 2D detect trên máy 3.

    joints3d: (T,J,3) hoặc (J,3), mét, hệ world.
    joints2d: (T,J,2) hoặc (J,2), pixel.
    P: (3,4) ma trận chiếu của camera held-out (= CameraCalib.P).
    bbox_height_px: nếu có, chuẩn hoá lỗi theo chiều cao người (%) để so giữa clip.

    Trả về mm-tương-đương-pixel (px) hoặc % nếu có bbox_height_px.
    """
    X = _as_frames(joints3d)
    Y = np.asarray(joints2d, dtype=np.float64)
    if Y.ndim == 2:
        Y = Y[None, ...]
    P = np.asarray(P, dtype=np.float64).reshape(3, 4)

    T, J = X.shape[0], X.shape[1]
    homog = np.concatenate([X, np.ones((T, J, 1))], axis=2)  # (T,J,4)
    proj = homog @ P.T                                        # (T,J,3)
    uv = proj[..., :2] / (proj[..., 2:3] + 1e-12)             # (T,J,2)

    err = np.linalg.norm(uv - Y, axis=2)                     # (T,J) px
    mean_err = float(err.mean())
    if bbox_height_px:
        return 100.0 * mean_err / bbox_height_px
    return mean_err
