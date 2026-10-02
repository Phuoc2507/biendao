"""Ánh xạ tên/URL video gốc AIST + tải đúng video theo camera.

Vì sao tách khỏi aist.py: aist.py chỉ đụng ANNOTATION SỐ (keypoints/calib, ~MB).
File này đụng VIDEO GỐC (nặng, có license riêng của AIST Dance DB) — chỉ cần khi
chạy DETECTOR THẬT trên pixel (Gate 0, cần GPU). Giữ riêng để phần annotation
không kéo theo ràng buộc tải video.

Quy ước tên AIST: stem keypoint dùng `cAll` (bài đã gộp/chuẩn hoá đa-view), còn
VIDEO lưu RIÊNG từng camera:
    gBR_sBM_cAll_d04_mBR0_ch01   (keypoint stem)
    gBR_sBM_c01_d04_mBR0_ch01    (video camera 1)  ... c09
=> tên video = thay `cAll` -> `c0{view+1}`.

LƯU Ý LICENSE/URL: base URL dưới là định dạng AIST Dance DB công bố; PHẢI đối
chiếu lại trang chính thức + ĐỒNG Ý điều khoản trước khi tải. Hàm tải KHÔNG tự
chạy trong phiên này (tải file cần người dùng cho phép + chấp nhận license).
"""

from __future__ import annotations

import os
import re
import urllib.request
from pathlib import Path

# Định dạng AIST Dance DB (CẦN XÁC MINH trên trang chính thức + đồng ý license).
# 10M = bản nén ~10Mbps, GIỮ NGUYÊN độ phân giải 1920x1080 như tham số calib.
VIDEO_BASE = "https://aistdancedb.ongaaccel.jp/v1.0.0/video"
VIDEO_QUALITY = "10M"

_CALL_RE = re.compile(r"_cAll_")


def video_name(stem: str, view_idx: int) -> str:
    """stem keypoint (`..._cAll_...`) + chỉ số view 0-based -> tên video camera đó.

    view_idx 0 -> c01, ... 8 -> c09. Khớp thứ tự calib trong AistData.calibs_for.
    """
    if not 0 <= view_idx <= 8:
        raise ValueError(f"view_idx phải 0..8 (c01..c09), nhận {view_idx}")
    cam = f"_c{view_idx + 1:02d}_"
    name, n = _CALL_RE.subn(cam, stem)
    if n != 1:
        raise ValueError(f"stem không có đúng một '_cAll_': {stem!r}")
    return name


def video_url(stem: str, view_idx: int, *, base: str = VIDEO_BASE,
              quality: str = VIDEO_QUALITY) -> str:
    """URL video của camera `view_idx` cho bài `stem`."""
    return f"{base}/{quality}/{video_name(stem, view_idx)}.mp4"


def download_video(stem: str, view_idx: int, cache_dir: os.PathLike | str, *,
                   base: str = VIDEO_BASE, quality: str = VIDEO_QUALITY) -> Path:
    """Tải video camera `view_idx` về cache (bỏ qua nếu đã có). Trả đường dẫn.

    CHỈ gọi sau khi đã đồng ý license AIST. urlretrieve -> ghi `<cache>/video/<name>.mp4`.
    """
    dest = Path(cache_dir) / "video" / f"{video_name(stem, view_idx)}.mp4"
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".mp4.part")
    urllib.request.urlretrieve(video_url(stem, view_idx, base=base, quality=quality), tmp)
    tmp.replace(dest)   # đổi tên nguyên tử -> không để file nửa chừng coi là xong
    return dest
