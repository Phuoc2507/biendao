"""Xuất MotionClip → JSON để sequencer web (M4) nạp.

Đây là ranh giới perception ↔ web: nhánh A tạo MotionClip (thật hoặc giả), xuất
JSON theo đúng schema này; nhánh web chỉ cần đọc JSON, không phụ thuộc Python.

Cũng có `make_demo_clip` sinh một đoạn "múa" tổng hợp sinh động để dựng và kiểm
thử sequencer khi CHƯA có mocap thật — đúng tinh thần "nhánh B chạy bằng clip giả".
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from choreo.schema import (
    MotionClip,
    BeatGrid,
    JOINT_NAMES,
    SKELETON_EDGES,
    MIRROR_PAIRS,
    NUM_JOINTS,
    JOINT_INDEX,
)


def clip_to_dict(clip: MotionClip) -> dict:
    """MotionClip → dict tuần tự hoá được (list lồng nhau, không phải ndarray)."""
    data: dict = {
        "fps": float(clip.fps),
        "numFrames": int(clip.num_frames),
        "jointNames": list(clip.joint_names),
        "edges": [list(e) for e in SKELETON_EDGES],
        "mirrorPairs": [list(p) for p in MIRROR_PAIRS],
        # frames[t][j] = [x, y, z] (mét, Y-up, sàn tại Y=0)
        "frames": np.round(clip.joints3d, 5).tolist(),
        "meta": clip.meta,
    }
    if clip.beat_grid is not None:
        data["beatGrid"] = {
            "bpm": float(clip.beat_grid.bpm),
            "beatTimes": clip.beat_grid.beat_times.tolist(),
            "downbeatTimes": clip.beat_grid.downbeat_times.tolist(),
        }
    if clip.contacts is not None:
        data["contacts"] = clip.contacts.astype(int).tolist()
    return data


def save_clip_json(clip: MotionClip, path: str | Path) -> Path:
    """Ghi clip ra file JSON. Trả về đường dẫn đã ghi."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clip_to_dict(clip)), encoding="utf-8")
    return path


def _beat_grid(bpm: float, seconds: float, beats_per_bar: int = 8) -> BeatGrid:
    period = 60.0 / bpm
    beat_times = np.arange(0.0, seconds, period)
    downbeat_times = beat_times[::beats_per_bar]
    return BeatGrid(bpm=bpm, beat_times=beat_times, downbeat_times=downbeat_times)


def make_demo_clip(fps: float = 30.0, seconds: float = 8.0, bpm: float = 120.0) -> MotionClip:
    """Sinh clip 'múa' tổng hợp: nhún theo nhịp + vẫy tay + bước chân trái/phải.

    Không phải mocap thật — chỉ để sequencer có gì đó sinh động mà hiển thị/kiểm thử
    trước khi cắm EasyMocap. Chuyển động khoá theo bpm để thấy rõ lưới 8-count.
    """
    T = int(round(fps * seconds))
    t = np.arange(T) / fps
    beat_hz = bpm / 60.0
    phase = 2 * np.pi * beat_hz * t

    J = NUM_JOINTS
    pose = np.zeros((J, 3), dtype=np.float64)
    # Dáng chữ T cơ bản (mét): dựng toạ độ nghỉ cho từng khớp.
    rest = {
        "pelvis": (0.0, 0.95, 0.0), "l_hip": (0.10, 0.90, 0.0), "r_hip": (-0.10, 0.90, 0.0),
        "spine": (0.0, 1.15, 0.0), "l_knee": (0.12, 0.50, 0.0), "r_knee": (-0.12, 0.50, 0.0),
        "neck": (0.0, 1.45, 0.0), "l_ankle": (0.12, 0.05, 0.0), "r_ankle": (-0.12, 0.05, 0.0),
        "head": (0.0, 1.62, 0.0), "l_shoulder": (0.18, 1.42, 0.0), "r_shoulder": (-0.18, 1.42, 0.0),
        "l_elbow": (0.42, 1.42, 0.0), "r_elbow": (-0.42, 1.42, 0.0),
        "l_wrist": (0.66, 1.42, 0.0), "r_wrist": (-0.66, 1.42, 0.0),
        "root_floor": (0.0, 0.0, 0.0),
    }
    for name, xyz in rest.items():
        pose[JOINT_INDEX[name]] = xyz

    frames = np.repeat(pose[None, :, :], T, axis=0)

    bob = 0.05 * np.sin(phase)                 # nhún người theo phách
    arm = 0.55 * (0.5 + 0.5 * np.sin(phase))   # vẫy tay 0..1
    step = 0.12 * np.sin(phase / 2)            # bước chân, chu kỳ 2 phách

    def j(name: str) -> int:
        return JOINT_INDEX[name]

    # Nhún toàn thân theo Y
    frames[:, :, 1] += bob[:, None]

    # Vẫy tay: nâng/hạ cổ tay + khuỷu theo Y
    for side, sgn in (("l", 1.0), ("r", -1.0)):
        frames[:, j(f"{side}_wrist"), 1] += 0.5 * arm * sgn * 0.0 + 0.35 * arm
        frames[:, j(f"{side}_elbow"), 1] += 0.18 * arm
        # xoè tay theo X một chút
        frames[:, j(f"{side}_wrist"), 0] += sgn * 0.10 * arm

    # Bước chân: trái/phải nhấc luân phiên
    frames[:, j("l_ankle"), 2] += np.clip(step, 0, None)
    frames[:, j("r_ankle"), 2] += np.clip(-step, 0, None)
    frames[:, j("l_ankle"), 1] += 0.08 * np.clip(step, 0, None) / 0.12
    frames[:, j("r_ankle"), 1] += 0.08 * np.clip(-step, 0, None) / 0.12

    return MotionClip(
        fps=fps,
        joints3d=frames,
        beat_grid=_beat_grid(bpm, seconds),
        meta={"source": "demo", "bpm": bpm, "note": "clip tổng hợp, không phải mocap thật"},
    )


if __name__ == "__main__":
    # Sinh clip demo vào thư mục public của web.
    out = Path(__file__).resolve().parents[2] / "web" / "public" / "clips" / "demo.json"
    clip = make_demo_clip()
    save_clip_json(clip, out)
    print(f"[OK] wrote {out}  ({clip.num_frames} frames, {clip.duration:.1f}s)")
