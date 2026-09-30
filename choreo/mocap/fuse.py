"""Hợp nhất 2D đa-view -> chuyển động 3D (lõi hình học của M2, chạy CPU).

Adapter thật (EasyMocap/XRMoCap trên GPU) làm hai việc: (1) chạy 2D pose trên mỗi
view, (2) hợp nhất ra 3D. Việc (2) — tam giác hoá + xử lý khớp thiếu + làm mượt
thời gian — thuần hình học, chạy được ngay trên CPU và test được ngay. Module này
hiện thực đúng phần đó, nhận keypoint 2D (từ BẤT KỲ detector nào) rồi trả MotionClip.

Nhờ tách vậy: phần GPU (detector 2D) cắm sau ở Gate 0, còn phần hình học đã có
số, có test, và tái dùng chung mã với thực nghiệm tổng hợp (experiments/).
"""

from __future__ import annotations

import numpy as np

from choreo.cleanup.smooth import detect_foot_contacts, savgol_smooth
from choreo.geom.triangulate import triangulate_dlt, triangulate_robust
from choreo.schema import CameraCalib, MotionClip, NUM_JOINTS


def _fill_gaps(joints3d: np.ndarray) -> np.ndarray:
    """Nội suy tuyến tính theo thời gian cho các khớp NaN (bị thiếu vài frame).

    Khớp không quan sát đủ (bị che) ở một số frame -> nội suy từ frame lân cận.
    Khớp thiếu toàn bộ chuỗi thì để nguyên NaN (phía gọi tự quyết).
    """
    out = joints3d.copy()
    T, J, _ = out.shape
    t = np.arange(T)
    for j in range(J):
        for c in range(3):
            col = out[:, j, c]
            good = np.isfinite(col)
            if good.all() or not good.any():
                continue
            col[~good] = np.interp(t[~good], t[good], col[good])
            out[:, j, c] = col
    return out


def fuse_multiview(
    keypoints2d: np.ndarray,
    calibs: list[CameraCalib],
    fps: float = 30.0,
    *,
    smooth: bool = True,
    smooth_window: int = 7,
    fill_gaps: bool = True,
    robust: bool = False,
    reproj_thresh_px: float = 20.0,
    confidences: np.ndarray | None = None,
    meta: dict | None = None,
) -> MotionClip:
    """Tam giác hoá keypoint 2D đa-view thành MotionClip 3D.

    keypoints2d: (V, T, J, 2) pixel; NaN = khớp không quan sát được ở view đó.
    calibs: danh sách V CameraCalib khớp thứ tự view.
    robust=True: loại outlier 2D bằng cổng sai số tái chiếu (triangulate_robust) —
        nên bật khi dùng detector 2D thật (hay có lỗi thô); khớp bị loại sẽ được
        lấp bằng nội suy thời gian (cần fill_gaps=True).
    confidences: (V, T, J) độ tin cậy mỗi quan sát (confidence detector 2D). Khi có,
        DLT được **đánh trọng số** — view tin cậy thấp (mờ/bị che) bị giảm ảnh hưởng
        thay vì bị loại cứng. Bổ trợ cho robust: robust loại lỗi THÔ, weighting xử lý
        nhiễu MỀM theo độ tin cậy. Bỏ qua khi robust=True (robust đi đường loại-view).
    Trả về MotionClip (T, J, 3) hệ world, đã (tuỳ chọn) lấp khoảng trống + làm mượt,
    kèm contacts đoán từ hình học chân.
    """
    kp = np.asarray(keypoints2d, dtype=np.float64)
    if kp.ndim != 4 or kp.shape[3] != 2:
        raise ValueError(f"keypoints2d phải (V,T,J,2), nhận {kp.shape}")
    V, T, J, _ = kp.shape
    if len(calibs) != V:
        raise ValueError(f"Số calib ({len(calibs)}) khác số view ({V})")
    if J != NUM_JOINTS:
        raise ValueError(f"Kỳ vọng {NUM_JOINTS} khớp, nhận {J}")
    conf = None
    if confidences is not None:
        conf = np.asarray(confidences, dtype=np.float64)
        if conf.shape != (V, T, J):
            raise ValueError(f"confidences phải (V,T,J)={(V, T, J)}, nhận {conf.shape}")

    P = np.stack([c.P for c in calibs], axis=0)  # (V,3,4)
    joints3d = np.empty((T, J, 3), dtype=np.float64)
    if robust:
        tri = lambda pts, w: triangulate_robust(P, pts, reproj_thresh_px)
    else:
        tri = lambda pts, w: triangulate_dlt(P, pts, weights=w)
    for f in range(T):
        w = None if conf is None else conf[:, f, :]
        joints3d[f] = tri(kp[:, f, :, :], w)  # (V,J,2) -> (J,3)

    if fill_gaps:
        joints3d = _fill_gaps(joints3d)
    if smooth and T >= 3:
        joints3d = savgol_smooth(joints3d, window=smooth_window, polyorder=2)

    m = {"stage": "fuse_multiview", "num_views": V, "robust": robust,
         "weighted": conf is not None}
    if meta:
        m.update(meta)
    clip = MotionClip(fps=fps, joints3d=joints3d, meta=m)
    # Đoán chạm sàn từ hình học chân (cần cho foot-lock ở M3).
    clip.contacts = detect_foot_contacts(clip)
    return clip
