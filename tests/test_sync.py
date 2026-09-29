"""Test M1 sync bằng tín hiệu tổng hợp — kiểm chứng được ngay, không cần dữ liệu thật."""

import numpy as np
import pytest

from choreo.ingest import (
    gcc_phat,
    estimate_offset_audio,
    estimate_offset_signal,
    refine_offset_keypoints,
    SyncResult,
)


def _clap_track(sr, dur=3.0, clap_at=0.5, seed=0):
    """Track audio giả: nền ồn nhẹ + một xung 'vỗ tay' tại clap_at giây."""
    rng = np.random.default_rng(seed)
    n = int(sr * dur)
    sig = 0.01 * rng.standard_normal(n)
    idx = int(sr * clap_at)
    # xung tắt dần mô phỏng tiếng vỗ tay
    L = int(sr * 0.02)
    env = np.exp(-np.linspace(0, 6, L))
    sig[idx : idx + L] += env * rng.standard_normal(L)
    return sig


def test_gcc_phat_recovers_known_delay():
    sr = 16000
    ref = _clap_track(sr, clap_at=0.5, seed=1)
    delay = 0.123  # sig trễ 123ms so với ref
    d = int(sr * delay)
    sig = np.concatenate([np.zeros(d), ref])[: ref.size]  # dịch trễ
    tau, _ = gcc_phat(sig, ref, fs=sr, max_tau=1.0)
    assert tau == pytest.approx(delay, abs=1.0 / sr * 2)


def test_estimate_offset_audio_sign_positive_when_sig_delayed():
    sr = 16000
    ref = _clap_track(sr, clap_at=0.4, seed=2)
    delay = 0.08
    d = int(sr * delay)
    sig = np.concatenate([np.zeros(d), ref])[: ref.size]
    off = estimate_offset_audio(sig, ref, sr=sr)
    assert off > 0
    assert off == pytest.approx(delay, abs=2.0 / sr)


def test_estimate_offset_zero_when_identical():
    sr = 16000
    ref = _clap_track(sr, seed=3)
    assert estimate_offset_audio(ref, ref, sr=sr) == pytest.approx(0.0, abs=1.0 / sr)


def test_estimate_offset_signal_subsample():
    fps = 60.0
    t = np.arange(0, 4, 1 / fps)
    ref = np.sin(2 * np.pi * 1.3 * t) + 0.5 * np.sin(2 * np.pi * 0.4 * t)
    lag_frames = 5
    sig = np.concatenate([np.zeros(lag_frames), ref])[: ref.size]  # sig trễ 5 frame
    off = estimate_offset_signal(sig, ref, fps=fps, max_lag_s=0.5)
    assert off == pytest.approx(lag_frames / fps, abs=1.0 / fps)


def test_refine_offset_keypoints():
    fps = 60.0
    T, J = 240, 17
    rng = np.random.default_rng(4)
    # chuyển động mượt: mỗi khớp đi theo tổng vài hình sin
    t = np.arange(T) / fps
    base = np.stack(
        [np.sin(2 * np.pi * (0.3 + 0.1 * k) * t + k) for k in range(J)], axis=1
    )
    kp_ref = np.stack([base, 0.5 * base], axis=2)  # (T,J,2)
    lag = 4
    kp_sig = np.concatenate([np.zeros((lag, J, 2)), kp_ref])[:T]
    off = refine_offset_keypoints(kp_sig, kp_ref, fps=fps, max_lag_s=0.5)
    assert off == pytest.approx(lag / fps, abs=1.5 / fps)


def test_sync_result_frame_shift():
    r = SyncResult(offset_s=0.05)
    assert r.frame_shift(60.0) == 3
