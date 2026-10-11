"""Giữ riêng người múa chính trong mặt nạ RVM.

RVM giữ MỌI người trong khung (bạn đứng xem, người đi ngang) làm tiền cảnh.
Thẻ video chỉ cần một vũ công, nên mỗi khung ta giữ đúng mảng mặt nạ nối liền
với người chính của khung trước, xoá các mảng khác.

- Khung đầu có người: chọn mảng LỚN NHẤT (người quay gần máy nhất).
- Các khung sau: tách mảng (lan vùng 8 hướng), giữ đúng một mảng trùng nhiều
  nhất với người chính khung trước (nới vài ô cho chuyển động nhanh).
- Mỗi khung chấm điểm từng mảng: giống MÀU TRANG PHỤC đã nhớ (mạnh nhất, gỡ
  được lúc vũ công lướt qua chồng lên người xem rồi tách ra), trùng vị trí
  khung trước, và "cỡ vũ công" (người xem thường nhỏ hơn hẳn).
- Chỉ học mẫu (vị trí, diện tích, màu) khi chắc là vũ công một mình; mảng to
  vọt (dính người khác) hay lệch màu thì vẫn xuất nhưng đóng băng mẫu.

Làm trên lưới thu nhỏ STRIDE lần cho nhanh; numpy thuần, không cần scipy/opencv.
Hai người chạm nhau thì mảng dính liền và được giữ cả — chấp nhận được.
"""

from __future__ import annotations

import numpy as np

STRIDE = 4
THRESH = 0.5


def _dilate(m: np.ndarray, n: int = 1) -> np.ndarray:
    for _ in range(n):
        p = np.pad(m, 1)
        m = (p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
             | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:])
    return m


def reconstruct(seed: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Mọi ô của mask nối liền (8 hướng) với seed."""
    cur = seed & mask
    while True:
        nxt = _dilate(cur) & mask
        if nxt.sum() == cur.sum():
            return cur
        cur = nxt


def components(mask: np.ndarray) -> list[np.ndarray]:
    """Các mảng nối liền của mask, lớn trước."""
    rest = mask.copy()
    out = []
    while rest.any():
        i = int(np.flatnonzero(rest)[0])
        seed = np.zeros_like(rest)
        seed.flat[i] = True
        comp = reconstruct(seed, rest)
        out.append(comp)
        rest &= ~comp
    out.sort(key=lambda c: -int(c.sum()))
    return out


def _centroid(m: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(m)
    return np.array([ys.mean(), xs.mean()])


def color_hist(rgb_small: np.ndarray, m: np.ndarray, levels: int = 4) -> np.ndarray:
    """Biểu đồ màu chuẩn hoá (levels^3 ô) của các điểm thuộc mảng m."""
    q = (rgb_small[m].astype(np.int32) * levels) // 256
    idx = (q[:, 0] * levels + q[:, 1]) * levels + q[:, 2]
    h = np.bincount(idx, minlength=levels ** 3).astype(np.float64)
    return h / max(h.sum(), 1.0)


class MainPersonFilter:
    def __init__(self, stride: int = STRIDE, slack: int = 3, size_frac: float = 0.5,
                 merge_ratio: float = 1.25, ema: float = 0.05, color_tol: float = 0.5):
        self.stride = stride
        self.slack = slack          # số ô nới seed (bù chuyển động giữa 2 khung)
        self.size_frac = size_frac  # mảng "cỡ vũ công": ≥ tỉ lệ này so với diện tích nhớ
        self.merge_ratio = merge_ratio  # mảng to vọt hơn thế: nghi gộp với người khác
        self.ema = ema              # tốc độ cập nhật mẫu màu trang phục
        self.color_tol = color_tol  # lệch màu (L1, 0..2) tối đa để còn học tiếp
        self._prev: np.ndarray | None = None
        self._area = 0
        self._hist: np.ndarray | None = None

    def _color(self, c: np.ndarray, rgb: np.ndarray | None) -> float:
        if rgb is None or self._hist is None:
            return 0.0
        return float(np.abs(color_hist(rgb, c) - self._hist).sum())

    def _cost(self, c: np.ndarray, seed: np.ndarray, color: float) -> float:
        """Nhỏ = giống vũ công. Màu trang phục (0..2) + độ trùng vị trí + cỡ."""
        area = int(c.sum())
        cost = color + 0.5 * (1.0 - (c & seed).sum() / area)
        if area < self.size_frac * self._area:
            cost += 1.0
        return cost

    def __call__(self, pha: np.ndarray, rgb: np.ndarray | None = None) -> np.ndarray:
        """Trả pha (H, W) chỉ còn người chính; khung không có ai trả nguyên.

        rgb (H, W, 3) tuỳ chọn: khung màu gốc, để nhận vũ công theo trang phục.
        """
        s = self.stride
        h, w = pha.shape
        small = pha[s // 2::s, s // 2::s] > THRESH
        if not small.any():
            return pha
        rs = None if rgb is None else rgb[s // 2::s, s // 2::s]
        # đúng MỘT mảng (lấy hợp các mảng chạm seed thì khi vũ công đi sát người
        # xem, người xem bị gộp vào và dính luôn các khung sau)
        comps = components(small)
        if self._prev is None:
            keep, color = comps[0], 0.0
        else:
            seed = _dilate(self._prev, self.slack)
            colors = [self._color(c, rs) for c in comps]
            i = min(range(len(comps)), key=lambda i: self._cost(comps[i], seed, colors[i]))
            keep, color = comps[i], colors[i]
        # chỉ HỌC (vị trí, diện tích, màu) khi chắc là vũ công một mình. Lúc vũ
        # công chồng lên người xem, học theo mảng gộp sẽ trôi mẫu sang người xem.
        merged = self._prev is not None and keep.sum() > self.merge_ratio * self._area
        if not merged and color < self.color_tol:
            self._prev, self._area = keep, int(keep.sum())
            if rs is not None:
                hk = color_hist(rs, keep)
                self._hist = hk if self._hist is None else (1 - self.ema) * self._hist + self.ema * hk
        # nới 2 ô để giữ mép mềm (tóc, tà áo) quanh người chính
        big = np.repeat(np.repeat(_dilate(keep, 2), s, axis=0), s, axis=1)[:h, :w]
        if big.shape != (h, w):
            big = np.pad(big, ((0, h - big.shape[0]), (0, w - big.shape[1])), mode="edge")
        return pha * big
