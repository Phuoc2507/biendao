"""Test bước hợp nhất 2D->3D (fuse) và TriangulationAdapter."""

from __future__ import annotations

import numpy as np

from choreo.eval.metrics import mpjpe
from choreo.geom import look_at_camera, project_points
from choreo.geom.visibility import visible_mask
from choreo.mocap.adapter import TriangulationAdapter
from choreo.mocap.fuse import fuse_multiview
from choreo.schema import MotionClip
from choreo.synth import synthetic_dance


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def test_fuse_recovers_clean_motion():
    # Không nhiễu, không che khuất: fuse phải phục hồi gần đúng ground-truth.
    clip = synthetic_dance(fps=30.0, seconds=2.0, seed=1)
    gt = clip.joints3d
    cams = [look_at_camera(a, 4.5, elevation_deg=8.0) for a in (-40.0, 45.0)]
    kp = _project_clip(cams, gt)
    est = fuse_multiview(kp, cams, fps=30.0, smooth=False)
    assert isinstance(est, MotionClip)
    assert est.joints3d.shape == gt.shape
    assert mpjpe(est.joints3d, gt, root=None) < 1e-6


def test_fuse_fills_occlusion_gaps():
    # Có che khuất -> một số khớp NaN vài frame; gap-fill phải lấp hết, giữ sai số nhỏ.
    clip = synthetic_dance(fps=30.0, seconds=2.0, seed=2)
    gt = clip.joints3d
    cams = [look_at_camera(a, 4.5, elevation_deg=8.0) for a in (-45.0, 45.0)]
    kp = _project_clip(cams, gt)
    for v, cam in enumerate(cams):  # áp mask nhìn thấy -> NaN khớp bị che
        for f in range(gt.shape[0]):
            kp[v, f, ~visible_mask(cam, gt[f]), :] = np.nan
    est = fuse_multiview(kp, cams, fps=30.0, smooth=False, fill_gaps=True)
    assert np.isfinite(est.joints3d).all()          # đã lấp hết khoảng trống
    assert mpjpe(est.joints3d, gt, root=None) < 30.0  # mm, sai số hợp lý


def test_fuse_smoothing_reduces_jitter():
    # Thêm nhiễu 2D rồi bật làm mượt -> jitter (gia tốc) giảm so với không mượt.
    clip = synthetic_dance(fps=30.0, seconds=2.0, seed=5)
    gt = clip.joints3d
    cams = [look_at_camera(a, 4.5, elevation_deg=8.0) for a in (-40.0, 40.0)]
    kp = _project_clip(cams, gt)
    rng = np.random.default_rng(0)
    kp = kp + rng.normal(0, 3.0, size=kp.shape)  # nhiễu pixel
    raw = fuse_multiview(kp, cams, fps=30.0, smooth=False)
    sm = fuse_multiview(kp, cams, fps=30.0, smooth=True, smooth_window=9)

    def accel(j):  # độ lớn gia tốc trung bình (đại lượng jitter)
        return np.linalg.norm(np.diff(j, n=2, axis=0), axis=2).mean()

    assert accel(sm.joints3d) < accel(raw.joints3d)


def test_triangulation_adapter_matches_interface():
    # Adapter tam giác hoá chạy đúng hợp đồng MocapAdapter với view = keypoint 2D.
    clip = synthetic_dance(fps=30.0, seconds=1.0, seed=7)
    gt = clip.joints3d
    ca = look_at_camera(-45.0, 4.5, elevation_deg=8.0)
    cb = look_at_camera(45.0, 4.5, elevation_deg=8.0)
    kp = _project_clip([ca, cb], gt)  # (2,T,J,2)
    out = TriangulationAdapter(smooth=False).capture(kp[0], kp[1], ca, cb, fps=30.0)
    assert out.joints3d.shape == gt.shape
    assert out.contacts is not None and out.contacts.shape[0] == gt.shape[0]
    assert mpjpe(out.joints3d, gt, root=None) < 1e-6
