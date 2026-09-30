"""Test hình học đa-view: chiếu, tam giác hoá DLT, góc giao hội."""

from __future__ import annotations

import numpy as np

from choreo.geom import (
    look_at_camera,
    perturb_calib,
    project_points,
    ray_angle_deg,
    triangulate_dlt,
)
from choreo.geom.cameras import camera_center
from choreo.synth import synthetic_dance


def _stack_P(cams):
    return np.stack([c.P for c in cams], axis=0)


def test_perturb_calib_zero_is_identity():
    cam = look_at_camera(30.0, 4.5)
    p = perturb_calib(cam, rot_deg=0.0, trans_m=0.0)
    assert np.allclose(p.R, cam.R) and np.allclose(p.t, cam.t)


def test_perturb_calib_rotation_angle_exact():
    # Góc quay tương đối dR = R'R^T phải đúng bằng rot_deg (bất kể trục ngẫu nhiên).
    cam = look_at_camera(30.0, 4.5)
    p = perturb_calib(cam, rot_deg=2.0, rng=np.random.default_rng(3))
    dR = p.R @ cam.R.T
    ang = np.degrees(np.arccos(np.clip((np.trace(dR) - 1) / 2, -1, 1)))
    assert np.isclose(ang, 2.0, atol=1e-6)


def test_perturb_calib_translation_magnitude_exact():
    # Tâm quang dịch đúng trans_m mét.
    cam = look_at_camera(30.0, 4.5)
    p = perturb_calib(cam, trans_m=0.05, rng=np.random.default_rng(4))
    assert np.isclose(np.linalg.norm(camera_center(p) - camera_center(cam)), 0.05, atol=1e-6)


def test_camera_center_matches_eye():
    # Tâm quang khôi phục = vị trí đặt máy (bán kính `distance` quanh target).
    cam = look_at_camera(37.0, distance=4.0, target=(0.0, 1.0, 0.0))
    C = camera_center(cam)
    assert np.isclose(np.linalg.norm(C - np.array([0.0, 1.0, 0.0])), 4.0, atol=1e-6)


def test_projection_hits_principal_point_for_target():
    # Điểm ngắm (target) phải chiếu đúng vào tâm ảnh (cx, cy).
    w, h = 1920, 1080
    cam = look_at_camera(20.0, distance=5.0, target=(0.0, 1.0, 0.0), image_size=(w, h))
    uv = project_points(cam, np.array([0.0, 1.0, 0.0]))
    assert np.allclose(uv, [w / 2, h / 2], atol=1e-6)


def test_triangulate_recovers_known_point():
    # Hai máy lệch 90°, một điểm biết trước -> DLT phục hồi gần như tuyệt đối.
    pt = np.array([0.3, 1.2, -0.2])
    cams = [look_at_camera(a, distance=4.0) for a in (-45.0, 45.0)]
    x = np.stack([project_points(c, pt) for c in cams], axis=0)[:, None, :]  # (2,1,2)
    est = triangulate_dlt(_stack_P(cams), x)
    assert np.allclose(est[0], pt, atol=1e-6)


def test_roundtrip_full_clip_noise_free():
    # Chiếu cả clip qua 2 máy rồi tam giác hoá lại: sai số ~0 khi không nhiễu.
    clip = synthetic_dance(fps=15.0, seconds=1.0, seed=3)
    cams = [look_at_camera(a, distance=4.5) for a in (-40.0, 50.0)]
    P = _stack_P(cams)
    gt = clip.joints3d  # (T,J,3)
    for f in range(gt.shape[0]):
        x = np.stack([project_points(c, gt[f]) for c in cams], axis=0)  # (2,J,2)
        est = triangulate_dlt(P, x)
        assert np.isfinite(est).all()
        assert np.max(np.linalg.norm(est - gt[f], axis=1)) < 1e-6


def test_ray_angle_symmetric_cameras():
    # Hai máy đặt đối xứng +-30° quanh trục nhìn vào tâm -> góc giao hội ~60°.
    pt = np.array([0.0, 1.0, 0.0])
    a = look_at_camera(-30.0, distance=4.0, elevation_deg=0.0, target=tuple(pt))
    b = look_at_camera(30.0, distance=4.0, elevation_deg=0.0, target=tuple(pt))
    ang = ray_angle_deg(a, b, pt)
    assert abs(ang - 60.0) < 1e-6


def test_triangulate_needs_two_views():
    # Chỉ một view hợp lệ (view kia NaN) -> không định được điểm -> NaN.
    pt = np.array([0.1, 1.0, 0.0])
    cams = [look_at_camera(a, distance=4.0) for a in (-45.0, 45.0)]
    x = np.stack([project_points(c, pt) for c in cams], axis=0)[:, None, :]
    x[1, 0] = np.nan
    est = triangulate_dlt(_stack_P(cams), x)
    assert np.isnan(est[0]).all()


def test_visibility_occludes_joint_behind_torso():
    # Khớp nằm sau thân (phía xa camera) bị che; khớp phía trước thì không.
    from choreo.geom.visibility import visible_mask
    from choreo.schema import NUM_JOINTS, JOINT_INDEX
    import numpy as np
    pose = np.zeros((NUM_JOINTS, 3))
    pose[JOINT_INDEX["pelvis"]] = (0.0, 0.95, 0.0)
    pose[JOINT_INDEX["neck"]] = (0.0, 1.45, 0.0)
    pose[JOINT_INDEX["l_wrist"]] = (0.0, 1.2, -0.3)   # sau thân so với máy ở +Z
    pose[JOINT_INDEX["r_wrist"]] = (0.0, 1.2, 0.4)    # trước thân, gần máy hơn
    cam = look_at_camera(0.0, distance=4.0, elevation_deg=0.0, target=(0.0, 1.2, 0.0))
    mask = visible_mask(cam, pose)
    assert not mask[JOINT_INDEX["l_wrist"]]  # bị thân che
    assert mask[JOINT_INDEX["r_wrist"]]      # thấy rõ
    assert mask[JOINT_INDEX["neck"]]         # khớp trên trục thân luôn thấy


def test_visibility_complementary_across_opposite_cameras():
    # Cùng một khớp bị che ở máy này thì lộ ra ở máy đối diện -> bù nhau.
    from choreo.geom.visibility import visible_mask
    from choreo.schema import NUM_JOINTS, JOINT_INDEX
    import numpy as np
    pose = np.zeros((NUM_JOINTS, 3))
    pose[JOINT_INDEX["pelvis"]] = (0.0, 0.95, 0.0)
    pose[JOINT_INDEX["neck"]] = (0.0, 1.45, 0.0)
    pose[JOINT_INDEX["l_wrist"]] = (0.0, 1.2, -0.3)
    front = look_at_camera(0.0, 4.0, elevation_deg=0.0, target=(0.0, 1.2, 0.0))
    back = look_at_camera(180.0, 4.0, elevation_deg=0.0, target=(0.0, 1.2, 0.0))
    mf = visible_mask(front, pose)
    mb = visible_mask(back, pose)
    assert not mf[JOINT_INDEX["l_wrist"]] and mb[JOINT_INDEX["l_wrist"]]
