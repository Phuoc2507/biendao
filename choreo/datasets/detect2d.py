"""Chạy 2D pose (RTMPose) trên 1 video -> keypoint COCO-17 (T,17,3)=[x,y,conf].

Đây là bước DUY NHẤT cần GPU ở Gate 0 (detector thật trên pixel). Phần hình học
còn lại (fuse_multiview) ăn thẳng mảng (V,T,17,3) mà hàm này xuất ra — cùng định
dạng với keypoints2d có sẵn của AIST, nên có thể THAY THẾ trực tiếp để đo "giá
của detector thật" so với keypoint curated.

KHỚP TRỤC KHỚP: RTMPose(COCO) xuất đúng thứ tự COCO-17 chuẩn, TRÙNG với
COCO17_NAMES của aist.py (nose, l_eye, r_eye, ...). KHÔNG cần đổi thứ tự.
KHỚP TOẠ ĐỘ: keypoint là pixel ở độ phân giải video = độ phân giải calib AIST
(1920x1080) -> dùng thẳng với calib.P, không cần chuẩn hoá.

Phụ thuộc (CHỈ ở máy GPU): mmpose + mmdet + mmcv (Ampere/CUDA 12.x: wheel chuẩn).
Import được BẢO VỆ: module nạp được trên máy không có mmpose để test phần thuần
(chọn instance, đóng gói) — chỉ khi KHỞI TẠO Rtmpose2D mới cần mmpose thật.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

# Alias model mmpose: tự ghép RTMDet (phát hiện người) + RTMPose-l (17 khớp COCO).
DEFAULT_MODEL = "human"
NUM_COCO = 17


def select_instance(keypoints: np.ndarray, scores: np.ndarray) -> np.ndarray:
    """Nhiều người trong khung -> chọn 1 (AIST ~ 1 vũ công). Trả (17,3)=[x,y,conf].

    keypoints: (P,17,2), scores: (P,17). Chọn người có TỔNG điểm tin cậy cao nhất
    (người rõ nhất/gần nhất). Khung rỗng (P=0) -> (17,3) toàn NaN (fuse sẽ lấp).
    """
    keypoints = np.asarray(keypoints, dtype=float)
    scores = np.asarray(scores, dtype=float)
    if keypoints.ndim != 3 or keypoints.shape[1:] != (NUM_COCO, 2):
        raise ValueError(f"keypoints phải (P,17,2), nhận {keypoints.shape}")
    if keypoints.shape[0] == 0:
        return np.full((NUM_COCO, 3), np.nan)
    best = int(np.argmax(scores.sum(axis=1)))
    return np.concatenate([keypoints[best], scores[best, :, None]], axis=1)


def pack_frames(per_frame: list[np.ndarray]) -> np.ndarray:
    """Danh sách (17,3) mỗi khung -> mảng (T,17,3)."""
    if not per_frame:
        return np.empty((0, NUM_COCO, 3))
    return np.stack(per_frame, axis=0)


class Rtmpose2D:
    """Bọc MMPoseInferencer: detect_video(path) -> (T,17,3). Cần mmpose (GPU)."""

    def __init__(self, model: str = DEFAULT_MODEL, device: str = "cuda:0"):
        try:
            from mmpose.apis import MMPoseInferencer
        except ImportError as e:  # pragma: no cover - chỉ xảy ra khi thiếu mmpose
            raise ImportError(
                "Cần mmpose+mmdet+mmcv để chạy detector. Cài trên máy GPU:\n"
                "  pip install -U openmim && mim install mmengine mmcv mmdet mmpose"
            ) from e
        self._inferencer = MMPoseInferencer(model, device=device)

    def detect_video(self, path: str | Path) -> np.ndarray:  # pragma: no cover - cần GPU
        """Chạy pose trên mọi khung của video -> (T,17,3)=[x,y,conf], COCO-17."""
        frames: list[np.ndarray] = []
        for result in self._inferencer(str(path)):
            preds = result["predictions"][0]        # list theo instance của 1 khung
            if preds:
                kps = np.array([p["keypoints"] for p in preds])          # (P,17,2)
                scr = np.array([p["keypoint_scores"] for p in preds])    # (P,17)
            else:
                kps = np.empty((0, NUM_COCO, 2))
                scr = np.empty((0, NUM_COCO))
            frames.append(select_instance(kps, scr))
        return pack_frames(frames)
