"""Tệp khớp 3D (.npz do tools/gvhmr_dump.py ghi) → <ten>.motion.json cho app.

    python -m choreo.pose3d the/Lan.npz the/Minh.npz --out the/

Mỗi .npz cần: joints_cam (T, 24, 3) khớp SMPL hệ camera OpenCV (mét), fps.
Tên ra theo tên tệp vào, trùng tên video thẻ thì app tự ghép đúng người.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

from .convert import motion_dict, to_stage_motion


def convert_file(path: str, out_dir: str, *, drift_sec: float, smooth_frames: int) -> str:
    with np.load(path) as z:
        if "joints_cam" not in z:
            raise ValueError(f"{path}: thiếu mảng joints_cam")
        j24 = z["joints_cam"]
        fps = float(z["fps"]) if "fps" in z else 30.0
    if not (fps > 0):
        raise ValueError(f"{path}: fps không hợp lệ ({fps})")
    name = os.path.splitext(os.path.basename(path))[0]
    joints = to_stage_motion(j24, fps, drift_sec=drift_sec, smooth_frames=smooth_frames)
    data = motion_dict(joints, fps, name=name, source=os.path.basename(path))
    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, f"{name}.motion.json")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return dst


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m choreo.pose3d", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="tệp .npz khớp 3D")
    ap.add_argument("--out", default="the", help="thư mục ra (mặc định: the/)")
    ap.add_argument("--drift", type=float, default=1.5,
                    help="giây trung bình trượt để bỏ trôi ngang (0: bỏ cả đi lại)")
    ap.add_argument("--smooth", type=int, default=3, help="số khung làm mượt (1: tắt)")
    a = ap.parse_args(argv)
    bad = 0
    for p in a.inputs:
        try:
            print(f"{p} → {convert_file(p, a.out, drift_sec=a.drift, smooth_frames=a.smooth)}")
        except Exception as e:  # một tệp hỏng không chặn tệp khác
            bad += 1
            print(f"LỖI {p}: {e}", file=sys.stderr)
    return 1 if bad else 0
