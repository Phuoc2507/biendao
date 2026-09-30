"""M3 — Làm sạch chuyển động: làm mượt, foot-lock, tách root motion, retarget.

Xem choreo/cleanup/smooth.py (thuần numpy, chạy ngay). Foot-lock kiểu Kovar và
retarget Mixamo (Blender headless) dựng ở bước sau.
"""

from choreo.cleanup.smooth import (
    savgol_smooth,
    detect_foot_contacts,
    decouple_root_motion,
    enforce_bone_lengths,
)

__all__ = [
    "savgol_smooth",
    "detect_foot_contacts",
    "decouple_root_motion",
    "enforce_bone_lengths",
]
