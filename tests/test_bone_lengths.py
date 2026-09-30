"""Test ràng buộc độ dài xương theo thời gian (enforce_bone_lengths, kiểu PBD) + metric."""

from __future__ import annotations

import numpy as np

from choreo.cleanup.smooth import enforce_bone_lengths
from choreo.eval.metrics import bone_length_std, mpjpe
from choreo.geom import look_at_camera, project_points
from choreo.mocap.fuse import fuse_multiview
from choreo.schema import MotionClip, SKELETON_EDGES
from choreo.synth import synthetic_dance


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def test_bone_lengths_become_constant():
    # Sau khi ép, mỗi xương có độ dài gần như hằng số qua mọi khung (std ~ 0).
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=1).joints3d
    rng = np.random.default_rng(0)
    noisy = gt + rng.normal(0, 0.01, size=gt.shape)   # nhiễu radial làm xương "co giãn"
    clip = MotionClip(fps=30.0, joints3d=noisy)

    before = bone_length_std(noisy)
    fixed = enforce_bone_lengths(clip, iters=40)
    after = bone_length_std(fixed)

    assert after < 1e-3           # gần như hằng số (đơn vị mm)
    assert before > 10 * after    # giảm dao động rõ rệt


def test_bone_lengths_converge_to_target_median():
    # Đủ vòng lặp, độ dài mỗi xương hội tụ về trung vị theo thời gian của độ dài gốc.
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=2).joints3d
    rng = np.random.default_rng(3)
    noisy = gt + rng.normal(0, 0.02, size=gt.shape)
    clip = MotionClip(fps=30.0, joints3d=noisy)
    fixed = enforce_bone_lengths(clip, iters=80)

    for p, c in SKELETON_EDGES:
        target = np.median(np.linalg.norm(noisy[:, c] - noisy[:, p], axis=1))
        got = np.linalg.norm(fixed[:, c] - fixed[:, p], axis=1)
        assert np.allclose(got, target, atol=1e-4)


def test_stays_close_to_observations():
    # PBD phân tán sai lệch -> khớp không trôi xa quan sát (dịch trung bình nhỏ).
    gt = synthetic_dance(fps=30.0, seconds=1.0, seed=4).joints3d
    rng = np.random.default_rng(5)
    noisy = gt + rng.normal(0, 0.02, size=gt.shape)
    clip = MotionClip(fps=30.0, joints3d=noisy)
    fixed = enforce_bone_lengths(clip, iters=20)

    disp = np.linalg.norm(fixed - noisy, axis=2).mean()   # mét
    assert disp < 0.03            # dịch trung bình < 3cm (chỉ sửa theo phương xương)


def test_pipeline_bone_std_drops_and_mpjpe_improves():
    # Trên pipeline 2 máy có nhiễu: ép xương vừa cứng xương vừa GIẢM MPJPE
    # (phân tán sai số, khác hẳn FK dựng lại từ root vốn làm MPJPE tệ đi).
    gt = synthetic_dance(fps=30.0, seconds=2.0, seed=7).joints3d
    cams = [look_at_camera(a, 4.5) for a in (-45.0, 45.0)]
    kp = _project_clip(cams, gt)
    rng = np.random.default_rng(8)
    kp = kp + rng.normal(0, 3.0, size=kp.shape)   # nhiễu 2D 3px

    clip = fuse_multiview(kp, cams, fps=30.0, smooth=True)
    fixed = enforce_bone_lengths(clip, iters=20)

    std_before = bone_length_std(clip.joints3d)
    std_after = bone_length_std(fixed)
    assert std_after < std_before * 0.1            # cứng xương gần hoàn toàn

    mpjpe_before = mpjpe(clip.joints3d, gt, root=None)
    mpjpe_after = mpjpe(fixed, gt, root=None)
    assert mpjpe_after <= mpjpe_before             # không tệ đi (thực tế tốt hơn)
