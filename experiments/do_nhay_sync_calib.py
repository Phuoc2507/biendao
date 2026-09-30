"""Độ nhạy của tam giác hoá 2-view với SAI SỐ ĐỒNG BỘ và SAI SỐ HIỆU CHỈNH.

Đây là "phần khó" của quay bằng 2 điện thoại tiêu dùng — thứ mà camera đơn của
Choreoto né được, và là điểm nhóm đưa ra như đóng góp phương pháp (§5.2):
  - Hai điện thoại KHÔNG genlock -> lệch thời gian (sync) dưới/khoảng 1 khung.
  - Hiệu chỉnh ChArUco không hoàn hảo -> sai lệch hướng ngắm / vị trí máy.
Thực nghiệm định lượng "được phép sai bao nhiêu" -> biện minh vỗ-tay-sync + 60fps
+ ChArUco, và đặt ngưỡng chấp nhận cho Cổng 0.

Chạy:  .venv/Scripts/python experiments/do_nhay_sync_calib.py
Ghi ra experiments/ket-qua-do-nhay-sync-calib.md
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

from experiments.synthetic_2view import (  # noqa: E402
    DISTANCE, ELEV, FOV, IMAGE, DEFAULT_NOISE_PX, _bar,
)
from choreo.eval.metrics import mpjpe                      # noqa: E402
from choreo.geom import look_at_camera, perturb_calib, project_points, triangulate_dlt  # noqa: E402
from choreo.synth import synthetic_dance                   # noqa: E402

OUT_FPS = 30.0
DENSE_FPS = 240.0           # lưới thời gian mịn để nội suy lệch dưới-khung
SECONDS = 2.0
TRIALS = 20
PAIR_AZ = (-45.0, 45.0)     # cấu hình khuyến nghị (lệch 90°)


def _make_cams():
    return [
        look_at_camera(PAIR_AZ[0], DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE),
        look_at_camera(PAIR_AZ[1], DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE),
    ]


def exp_sync(dense_gt):
    """MPJPE theo độ lệch đồng bộ giữa 2 máy (máy B trễ so với máy A)."""
    cams = _make_cams()
    P = np.stack([c.P for c in cams], axis=0)
    step = int(round(DENSE_FPS / OUT_FPS))          # 8 khung dense = 1 khung out
    max_shift = step                                 # tối đa 1 khung @30fps
    n_out = (dense_gt.shape[0] - max_shift) // step
    idxA = np.arange(n_out) * step
    gt_out = dense_gt[idxA]                           # sự thật tại thời điểm máy A
    J = dense_gt.shape[1]

    projA = project_points(cams[0], dense_gt)         # (Td,J,2)
    projB = project_points(cams[1], dense_gt)

    rows = []
    for dframe in range(0, max_shift + 1, 1):
        ms = 1000.0 * dframe / DENSE_FPS
        errs = []
        for tr in range(TRIALS):
            rng = np.random.default_rng(700 + tr)
            est = np.empty_like(gt_out)
            for k in range(n_out):
                a = projA[idxA[k]] + rng.normal(0, DEFAULT_NOISE_PX, size=(J, 2))
                b = projB[idxA[k] + dframe] + rng.normal(0, DEFAULT_NOISE_PX, size=(J, 2))
                est[k] = triangulate_dlt(P, np.stack([a, b], axis=0))
            errs.append(mpjpe(est, gt_out, root=None))
        rows.append((ms, dframe, float(np.mean(errs))))
    return rows


def _run_calib(cams_pair, gt, trials, seed0):
    """MPJPE trung bình khi tam giác hoá với cặp calib cho trước (có nhiễu 2px)."""
    # Chiếu bằng calib THẬT (look_at gốc) nhưng tam giác hoá bằng calib NHIỄU:
    # mô phỏng ta tưởng máy ở đúng chỗ nhưng thực ra hiệu chỉnh sai.
    true_cams = _make_cams()
    projA = project_points(true_cams[0], gt)
    projB = project_points(true_cams[1], gt)
    T, J = gt.shape[0], gt.shape[1]
    errs = []
    for tr in range(trials):
        rng = np.random.default_rng(seed0 + tr)
        P = np.stack([cams_pair[tr][0].P, cams_pair[tr][1].P], axis=0)
        est = np.empty_like(gt)
        for f in range(T):
            a = projA[f] + rng.normal(0, DEFAULT_NOISE_PX, size=(J, 2))
            b = projB[f] + rng.normal(0, DEFAULT_NOISE_PX, size=(J, 2))
            est[f] = triangulate_dlt(P, np.stack([a, b], axis=0))
        errs.append(mpjpe(est, gt, root=None))
    return float(np.mean(errs))


def exp_calib_rot(gt):
    """MPJPE theo sai số HƯỚNG NGẮM hiệu chỉnh (xoay máy B, độ)."""
    true_cams = _make_cams()
    rows = []
    for deg in (0.0, 0.1, 0.25, 0.5, 1.0, 2.0):
        cams_pair = []
        for tr in range(TRIALS):
            rng = np.random.default_rng(3000 + tr)
            b = perturb_calib(true_cams[1], rot_deg=deg, rng=rng)
            cams_pair.append((true_cams[0], b))
        rows.append((deg, _run_calib(cams_pair, gt, TRIALS, seed0=3100)))
    return rows


def exp_calib_trans(gt):
    """MPJPE theo sai số VỊ TRÍ máy hiệu chỉnh (dời tâm máy B, cm)."""
    true_cams = _make_cams()
    rows = []
    for cm in (0.0, 0.5, 1.0, 2.0, 5.0):
        cams_pair = []
        for tr in range(TRIALS):
            rng = np.random.default_rng(4000 + tr)
            b = perturb_calib(true_cams[1], trans_m=cm / 100.0, rng=rng)
            cams_pair.append((true_cams[0], b))
        rows.append((cm, _run_calib(cams_pair, gt, TRIALS, seed0=4100)))
    return rows


def _fmt_sync(rows):
    vmax = max(r[2] for r in rows)
    out = ["| Lệch sync (ms) | (khung @240fps) | MPJPE (mm) | |", "|---:|---:|---:|:--|"]
    for ms, df, e in rows:
        out.append(f"| {ms:.1f} | {df} | {e:.1f} | `{_bar(e, vmax)}` |")
    return "\n".join(out)


def _fmt_rot(rows):
    vmax = max(r[1] for r in rows)
    out = ["| Sai số hướng ngắm (°) | MPJPE (mm) | |", "|---:|---:|:--|"]
    for d, e in rows:
        out.append(f"| {d:.2f} | {e:.1f} | `{_bar(e, vmax)}` |")
    return "\n".join(out)


def _fmt_trans(rows):
    vmax = max(r[1] for r in rows)
    out = ["| Sai số vị trí máy (cm) | MPJPE (mm) | |", "|---:|---:|:--|"]
    for c, e in rows:
        out.append(f"| {c:.1f} | {e:.1f} | `{_bar(e, vmax)}` |")
    return "\n".join(out)


def main():
    dense = synthetic_dance(fps=DENSE_FPS, seconds=SECONDS, seed=0).joints3d
    gt = synthetic_dance(fps=OUT_FPS, seconds=SECONDS, seed=0).joints3d
    print(f"Độ nhạy sync & calib — cặp máy {PAIR_AZ[0]:.0f}/{PAIR_AZ[1]:.0f}°, "
          f"nhiễu {DEFAULT_NOISE_PX:.0f}px, {TRIALS} lần lặp.\n")

    s = exp_sync(dense)
    r = exp_calib_rot(gt)
    tr = exp_calib_trans(gt)

    base = s[0][2]
    one_frame_30 = s[-1][2]
    half_frame = next((e for ms, df, e in s if abs(ms - 16.67) < 3), s[-1][2])

    doc = f"""# Độ nhạy tam giác hoá 2-view với sai số đồng bộ & hiệu chỉnh

*Sinh tự động bởi `experiments/do_nhay_sync_calib.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Quay bằng 2 điện thoại tiêu dùng có hai nguồn sai số mà camera đơn không gặp:
1. **Không genlock** → hai máy lệch thời gian (thường < 1 khung hình).
2. **Hiệu chỉnh không hoàn hảo** → sai hướng ngắm / vị trí máy khi dựng ma trận chiếu.

Bảng dưới định lượng "được phép sai tới đâu" để đặt ngưỡng cho khâu đồng bộ (vỗ tay
+ 60fps) và hiệu chỉnh (ChArUco) ở §5.2/§5.3. Cấu hình: cặp máy lệch 90°
({PAIR_AZ[0]:.0f}/{PAIR_AZ[1]:.0f}°) — cấu hình khuyến nghị; MPJPE toàn cục (root=None).

## A. Sai số ĐỒNG BỘ (máy B trễ so với máy A)
{_fmt_sync(s)}

**Đọc kết quả:** đồng bộ hoàn hảo cho MPJPE nền **{base:.1f}mm**. Lệch **nửa khung
@30fps** (~16.7ms) đã đẩy MPJPE lên **{half_frame:.1f}mm**, lệch **trọn 1 khung**
(~33ms) lên **{one_frame_30:.1f}mm**. Lưu ý: múa thật (nhất là footwork/vung tay
nhanh) di chuyển nhanh hơn đoạn tổng hợp này, nên cùng một độ lệch thời gian sẽ gây
sai số LỚN HƠN — bảng này là **cận dưới**. Kết luận: đồng bộ phải đạt **dưới ~nửa khung**.
Hệ quả trực tiếp: (1) quay **60fps** thay vì 30fps — mỗi khung chỉ 16.7ms nên cùng
một sai lệch tuyệt đối tính theo khung sẽ nhỏ hơn một nửa; (2) căn mốc **vỗ tay**
đầu clip để triệt tiêu độ trễ khởi động giữa hai máy về mức dưới-khung.

## B. Sai số HƯỚNG NGẮM hiệu chỉnh (xoay máy B)
{_fmt_rot(r)}

**Đọc kết quả:** MPJPE **rất nhạy** với sai hướng — chỉ **1°** lệch hướng ngắm đã
làm sai số tăng mạnh (đòn bẩy góc ở khoảng cách {DISTANCE:.0f}m: 1° ≈ {np.tan(np.radians(1.0))*DISTANCE*1000:.0f}mm
dịch ở tâm sân khấu). ⇒ Hiệu chỉnh ngoại phải chính xác **dưới ~0.5°**; đây là lý do
dùng bảng **ChArUco** (nhiều điểm góc, ước lượng tư thế ổn định) thay vì căn tay.

## C. Sai số VỊ TRÍ máy hiệu chỉnh (dời tâm máy B)
{_fmt_trans(rows=tr)}

**Đọc kết quả:** sai vị trí máy dịch gần như **1:1** vào sai số 3D (dời máy 1cm →
MPJPE tăng ~1cm). May là vị trí máy dễ đo chính xác hơn hướng (ChArUco + đo tay đạt
mm–cm), nên đây là nguồn lỗi phụ so với hướng ngắm.

## Kết luận cho luận văn (ngưỡng thiết kế Cổng 0)
1. **Đồng bộ < nửa khung** (⇒ quay 60fps + vỗ tay). Sai 1 khung @30fps ~{one_frame_30:.0f}mm là không chấp nhận được.
2. **Hiệu chỉnh hướng < ~0.5°** (⇒ ChArUco bắt buộc; sai 1° đã hỏng).
3. **Vị trí máy < ~1–2cm** (lỗi tuyến tính, dễ kiểm soát hơn).
4. Ba ngưỡng này là **tiêu chí nghiệm thu khâu M1/M2** trước khi tin số MPJPE ở Cổng 0 —
   một đóng góp phương pháp mà giải pháp 1-camera không phải đối mặt.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-do-nhay-sync-calib.md"
    out_path.write_text(doc, encoding="utf-8")

    print(_fmt_sync(s), "\n")
    print(_fmt_rot(r), "\n")
    print(_fmt_trans(tr), "\n")
    print(f"→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
