"""Khớp video với nhạc gốc bằng tương quan chéo đường bao onset.

Quy ước: offset_sec là thời điểm trong bài nhạc khi video bắt đầu, nên
thời gian video = thời gian nhạc - offset_sec. Video bật quay trước khi nhạc
chạy thì offset âm.
"""

from __future__ import annotations

import numpy as np

FRAME_RATE = 100  # khung đường bao mỗi giây
_SR = 8000
_HOP = _SR // FRAME_RATE  # 80 mẫu
_WIN = 512


def resample_linear(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Đổi tần số lấy mẫu bằng nội suy tuyến tính (đủ cho đường bao onset)."""
    x = np.asarray(x, dtype=np.float64)
    if sr_in == sr_out or len(x) == 0:
        return x.copy()
    n_out = int(round(len(x) * sr_out / sr_in))
    t_out = np.arange(n_out) * (sr_in / sr_out)
    return np.interp(t_out, np.arange(len(x)), x)


def _mono(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64)
    return x.mean(axis=1) if x.ndim == 2 else x


def onset_envelope(x: np.ndarray, sr: int) -> np.ndarray:
    """Spectral flux log năng lượng, 100 khung mỗi giây, chuẩn hoá z."""
    y = resample_linear(_mono(x), sr, _SR)
    n_frames = max(1, int(np.ceil(len(y) / _HOP)))
    pad = np.zeros(n_frames * _HOP + _WIN)
    pad[_WIN // 2: _WIN // 2 + len(y)] = y
    idx = np.arange(_WIN)[None, :] + _HOP * np.arange(n_frames)[:, None]
    frames = pad[idx] * np.hanning(_WIN)[None, :]
    mag = np.log1p(100.0 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(np.diff(mag, axis=0, prepend=mag[:1]), 0.0).sum(axis=1)
    # bỏ thành phần chậm (trung bình trượt 0.5 s) để chỉ giữ cú gõ
    k = FRAME_RATE // 2
    kernel = np.ones(k) / k
    flux = np.maximum(flux - np.convolve(flux, kernel, mode="same"), 0.0)
    sd = flux.std()
    if sd < 1e-12:
        return np.zeros_like(flux)
    return (flux - flux.mean()) / sd


def _xcorr(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Tương quan chéo c[lag] = sum_n a[n + lag] * b[n]; trả (lags, c)."""
    n = len(a) + len(b) - 1
    size = 1 << int(np.ceil(np.log2(n)))
    c = np.fft.irfft(np.fft.rfft(a, size) * np.conj(np.fft.rfft(b, size)), size)
    # lag dương: 0..len(a)-1 ở đầu; lag âm: -(len(b)-1)..-1 ở cuối
    c = np.concatenate([c[size - (len(b) - 1):], c[: len(a)]])
    lags = np.arange(-(len(b) - 1), len(a))
    return lags, c


def estimate_offset(video_audio: np.ndarray, sr_v: int,
                    music: np.ndarray, sr_m: int) -> tuple[float, float]:
    """Trả (offset_sec, confidence).

    confidence = đỉnh tương quan cao nhất / đỉnh cao nhất ngoài ±0.5 s quanh
    nó. Dưới 1.5 thì nên để người dùng căn tay.
    """
    ev = onset_envelope(video_audio, sr_v)
    em = onset_envelope(music, sr_m)
    lags, c = _xcorr(em, ev)  # đỉnh tại lag = vị trí video trong nhạc
    # chuẩn hoá theo số khung chồng lấn để lag ở mép không bị thiệt hay lợi
    overlap = np.minimum(len(ev), len(em) - lags) - np.maximum(0, -lags)
    overlap = np.clip(overlap, 1, None).astype(np.float64)
    min_overlap = min(len(ev), len(em)) * 0.25
    score = np.where(overlap >= min_overlap, c / np.sqrt(overlap), -np.inf)
    i = int(np.argmax(score))
    frac = 0.0
    if 0 < i < len(score) - 1 and np.isfinite(score[i - 1]) and np.isfinite(score[i + 1]):
        y0, y1, y2 = score[i - 1], score[i], score[i + 1]
        den = y0 - 2 * y1 + y2
        if abs(den) > 1e-12:
            frac = float(np.clip(0.5 * (y0 - y2) / den, -0.5, 0.5))
    offset = (lags[i] + frac) / FRAME_RATE
    best = score[i]
    guard = FRAME_RATE // 2
    rest = score.copy()
    rest[max(0, i - guard): i + guard + 1] = -np.inf
    second = np.max(rest) if np.isfinite(rest).any() else 0.0
    if best <= 0:
        conf = 0.0
    elif second <= 1e-12:
        conf = float("inf")
    else:
        conf = float(best / second)
    return float(offset), conf
