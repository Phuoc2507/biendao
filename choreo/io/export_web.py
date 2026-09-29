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


# Dáng chữ T cơ bản (mét): toạ độ nghỉ cho từng khớp, dùng chung mọi style.
_REST_POSE = {
    "pelvis": (0.0, 0.95, 0.0), "l_hip": (0.10, 0.90, 0.0), "r_hip": (-0.10, 0.90, 0.0),
    "spine": (0.0, 1.15, 0.0), "l_knee": (0.12, 0.50, 0.0), "r_knee": (-0.12, 0.50, 0.0),
    "neck": (0.0, 1.45, 0.0), "l_ankle": (0.12, 0.05, 0.0), "r_ankle": (-0.12, 0.05, 0.0),
    "head": (0.0, 1.62, 0.0), "l_shoulder": (0.18, 1.42, 0.0), "r_shoulder": (-0.18, 1.42, 0.0),
    "l_elbow": (0.42, 1.42, 0.0), "r_elbow": (-0.42, 1.42, 0.0),
    "l_wrist": (0.66, 1.42, 0.0), "r_wrist": (-0.66, 1.42, 0.0),
    "root_floor": (0.0, 0.0, 0.0),
}


def _rest_frames(T: int) -> np.ndarray:
    pose = np.zeros((NUM_JOINTS, 3), dtype=np.float64)
    for name, xyz in _REST_POSE.items():
        pose[JOINT_INDEX[name]] = xyz
    return np.repeat(pose[None, :, :], T, axis=0)


def make_demo_clip(
    fps: float = 30.0,
    seconds: float = 8.0,
    bpm: float = 120.0,
    style: str = "wave",
) -> MotionClip:
    """Sinh clip 'múa' tổng hợp theo `style`. KHÔNG phải mocap thật — chỉ để
    sequencer có động tác đa dạng mà hiển thị/kiểm thử trước khi cắm EasyMocap.
    Chuyển động khoá theo bpm để thấy rõ lưới 8-count.

    style ∈ {"wave", "step", "bounce", "point"}.
    """
    T = int(round(fps * seconds))
    t = np.arange(T) / fps
    phase = 2 * np.pi * (bpm / 60.0) * t
    frames = _rest_frames(T)

    def j(name: str) -> int:
        return JOINT_INDEX[name]

    if style == "wave":
        bob = 0.05 * np.sin(phase)
        arm = 0.55 * (0.5 + 0.5 * np.sin(phase))
        step = 0.12 * np.sin(phase / 2)
        frames[:, :, 1] += bob[:, None]
        for side, sgn in (("l", 1.0), ("r", -1.0)):
            frames[:, j(f"{side}_wrist"), 1] += 0.35 * arm
            frames[:, j(f"{side}_elbow"), 1] += 0.18 * arm
            frames[:, j(f"{side}_wrist"), 0] += sgn * 0.10 * arm
        frames[:, j("l_ankle"), 2] += np.clip(step, 0, None)
        frames[:, j("r_ankle"), 2] += np.clip(-step, 0, None)
        frames[:, j("l_ankle"), 1] += 0.08 * np.clip(step, 0, None) / 0.12
        frames[:, j("r_ankle"), 1] += 0.08 * np.clip(-step, 0, None) / 0.12

    elif style == "step":
        # Dồn trọng tâm trái/phải + gập gối, tay giữ thấp đánh nhẹ.
        shift = 0.18 * np.sin(phase / 2)          # lắc hông chu kỳ 2 phách
        knee = 0.06 * (0.5 - 0.5 * np.cos(phase))  # nhún gối theo phách
        frames[:, :, 0] += shift[:, None]
        for side in ("l", "r"):
            frames[:, j(f"{side}_knee"), 1] -= knee
            frames[:, j(f"{side}_wrist"), 1] -= 0.55  # tay buông thấp
            frames[:, j(f"{side}_elbow"), 1] -= 0.30
        frames[:, j("l_wrist"), 0] += 0.10 * np.sin(phase)
        frames[:, j("r_wrist"), 0] -= 0.10 * np.sin(phase)

    elif style == "bounce":
        # Nhảy nhún biên độ lớn + hai tay giơ cao.
        up = np.clip(0.22 * np.sin(phase), 0, None)
        arm = 0.5 + 0.5 * np.sin(phase)
        frames[:, :, 1] += up[:, None]
        for side, sgn in (("l", 1.0), ("r", -1.0)):
            frames[:, j(f"{side}_wrist"), 1] += 0.45 * arm
            frames[:, j(f"{side}_elbow"), 1] += 0.25 * arm
            frames[:, j(f"{side}_wrist"), 0] += sgn * 0.05 * arm
        for side in ("l", "r"):  # co chân khi bật
            frames[:, j(f"{side}_ankle"), 1] += 0.5 * up

    elif style == "point":
        # Đưa tay phải chỉ chéo lên, tay trái chống hông, xoay nhẹ thân theo phách.
        pt = 0.5 + 0.5 * np.sin(phase / 2)
        bob = 0.04 * np.sin(phase)
        frames[:, :, 1] += bob[:, None]
        frames[:, j("r_wrist"), 1] += 0.45 * pt
        frames[:, j("r_wrist"), 0] -= 0.15 * pt
        frames[:, j("r_elbow"), 1] += 0.22 * pt
        frames[:, j("l_wrist"), 1] -= 0.55
        frames[:, j("l_wrist"), 0] = 0.14
        frames[:, j("l_elbow"), 1] -= 0.28
    else:
        raise ValueError(f"style không hợp lệ: {style}")

    return MotionClip(
        fps=fps,
        joints3d=frames,
        beat_grid=_beat_grid(bpm, seconds),
        meta={"source": "demo", "style": style, "bpm": bpm,
              "note": "clip tổng hợp, không phải mocap thật"},
    )


# Thư viện clip demo: (tên file, nhãn hiển thị, style, bpm)
_LIBRARY = [
    ("wave", "Vẫy tay + bước", "wave", 120.0),
    ("step", "Dồn trọng tâm", "step", 120.0),
    ("bounce", "Nhảy nhún", "bounce", 128.0),
    ("point", "Chỉ tay", "point", 112.0),
]


def write_library(out_dir: str | Path | None = None) -> Path:
    """Sinh toàn bộ thư viện clip + index.json cho web. Trả về thư mục đã ghi."""
    if out_dir is None:
        out_dir = Path(__file__).resolve().parents[2] / "web" / "public" / "clips"
    out_dir = Path(out_dir)
    index = []
    for name, label, style, bpm in _LIBRARY:
        clip = make_demo_clip(bpm=bpm, style=style)
        save_clip_json(clip, out_dir / f"{name}.json")
        index.append({"name": name, "label": label, "file": f"{name}.json",
                      "bpm": bpm, "frames": clip.num_frames})
    (out_dir / "index.json").write_text(
        json.dumps({"clips": index}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Giữ demo.json trỏ clip đầu để tương thích ngược.
    save_clip_json(make_demo_clip(bpm=_LIBRARY[0][3], style=_LIBRARY[0][2]),
                   out_dir / "demo.json")
    return out_dir


if __name__ == "__main__":
    d = write_library()
    print(f"[OK] wrote clip library + index.json to {d}")
