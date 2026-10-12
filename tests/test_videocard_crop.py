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


# --- cắt bám người từng khung -------------------------------------------------

from choreo.videocard.crop import (crop_padded, fill_gaps, frame_bbox, smooth,
                                   track_crops)


def test_frame_bbox_and_empty():
    assert frame_bbox(_alpha(100, 80, [(10, 20, 30, 90)])) == (10, 20, 30, 90)
    assert frame_bbox(np.zeros((10, 10))) is None


def test_smooth_reduces_noise_keeps_trend():
    rng = np.random.default_rng(0)
    t = np.arange(300, dtype=float)
    truth = 400 + 2.0 * t  # máy lia đều
    noisy = truth + rng.normal(0, 15, t.size)
    s = smooth(noisy, 6.0)
    assert s.shape == noisy.shape
    assert np.std(np.diff(s)) < 0.2 * np.std(np.diff(noisy))
    assert np.abs(s - truth)[20:-20].mean() < np.abs(noisy - truth)[20:-20].mean()


def test_fill_gaps_interp_and_hold():
    v = np.array([0, 0, 10, 0, 30, 0], dtype=float)
    valid = np.array([False, False, True, False, True, False])
    assert np.allclose(fill_gaps(v, valid), [10, 10, 10, 20, 30, 30])


def _walk_boxes(n=200, w=1920, h=1080, gaps=()):
    rng = np.random.default_rng(1)
    boxes = []
    for i in range(n):
        if i in gaps:
            boxes.append(None)
            continue
        cx = 300 + 7 * i + rng.normal(0, 20)
        bh = 600 + rng.normal(0, 30)
        bw = 250 + rng.normal(0, 40)
        y1 = 1000 + rng.normal(0, 10)
        boxes.append((int(cx - bw / 2), int(y1 - bh), int(cx + bw / 2), int(y1)))
    return boxes


def test_track_crops_fixed_size_inside_and_follows():
    w, h = 1920, 1080
    boxes = _walk_boxes(gaps=set(range(50, 70)))
    (cw, ch), xy = track_crops(boxes, w, h)
    assert xy.shape == (200, 2)
    assert cw % 2 == 0 and ch % 2 == 0
    assert (xy[:, 0] >= 0).all() and (xy[:, 0] + cw <= w).all()
    # dọc: chân (đáy bbox) giữ ổn định gần đáy khung cắt
    feet = np.array([b[3] - y for (x, y), b in zip(xy, boxes) if b is not None])
    assert (feet <= ch + 30).all() and (feet > 0.9 * ch).all()  # nhiễu đáy ~10 px
    assert np.std(feet) < 15
    # khung bám người: tâm bbox (khung có người) nằm trong khung cắt
    for (x, y), b in zip(xy, boxes):
        if b is not None:
            assert x <= (b[0] + b[2]) / 2 <= x + cw
    # quỹ đạo mượt hơn tâm bbox thô
    raw = np.array([(b[0] + b[2]) / 2 for b in boxes if b is not None])
    assert np.std(np.diff(xy[:, 0], 2)) < 0.3 * np.std(np.diff(raw, 2))
    # khung trống (50..69) được điền liên tục, không nhảy
    assert np.abs(np.diff(xy[45:75, 0])).max() < 20


def test_track_crops_bigger_than_image_pads():
    boxes = [(0, 0, 100, 100)] * 5
    (cw, ch), xy = track_crops(boxes, 80, 90)
    assert ch > 90
    img = np.full((90, 80, 3), 255, np.uint8)
    out = crop_padded(img, xy[0, 0], xy[0, 1], cw, ch)
    assert out.shape == (ch, cw, 3)
    assert out[0, 0].sum() == 0  # ngoài ảnh: đen


def test_crop_padded_inside_and_partial():
    img = np.arange(20 * 30, dtype=np.uint8).reshape(20, 30)
    assert np.array_equal(crop_padded(img, 5, 4, 10, 6), img[4:10, 5:15])
    out = crop_padded(img, -3, -2, 10, 6)
    assert out[:2].sum() == 0 and out[:, :3].sum() == 0
    assert np.array_equal(out[2:, 3:], img[0:4, 0:7])


def test_track_crops_all_empty_raises():
    import pytest

    with pytest.raises(ValueError):
        track_crops([None, None], 100, 100)


def test_track_crops_feet_anchored_even_near_image_bottom():
    # người cao gần kín khung quay, chân sát đáy ảnh: kẹp dọc sẽ đẩy chân lên;
    # ta không kẹp dọc nên chân vẫn cách đáy thẻ đúng lề dưới
    boxes = [(800, 100, 1100, 1078)] * 10
    (cw, ch), xy = track_crops(boxes, 1920, 1080, bottom=0.02)
    feet = 1078 - xy[:, 1]
    assert np.allclose(feet, ch - 0.02 * 978, atol=2)
    assert (xy[:, 1] < 100).all()  # đầu vẫn trong khung
