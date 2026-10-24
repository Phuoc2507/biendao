import json

import numpy as np
import pytest

from choreo.pose3d.cli import convert_file
from choreo.pose3d.convert import (
    ANKLE_HEIGHT, OURS_FROM_SMPL, SMPL24, cam_to_stage, estimate_up, moving_average,
    to_stage_motion,
)
from choreo.schema import JOINT_INDEX
from choreo.synth.dancer import synthetic_dance


def _fake_smpl_cam(ours: np.ndarray, tilt_deg: float = 12.0, dist: float = 4.0) -> np.ndarray:
    """Dựng khớp SMPL 24 hệ camera từ 17 khớp hệ sân khấu: máy chúc xuống tilt độ, cách dist m."""
    T = ours.shape[0]
    j24 = np.zeros((T, 24, 3))
    for o, s in OURS_FROM_SMPL.items():
        j24[:, SMPL24[s]] = ours[:, JOINT_INDEX[o]]
    # khớp SMPL không dùng: đặt gần chậu cho đủ hình
    for k in range(24):
        if not j24[:, k].any():
            j24[:, k] = ours[:, JOINT_INDEX["pelvis"]]
    a = np.deg2rad(tilt_deg)
    # máy cao hơn người, chúc xuống: xoay cả cảnh quanh trục X (hệ sân khấu)
    rx = np.array([[1, 0, 0], [0, np.cos(a), -np.sin(a)], [0, np.sin(a), np.cos(a)]])
    st = j24 @ rx.T + np.array([0.3, -1.2, -dist])  # lệch ngang, máy cao, người ở xa
    return cam_to_stage(st)  # cam_to_stage là nghịch đảo của chính nó


def test_cam_to_stage_is_proper_rotation():
    m = cam_to_stage(np.eye(3))
    assert np.isclose(np.linalg.det(m), 1.0)
    assert np.allclose(cam_to_stage(cam_to_stage(m)), m)


def test_moving_average_keeps_constant_and_length():
    x = np.full((10, 2), 3.0)
    y = moving_average(x, 4)
    assert y.shape == x.shape and np.allclose(y, 3.0)


def test_roundtrip_recovers_upright_pose_on_floor():
    clip = synthetic_dance(fps=30, seconds=4, seed=1)
    gt = clip.joints3d
    got = to_stage_motion(_fake_smpl_cam(gt, tilt_deg=12), 30, drift_sec=0, smooth_frames=1)
    # thân thẳng đứng trở lại
    up = estimate_up(got)
    assert up[1] > 0.995
    # cổ chân thấp chạm "sàn" đúng độ cao
    ank = np.minimum(got[:, JOINT_INDEX["l_ankle"], 1], got[:, JOINT_INDEX["r_ankle"], 1])
    assert abs(np.percentile(ank, 5) - ANKLE_HEIGHT) < 1e-6
    assert np.allclose(got[:, JOINT_INDEX["root_floor"], 1], 0)
    # hình dáng (khớp so với chậu) giữ nguyên cỡ cm
    rel = lambda j: j - j[:, [JOINT_INDEX["pelvis"]]]
    err = np.linalg.norm(rel(got)[:, :16] - rel(gt)[:, :16], axis=-1)
    assert err.mean() < 0.03


def test_left_stays_left_facing_audience():
    clip = synthetic_dance(fps=30, seconds=1, seed=0)
    got = to_stage_motion(_fake_smpl_cam(clip.joints3d, tilt_deg=0), 30)
    # người nhìn khán giả (+Z): tay trái của người ở phía +X (bên phải khán giả)
    assert (got[:, JOINT_INDEX["l_shoulder"], 0] > got[:, JOINT_INDEX["r_shoulder"], 0]).mean() > 0.9


def test_drift_removed():
    clip = synthetic_dance(fps=30, seconds=6, seed=2)
    gt = clip.joints3d.copy()
    walk = np.linspace(0, 2.0, gt.shape[0])  # đi ngang 2 m trong khung
    gt[:, :, 0] += walk[:, None]
    got = to_stage_motion(_fake_smpl_cam(gt, tilt_deg=0), 30, drift_sec=1.0)
    px = got[:, JOINT_INDEX["pelvis"], 0]
    assert np.abs(px).max() < 0.15


def test_convert_file_writes_motion_json(tmp_path):
    clip = synthetic_dance(fps=25, seconds=2, seed=3)
    src = tmp_path / "Lan.npz"
    np.savez(src, joints_cam=_fake_smpl_cam(clip.joints3d), fps=25.0)
    dst = convert_file(str(src), str(tmp_path / "the"), drift_sec=1.5, smooth_frames=3)
    j = json.loads(open(dst, encoding="utf-8").read())
    assert dst.endswith("Lan.motion.json")
    assert j["format"] == "choreo-motion" and j["fps"] == 25.0
    assert j["numFrames"] == 50 and len(j["frames"][0]) == 17 and len(j["jointNames"]) == 17


def test_bad_shape_rejected(tmp_path):
    src = tmp_path / "x.npz"
    np.savez(src, joints_cam=np.zeros((5, 17, 3)), fps=30.0)
    with pytest.raises(ValueError):
        convert_file(str(src), str(tmp_path), drift_sec=1.5, smooth_frames=3)
