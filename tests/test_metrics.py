"""Test M5 metrics bằng dữ liệu tổng hợp có đáp án biết trước."""

import numpy as np
import pytest

from choreo.eval import (
    mpjpe,
    pa_mpjpe,
    per_joint_error,
    jitter,
    foot_slip,
    reprojection_error,
)
from choreo.schema import CameraCalib, NUM_JOINTS


def _pose(seed=0, T=10, J=17):
    rng = np.random.default_rng(seed)
    return rng.standard_normal((T, J, 3)) * 0.3


def test_mpjpe_zero_when_identical():
    p = _pose(1)
    assert mpjpe(p, p) == pytest.approx(0.0, abs=1e-9)


def test_mpjpe_known_offset_root_relative():
    # Dịch toàn cục không đổi -> MPJPE root-relative phải = 0.
    p = _pose(2)
    q = p + np.array([0.1, -0.2, 0.05])
    assert mpjpe(p, q, root=0) == pytest.approx(0.0, abs=1e-9)


def test_mpjpe_known_value_no_root():
    # Dịch mỗi khớp 3mm theo X, không căn gốc -> MPJPE = 3mm.
    p = _pose(3)
    q = p + np.array([0.003, 0.0, 0.0])
    assert mpjpe(p, q, root=None) == pytest.approx(3.0, abs=1e-6)


def test_pa_mpjpe_invariant_to_rotation_scale():
    # PA-MPJPE bất biến với xoay + tỉ lệ + tịnh tiến toàn cục.
    p = _pose(4)
    theta = 0.7
    Rz = np.array(
        [
            [np.cos(theta), -np.sin(theta), 0],
            [np.sin(theta), np.cos(theta), 0],
            [0, 0, 1],
        ]
    )
    q = 2.0 * (p @ Rz.T) + np.array([1.0, 2.0, -3.0])
    assert pa_mpjpe(p, q) == pytest.approx(0.0, abs=1e-6)


def test_per_joint_error_shape():
    p, q = _pose(5), _pose(6)
    e = per_joint_error(p, q, root=None)
    assert e.shape == (10, 17)


def test_jitter_zero_for_constant_velocity():
    # Chuyển động thẳng đều -> gia tốc 0 -> jitter 0.
    T, J = 20, NUM_JOINTS
    t = np.arange(T)[:, None, None]
    x = t * np.ones((1, J, 3)) * 0.01
    assert jitter(x, fps=30.0) == pytest.approx(0.0, abs=1e-9)


def test_jitter_positive_for_noise():
    x = _pose(7, T=30)
    assert jitter(x, fps=30.0) > 0


def test_foot_slip_zero_when_planted():
    # Chân đứng yên khi chạm sàn -> foot_slip = 0.
    T, J = 15, NUM_JOINTS
    x = np.zeros((T, J, 3))
    x[:, 7, :] = np.array([0.5, 0.0, 0.3])  # mắt cá trái cố định
    contacts = np.ones((T, 1), dtype=bool)
    assert foot_slip(x, contacts, fps=30.0, foot_joints=(7,)) == pytest.approx(0.0)


def test_foot_slip_measures_horizontal_drift():
    # Chân trượt ngang 1cm/frame khi chạm sàn -> foot_slip = 10mm.
    T, J = 5, NUM_JOINTS
    x = np.zeros((T, J, 3))
    x[:, 7, 0] = np.arange(T) * 0.01  # trượt 1cm mỗi frame theo X
    contacts = np.ones((T, 1), dtype=bool)
    assert foot_slip(x, contacts, fps=30.0, foot_joints=(7,)) == pytest.approx(10.0)


def test_reprojection_error_zero_for_perfect_projection():
    # Chiếu 3D bằng chính P rồi so lại -> lỗi 0.
    rng = np.random.default_rng(8)
    X = rng.standard_normal((4, NUM_JOINTS, 3)) * 0.3
    X[..., 2] += 4.0  # đẩy ra trước camera (Z dương)
    calib = CameraCalib(
        K=np.array([[1000, 0, 960], [0, 1000, 540], [0, 0, 1]], dtype=float),
        R=np.eye(3),
        t=np.zeros(3),
    )
    P = calib.P
    homog = np.concatenate([X, np.ones((*X.shape[:2], 1))], axis=2)
    proj = homog @ P.T
    uv = proj[..., :2] / proj[..., 2:3]
    assert reprojection_error(X, uv, P) == pytest.approx(0.0, abs=1e-6)
