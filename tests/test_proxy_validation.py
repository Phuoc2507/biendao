"""Test helper THUẦN của proxy-validation (Spearman/rankdata) — không mạng/GPU."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from experiments.aist_proxy_validation import COCO_BONES, rankdata, spearman


def test_rankdata_basic_and_ties():
    # không trùng -> hạng 1..n theo thứ tự giá trị
    assert list(rankdata([30.0, 10.0, 20.0])) == [3.0, 1.0, 2.0]
    # trùng -> hạng trung bình (hai số 10 chiếm hạng 1,2 -> 1.5)
    assert list(rankdata([10.0, 10.0, 20.0])) == [1.5, 1.5, 3.0]


def test_spearman_monotonic_is_one():
    x = np.arange(10, dtype=float)
    y = 2.0 * x + 5.0                     # đơn điệu tăng (dù phi tuyến vẫn ρ=1)
    assert spearman(x, y) == pytest.approx(1.0)
    assert spearman(x, np.exp(y)) == pytest.approx(1.0)   # bất biến đơn điệu


def test_spearman_antitonic_is_minus_one():
    x = np.arange(10, dtype=float)
    assert spearman(x, -x) == pytest.approx(-1.0)


def test_spearman_ignores_nan_pairs():
    x = np.array([1.0, 2.0, 3.0, np.nan, 5.0])
    y = np.array([1.0, 2.0, 3.0, 4.0, np.nan])
    # chỉ 3 cặp hợp lệ (1,1)(2,2)(3,3) -> đơn điệu -> ρ=1
    assert spearman(x, y) == pytest.approx(1.0)


def test_spearman_too_few_pairs_is_nan():
    assert np.isnan(spearman(np.array([1.0, np.nan]), np.array([1.0, 2.0])))


def test_coco_bones_are_valid_indices():
    # mọi chỉ số xương nằm trong 0..16 và không tự nối
    for p, c in COCO_BONES:
        assert 0 <= p < 17 and 0 <= c < 17 and p != c


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
