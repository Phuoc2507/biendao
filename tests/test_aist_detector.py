"""Test phần THUẦN của đường ống detector-trên-video-AIST (Gate 0).

KHÔNG chạm GPU/mạng/đĩa video: chỉ kiểm ánh xạ tên-camera (aist_video), chọn-
instance/đóng-gói (detect2d) và căn-thời-gian/ghép-view/đo (aist_detector_2view).
Phần `detect` thật (mmpose) và `download_video` nằm ngoài tầm test — đã đánh dấu
pragma no cover và cần GPU/license.
"""

from __future__ import annotations

import numpy as np
import pytest

from choreo.datasets.aist_video import video_name, video_url
from choreo.datasets.detect2d import NUM_COCO, pack_frames, select_instance


# ------------------------------- aist_video -------------------------------

STEM = "gBR_sBM_cAll_d04_mBR0_ch01"


def test_video_name_maps_call_to_each_camera():
    # view 0..8 -> c01..c09, phần còn lại của tên giữ nguyên
    assert video_name(STEM, 0) == "gBR_sBM_c01_d04_mBR0_ch01"
    assert video_name(STEM, 8) == "gBR_sBM_c09_d04_mBR0_ch01"
    assert video_name(STEM, 3) == "gBR_sBM_c04_d04_mBR0_ch01"


def test_video_name_rejects_bad_view_idx():
    for bad in (-1, 9, 100):
        with pytest.raises(ValueError):
            video_name(STEM, bad)


def test_video_name_requires_exactly_one_cAll():
    with pytest.raises(ValueError):
        video_name("gBR_sBM_c01_d04_mBR0_ch01", 0)       # không có _cAll_
    with pytest.raises(ValueError):
        video_name("x_cAll_y_cAll_z", 0)                 # hai _cAll_


def test_video_url_format():
    url = video_url(STEM, 0, base="http://h/v", quality="10M")
    assert url == "http://h/v/10M/gBR_sBM_c01_d04_mBR0_ch01.mp4"


# ------------------------------- detect2d -------------------------------

def test_select_instance_picks_highest_total_score():
    kp = np.zeros((2, NUM_COCO, 2))
    kp[0] = 1.0                                   # người 0 ở (1,1)
    kp[1] = 2.0                                   # người 1 ở (2,2)
    scores = np.zeros((2, NUM_COCO))
    scores[1] = 0.9                               # người 1 tin cậy hơn
    scores[0] = 0.1
    out = select_instance(kp, scores)
    assert out.shape == (NUM_COCO, 3)
    assert np.allclose(out[:, :2], 2.0)           # chọn người 1
    assert np.allclose(out[:, 2], 0.9)            # kèm đúng confidence


def test_select_instance_empty_frame_is_nan():
    out = select_instance(np.empty((0, NUM_COCO, 2)), np.empty((0, NUM_COCO)))
    assert out.shape == (NUM_COCO, 3)
    assert np.all(np.isnan(out))


def test_select_instance_rejects_bad_shape():
    with pytest.raises(ValueError):
        select_instance(np.zeros((2, 5, 2)), np.zeros((2, 5)))


def test_pack_frames_stacks_and_handles_empty():
    frames = [np.full((NUM_COCO, 3), i) for i in range(4)]
    packed = pack_frames(frames)
    assert packed.shape == (4, NUM_COCO, 3)
    assert np.allclose(packed[2], 2.0)
    assert pack_frames([]).shape == (0, NUM_COCO, 3)


# --------------------- aist_detector_2view (hàm thuần) ---------------------
# import muộn: file ở experiments/, cần có trên sys.path khi test chạy từ gốc repo.

def _exp():
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    import experiments.aist_detector_2view as exp
    return exp


def test_align_time_truncates_to_min():
    exp = _exp()
    a = np.zeros((10, NUM_COCO, 3))
    b = np.zeros((7, NUM_COCO, 3))
    c = np.zeros((12, NUM_COCO, 3))
    out = exp.align_time([a, b, c])
    assert [x.shape[0] for x in out] == [7, 7, 7]
    assert out[0].shape[1:] == (NUM_COCO, 3)      # trục khác giữ nguyên


def test_align_time_empty_list():
    exp = _exp()
    assert exp.align_time([]) == []


def test_stack_views_splits_xy_and_conf():
    exp = _exp()
    va = np.arange(5 * NUM_COCO * 3, dtype=float).reshape(5, NUM_COCO, 3)
    vb = np.arange(8 * NUM_COCO * 3, dtype=float).reshape(8, NUM_COCO, 3)
    xy, conf = exp.stack_views([va, vb])
    assert xy.shape == (2, 5, NUM_COCO, 2)        # căn về min T=5, bỏ cột conf
    assert conf.shape == (2, 5, NUM_COCO)
    assert np.allclose(xy[0], va[:5, :, :2])
    assert np.allclose(conf[0], va[:5, :, 2])


def test_px_rmse_known_and_ignores_nan():
    exp = _exp()
    pred = np.zeros((3, NUM_COCO, 2))
    ref = np.zeros((3, NUM_COCO, 2))
    ref[..., 0] = 3.0
    ref[..., 1] = 4.0                             # mỗi khớp lệch đúng 5 px
    assert np.isclose(exp.px_rmse(pred, ref), 5.0)
    pred[0, 0, 0] = np.nan                        # một khớp NaN -> bị bỏ, không hỏng
    assert np.isclose(exp.px_rmse(pred, ref), 5.0)


def test_mpjpe_zero_when_identical():
    exp = _exp()
    rng = np.random.default_rng(0)
    pose = rng.normal(size=(6, NUM_COCO, 3))
    g, pa = exp.mpjpe(pose, pose)
    assert g < 1e-9 and pa < 1e-6


def test_detect_npz_path_names_camera():
    exp = _exp()
    p = exp.detect_npz_path("/cache", STEM, 0)
    assert p.name == "gBR_sBM_c01_d04_mBR0_ch01.npz"
    assert p.parent.name == exp.DETECT_SUBDIR


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
