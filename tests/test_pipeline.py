"""Test end-to-end tối giản: DummyAdapter -> cleanup -> eval, chạy trên CPU.

Chứng minh hợp đồng schema nối được cả pipeline mà chưa cần backend mocap thật.
"""

import numpy as np
import pytest

from choreo.schema import MotionClip, CameraCalib, NUM_JOINTS
from choreo.mocap import DummyAdapter
from choreo.cleanup import savgol_smooth, detect_foot_contacts, decouple_root_motion
from choreo.eval import jitter, mpjpe


def _calib():
    return CameraCalib(
        K=np.array([[1000, 0, 960], [0, 1000, 540], [0, 0, 1]], dtype=float),
        R=np.eye(3),
        t=np.array([0.0, 0.0, 3.0]),
    )


def test_dummy_adapter_produces_valid_clip():
    adapter = DummyAdapter()
    frames = np.zeros((30, 4, 4))  # 30 khung giả
    clip = adapter.capture(frames, frames, _calib(), _calib(), fps=30.0)
    assert isinstance(clip, MotionClip)
    assert clip.num_frames == 30
    assert clip.joints3d.shape == (30, NUM_JOINTS, 3)
    assert clip.duration == pytest.approx(1.0)


def test_smoothing_reduces_jitter():
    rng = np.random.default_rng(0)
    clean = DummyAdapter().capture(
        np.zeros((60, 1)), np.zeros((60, 1)), _calib(), _calib(), fps=30.0
    ).joints3d
    noisy = clean + rng.standard_normal(clean.shape) * 0.01
    smoothed = savgol_smooth(noisy, window=7, polyorder=2)
    assert jitter(smoothed, 30.0) < jitter(noisy, 30.0)
    # làm mượt phải kéo lại gần tín hiệu gốc so với nhiễu
    assert mpjpe(smoothed, clean, root=None) < mpjpe(noisy, clean, root=None)


def test_detect_foot_contacts_shape():
    clip = DummyAdapter().capture(
        np.zeros((20, 1)), np.zeros((20, 1)), _calib(), _calib(), fps=30.0
    )
    contacts = detect_foot_contacts(clip)
    assert contacts.shape == (20, 2)
    assert contacts.dtype == bool


def test_decouple_root_motion_removes_horizontal_drift():
    clip = DummyAdapter().capture(
        np.zeros((30, 1)), np.zeros((30, 1)), _calib(), _calib(), fps=30.0
    )
    # thêm dịch chuyển ngang cho toàn thân
    drift = np.linspace(0, 2.0, clip.num_frames)
    clip.joints3d[:, :, 0] += drift[:, None]
    in_place, root_traj = decouple_root_motion(clip)
    # sau khi tách, gốc (pelvis) không còn trôi ngang
    assert np.allclose(in_place[:, 0, [0, 2]], in_place[0, 0, [0, 2]])
    assert root_traj.shape == (clip.num_frames, 3)
    assert np.allclose(root_traj[:, 1], 0.0)  # quỹ đạo nằm trên sàn
