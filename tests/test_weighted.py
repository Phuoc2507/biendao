"""Test tam giác hoá có trọng số tin cậy (weighted DLT) + fuse dùng confidences."""

from __future__ import annotations

import numpy as np

from choreo.eval.metrics import mpjpe
from choreo.geom import look_at_camera, project_points
from choreo.geom.triangulate import triangulate_dlt
from choreo.mocap.fuse import fuse_multiview
from choreo.synth import synthetic_dance


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def test_uniform_weights_match_unweighted():
    # Trọng số đều -> y hệt DLT thường.
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=1).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    pts = _project_clip(cams, gt)[:, 5]           # (V,J,2)
    a = triangulate_dlt(P, pts)
    b = triangulate_dlt(P, pts, weights=np.ones((3, gt.shape[1])))
    assert np.allclose(a, b, atol=1e-9)


def test_zero_weight_drops_view():
    # Trọng số 0 cho 1 view = coi như view đó không quan sát (loại khỏi hệ).
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=2).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    pts = _project_clip(cams, gt)[:, 5].copy()
    J = gt.shape[1]

    # Bỏ view 1 bằng trọng số 0 ...
    w = np.ones((3, J)); w[1] = 0.0
    got = triangulate_dlt(P, pts, weights=w)
    # ... phải bằng dựng chỉ từ 2 view còn lại.
    ref = triangulate_dlt(P[[0, 2]], pts[[0, 2]])
    assert np.allclose(got, ref, atol=1e-9)


def test_weight_downweights_noisy_view():
    # 3 máy, 1 view có nhiễu lớn ở 1 khớp: hạ trọng số view đó -> gần GT hơn nhiều.
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=3).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    f, j = 10, 15
    pts = _project_clip(cams, gt)[:, f].copy()
    pts[1, j] += np.array([25.0, -18.0])          # view giữa nhiễu mềm ở khớp j
    J = gt.shape[1]

    plain = triangulate_dlt(P, pts)[j]
    w = np.ones((3, J)); w[1, j] = 0.1            # hạ tin cậy view nhiễu
    weighted = triangulate_dlt(P, pts, weights=w)[j]
    assert np.linalg.norm(weighted - gt[f, j]) < np.linalg.norm(plain - gt[f, j])


def test_fuse_weighted_beats_unweighted_under_confidence_noise():
    # Pipeline: nhiễu 2D tương quan với (1-confidence). Dùng confidences -> MPJPE tốt hơn.
    gt = synthetic_dance(fps=30.0, seconds=2.0, seed=4).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    kp = _project_clip(cams, gt)
    V, T, J, _ = kp.shape
    rng = np.random.default_rng(0)
    # confidence ngẫu nhiên trong [0.2,1]; nhiễu tỉ lệ nghịch với confidence.
    conf = rng.uniform(0.2, 1.0, size=(V, T, J))
    sigma = (1.0 - conf) * 12.0 + 1.0             # px: conf thấp -> nhiễu lớn
    kp = kp + rng.normal(0, 1.0, size=kp.shape) * sigma[..., None]

    plain = fuse_multiview(kp, cams, fps=30.0, smooth=True)
    weighted = fuse_multiview(kp, cams, fps=30.0, smooth=True, confidences=conf)
    assert weighted.meta["weighted"] is True
    assert plain.meta["weighted"] is False
    assert mpjpe(weighted.joints3d, gt, root=None) < mpjpe(plain.joints3d, gt, root=None)
