"""Khớp nhạc cho thẻ video: tín hiệu tổng hợp với độ lệch biết trước."""

import numpy as np
import pytest

from choreo.videocard.align import estimate_offset, onset_envelope, resample_linear


def _clicks(sec, sr, times, seed=0, freq=None):
    """Chuỗi tiếng gõ ngắn (tắt dần) tại các thời điểm cho trước."""
    rng = np.random.default_rng(seed)
    x = np.zeros(int(sec * sr), dtype=np.float64)
    n = int(0.06 * sr)
    env = np.exp(-np.arange(n) / (0.012 * sr))
    for i, t in enumerate(times):
        k = int(t * sr)
        if k + n >= len(x):
            continue
        if freq is None:
            burst = rng.standard_normal(n)
        else:
            burst = np.sin(2 * np.pi * freq * np.arange(n) / sr)
        x[k:k + n] += burst * env * (0.5 + 0.5 * ((i * 7) % 5) / 4)
    return x


def _music(sec=40.0, sr=44100, seed=1):
    rng = np.random.default_rng(seed)
    gaps = rng.uniform(0.18, 0.9, size=400)
    times = np.cumsum(gaps)
    times = times[times < sec - 0.2]
    return _clicks(sec, sr, times, seed=seed), times


def test_onset_envelope_rate():
    sr = 8000
    x = np.zeros(sr * 3)
    env = onset_envelope(x, sr)
    assert abs(len(env) - 300) <= 2


def test_resample_length():
    x = np.ones(44100)
    y = resample_linear(x, 44100, 8000)
    assert abs(len(y) - 8000) <= 1


def test_offset_positive_cut_from_music():
    sr = 44100
    music, _ = _music(sr=sr)
    start = 3.27
    video = music[int(start * sr): int((start + 20) * sr)].copy()
    off, conf = estimate_offset(video, sr, music, sr)
    assert off == pytest.approx(start, abs=0.02)
    assert conf >= 1.5


def test_offset_negative_video_starts_before_music():
    sr = 44100
    music, _ = _music(sr=sr)
    rng = np.random.default_rng(5)
    pre = 0.01 * rng.standard_normal(int(1.5 * sr))
    video = np.concatenate([pre, music[: int(25 * sr)]])
    off, _ = estimate_offset(video, sr, music, sr)
    assert off == pytest.approx(-1.5, abs=0.02)


def test_offset_with_noise_and_gain():
    sr = 44100
    music, _ = _music(sr=sr, seed=3)
    start = 7.8
    video = 0.3 * music[int(start * sr): int((start + 25) * sr)]
    rng = np.random.default_rng(9)
    video = video + rng.standard_normal(len(video)) * np.std(video)  # SNR ~ 0 dB
    off, _ = estimate_offset(video, sr, music, sr)
    assert off == pytest.approx(start, abs=0.02)


def test_offset_different_sample_rates():
    music48, times = _music(sr=48000, seed=4)
    start = 5.05
    # cùng chuỗi tiếng gõ nhưng tạo ở 44100 Hz, dời theo start
    video44 = _clicks(20.0, 44100, times - start, seed=4)
    off, _ = estimate_offset(video44, 44100, music48, 48000)
    assert off == pytest.approx(start, abs=0.02)


def test_periodic_metronome_low_confidence():
    sr = 22050
    times = np.arange(0.25, 30, 0.5)
    music = _clicks(30.0, sr, times, freq=1000.0)
    video = music[int(4.0 * sr): int(20 * sr)]
    _, conf = estimate_offset(video, sr, music, sr)
    assert conf < 1.5
