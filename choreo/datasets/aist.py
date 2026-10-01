"""Nạp một sequence AIST++ (2D/3D/camera) đủ dùng cho thực nghiệm perception.

Vì sao có file này: AIST++ phát annotation dạng ba zip GỘP cả ~1.4k bài trên
GitHub Releases (keypoints2d 1.26GB, keypoints3d 836MB, cameras 27KB). Thực nghiệm
chỉ cần vài chục bài, nên ta đọc ZIP qua **HTTP Range** — chỉ kéo đúng central
directory + đúng member của bài cần (~0.4-1MB/bài) thay vì tải trọn 2GB. Mỗi bài
tải về được cache xuống đĩa (data/aist_sample/, đã .gitignore) để chạy lại offline.

Thuần stdlib (urllib + zipfile) + numpy — không thêm phụ thuộc. Phần toán camera
(Rodrigues rvec->R, dựng CameraCalib) là hàm thuần, có test ở tests/test_aist.py.

Khớp AIST++ là **COCO-17** (khác JOINT_NAMES H36M-17 của schema). Khi chỉ ĐO độ
chính xác tam giác hoá (3D dựng vs 3D tham chiếu) ta giữ nguyên COCO-17 cho cả hai
vế — tránh sai số remap làm bẩn metric. COCO17_NAMES + COCO17_TO_H36M để khi nào
cần đổ lên vũ công H36M thì remap riêng.
"""

from __future__ import annotations

import io
import json
import os
import pickle
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

from choreo.schema import CameraCalib

RELEASE = "https://github.com/google/aistplusplus_dataset/releases/download/v1.0"
DEFAULT_CACHE = Path(r"D:\bien\data\aist_sample")

# Thứ tự 17 khớp COCO (như AIST++ 2D & 3D).
COCO17_NAMES = (
    "nose", "l_eye", "r_eye", "l_ear", "r_ear", "l_shoulder", "r_shoulder",
    "l_elbow", "r_elbow", "l_wrist", "r_wrist", "l_hip", "r_hip",
    "l_knee", "r_knee", "l_ankle", "r_ankle",
)
COCO = {n: i for i, n in enumerate(COCO17_NAMES)}


def rodrigues(rvec: np.ndarray) -> np.ndarray:
    """Vector Rodrigues (trục*góc, kiểu OpenCV) -> ma trận quay 3x3."""
    r = np.asarray(rvec, dtype=np.float64).reshape(3)
    theta = float(np.linalg.norm(r))
    if theta < 1e-12:
        return np.eye(3)
    k = r / theta
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(theta) * K + (1 - np.cos(theta)) * (K @ K)


def calib_from_aist(cam: dict) -> CameraCalib:
    """Một entry camera AIST (matrix/rotation=rvec/translation/distortions/size)
    -> CameraCalib (R world->cam). AIST lưu rotation là vector Rodrigues."""
    return CameraCalib(
        K=np.array(cam["matrix"], dtype=np.float64),
        R=rodrigues(cam["rotation"]),
        t=np.array(cam["translation"], dtype=np.float64),
        dist=np.array(cam["distortions"], dtype=np.float64),
        image_size=tuple(int(s) for s in cam["size"]),
    )


class _HTTPRangeFile(io.RawIOBase):
    """File-like chỉ-đọc, lấy byte theo nhu cầu bằng HTTP Range (cho zipfile seek)."""

    def __init__(self, url: str):
        self.url = url
        self._pos = 0
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=30) as r:
            self._size = int(r.headers["Content-Length"])

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self._pos

    def seek(self, off, whence=0):
        if whence == 0: self._pos = off
        elif whence == 1: self._pos += off
        elif whence == 2: self._pos = self._size + off
        return self._pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self._size - self._pos
        if n == 0 or self._pos >= self._size:
            return b""
        end = min(self._pos + n, self._size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self._pos}-{end}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        self._pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)


class AistData:
    """Truy cập AIST++ qua HTTP Range + cache đĩa. Một instance = một thư mục cache."""

    def __init__(self, cache_dir: os.PathLike | str = DEFAULT_CACHE):
        self.cache = Path(cache_dir)
        self.cache.mkdir(parents=True, exist_ok=True)
        self._zip = {}        # ten_zip -> ZipFile (từ xa, mở lười)
        self._mapping = None  # stem -> ten setting
        self._settings = {}   # ten setting -> list[CameraCalib] (theo thứ tự c01..c09)

    # --- zip từ xa (mở lười, dùng lại trong phiên) ---
    def _remote(self, name: str) -> zipfile.ZipFile:
        if name not in self._zip:
            self._zip[name] = zipfile.ZipFile(_HTTPRangeFile(f"{RELEASE}/{name}.zip"))
        return self._zip[name]

    def stems(self, kind: str) -> set[str]:
        """Tập 'stem' (tên bài, không đuôi) có trong một zip ('keypoints2d'/'keypoints3d')."""
        zf = self._remote(kind)
        return {
            os.path.basename(i.filename)[:-4]
            for i in zf.infolist()
            if i.filename.endswith(".pkl") and not i.filename.startswith("__MACOSX")
        }

    def _member_cached(self, kind: str, stem: str) -> bytes:
        """Byte của <kind>/<stem>.pkl — đọc cache nếu có, không thì kéo Range rồi lưu."""
        dest = self.cache / kind / f"{stem}.pkl"
        if dest.exists():
            return dest.read_bytes()
        data = self._remote(kind).read(f"{kind}/{stem}.pkl")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return data

    def keypoints2d(self, stem: str) -> np.ndarray:
        """(V, T, 17, 3) = (view, frame, khớp COCO, [x, y, confidence])."""
        return pickle.loads(self._member_cached("keypoints2d", stem))["keypoints2d"]

    def keypoints3d(self, stem: str, optim: bool = True) -> np.ndarray:
        """(T, 17, 3) 3D tham chiếu (COCO-17), hệ world AIST. optim=bản tối ưu bundle."""
        d = pickle.loads(self._member_cached("keypoints3d", stem))
        return d["keypoints3d_optim" if optim else "keypoints3d"]

    # --- cameras.zip: tải trọn (27KB) về cache, đọc setting theo tên ---
    def _cameras_zip(self) -> zipfile.ZipFile:
        dest = self.cache / "cameras.zip"
        if not dest.exists():
            urllib.request.urlretrieve(f"{RELEASE}/cameras.zip", dest)
        return zipfile.ZipFile(dest)

    def _load_mapping(self):
        if self._mapping is None:
            cz = self._cameras_zip()
            txt = cz.read("cameras/mapping.txt").decode("utf-8")
            self._mapping = dict(
                line.split() for line in txt.splitlines() if line.strip()
            )

    def setting_of(self, stem: str) -> str:
        self._load_mapping()
        return self._mapping[stem]

    def calibs_for(self, stem: str) -> list[CameraCalib]:
        """Danh sách CameraCalib (theo thứ tự view c01..c09) cho bài `stem`."""
        setting = self.setting_of(stem)
        if setting not in self._settings:
            cams = json.loads(self._cameras_zip().read(f"cameras/{setting}.json"))
            self._settings[setting] = [calib_from_aist(c) for c in cams]
        return self._settings[setting]
