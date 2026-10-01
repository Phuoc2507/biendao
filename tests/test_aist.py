"""Test phần TOÁN THUẦN của loader AIST++ (choreo.datasets.aist).

Chỉ kiểm hàm thuần — KHÔNG chạm mạng/đĩa: Rodrigues rvec->R (tính chất ma trận
quay + tương đương hàm _rodrigues của lõi) và dựng CameraCalib từ entry AIST.
Phần I/O (HTTP Range, cache) không test ở đây vì phụ thuộc mạng; nó chỉ phục vụ
thực nghiệm, không nằm trong pipeline lõi.
"""

from __future__ import annotations

import numpy as np
import pytest

from choreo.datasets.aist import COCO, COCO17_NAMES, calib_from_aist, rodrigues
from choreo.geom.cameras import _rodrigues


def test_rodrigues_zero_is_identity():
    assert np.allclose(rodrigues([0.0, 0.0, 0.0]), np.eye(3))
    assert np.allclose(rodrigues([0.0, 1e-15, 0.0]), np.eye(3))


def test_rodrigues_is_rotation_matrix():
    rng = np.random.default_rng(0)
    for _ in range(20):
        rvec = rng.normal(size=3) * rng.uniform(0, 3)
        R = rodrigues(rvec)
        assert np.allclose(R @ R.T, np.eye(3), atol=1e-12)   # trực giao
        assert np.isclose(np.linalg.det(R), 1.0, atol=1e-12)  # quay thuần (det=+1)


def test_rodrigues_known_90deg_about_z():
    R = rodrigues([0.0, 0.0, np.pi / 2])
    assert np.allclose(R, [[0, -1, 0], [1, 0, 0], [0, 0, 1]], atol=1e-12)


def test_rodrigues_matches_core_axis_angle():
    """rvec = trục*góc phải cho cùng R như _rodrigues(trục, góc) của lõi."""
    rng = np.random.default_rng(1)
    for _ in range(20):
        axis = rng.normal(size=3)
        axis /= np.linalg.norm(axis)
        angle = rng.uniform(0.1, np.pi)
        assert np.allclose(rodrigues(axis * angle), _rodrigues(axis, angle), atol=1e-12)


def _fake_cam():
    """Một entry camera kiểu AIST (rotation là vector Rodrigues)."""
    return {
        "matrix": [[1200.0, 0.0, 960.0], [0.0, 1200.0, 540.0], [0.0, 0.0, 1.0]],
        "rotation": [0.1, -2.0, 0.3],
        "translation": [10.0, -5.0, 300.0],
        "distortions": [0.01, -0.02, 0.0, 0.0, 0.003],
        "size": [1920, 1080],
    }


def test_calib_from_aist_shapes_and_rotation():
    cal = calib_from_aist(_fake_cam())
    assert cal.K.shape == (3, 3)
    assert cal.R.shape == (3, 3)
    assert cal.t.shape == (3,)
    assert cal.dist.shape == (5,)
    assert cal.image_size == (1920, 1080)
    assert np.allclose(cal.R @ cal.R.T, np.eye(3), atol=1e-12)  # R hợp lệ
    assert np.allclose(cal.R, rodrigues([0.1, -2.0, 0.3]))      # đúng rvec->R


def test_calib_from_aist_projection_matrix():
    cal = calib_from_aist(_fake_cam())
    assert cal.P.shape == (3, 4)                 # P = K[R|t]
    assert np.allclose(cal.P[:, :3], cal.K @ cal.R)


def test_coco_index_sanity():
    assert len(COCO17_NAMES) == 17
    assert len(COCO) == 17
    assert sorted(COCO.values()) == list(range(17))   # 0..16, không trùng
    # vài mốc dùng trong thực nghiệm (hông trái/phải cho tâm người)
    assert COCO["l_hip"] == 11 and COCO["r_hip"] == 12
    assert COCO["nose"] == 0


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
