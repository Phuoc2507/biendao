"""Test tam giác hoá bền vững (loại outlier 2D) + fuse robust."""

from __future__ import annotations

import numpy as np

from choreo.eval.metrics import mpjpe
from choreo.geom import look_at_camera, project_points
from choreo.geom.triangulate import triangulate_dlt, triangulate_robust
from choreo.mocap.fuse import fuse_multiview
from choreo.synth import synthetic_dance


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def test_robust_matches_dlt_when_clean():
    # Không outlier -> robust cho kết quả gần y hệt DLT thường.
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=1).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    kp = _project_clip(cams, gt)
    f = 5
    a = triangulate_dlt(P, kp[:, f])
    b = triangulate_robust(P, kp[:, f], reproj_thresh_px=20.0)
    assert np.allclose(a, b, atol=1e-6)


def test_robust_rejects_outlier_view_with_three_cams():
    # 3 máy, tiêm 1 outlier lớn vào 1 view của 1 khớp -> robust loại view đó và
    # vẫn dựng đúng khớp; DLT thường thì sai hẳn.
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=2).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    f, j = 10, 15  # cổ tay phải
    pts = _project_clip(cams, gt)[:, f].copy()  # (V,J,2)
    pts[1, j] += np.array([120.0, -90.0])       # outlier thô ở view giữa

    plain = triangulate_dlt(P, pts)[j]
    robust = triangulate_robust(P, pts, reproj_thresh_px=15.0)[j]
    err_plain = np.linalg.norm(plain - gt[f, j])
    err_robust = np.linalg.norm(robust - gt[f, j])
    assert err_robust < 0.01                      # <10mm: gần như hồi phục hoàn toàn
    assert err_plain > 5 * err_robust             # DLT thường sai lớn hơn nhiều


def test_robust_rejects_bad_joint_with_two_cams():
    # 2 máy: không phân biệt được ai sai -> khớp outlier bị trả NaN (để nội suy).
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=3).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 45.0)]
    P = np.stack([c.P for c in cams], axis=0)
    f, j = 8, 14
    pts = _project_clip(cams, gt)[:, f].copy()
    pts[0, j] += np.array([150.0, 60.0])          # outlier ở 1 view
    robust = triangulate_robust(P, pts, reproj_thresh_px=15.0)
    assert not np.isfinite(robust[j]).all()       # khớp hỏng -> NaN
    ok = [k for k in range(gt.shape[1]) if k != j]
    assert np.isfinite(robust[ok]).all()          # các khớp khác vẫn ổn


def test_fuse_robust_recovers_from_outliers():
    # Pipeline: tiêm outlier rải rác + robust + gap-fill -> MPJPE tốt hơn hẳn không robust.
    gt = synthetic_dance(fps=30.0, seconds=2.0, seed=4).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 0.0, 45.0)]
    kp = _project_clip(cams, gt)
    rng = np.random.default_rng(0)
    # 3% quan sát (view,frame,joint) bị lỗi thô.
    V, T, J, _ = kp.shape
    mask = rng.random((V, T, J)) < 0.03
    kp[mask] += rng.normal(0, 100.0, size=(mask.sum(), 2))

    plain = fuse_multiview(kp, cams, fps=30.0, smooth=False, robust=False)
    robust = fuse_multiview(kp, cams, fps=30.0, smooth=False, robust=True, reproj_thresh_px=20.0)
    assert mpjpe(robust.joints3d, gt, root=None) < mpjpe(plain.joints3d, gt, root=None)
    assert np.isfinite(robust.joints3d).all()
    assert robust.meta["robust"] is True
