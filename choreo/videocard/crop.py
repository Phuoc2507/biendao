"""Khung bao người hợp nhất qua mọi khung hình, và lề cắt cho thẻ video.

Cắt theo khung bao HỢP (không theo từng khung) để thẻ không giật kích thước;
lề dưới nhỏ để bàn chân nằm sát đáy thẻ, tức là chạm sàn sân khấu ảo.
"""

from __future__ import annotations

import numpy as np


class BBoxAccumulator:
    def __init__(self, thresh: float = 0.5):
        self.thresh = thresh
        self._box: list[int] | None = None

    def add(self, alpha: np.ndarray) -> None:
        mask = np.asarray(alpha) > self.thresh
        rows = np.flatnonzero(mask.any(axis=1))
        if rows.size == 0:
            return
        cols = np.flatnonzero(mask.any(axis=0))
        box = [int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1]
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
