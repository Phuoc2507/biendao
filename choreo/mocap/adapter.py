"""Interface adapter mocap — ranh giới đổi được giữa các backend.

Ý nghĩa kiến trúc: cả đồ án KHÔNG khoá vào một thư viện mocap cụ thể. M3/M4/M5
chỉ biết tới `MotionClip` và tới hàm:

    adapter.capture(view_a, view_b, calib_a, calib_b) -> MotionClip

Nhờ vậy có thể so EasyMocap vs XRMoCap vs (sau này) sparse-view mà không sửa
phần còn lại. Cũng nhờ vậy Gate 0 chạy được backend thật trên GPU lab, còn CI/
unit-test trên CPU chạy `DummyAdapter`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
import numpy as np

from choreo.schema import MotionClip, CameraCalib, NUM_JOINTS


class MocapAdapter(ABC):
    """Hợp đồng cho mọi backend hợp nhất 2-view → chuyển động 3D.

    Cài đặt thật (EasyMocap/XRMoCap) sẽ:
      1. Chạy 2D pose (RTMPose/ViTPose) trên từng view.
      2. Triangulate + khớp SMPL đa-view với ràng buộc calib.
      3. Xuất khớp 3D theo joint layout của schema (canh thứ tự khớp!).
    """

    name: str = "base"

    @abstractmethod
    def capture(
        self,
        view_a: np.ndarray,
        view_b: np.ndarray,
        calib_a: CameraCalib,
        calib_b: CameraCalib,
        fps: float,
    ) -> MotionClip:
        """view_a, view_b: chuỗi khung hình đã đồng bộ (M1) của 2 máy.

        Dạng đầu vào tuỳ backend (đường dẫn video, mảng ảnh, hay keypoint 2D).
        Trả về `MotionClip` ở joint layout chuẩn của schema.
        """
        raise NotImplementedError


class DummyAdapter(MocapAdapter):
    """Backend giả lập để kiểm thử pipeline không cần GPU/dữ liệu thật.

    Sinh chuyển động 3D tất định (đứng yên + dao động nhẹ) đúng joint layout, cho
    phép nhánh sequencer (M4) và eval (M5) chạy end-to-end từ tuần 1.
    """

    name = "dummy"

    def __init__(self, seed: int = 0) -> None:
        self._rng = np.random.default_rng(seed)

    def capture(
        self,
        view_a: np.ndarray,
        view_b: np.ndarray,
        calib_a: CameraCalib,
        calib_b: CameraCalib,
        fps: float = 30.0,
    ) -> MotionClip:
        # Số frame lấy theo view_a nếu là mảng, ngược lại mặc định 1 giây.
        try:
            num_frames = int(len(view_a))
        except TypeError:
            num_frames = int(fps)
        num_frames = max(num_frames, 2)

        t = np.arange(num_frames) / fps
        base = np.zeros((NUM_JOINTS, 3), dtype=np.float64)
        # Dựng một dáng đứng tối giản: rải khớp theo chiều cao Y.
        base[:, 1] = np.linspace(0.0, 1.7, NUM_JOINTS)
        sway = 0.02 * np.sin(2 * np.pi * 0.5 * t)  # đung đưa 0.5Hz, biên độ 2cm

        joints3d = np.repeat(base[None, :, :], num_frames, axis=0)
        joints3d[:, :, 0] += sway[:, None]  # lắc theo trục X

        contacts = np.ones((num_frames, 2), dtype=bool)  # giả định luôn chạm sàn
        return MotionClip(
            fps=fps,
            joints3d=joints3d,
            contacts=contacts,
            meta={"adapter": self.name, "source": "synthetic"},
        )


class TriangulationAdapter(MocapAdapter):
    """Backend hình học THẬT chạy CPU: nhận keypoint 2D đã có của 2 view rồi tam
    giác hoá ra 3D (qua choreo.mocap.fuse). Đây là lõi hợp nhất mà EasyMocap/
    XRMoCap cũng làm ở bước cuối — tách khỏi phần detector 2D (GPU) để test ngay.

    Ở đây `view_a`, `view_b` là mảng keypoint 2D shape (T, J, 2) theo pixel
    (NaN = khớp bị che ở view đó), KHÔNG phải khung hình thô. Khi có GPU lab, một
    adapter con chỉ cần chạy 2D pose trên video rồi gọi lại `capture` này.
    """

    name = "triangulation"

    def __init__(self, smooth: bool = True, smooth_window: int = 7) -> None:
        self._smooth = smooth
        self._window = smooth_window

    def capture(
        self,
        view_a: np.ndarray,
        view_b: np.ndarray,
        calib_a: CameraCalib,
        calib_b: CameraCalib,
        fps: float = 30.0,
    ) -> MotionClip:
        from choreo.mocap.fuse import fuse_multiview

        kp = np.stack([np.asarray(view_a, dtype=np.float64),
                       np.asarray(view_b, dtype=np.float64)], axis=0)  # (2,T,J,2)
        clip = fuse_multiview(
            kp, [calib_a, calib_b], fps,
            smooth=self._smooth, smooth_window=self._window,
            meta={"adapter": self.name},
        )
        return clip
