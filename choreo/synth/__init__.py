"""Nguồn chuyển động tổng hợp có kiểm soát (ground-truth) cho thực nghiệm.

Khác với DummyAdapter (chỉ đứng lắc nhẹ), ở đây dựng một đoạn "múa" có xoay thân,
vung tay theo vòng, và nhún gối — để sai số tam giác hoá thật sự phụ thuộc vào
hình học đặt máy, cho ra đường cong MPJPE-theo-góc có ý nghĩa.
"""

from choreo.synth.dancer import synthetic_dance

__all__ = ["synthetic_dance"]
