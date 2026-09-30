"""Mô hình che khuất thô: khớp có bị thân người che khỏi một camera không?

Vì sao cần: tam giác hoá đòi hỏi mỗi khớp được >=2 camera NHÌN THẤY. Khi vũ công
xoay lưng, các khớp phía trước (cổ tay, khuỷu) bị thân che khỏi camera phía sau.
Đây chính là CƠ CHẾ khiến 2 máy đặt lệch góc thắng 1 máy (hoặc 2 máy cùng phía):
khớp bị che ở máy này thường lộ ra ở máy kia. Không mô hình che khuất thì thực
nghiệm bỏ sót nửa lý do vật lý của tuyên bố 2-cam.

Mô hình: thân người xấp xỉ một hình trụ đứng bán kính r quanh trục pelvis->neck.
Một khớp bị che khỏi camera nếu đoạn thẳng (tâm máy -> khớp) cắt hình trụ này
TRƯỚC khi tới khớp. Thuần hình học, đủ để định lượng độ phủ theo góc đặt máy.
"""

from __future__ import annotations

import numpy as np

from choreo.schema import CameraCalib, JOINT_INDEX
from choreo.geom.cameras import camera_center

# Bán kính thân người xấp xỉ (m). ~14cm: nửa bề ngang thân trung bình.
TORSO_RADIUS = 0.14

# Các khớp nằm TRÊN/TRONG trục thân — không xét tự che (luôn coi là thấy nếu
# ở phía camera). Các chi (vai, khuỷu, cổ tay, gối, mắt cá, đầu, hông) có thể bị che.
_AXIS_JOINTS = frozenset(
    {JOINT_INDEX["pelvis"], JOINT_INDEX["spine"], JOINT_INDEX["neck"],
     JOINT_INDEX["root_floor"]}
)


def _perp(v: np.ndarray, d: np.ndarray) -> np.ndarray:
    """Thành phần của v vuông góc với trục đơn vị d."""
    return v - np.outer(v @ d, d)


def visible_mask(calib: CameraCalib, pose: np.ndarray) -> np.ndarray:
    """Trả về mask (J,) bool: khớp có được camera này nhìn thấy không.

    pose: (J, 3) một khung. Khớp bị coi là khuất nếu đoạn (tâm máy -> khớp) cắt
    hình trụ thân (trục pelvis->neck, bán kính TORSO_RADIUS) ở giữa đường.
    Khớp sau lưng camera (không chiếu được) cũng coi là không thấy.
    """
    C = camera_center(calib)
    A = pose[JOINT_INDEX["pelvis"]]
    B = pose[JOINT_INDEX["neck"]]
    axis = B - A
    axis_len = np.linalg.norm(axis)
    J = pose.shape[0]
    mask = np.ones(J, dtype=bool)
    if axis_len < 1e-6:
        return mask
    d = axis / axis_len

    for j in range(J):
        P = pose[j]
        # Điểm sau lưng camera: Z_cam <= 0 -> không quan sát được.
        z_cam = calib.R[2] @ P + calib.t[2]
        if z_cam <= 1e-6:
            mask[j] = False
            continue
        if j in _AXIS_JOINTS:
            continue  # khớp trên trục thân: không tự che

        ray = P - C
        m = ray - (ray @ d) * d          # phần ray vuông góc trục trụ
        n = (C - A) - ((C - A) @ d) * d   # offset điểm đầu (tâm máy) vuông góc trục
        a = m @ m
        if a < 1e-12:
            continue                      # ray song song trục -> không cắt hông trụ
        b = 2.0 * (n @ m)
        c = n @ n - TORSO_RADIUS ** 2
        disc = b * b - 4 * a * c
        if disc <= 0:
            continue                      # không cắt hình trụ
        sq = np.sqrt(disc)
        s1 = (-b - sq) / (2 * a)
        # Giao gần camera nhất nằm THỰC SỰ giữa máy và khớp (0 < s < ~1)?
        if not (1e-3 < s1 < 0.999):
            continue
        # Điểm giao có nằm trong khoảng chiều cao thân (giữa pelvis và neck)?
        hit = C + s1 * ray
        h = (hit - A) @ d
        if 0.0 <= h <= axis_len:
            mask[j] = False
    return mask
