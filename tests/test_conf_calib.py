"""Test hiệu chuẩn confidence → σ (px) từ sai số tái chiếu, không cần 3D GT."""

from __future__ import annotations

import numpy as np

from choreo.geom import look_at_camera, project_points
from choreo.mocap.conf_calib import (
    ConfCalibration,
    _pav_nonincreasing,
    calibrate_confidence,
    per_view_reproj_residual,
)
from choreo.synth import synthetic_dance


def test_pav_is_nonincreasing():
    y = np.array([3.0, 1.0, 2.0, 0.5, 0.9])
    w = np.ones_like(y)
    out = _pav_nonincreasing(y, w)
    assert np.all(np.diff(out) <= 1e-9)                 # không tăng
    # PAV giữ tổng có trọng số (tính chất chiếu bảo toàn trung bình).
    assert abs(np.sum(out * w) - np.sum(y * w)) < 1e-9


def test_calibration_recovers_true_sigma():
    # residual sinh từ σ_true(conf) đã biết -> hiệu chuẩn phải khôi phục xấp xỉ.
    rng = np.random.default_rng(0)
    conf = rng.uniform(0.0, 1.0, size=40000)
    sigma_true = 1.0 + (1.0 - conf) * 9.0
    # residual = |chuẩn tắc| * σ (RMS = σ) — đo relative là đủ cho trọng số.
    resid = np.abs(rng.normal(0.0, 1.0, size=conf.shape)) * sigma_true
    cal = calibrate_confidence(conf, resid, n_bins=12)
    assert isinstance(cal, ConfCalibration)
    assert np.all(np.diff(cal.sigma) <= 1e-9)           # σ giảm theo confidence
    assert abs(cal.sigma_of(0.1) - 9.1) < 1.0
    assert abs(cal.sigma_of(0.9) - 1.9) < 0.6


def test_weight_is_inverse_sigma_and_monotone():
    rng = np.random.default_rng(1)
    conf = rng.uniform(0.0, 1.0, size=20000)
    sigma_true = 1.0 + (1.0 - conf) * 9.0
    resid = np.abs(rng.normal(0.0, 1.0, size=conf.shape)) * sigma_true
    cal = calibrate_confidence(conf, resid, n_bins=10)
    w_lo = cal.weight_of(0.1)
    w_hi = cal.weight_of(0.9)
    assert w_hi > w_lo                                   # tin cậy cao -> trọng số lớn
    # bội số hàng = 1/σ (không phải 1/σ²).
    assert abs(w_hi - 1.0 / cal.sigma_of(0.9)) < 1e-9


def test_reproj_residual_zero_on_exact_projection():
    gt = synthetic_dance(fps=30.0, seconds=0.5, seed=2).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    kp = np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2) chiếu ĐÚNG từ gt
    res = per_view_reproj_residual(gt, kp, P)
    assert res.shape == (2, gt.shape[0], gt.shape[1])
    assert np.nanmax(res) < 1e-6                         # chiếu đúng -> residual ~0


def test_reproj_residual_tracks_2d_noise():
    gt = synthetic_dance(fps=30.0, seconds=0.5, seed=3).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    kp = np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )
    kp[0, :, 5] += np.array([10.0, 0.0])                 # dịch 1 khớp 1 view 10px
    res = per_view_reproj_residual(gt, kp, P)
    assert abs(np.nanmean(res[0, :, 5]) - 10.0) < 1e-6   # residual = đúng độ dịch
