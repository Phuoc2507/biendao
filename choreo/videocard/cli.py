"""Lệnh tạo thẻ video.

    python -m choreo.videocard --music bai.mp3 --out the/ lan.mp4 mai.mp4

Mỗi video ra hai tệp trong --out:
  <ten>.card.mp4   H.264, nửa trên hình màu, nửa dưới mặt nạ (xếp chồng)
  <ten>.card.json  tên, thời lượng, offsetSec (thời điểm trong nhạc khi video bắt đầu)

--no-matting: bỏ xoá phông (không cần onnxruntime, mô hình), chỉ khớp nhạc và
mã hoá lại H.264 cho Chrome phát mượt; thẻ hiện cả nền.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .align import estimate_offset
from .crop import BBoxAccumulator, padded_crop

DEFAULT_MODEL = os.path.join("models", "rvm_mobilenetv3_fp32.onnx")
MODEL_URL = ("https://github.com/PeterL1n/RobustVideoMatting/releases/download/"
             "v1.0.0/rvm_mobilenetv3_fp32.onnx")
CONFIDENT = 1.5
EXIT_MISSING = 2


def card_meta(name: str, *, stacked: bool, duration: float, width: int,
              height: int, offset: float, confident: bool) -> dict:
    return {
        "format": "choreo-card", "version": 1, "name": name,
        "stacked": stacked, "fps": 30, "durationSec": round(duration, 3),
        "width": width, "height": height,
        "offsetSec": round(offset, 3), "alignConfident": bool(confident),
    }


def _missing(msg: str) -> int:
    print(msg, file=sys.stderr)
    return EXIT_MISSING


def _check_deps(no_matting: bool, model: str) -> tuple[str | None, int]:
    from . import ffio

    ff = ffio.find_ffmpeg()
    if ff is None:
        return None, _missing(
            "Thiếu ffmpeg. Cài bằng:  pip install imageio-ffmpeg\n"
            "(hoặc đặt biến môi trường CHOREO_FFMPEG trỏ tới ffmpeg.exe)")
    if no_matting:
        return ff, 0
    try:
        import onnxruntime  # noqa: F401
    except ImportError:
        return None, _missing("Thiếu onnxruntime. Cài bằng:  pip install onnxruntime\n"
                              "(hoặc chạy với --no-matting để bỏ xoá phông)")
    if not os.path.exists(model):
        return None, _missing(
            f"Không thấy mô hình xoá phông: {model}\n"
            f"Tải tệp rvm_mobilenetv3_fp32.onnx (~15 MB) từ\n  {MODEL_URL}\n"
            f"rồi đặt vào {model} (hoặc chỉ đường dẫn bằng --model).")
    return ff, 0


def _align(ff: str, video: str, music_audio) -> tuple[float, bool]:
    from . import ffio

    if music_audio is None:
        return 0.0, False
    va = ffio.read_audio(ff, video)
    if va is None:
        print("  video không có tiếng: offset = 0, cần căn tay trong app")
        return 0.0, False
    off, conf = estimate_offset(va, 8000, music_audio, 8000)
    ok = conf >= CONFIDENT
    print(f"  khớp nhạc: video bắt đầu ở giây {off:.2f} của bài"
          f" (độ tin cậy {conf:.2f}{'' if ok else ', THẤP: nên kiểm lại trong app'})")
    return off, ok


def _plain(ff: str, video: str, out_mp4: str, height: int) -> tuple[float, int, int]:
    from . import ffio

    w, h = ffio.frame_size(ff, video, height)
    subprocess.run(
        [ff, "-y", "-v", "error", "-i", video, "-vf", ffio._vf(height), "-an",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_mp4], check=True)
    n = sum(1 for _ in ffio.frames(ff, out_mp4, h))
    return n / ffio.FPS, w, h


def _matted(ff: str, video: str, out_mp4: str, model: str, half: int,
            work_h: int) -> tuple[float, int, int]:
    import numpy as np

    from . import ffio
    from .matting import RVMSession

    sess = RVMSession(model)
    acc = BBoxAccumulator()
    w, h = ffio.frame_size(ff, video, work_h)
    with tempfile.TemporaryDirectory() as tmp:
        rgb_p, a_p = os.path.join(tmp, "rgb.mp4"), os.path.join(tmp, "a.mp4")
        wr_rgb, wr_a = ffio.Writer(ff, rgb_p, w, h), ffio.Writer(ff, a_p, w, h)
        n, t0 = 0, time.time()
        for frame in ffio.frames(ff, video, work_h):
            fgr, pha = sess(frame)
            acc.add(pha)
            # hình màu: tiền cảnh RVM (đã khử màu nền ở mép tóc, tà áo)
            wr_rgb.write(fgr)
            a8 = np.clip(pha * 255.0 + 0.5, 0, 255).astype(np.uint8)
            wr_a.write(np.repeat(a8[:, :, None], 3, axis=2))
            n += 1
            if n % 150 == 0:
                print(f"  xoá phông: {n / ffio.FPS:.0f} s video"
                      f" ({n / max(time.time() - t0, 1e-6):.1f} khung/s)")
        wr_rgb.close()
        wr_a.close()
        if acc.bbox is None:
            raise RuntimeError("không tìm thấy người trong video (mặt nạ rỗng)")
        crop = padded_crop(acc.bbox, w, h)
        ffio.stack_card(ff, rgb_p, a_p, out_mp4, crop, half)
    cw, ch = crop[2], crop[3]
    width = 2 * round(cw * half / ch / 2)
    return n / ffio.FPS, width, half


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m choreo.videocard",
                                 description="Tạo thẻ video cho sân khấu ảo")
    ap.add_argument("videos", nargs="+", help="video gốc quay từng vũ công")
    ap.add_argument("--music", help="tệp nhạc gốc để tự khớp thời gian")
    ap.add_argument("--out", default="the", help="thư mục ra (mặc định: the/)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="tệp mô hình RVM .onnx")
    ap.add_argument("--height", type=int, default=540,
                    help="chiều cao mỗi nửa thẻ, px (mặc định 540)")
    ap.add_argument("--no-matting", action="store_true",
                    help="không xoá phông, chỉ khớp nhạc và mã hoá lại")
    args = ap.parse_args(argv)

    ff, code = _check_deps(args.no_matting, args.model)
    if ff is None:
        return code
    from . import ffio

    os.makedirs(args.out, exist_ok=True)
    music_audio = None
    if args.music:
        music_audio = ffio.read_audio(ff, args.music)
        if music_audio is None:
            print(f"Không đọc được tiếng của {args.music}; bỏ qua khớp nhạc.")
    failed = 0
    for i, video in enumerate(args.videos, 1):
        name = Path(video).stem
        print(f"[{i}/{len(args.videos)}] {name}")
        out_mp4 = os.path.join(args.out, f"{name}.card.mp4")
        try:
            off, ok = _align(ff, video, music_audio)
            if args.no_matting:
                dur, w, h = _plain(ff, video, out_mp4, 720)
            else:
                dur, w, h = _matted(ff, video, out_mp4, args.model, args.height,
                                    work_h=max(2 * args.height, 960))
            meta = card_meta(name, stacked=not args.no_matting, duration=dur,
                             width=w, height=h, offset=off, confident=ok)
            with open(os.path.join(args.out, f"{name}.card.json"), "w",
                      encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
            print(f"  xong: {out_mp4}")
        except Exception as e:  # một video lỗi không dừng các video khác
            failed += 1
            print(f"  LỖI: {e}", file=sys.stderr)
    print(f"Hoàn tất {len(args.videos) - failed}/{len(args.videos)} thẻ trong {args.out}/")
    return 1 if failed else 0
