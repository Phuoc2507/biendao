"""Định dạng trao đổi giữa các module (interchange format).

Đây là "hợp đồng" nối M2 (mocap) → M3 (cleanup) → M4 (sequencer) → M5 (eval).
Cố ý giữ tối giản, chỉ numpy + dataclass, để mọi module import được mà không kéo theo
gói nặng (torch/opencv). Nhờ vậy nhánh sequencer (người B) và nhánh perception (người A)
dùng chung một schema và ghép được từ tuần 1.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np


# ---------------------------------------------------------------------------
# Bố cục khớp (joint layout)
# ---------------------------------------------------------------------------
# Ta chuẩn hoá về một tập khớp cố định để MPJPE giữa các nguồn (AIST++ SMPL,
# EasyMocap, retarget Mixamo) so được với nhau. Dùng 17 khớp kiểu Human3.6M/COCO
# mở rộng — đủ cho múa và khớp với hầu hết detector 2D.
JOINT_NAMES: tuple[str, ...] = (
    "pelvis",      # 0  gốc (root)
    "l_hip",       # 1
    "r_hip",       # 2
    "spine",       # 3
    "l_knee",      # 4
    "r_knee",      # 5
    "neck",        # 6
    "l_ankle",     # 7
    "r_ankle",     # 8
    "head",        # 9
    "l_shoulder",  # 10
    "r_shoulder",  # 11
    "l_elbow",     # 12
    "r_elbow",     # 13
    "l_wrist",     # 14
    "r_wrist",     # 15
    "root_floor",  # 16  chiếu của pelvis xuống sàn (dùng cho quỹ đạo/foot-lock)
)
NUM_JOINTS: int = len(JOINT_NAMES)
JOINT_INDEX: dict[str, int] = {name: i for i, name in enumerate(JOINT_NAMES)}

# Khớp bàn chân — dùng cho foot-lock và đo foot-slip.
FOOT_JOINTS: tuple[int, int] = (JOINT_INDEX["l_ankle"], JOINT_INDEX["r_ankle"])
ROOT_JOINT: int = JOINT_INDEX["pelvis"]

# Cạnh xương (cha, con) — dùng để vẽ mannequin ở sequencer web và debug.
SKELETON_EDGES: tuple[tuple[int, int], ...] = (
    (0, 1), (0, 2), (0, 3),      # pelvis -> hông trái/phải, cột sống
    (1, 4), (2, 5),              # hông -> gối
    (4, 7), (5, 8),              # gối -> mắt cá
    (3, 6), (6, 9),              # cột sống -> cổ -> đầu
    (6, 10), (6, 11),            # cổ -> vai trái/phải
    (10, 12), (11, 13),          # vai -> khuỷu
    (12, 14), (13, 15),          # khuỷu -> cổ tay
)

# Cặp khớp trái/phải — dùng khi lật gương (mirror) mannequin.
MIRROR_PAIRS: tuple[tuple[int, int], ...] = (
    (1, 2), (4, 5), (7, 8),          # hông, gối, mắt cá
    (10, 11), (12, 13), (14, 15),    # vai, khuỷu, cổ tay
)


@dataclass
class BeatGrid:
    """Lưới nhịp trích từ nhạc (M1/beat_this). Dùng để căn clip vào 8-count."""

    bpm: float
    beat_times: np.ndarray            # (Nbeat,) giây, mốc mỗi phách
    downbeat_times: np.ndarray        # (Nbar,) giây, mốc mỗi ô nhịp (đầu 8-count)

    def __post_init__(self) -> None:
        self.beat_times = np.asarray(self.beat_times, dtype=np.float64).reshape(-1)
        self.downbeat_times = np.asarray(self.downbeat_times, dtype=np.float64).reshape(-1)


@dataclass
class CameraCalib:
    """Tham số camera từ ChArUco (M2). Dùng cho triangulation + reprojection (Đường B)."""

    K: np.ndarray                     # (3,3) nội tại
    R: np.ndarray                     # (3,3) xoay world->cam
    t: np.ndarray                     # (3,)  tịnh tiến world->cam
    dist: np.ndarray = field(         # (k,) hệ số méo (OpenCV), mặc định không méo
        default_factory=lambda: np.zeros(5, dtype=np.float64)
    )
    image_size: tuple[int, int] = (1920, 1080)  # (W, H)

    def __post_init__(self) -> None:
        self.K = np.asarray(self.K, dtype=np.float64).reshape(3, 3)
        self.R = np.asarray(self.R, dtype=np.float64).reshape(3, 3)
        self.t = np.asarray(self.t, dtype=np.float64).reshape(3)
        self.dist = np.asarray(self.dist, dtype=np.float64).reshape(-1)

    @property
    def P(self) -> np.ndarray:
        """Ma trận chiếu 3x4: P = K [R | t]."""
        return self.K @ np.hstack([self.R, self.t.reshape(3, 1)])


@dataclass
class MotionClip:
    """Một đoạn chuyển động 3D đã dựng — đơn vị dữ liệu chính chảy qua pipeline.

    joints3d ở hệ world, đơn vị **mét**. Trục Y hướng lên (Y-up), sàn tại Y=0.
    """

    fps: float
    joints3d: np.ndarray              # (T, NUM_JOINTS, 3) toạ độ khớp theo thời gian
    contacts: np.ndarray | None = None        # (T, 2) bool: (chân trái, chân phải) chạm sàn
    root_trajectory: np.ndarray | None = None # (T, 3) quỹ đạo gốc trên sàn (tách khỏi dáng)
    beat_grid: BeatGrid | None = None
    joint_names: tuple[str, ...] = JOINT_NAMES
    meta: dict = field(default_factory=dict)  # nguồn, dancer, nhóm động tác, cặp góc...

    def __post_init__(self) -> None:
        self.joints3d = np.asarray(self.joints3d, dtype=np.float64)
        if self.joints3d.ndim != 3 or self.joints3d.shape[2] != 3:
            raise ValueError(
                f"joints3d phải có shape (T, J, 3), nhận {self.joints3d.shape}"
            )
        if self.joints3d.shape[1] != len(self.joint_names):
            raise ValueError(
                f"Số khớp {self.joints3d.shape[1]} != {len(self.joint_names)} tên khớp"
            )
        if self.contacts is not None:
            self.contacts = np.asarray(self.contacts, dtype=bool)
        if self.root_trajectory is not None:
            self.root_trajectory = np.asarray(self.root_trajectory, dtype=np.float64)

    @property
    def num_frames(self) -> int:
        return self.joints3d.shape[0]

    @property
    def duration(self) -> float:
        """Độ dài clip (giây)."""
        return self.num_frames / self.fps
