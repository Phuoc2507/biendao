"""Khung cắt cho thẻ video: cố định (hợp bbox mọi khung) hoặc bám người.

- Cố định (`BBoxAccumulator` + `padded_crop`, cờ --fixed-crop): cắt theo khung
  bao HỢP; hợp lý khi máy quay đứng yên trên chân máy.
- Bám người (`track_crops`, mặc định): video cầm tay lia theo người thì hợp bbox
  rất rộng, vũ công nhỏ và trôi trong thẻ. Ta lưu bbox từng khung, làm mượt cả
  chuỗi (offline nên lọc hai chiều, không trễ), giữ KÍCH THƯỚC khung cắt cố định
  cả video (thẻ không co giãn) và neo đáy khung theo đáy bbox đã mượt.

Lề dưới nhỏ để bàn chân nằm sát đáy thẻ, tức là chạm sàn sân khấu ảo.
"""

from __future__ import annotations

import numpy as np


def frame_bbox(alpha: np.ndarray, thresh: float = 0.5
               ) -> tuple[int, int, int, int] | None:
    """(x0, y0, x1, y1) của mặt nạ > thresh trong một khung; None nếu rỗng."""
    mask = np.asarray(alpha) > thresh
    rows = np.flatnonzero(mask.any(axis=1))
    if rows.size == 0:
        return None
    cols = np.flatnonzero(mask.any(axis=0))
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


class BBoxAccumulator:
    def __init__(self, thresh: float = 0.5):
        self.thresh = thresh
        self._box: list[int] | None = None

    def add(self, alpha: np.ndarray) -> None:
        fb = frame_bbox(alpha, self.thresh)
        if fb is None:
            return
        box = list(fb)
        if self._box is None:
            self._box = box
        else:
            b = self._box
            self._box = [min(b[0], box[0]), min(b[1], box[1]),
                         max(b[2], box[2]), max(b[3], box[3])]

    @property
    def bbox(self) -> tuple[int, int, int, int] | None:
        return None if self._box is None else tuple(self._box)  # type: ignore[return-value]


def padded_crop(bbox, w: int, h: int, side: float = 0.04, top: float = 0.04,
                bottom: float = 0.01) -> tuple[int, int, int, int]:
    """Trả (x, y, cw, ch) chẵn, nằm trong ảnh. Lề tính theo chiều cao bbox."""
    x0, y0, x1, y1 = bbox
    bh = y1 - y0
    x0 = max(0, int(np.floor(x0 - side * bh)))
    x1 = min(w, int(np.ceil(x1 + side * bh)))
    y0 = max(0, int(np.floor(y0 - top * bh)))
    y1 = min(h, int(np.ceil(y1 + bottom * bh)))
    # góc trên trái chẵn (lùi xuống), kích thước chẵn (nới ra nếu còn chỗ)
    x0 -= x0 % 2
    y0 -= y0 % 2
    cw, ch = x1 - x0, y1 - y0
    if cw % 2:
        cw = cw + 1 if x0 + cw + 1 <= w else cw - 1
    if ch % 2:
        ch = ch + 1 if y0 + ch + 1 <= h else ch - 1
    return x0, y0, cw, ch


def fill_gaps(v: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Nội suy tuyến tính chỗ trống; hai đầu giữ giá trị hợp lệ gần nhất."""
    idx = np.arange(len(v))
    return np.interp(idx, idx[valid], v[valid])


def smooth(v: np.ndarray, sigma: float) -> np.ndarray:
    """Lọc Gauss hai chiều (pha 0), biên phản xạ để đầu/cuối không bị kéo."""
    v = np.asarray(v, dtype=np.float64)
    if sigma <= 0 or len(v) < 2:
        return v.copy()
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(v, r, mode="reflect" if len(v) > r else "edge")
    return np.convolve(p, k, mode="valid")


def track_crops(boxes, w: int, h: int, *, sigma: float = 6.0, q: float = 95.0,
                side: float = 0.06, top: float = 0.08, bottom: float = 0.02,
                min_aspect: float = 0.45
                ) -> tuple[tuple[int, int], np.ndarray]:
    """Khung cắt bám người từng khung.

    boxes: dãy (x0, y0, x1, y1) hoặc None (khung không thấy người).
    Trả ((cw, ch), xy) với cw, ch chẵn cố định cả video và xy (N, 2) int là góc
    trên trái từng khung. Theo chiều dọc (và chiều ngang khi khung rộng hơn ảnh)
    khung có thể thò ra ngoài ảnh: phần đó đệm đen (alpha 0), xem `crop_padded`.
    - cao = phân vị q chiều cao người * (1 + top + bottom), rộng = phân vị q
      chiều rộng + lề hai bên (ít nhất min_aspect * cao);
    - tâm ngang bám tâm bbox đã mượt; đáy khung = đáy bbox mượt + lề dưới
      (chân ổn định gần đáy thẻ).
    """
    n = len(boxes)
    valid = np.array([b is not None for b in boxes], dtype=bool)
    if not valid.any():
        raise ValueError("không có khung nào thấy người")
    arr = np.array([b if b is not None else (0, 0, 0, 0) for b in boxes],
                   dtype=np.float64).reshape(n, 4)
    bw, bh = arr[:, 2] - arr[:, 0], arr[:, 3] - arr[:, 1]
    hq = float(np.percentile(bh[valid], q))
    wq = float(np.percentile(bw[valid], q))
    ch = int(np.ceil(hq * (1 + top + bottom)))
    cw = int(np.ceil(max(wq + 2 * side * hq, min_aspect * ch)))
    cw += cw % 2
    ch += ch % 2
    cx = smooth(fill_gaps((arr[:, 0] + arr[:, 2]) / 2, valid), sigma)
    by = smooth(fill_gaps(arr[:, 3], valid), sigma)
    x = np.rint(cx - cw / 2)
    y = np.rint(by + bottom * hq - ch)
    # ngang: kẹp trong ảnh khi khung vừa ảnh, lớn hơn ảnh thì đặt giữa (đệm hai
    # bên). Dọc: KHÔNG kẹp, vì người thường cao gần kín khung quay; kẹp sẽ phá
    # neo chân (chân trôi lên xuống theo tay máy). Phần thò ra ngoài ảnh đệm
    # alpha 0 nên trong app vô hình.
    x = np.clip(x, 0, w - cw) if cw <= w else np.full(n, (w - cw) // 2)
    return (cw, ch), np.stack([x, y], axis=1).astype(int)


def crop_padded(img: np.ndarray, x: int, y: int, cw: int, ch: int) -> np.ndarray:
    """Cắt (cw, ch) tại (x, y); phần nằm ngoài ảnh điền 0."""
    h, w = img.shape[:2]
    out = np.zeros((ch, cw) + img.shape[2:], dtype=img.dtype)
    sx0, sy0 = max(x, 0), max(y, 0)
    sx1, sy1 = min(x + cw, w), min(y + ch, h)
    if sx1 > sx0 and sy1 > sy0:
        out[sy0 - y:sy1 - y, sx0 - x:sx1 - x] = img[sy0:sy1, sx0:sx1]
    return out
