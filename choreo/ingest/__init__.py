"""M1 — Nạp video 2 clip, tách audio, đồng bộ thời gian."""

from choreo.ingest.sync import (
    gcc_phat,
    estimate_offset_audio,
    estimate_offset_signal,
    refine_offset_keypoints,
    SyncResult,
)

__all__ = [
    "gcc_phat",
    "estimate_offset_audio",
    "estimate_offset_signal",
    "refine_offset_keypoints",
    "SyncResult",
]
