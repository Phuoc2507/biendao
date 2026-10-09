"""Khung bao người qua mọi khung hình và lề cắt cho thẻ video."""

import numpy as np

from choreo.videocard.crop import BBoxAccumulator, padded_crop


def _alpha(h, w, rects):
    a = np.zeros((h, w), dtype=np.float32)
    for x0, y0, x1, y1 in rects:
        a[y0:y1, x0:x1] = 1.0
    return a


def test_single_rect():
    acc = BBoxAccumulator()
    acc.add(_alpha(100, 80, [(10, 20, 30, 90)]))
    assert acc.bbox == (10, 20, 30, 90)


def test_union_over_frames():
    acc = BBoxAccumulator()
    acc.add(_alpha(100, 80, [(10, 20, 30, 90)]))
    acc.add(_alpha(100, 80, [(40, 5, 70, 60)]))
    assert acc.bbox == (10, 5, 70, 90)


def test_threshold_ignores_faint_alpha():
    acc = BBoxAccumulator(thresh=0.5)
    a = _alpha(50, 50, [(10, 10, 20, 20)])
    a[0:5, 0:50] = 0.3  # bóng mờ, không tính
    acc.add(a)
    assert acc.bbox == (10, 10, 20, 20)


def test_empty_is_none():
    acc = BBoxAccumulator()
    acc.add(np.zeros((10, 10)))
    assert acc.bbox is None


def test_padded_crop_margins_even_and_inside():
    # bbox cao 100 px: lề bên 4 px, trên 4 px, dưới 1 px
    x, y, cw, ch = padded_crop((101, 50, 151, 150), w=640, h=360)
    assert x <= 97 and y <= 46
    assert x + cw >= 155 and y + ch >= 151
    assert cw % 2 == 0 and ch % 2 == 0
    assert x % 2 == 0 and y % 2 == 0


def test_padded_crop_clamped_to_image():
    x, y, cw, ch = padded_crop((0, 0, 639, 359), w=640, h=360)
    assert x >= 0 and y >= 0
    assert x + cw <= 640 and y + ch <= 360
    assert cw % 2 == 0 and ch % 2 == 0
