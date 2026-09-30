"""Test logic chọn cặp máy khuyến nghị của bản đồ đặt góc máy."""

from __future__ import annotations

import math

from experiments.ban_do_dat_may import recommend


ANGLES = [-90, -60, -30, 0, 30, 60, 90]


def test_recommend_picks_min_err_above_floor():
    # (i,j) -> (coverage%, mpjpe mm). Cặp (2,4) = -30/+30: phủ cao & err nhỏ nhất.
    pairs = {
        (0, 6): (60.0, 240.0),   # -90/+90: thoái hoá
        (2, 4): (92.0, 11.0),    # -30/+30: TỐT NHẤT trong nhóm đạt sàn
        (3, 4): (97.0, 26.0),    # 0/+30: phủ cao nhưng err lớn hơn
        (1, 5): (90.5, 14.0),    # -60/+60: đạt sàn, err lớn hơn (2,4)
    }
    rec = recommend(pairs, ANGLES, cov_floor=90.0)
    assert (rec["az_a"], rec["az_b"]) == (-30, 30)
    assert not rec["fallback"]
    assert math.isclose(rec["separation"], 60)


def test_recommend_ignores_high_coverage_but_worse_accuracy():
    # Cặp phủ cao nhất (0,+30) KHÔNG được chọn vì err lớn hơn cặp đạt sàn khác.
    pairs = {
        (3, 4): (99.0, 30.0),
        (2, 4): (91.0, 12.0),
    }
    rec = recommend(pairs, ANGLES, cov_floor=90.0)
    assert (rec["az_a"], rec["az_b"]) == (-30, 30)


def test_recommend_falls_back_when_none_meet_floor():
    # Không cặp nào đạt sàn -> lấy phủ cao nhất (rồi err nhỏ nhất), cờ fallback bật.
    pairs = {
        (2, 4): (70.0, 11.0),
        (3, 4): (85.0, 20.0),   # phủ cao nhất
        (0, 6): (40.0, 200.0),
    }
    rec = recommend(pairs, ANGLES, cov_floor=90.0)
    assert rec["fallback"]
    assert (rec["az_a"], rec["az_b"]) == (0, 30)


def test_recommend_skips_nan_error():
    # Cặp có err = NaN (không khôi phục được khớp nào) phải bị bỏ qua.
    pairs = {
        (0, 6): (95.0, float("nan")),
        (2, 4): (91.0, 13.0),
    }
    rec = recommend(pairs, ANGLES, cov_floor=90.0)
    assert (rec["az_a"], rec["az_b"]) == (-30, 30)
