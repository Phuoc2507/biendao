"""M3 — Làm mượt & tách chuyển động, thuần numpy (chạy/kiểm chứng ngay trên CPU).

Gồm 3 việc lõi của bước cleanup, đủ để đưa clip mocap thô về dạng dùng được
trong sequencer:
  - savgol_smooth: lọc Savitzky–Golay giữ đỉnh chuyển động (tốt hơn trung bình trượt).
  - detect_foot_contacts: đoán frame chân chạm sàn (cho foot-lock + đo foot-slip).
  - decouple_root_motion: tách quỹ đạo gốc trên sàn khỏi dáng tại chỗ (cho M4 đặt
    mannequin lên đường đi bất kỳ).
"""

from __future__ import annotations

import numpy as np

from choreo.schema import MotionClip, FOOT_JOINTS, ROOT_JOINT


def _savgol_coeffs(window: int, polyorder: int) -> np.ndarray:
    """Hệ số lọc Savitzky–Golay (đạo hàm 0) cho điểm giữa cửa sổ.

    Tự tính qua giả nghịch đảo ma trận Vandermonde → không cần scipy.
    """
    if window % 2 == 0:
        raise ValueError("window phải lẻ")
    if polyorder >= window:
        raise ValueError("polyorder phải < window")
    half = window // 2
    x = np.arange(-half, half + 1, dtype=np.float64)
    A = np.vander(x, polyorder + 1, increasing=True)   # (window, p+1)
    return np.linalg.pinv(A)[0]                          # hàng ứng bậc 0 = giá trị tại tâm


def savgol_smooth(x: np.ndarray, window: int = 7, polyorder: int = 2) -> np.ndarray:
    """Làm mượt theo trục thời gian (trục 0). Giữ nguyên shape.

    Đệm biên kiểu 'edge' để không co ngắn clip. Áp cho mảng (T, ...) bất kỳ.
    """
    x = np.asarray(x, dtype=np.float64)
    T = x.shape[0]
    if T < window:
        window = T if T % 2 == 1 else T - 1
        if window < 3:
            return x.copy()
        polyorder = min(polyorder, window - 1)

    coeffs = _savgol_coeffs(window, polyorder)
    half = window // 2
    pad = [(half, half)] + [(0, 0)] * (x.ndim - 1)
    xp = np.pad(x, pad, mode="edge")

    out = np.zeros_like(x)
    for k, c in enumerate(coeffs):
        out += c * xp[k : k + T]
    return out


def detect_foot_contacts(
    clip: MotionClip,
    speed_thresh: float = 0.15,
    height_thresh: float = 0.08,
    foot_joints: tuple[int, ...] = FOOT_JOINTS,
) -> np.ndarray:
    """Đoán frame chân chạm sàn: tốc độ ngang thấp VÀ mắt cá gần sàn (Y nhỏ).

    speed_thresh: m/s. height_thresh: m (trên sàn). Trả về (T, len(foot_joints)) bool.
    """
    j = clip.joints3d
    fps = clip.fps
    contacts = np.zeros((clip.num_frames, len(foot_joints)), dtype=bool)
    floor = j[..., 1].min()  # ước lượng cao độ sàn = điểm thấp nhất

    for fi, joint in enumerate(foot_joints):
        pos = j[:, joint, :]
        vel = np.zeros(clip.num_frames)
        vel[1:] = np.linalg.norm(np.diff(pos, axis=0), axis=1) * fps
        height = pos[:, 1] - floor
        contacts[:, fi] = (vel < speed_thresh) & (height < height_thresh)
    return contacts


def decouple_root_motion(clip: MotionClip) -> tuple[np.ndarray, np.ndarray]:
    """Tách quỹ đạo gốc trên sàn khỏi dáng tại chỗ.

    Trả về:
      in_place: (T, J, 3) khớp sau khi trừ dịch chuyển ngang của gốc (dáng "tại chỗ").
      root_traj: (T, 3) quỹ đạo gốc chiếu xuống sàn (x, 0, z).
    Cho phép M4 gắn dáng tại chỗ lên đường đi CatmullRom bất kỳ.
    """
    j = clip.joints3d
    root_xz = j[:, ROOT_JOINT, :].copy()
    root_traj = root_xz.copy()
    root_traj[:, 1] = 0.0  # chỉ giữ thành phần trên sàn (XZ)

    in_place = j - root_traj[:, None, :]
    return in_place, root_traj
