"""Xoá phông bằng RobustVideoMatting bản ONNX qua onnxruntime.

Có card đồ hoạ thì tự dùng (onnxruntime-gpu cho CUDA, onnxruntime-directml
cho mọi card trên Windows), không có thì chạy CPU như cũ.

RVM (GPL 3.0) chỉ được GỌI như công cụ ngoài: repo này không chép code của
nó, chỉ nạp file mô hình .onnx người dùng tự tải về. Mô hình có trạng thái
hồi quy (r1..r4) giữ giữa các khung nên mặt nạ ổn định, ít nhấp nháy.
"""

from __future__ import annotations

import numpy as np


def auto_downsample(h: int, w: int) -> float:
    """Tỉ lệ thu nhỏ nội bộ theo khuyến nghị của RVM (~0.25 cho 1080p)."""
    return float(np.clip(480.0 / max(h, w), 0.125, 1.0))


# thứ tự ưu tiên: CUDA, DirectML, cuối cùng CPU
_PREFER = ("CUDAExecutionProvider", "DmlExecutionProvider")


def pick_providers(available: list[str]) -> list[str]:
    """Chọn nơi chạy mô hình từ danh sách onnxruntime có; luôn kèm CPU dự phòng."""
    return [p for p in _PREFER if p in available] + ["CPUExecutionProvider"]


class RVMSession:
    def __init__(self, model_path: str, downsample: float | None = None):
        import onnxruntime as ort  # import có bảo vệ ở cli

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.sess = ort.InferenceSession(
            model_path, opts, providers=pick_providers(ort.get_available_providers()))
        self.device = self.sess.get_providers()[0]
        self.downsample = downsample
        self.reset()

    def reset(self) -> None:
        self.rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4

    def __call__(self, rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """rgb uint8 (H, W, 3) -> (fgr uint8 (H, W, 3), alpha float32 (H, W))."""
        h, w = rgb.shape[:2]
        ratio = self.downsample or auto_downsample(h, w)
        src = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        fgr, pha, *self.rec = self.sess.run(None, {
            "src": src,
            "r1i": self.rec[0], "r2i": self.rec[1],
            "r3i": self.rec[2], "r4i": self.rec[3],
            "downsample_ratio": np.array([ratio], np.float32),
        })
        fgr8 = np.clip(fgr[0].transpose(1, 2, 0) * 255.0 + 0.5, 0, 255).astype(np.uint8)
        return fgr8, pha[0, 0].astype(np.float32)
