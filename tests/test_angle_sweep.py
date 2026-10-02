"""Test helper THUẦN của sweep góc (experiments.aist_angle_sweep) — không mạng/GPU."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from experiments.aist_angle_sweep import BIN_EDGES, bin_index


def test_bin_index_maps_each_30deg_band():
    # tâm mỗi khoảng rơi đúng bin của nó
    centers = [(BIN_EDGES[i] + BIN_EDGES[i + 1]) / 2 for i in range(len(BIN_EDGES) - 1)]
    for i, c in enumerate(centers):
        assert bin_index(c) == i


def test_bin_index_left_edge_inclusive():
    # cạnh trái thuộc chính bin đó (0->bin0, 60->bin2)
    assert bin_index(0.0) == 0
    assert bin_index(60.0) == 2
    assert bin_index(149.9) == 4


def test_bin_index_180_goes_to_last_bin():
    # 180° (và sát-180) không vượt ra ngoài -> bin cuối 150–180
    last = len(BIN_EDGES) - 2
    assert bin_index(180.0) == last
    assert bin_index(179.9) == last


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
