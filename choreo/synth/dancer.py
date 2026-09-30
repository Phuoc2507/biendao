"""Sinh một đoạn múa 3D tổng hợp (ground-truth) theo layout 17 khớp của schema.

Toạ độ hệ world, mét, Y-up, sàn Y=0, tâm sân khấu tại gốc. Chuyển động gồm:
  - nhún gối (squat) tuần hoàn -> thay đổi độ sâu chân,
  - vung hai tay theo vòng lệch pha -> cổ tay/khuỷu quét cả 3 trục,
  - xoay cả thân quanh trục Y (facing) -> khớp đổi độ sâu so với máy,
  - dịch chuyển gốc nhẹ trên sàn.
Nhờ vậy chất lượng tam giác hoá phụ thuộc thật vào góc đặt hai máy.
"""

from __future__ import annotations

import numpy as np

from choreo.schema import JOINT_INDEX, MotionClip, NUM_JOINTS

# Tư thế chuẩn (canonical) đứng thẳng, quay mặt về +Z. Đơn vị mét.
_CANONICAL = {
    "pelvis": (0.00, 0.95, 0.00),
    "l_hip": (0.10, 0.90, 0.00),
    "r_hip": (-0.10, 0.90, 0.00),
    "spine": (0.00, 1.15, 0.00),
    "l_knee": (0.11, 0.50, 0.00),
    "r_knee": (-0.11, 0.50, 0.00),
    "neck": (0.00, 1.45, 0.00),
    "l_ankle": (0.11, 0.06, 0.00),
    "r_ankle": (-0.11, 0.06, 0.00),
    "head": (0.00, 1.62, 0.00),
    "l_shoulder": (0.18, 1.42, 0.00),
    "r_shoulder": (-0.18, 1.42, 0.00),
    "l_elbow": (0.42, 1.42, 0.00),
    "r_elbow": (-0.42, 1.42, 0.00),
    "l_wrist": (0.65, 1.42, 0.00),
    "r_wrist": (-0.65, 1.42, 0.00),
    "root_floor": (0.00, 0.00, 0.00),
}


def _canonical_pose() -> np.ndarray:
    pose = np.zeros((NUM_JOINTS, 3), dtype=np.float64)
    for name, xyz in _CANONICAL.items():
        pose[JOINT_INDEX[name]] = xyz
    return pose


def _rot_y(theta: float) -> np.ndarray:
    c, s = np.cos(theta), np.sin(theta)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]], dtype=np.float64)


def synthetic_dance(
    fps: float = 30.0,
    seconds: float = 4.0,
    *,
    seed: int = 0,
) -> MotionClip:
    """Trả về MotionClip ground-truth (T, 17, 3). `seed` để tái lập được."""
    rng = np.random.default_rng(seed)
    T = int(round(fps * seconds))
    t = np.arange(T) / fps
    base = _canonical_pose()

    # Pha ngẫu nhiên nhẹ để mỗi seed cho một đoạn khác nhau nhưng vẫn hợp lý.
    ph = rng.uniform(0, 2 * np.pi, size=4)

    frames = np.empty((T, NUM_JOINTS, 3), dtype=np.float64)
    idx = JOINT_INDEX

    for f in range(T):
        pose = base.copy()
        tt = t[f]

        # --- Nhún gối: hạ hông + gối, đẩy gối ra trước theo chu kỳ 1.0 Hz ---
        squat = 0.12 * (1 - np.cos(2 * np.pi * 1.0 * tt + ph[0])) / 2  # 0..0.12 m
        for name in ("pelvis", "l_hip", "r_hip", "spine", "neck", "head",
                     "l_shoulder", "r_shoulder", "l_elbow", "r_elbow",
                     "l_wrist", "r_wrist"):
            pose[idx[name], 1] -= squat
        for name in ("l_knee", "r_knee"):
            pose[idx[name], 1] -= 0.45 * squat
            pose[idx[name], 2] += 1.6 * squat  # gối đẩy ra trước khi khuỵu

        # --- Vung hai tay theo vòng tròn trong mặt phẳng nghiêng, lệch pha ---
        aL = 2 * np.pi * 0.7 * tt + ph[1]
        aR = 2 * np.pi * 0.7 * tt + ph[1] + np.pi  # tay phải ngược pha
        # cổ tay quét: lên/xuống (Y) + ra trước/sau (Z); khuỷu quét biên nhỏ hơn.
        pose[idx["l_wrist"], 1] += 0.35 * np.sin(aL)
        pose[idx["l_wrist"], 2] += 0.30 * np.cos(aL)
        pose[idx["l_elbow"], 1] += 0.18 * np.sin(aL)
        pose[idx["l_elbow"], 2] += 0.15 * np.cos(aL)
        pose[idx["r_wrist"], 1] += 0.35 * np.sin(aR)
        pose[idx["r_wrist"], 2] += 0.30 * np.cos(aR)
        pose[idx["r_elbow"], 1] += 0.18 * np.sin(aR)
        pose[idx["r_elbow"], 2] += 0.15 * np.cos(aR)

        # --- Xoay cả thân quanh trục Y qua pelvis (facing +-40°) ---
        yaw = np.radians(40.0) * np.sin(2 * np.pi * 0.35 * tt + ph[2])
        pivot = base[idx["pelvis"]].copy()
        pivot[1] = 0.0  # xoay quanh trục đứng qua gốc chân
        pose = (pose - pivot) @ _rot_y(yaw).T + pivot

        # --- Dịch gốc trên sàn (đi ngang nhẹ) ---
        pose[:, 0] += 0.25 * np.sin(2 * np.pi * 0.25 * tt + ph[3])

        frames[f] = pose

    # root_floor = chiếu pelvis xuống sàn; cập nhật lại sau mọi biến đổi.
    frames[:, idx["root_floor"], :] = frames[:, idx["pelvis"], :]
    frames[:, idx["root_floor"], 1] = 0.0

    return MotionClip(fps=fps, joints3d=frames, meta={"source": "synthetic_dance", "seed": seed})
