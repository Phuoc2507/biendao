"""Test mô hình nhiễu detector 2D (choreo.mocap.noise2d) — thuần, không GPU/mạng."""

from __future__ import annotations

import numpy as np
import pytest

from choreo.datasets.aist import COCO17_NAMES
from choreo.mocap.noise2d import COCO_LR_PAIRS, perturb_keypoints2d


def _clean(V=2, T=5, J=17):
    rng = np.random.default_rng(0)
    kp = rng.normal(500, 100, size=(V, T, J, 2))
    conf = np.full((V, T, J), 0.9)
    return kp, conf


def test_lr_pairs_are_symmetric_and_disjoint():
    # 8 cặp đối xứng, mỗi chỉ số COCO xuất hiện tối đa 1 lần, tên khớp l_/r_
    assert len(COCO_LR_PAIRS) == 8
    flat = [i for p in COCO_LR_PAIRS for i in p]
    assert len(flat) == len(set(flat))
    for a, b in COCO_LR_PAIRS:
        assert COCO17_NAMES[a].startswith("l_")
        assert COCO17_NAMES[b] == "r_" + COCO17_NAMES[a][2:]


def test_zero_noise_is_identity():
    kp, conf = _clean()
    kp2, cf2 = perturb_keypoints2d(kp, conf, sigma_px=0.0, rng=np.random.default_rng(1))
    assert np.array_equal(kp2, kp)
    assert np.array_equal(cf2, conf)
    assert kp2 is not kp              # không sửa mảng gốc


def test_jitter_scales_with_sigma_and_preserves_shape():
    kp, conf = _clean(V=4, T=200, J=17)
    s1 = perturb_keypoints2d(kp, conf, sigma_px=2.0, rng=np.random.default_rng(2))[0]
    s2 = perturb_keypoints2d(kp, conf, sigma_px=8.0, rng=np.random.default_rng(2))[0]
    assert s1.shape == kp.shape
    # lệch chuẩn thực tăng theo sigma_px (×4), kiểm trên số lớn mẫu
    r1 = np.std(s1 - kp)
    r2 = np.std(s2 - kp)
    assert r2 > r1 * 2.5              # xấp xỉ ×4, nới rộng cho ngẫu nhiên


def test_low_confidence_is_noisier():
    # cùng sigma, khớp conf thấp phải lệch mạnh hơn khớp conf cao
    V, T, J = 1, 5000, 17
    kp = np.zeros((V, T, J, 2))
    conf = np.zeros((V, T, J))
    conf[..., 0] = 1.0               # khớp 0: tin cậy đầy  -> sigma_eff = s
    conf[..., 1] = 0.0               # khớp 1: tin cậy 0    -> sigma_eff = 2s
    out = perturb_keypoints2d(kp, conf, sigma_px=3.0, rng=np.random.default_rng(3))[0]
    assert np.std(out[..., 1, :]) > np.std(out[..., 0, :]) * 1.5


def test_drop_sets_nan_and_zero_conf():
    kp, conf = _clean(V=3, T=1000, J=17)
    kp2, cf2 = perturb_keypoints2d(kp, conf, sigma_px=0.0, drop_rate=0.3,
                                   rng=np.random.default_rng(4))
    dropped = np.isnan(kp2).any(axis=-1)         # (V,T,J)
    assert dropped.any()                          # có khớp bị sót
    assert np.allclose(cf2[dropped], 0.0)         # conf về 0 đúng chỗ sót
    assert not np.isnan(kp2[~dropped]).any()      # chỗ còn lại không NaN
    # tỉ lệ sót xấp xỉ drop_rate
    assert 0.25 < dropped.mean() < 0.35


def test_swap_moves_coordinates_between_lr_pair():
    # swap_rate=1 -> MỌI (view,frame) tráo đúng 1 cặp L/R; tổng toạ độ bất biến
    V, T, J = 1, 50, 17
    kp = np.arange(V * T * J * 2, dtype=float).reshape(V, T, J, 2)
    conf = np.full((V, T, J), 0.5)
    kp2 = perturb_keypoints2d(kp, conf, sigma_px=0.0, swap_rate=1.0,
                              rng=np.random.default_rng(5))[0]
    assert np.allclose(np.sort(kp2.reshape(-1)), np.sort(kp.reshape(-1)))  # hoán vị
    assert not np.array_equal(kp2, kp)            # thực sự có tráo


def test_invalid_params_raise():
    kp, conf = _clean()
    rng = np.random.default_rng(6)
    with pytest.raises(ValueError):
        perturb_keypoints2d(kp, conf, sigma_px=-1.0, rng=rng)
    with pytest.raises(ValueError):
        perturb_keypoints2d(kp, conf, sigma_px=1.0, drop_rate=2.0, rng=rng)
    with pytest.raises(ValueError):
        perturb_keypoints2d(kp, conf[:, :, :5], sigma_px=1.0, rng=rng)  # lệch shape


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
