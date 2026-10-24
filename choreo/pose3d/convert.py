"""Khớp SMPL 24 hệ camera → 17 khớp hệ sân khấu, sẵn cho nhân vật 3D.

Hệ camera kiểu OpenCV: x sang phải ảnh, y xuống, z ra xa máy. Hệ sân khấu của
app: Y lên, +Z về phía khán giả (máy quay đứng chỗ khán giả), +X bên phải khán
giả. Nên X = x, Y = -y, Z = -z (định thức +1, là phép xoay thật, không lật).

Máy quay thường hơi chúc xuống: hướng "lên" ước từ thân (trung bình chậu→cổ cả
bài, múa có cúi có ngửa nhưng trung bình gần thẳng đứng) rồi xoay về +Y. Sàn đặt
sao cho cổ chân thấp nhất (phân vị nhỏ) cao bằng cổ chân lúc đứng.

Trôi ngang: dựng một máy thì độ sâu của chậu rung và trôi, người cũng đi lại
trong khung. Vị trí trên sân do đội hình trong app quyết định, nên ở đây bỏ phần
trôi chậm (trung bình trượt) và giữ phần dịch nhanh (nhún, bước nhỏ).
"""

from __future__ import annotations

import numpy as np

from choreo.schema import JOINT_INDEX, JOINT_NAMES, NUM_JOINTS

# chỉ số khớp SMPL 24 (bậc của mô hình SMPL)
SMPL24 = {
    "pelvis": 0, "l_hip": 1, "r_hip": 2, "spine1": 3, "l_knee": 4, "r_knee": 5,
    "spine2": 6, "l_ankle": 7, "r_ankle": 8, "spine3": 9, "l_foot": 10, "r_foot": 11,
    "neck": 12, "l_collar": 13, "r_collar": 14, "head": 15, "l_shoulder": 16,
    "r_shoulder": 17, "l_elbow": 18, "r_elbow": 19, "l_wrist": 20, "r_wrist": 21,
    "l_hand": 22, "r_hand": 23,
}

# khớp của ta ← khớp SMPL; root_floor tính riêng (chiếu chậu xuống sàn)
OURS_FROM_SMPL = {
    "pelvis": "pelvis", "l_hip": "l_hip", "r_hip": "r_hip", "spine": "spine2",
    "l_knee": "l_knee", "r_knee": "r_knee", "neck": "neck", "l_ankle": "l_ankle",
    "r_ankle": "r_ankle", "head": "head", "l_shoulder": "l_shoulder",
    "r_shoulder": "r_shoulder", "l_elbow": "l_elbow", "r_elbow": "r_elbow",
    "l_wrist": "l_wrist", "r_wrist": "r_wrist",
}

ANKLE_HEIGHT = 0.06  # cổ chân cách sàn lúc đứng (m), như tư thế chuẩn của schema


def smpl24_to_ours(j24: np.ndarray) -> np.ndarray:
    """(T, 24, 3) → (T, 17, 3); root_floor tạm bằng chậu, đặt y sau khi có sàn."""
    j24 = np.asarray(j24, dtype=np.float64)
    if j24.ndim != 3 or j24.shape[1] < 24 or j24.shape[2] != 3:
        raise ValueError(f"cần khớp SMPL dạng (T, 24, 3), nhận {j24.shape}")
    out = np.zeros((j24.shape[0], NUM_JOINTS, 3))
    for ours, smpl in OURS_FROM_SMPL.items():
        out[:, JOINT_INDEX[ours]] = j24[:, SMPL24[smpl]]
    out[:, JOINT_INDEX["root_floor"]] = out[:, JOINT_INDEX["pelvis"]]
    return out


def cam_to_stage(x: np.ndarray) -> np.ndarray:
    """Hệ camera OpenCV → hệ sân khấu (đổi dấu y, z)."""
    y = np.array(x, dtype=np.float64, copy=True)
    y[..., 1] *= -1.0
    y[..., 2] *= -1.0
    return y


def _rot_between(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Ma trận xoay ngắn nhất đưa hướng a về hướng b (Rodrigues)."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        if c > 0:
            return np.eye(3)
        # ngược chiều: xoay 180° quanh trục bất kỳ vuông góc a
        p = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 0, 1.0])
        k = np.cross(a, p)
        k /= np.linalg.norm(k)
        return 2 * np.outer(k, k) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


def estimate_up(j: np.ndarray) -> np.ndarray:
    """Hướng lên ước từ thân: trung bình các vector đơn vị chậu→cổ."""
    v = j[:, JOINT_INDEX["neck"]] - j[:, JOINT_INDEX["pelvis"]]
    n = np.linalg.norm(v, axis=1, keepdims=True)
    ok = n[:, 0] > 1e-6
    if not ok.any():
        return np.array([0.0, 1.0, 0.0])
    u = (v[ok] / n[ok]).mean(axis=0)
    return u / np.linalg.norm(u)


def level(j: np.ndarray) -> np.ndarray:
    """Xoay quanh chậu trung bình cho hướng lên về +Y (giữ hướng ngang)."""
    r = _rot_between(estimate_up(j), np.array([0.0, 1.0, 0.0]))
    c = j[:, JOINT_INDEX["pelvis"]].mean(axis=0)
    return (j - c) @ r.T + c


def moving_average(x: np.ndarray, win: int) -> np.ndarray:
    """Trung bình trượt dọc trục 0, mép lặp giá trị biên (không co về 0)."""
    if win <= 1 or len(x) < 2:
        return np.array(x, dtype=np.float64, copy=True)
    win = min(win, len(x))
    lo = win // 2
    hi = win - 1 - lo
    pad = np.concatenate([np.repeat(x[:1], lo, axis=0), x, np.repeat(x[-1:], hi, axis=0)])
    cs = np.cumsum(np.concatenate([np.zeros_like(x[:1]), pad]), axis=0)
    return (cs[win:] - cs[:-win]) / win


def remove_drift(j: np.ndarray, fps: float, window_sec: float) -> np.ndarray:
    """Bỏ trôi ngang chậm của chậu (trung bình trượt window_sec); 0 thì bỏ cả trôi."""
    pel = j[:, JOINT_INDEX["pelvis"], :][:, [0, 2]]
    if window_sec <= 0:
        slow = pel
    else:
        slow = moving_average(pel, max(1, int(round(window_sec * fps))))
    out = j.copy()
    out[:, :, 0] -= slow[:, None, 0]
    out[:, :, 2] -= slow[:, None, 1]
    return out


def put_on_floor(j: np.ndarray, pct: float = 5.0) -> np.ndarray:
    """Dời dọc cho cổ chân thấp (phân vị pct của cổ chân thấp hơn mỗi khung) cao ANKLE_HEIGHT."""
    ank = np.minimum(j[:, JOINT_INDEX["l_ankle"], 1], j[:, JOINT_INDEX["r_ankle"], 1])
    out = j.copy()
    out[:, :, 1] += ANKLE_HEIGHT - float(np.percentile(ank, pct))
    rf = JOINT_INDEX["root_floor"]
    out[:, rf] = out[:, JOINT_INDEX["pelvis"]]
    out[:, rf, 1] = 0.0
    return out


def smooth(j: np.ndarray, frames: int) -> np.ndarray:
    """Làm mượt nhẹ mọi khớp (khử rung khung-khung của bộ dựng một máy)."""
    return moving_average(j, frames) if frames > 1 else j


def to_stage_motion(j24_cam: np.ndarray, fps: float, *, drift_sec: float = 1.5,
                    smooth_frames: int = 3) -> np.ndarray:
    """Cả chuỗi: SMPL 24 hệ camera → 17 khớp hệ sân khấu, đứng trên sàn quanh gốc."""
    j = cam_to_stage(smpl24_to_ours(j24_cam))
    j = level(j)
    j = smooth(j, smooth_frames)
    j = remove_drift(j, fps, drift_sec)
    return put_on_floor(j)


def motion_dict(joints: np.ndarray, fps: float, *, name: str, source: str = "") -> dict:
    """Dữ liệu tệp <ten>.motion.json (format choreo-motion, bản 1)."""
    joints = np.asarray(joints, dtype=np.float64)
    if not np.isfinite(joints).all():
        raise ValueError("khớp có giá trị NaN hoặc vô hạn")
    return {
        "format": "choreo-motion",
        "version": 1,
        "name": name,
        "fps": float(fps),
        "numFrames": int(joints.shape[0]),
        "jointNames": list(JOINT_NAMES),
        # frames[t][j] = [x, y, z] mét, hệ sân khấu, thời điểm t/fps tính từ đầu video gốc
        "frames": np.round(joints, 4).tolist(),
        "source": source,
    }
