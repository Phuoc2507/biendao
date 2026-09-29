"""M2 — Adapter hợp nhất đa-view → khung xương 3D.

Interface `MocapAdapter` là điểm cắm: EasyMocap / XRMoCap (chạy trên GPU lab) cắm
vào đây, còn `DummyAdapter` cho phép nhánh sequencer + eval chạy end-to-end ngay
trên CPU mà chưa cần backend thật.
"""

from choreo.mocap.adapter import MocapAdapter, DummyAdapter

__all__ = ["MocapAdapter", "DummyAdapter"]
