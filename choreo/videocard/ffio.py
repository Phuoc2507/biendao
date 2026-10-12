"""Vào ra video và âm thanh qua ffmpeg (tiến trình con, ống dẫn rawvideo).

Không cần ffmpeg cài sẵn: nếu có gói imageio-ffmpeg thì dùng bản ffmpeg nó
mang theo. Đặt biến môi trường CHOREO_FFMPEG để chỉ một bản khác.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from typing import Iterator

import numpy as np

FPS = 30


def find_ffmpeg() -> str | None:
    env = os.environ.get("CHOREO_FFMPEG")
    if env and os.path.exists(env):
        return env
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _vf(height: int) -> str:
    # fps cố định 30 (điện thoại hay quay khung hình biến thiên), co theo chiều cao
    return f"fps={FPS},scale=-2:{height}:flags=area"


def frame_size(ffmpeg: str, path: str, height: int) -> tuple[int, int]:
    """Giải mã một khung ra PPM để biết kích thước THẬT sau xoay và co."""
    out = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-vf", _vf(height), "-frames:v", "1",
         "-f", "image2pipe", "-vcodec", "ppm", "-"],
        capture_output=True, check=True).stdout
    parts = out.split(maxsplit=3)
    if len(parts) < 3 or parts[0] != b"P6":
        raise RuntimeError(f"Không đọc được khung hình nào từ {path}")
    return int(parts[1]), int(parts[2])


def frames(ffmpeg: str, path: str, height: int) -> Iterator[np.ndarray]:
    """Lặp từng khung RGB uint8 (H, W, 3) ở 30 fps."""
    w, h = frame_size(ffmpeg, path, height)
    proc = subprocess.Popen(
        [ffmpeg, "-v", "error", "-i", path, "-vf", _vf(height), "-an",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE)
    size = w * h * 3
    assert proc.stdout is not None
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    finally:
        proc.stdout.close()
        proc.wait()


def read_audio(ffmpeg: str, path: str, sr: int = 8000) -> np.ndarray | None:
    """Tiếng mono float32; None nếu tệp không có tiếng."""
    res = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr),
         "-f", "f32le", "-"],
        capture_output=True)
    if res.returncode != 0 or len(res.stdout) < sr * 4:
        return None
    return np.frombuffer(res.stdout, np.float32).astype(np.float64)


class Writer:
    """Ghi khung RGB uint8 ra H.264 qua ống dẫn."""

    def __init__(self, ffmpeg: str, path: str, w: int, h: int, crf: int = 12):
        self.proc = subprocess.Popen(
            [ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-", "-c:v", "libx264",
             "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p", path],
            stdin=subprocess.PIPE)

    def write(self, rgb: np.ndarray) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(np.ascontiguousarray(rgb, dtype=np.uint8).tobytes())

    def close(self) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.close()
        if self.proc.wait() != 0:
            raise RuntimeError("ffmpeg ghi video thất bại")


def stack_card(ffmpeg: str, rgb_path: str, alpha_path: str, out_path: str,
               crop: tuple[int, int, int, int], half_height: int) -> None:
    """Cắt hai file tạm theo cùng khung, co về cao half_height, xếp chồng dọc."""
    x, y, cw, ch = crop
    c = f"crop={cw}:{ch}:{x}:{y},scale=-2:{half_height}:flags=lanczos"
    graph = (f"[0:v]{c},format=yuv420p[a];"
             f"[1:v]{c},format=gray,format=yuv420p[b];"
             f"[a][b]vstack=inputs=2,format=yuv420p[v]")
    subprocess.run(
        [ffmpeg, "-y", "-v", "error", "-i", rgb_path, "-i", alpha_path,
         "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264",
         "-preset", "medium", "-crf", "18", "-r", str(FPS),
         "-movflags", "+faststart", out_path],
        check=True)


class CardWriter:
    """Ghi thẻ xếp chồng từ khung đã cắt sẵn bằng numpy (chế độ bám người).

    Mỗi lần write nhận hình màu và mặt nạ cùng cỡ (ch, cw); ffmpeg co từng nửa
    RIÊNG về out_w x half_height rồi xếp chồng (co chung cả khung sẽ làm màu
    chân nhoè sang mép trên mặt nạ ở đường nối).
    """

    def __init__(self, ffmpeg: str, path: str, cw: int, ch: int, out_w: int,
                 half_height: int):
        self.cw, self.ch = cw, ch
        s = f"scale={out_w}:{half_height}:flags=lanczos"
        graph = (f"[0:v]split[t][b];[t]crop={cw}:{ch}:0:0,{s},format=yuv420p[a];"
                 f"[b]crop={cw}:{ch}:0:{ch},{s},format=gray,format=yuv420p[m];"
                 f"[a][m]vstack=inputs=2,format=yuv420p[v]")
        self.proc = subprocess.Popen(
            [ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{cw}x{2 * ch}", "-r", str(FPS), "-i", "-",
             "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264",
             "-preset", "medium", "-crf", "18", "-r", str(FPS),
             "-movflags", "+faststart", path],
            stdin=subprocess.PIPE)

    def write(self, rgb: np.ndarray, alpha_rgb: np.ndarray) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(np.ascontiguousarray(
            np.concatenate([rgb, alpha_rgb], axis=0), dtype=np.uint8).tobytes())

    def close(self) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.close()
        if self.proc.wait() != 0:
            raise RuntimeError("ffmpeg ghi thẻ thất bại")
