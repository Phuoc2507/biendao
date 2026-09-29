"""M1 — Đồng bộ thời gian giữa 2 clip điện thoại.

Hai clip quay bằng 2 máy không bấm nút cùng lúc → lệch vài trăm ms. Phải căn về
cùng mốc thời gian trước khi triangulate, nếu không 3D sẽ méo.

Chiến lược 2 tầng (khớp §pipeline trong đặc tả):
  1. Thô: cross-correlation audio bằng GCC-PHAT trên tiếng vỗ tay đầu clip.
     GCC-PHAT chuẩn hoá biên độ theo tần số → nhọn đỉnh, bền với vọng/ồn.
  2. Tinh: cross-correlation tốc độ keypoint (chuyển động toàn thân) — không phụ
     thuộc audio, bắt được cả trôi đồng bộ khi audio yếu.

Quy ước dấu (nhất quán toàn module):
  offset > 0  nghĩa là `sig` TRỄ hơn `ref` một khoảng `offset` giây
  → để căn: dịch `sig` sớm lại `offset`, hoặc dịch `ref` trễ đi `offset`.

Thuần numpy — chạy trên CPU, kiểm chứng được bằng tín hiệu tổng hợp, không cần
dữ liệu thật hay GPU.
"""

from __future__ import annotations

from dataclasses import dataclass
import numpy as np

_EPS = 1e-12


def gcc_phat(
    sig: np.ndarray,
    ref: np.ndarray,
    fs: float,
    max_tau: float | None = None,
    interp: int = 16,
) -> tuple[float, np.ndarray]:
    """Generalized Cross-Correlation with Phase Transform (Knapp–Carter 1976).

    Trả về (tau, cc):
      tau — độ trễ của `sig` so với `ref`, đơn vị giây (dấu như mô tả ở đầu file).
      cc  — hàm tương quan (đã nội suy) để chẩn đoán/độ tin cậy.

    `interp` nội suy để đạt độ phân giải dưới-mẫu (sub-sample), quan trọng khi
    fps/độ trễ nhỏ hơn 1 mẫu audio.
    """
    sig = np.asarray(sig, dtype=np.float64).reshape(-1)
    ref = np.asarray(ref, dtype=np.float64).reshape(-1)
    n = sig.size + ref.size

    SIG = np.fft.rfft(sig, n=n)
    REF = np.fft.rfft(ref, n=n)
    R = SIG * np.conj(REF)
    R /= np.abs(R) + _EPS  # PHAT: giữ pha, bỏ biên độ

    cc = np.fft.irfft(R, n=n * interp)

    max_shift = int(interp * n / 2)
    if max_tau is not None:
        max_shift = min(int(interp * fs * max_tau), max_shift)

    # Gộp hai nửa để lag 0 nằm giữa: [ -max_shift ... 0 ... +max_shift ]
    cc = np.concatenate((cc[-max_shift:], cc[: max_shift + 1]))
    shift = int(np.argmax(np.abs(cc))) - max_shift
    tau = shift / float(interp * fs)
    return tau, cc


def estimate_offset_audio(
    sig: np.ndarray,
    ref: np.ndarray,
    sr: float,
    max_tau: float | None = 2.0,
) -> float:
    """Ước lượng lệch thời gian thô (giây) giữa 2 track audio bằng GCC-PHAT.

    `max_tau` giới hạn cửa sổ tìm kiếm (giây) — mặc định ±2s, đủ cho lệch bấm nút.
    """
    tau, _ = gcc_phat(sig, ref, fs=sr, max_tau=max_tau)
    return tau


def estimate_offset_signal(
    sig: np.ndarray,
    ref: np.ndarray,
    fps: float,
    max_lag_s: float | None = None,
    subsample: bool = True,
) -> float:
    """Lệch thời gian (giây) giữa 2 tín hiệu 1D cùng tần số lấy mẫu, bằng
    cross-correlation chuẩn hoá + tinh chỉnh đỉnh bằng nội suy parabol.

    Dùng cho tín hiệu tốc-độ-keypoint. offset > 0 ⇒ `sig` trễ hơn `ref`.
    """
    a = np.asarray(sig, dtype=np.float64).reshape(-1)
    b = np.asarray(ref, dtype=np.float64).reshape(-1)
    a = a - a.mean()
    b = b - b.mean()
    a /= np.linalg.norm(a) + _EPS
    b /= np.linalg.norm(b) + _EPS

    corr = np.correlate(a, b, mode="full")
    # correlate(a, b, 'full')[k] tương ứng lag = k - (len(b) - 1),
    # với lag>0 nghĩa là a bị dịch trễ so với b (a[n] ~ b[n - lag]).
    lags = np.arange(-(b.size - 1), a.size)

    if max_lag_s is not None:
        max_lag = int(round(max_lag_s * fps))
        mask = np.abs(lags) <= max_lag
        corr = corr[mask]
        lags = lags[mask]

    peak = int(np.argmax(corr))
    lag = float(lags[peak])

    if subsample and 0 < peak < corr.size - 1:
        y0, y1, y2 = corr[peak - 1], corr[peak], corr[peak + 1]
        denom = y0 - 2.0 * y1 + y2
        if denom != 0.0:
            lag += 0.5 * (y0 - y2) / denom

    return lag / fps


def _keypoint_speed(kp2d: np.ndarray) -> np.ndarray:
    """Tốc độ chuyển động toàn thân theo frame: trung bình |Δkeypoint| qua các khớp.

    kp2d: (T, J, 2). Trả về (T,). Bất biến với vị trí camera (chỉ dùng độ lớn
    chuyển động), nên so được giữa 2 view khác góc.
    """
    kp2d = np.asarray(kp2d, dtype=np.float64)
    disp = np.diff(kp2d, axis=0)               # (T-1, J, 2)
    speed = np.linalg.norm(disp, axis=2).mean(axis=1)  # (T-1,)
    return np.concatenate([speed[:1], speed])  # đệm về độ dài T


def refine_offset_keypoints(
    kp2d_sig: np.ndarray,
    kp2d_ref: np.ndarray,
    fps: float,
    max_lag_s: float = 0.5,
) -> float:
    """Tinh chỉnh lệch thời gian bằng tốc độ keypoint (sau bước audio thô).

    `max_lag_s` nhỏ vì đây là bước tinh sau khi đã căn thô bằng audio.
    """
    speed_sig = _keypoint_speed(kp2d_sig)
    speed_ref = _keypoint_speed(kp2d_ref)
    return estimate_offset_signal(speed_sig, speed_ref, fps=fps, max_lag_s=max_lag_s)


@dataclass
class SyncResult:
    """Kết quả đồng bộ tổng hợp giữa clip `sig` và clip tham chiếu `ref`."""

    offset_s: float                 # lệch cuối cùng dùng để căn (giây), sig trễ hơn ref
    audio_offset_s: float | None = None
    keypoint_offset_s: float | None = None

    def frame_shift(self, fps: float) -> int:
        """Số frame cần dịch (làm tròn) để căn `sig` về `ref`."""
        return int(round(self.offset_s * fps))
