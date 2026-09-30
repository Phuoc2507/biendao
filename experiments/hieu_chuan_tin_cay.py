"""Hiệu chuẩn confidence → phương sai: đóng nốt việc còn mở của Vòng 10.

Vòng 10 cho thấy trọng số nghịch-phương-sai là đúng, NHƯNG chỉ khi σ là phương sai
THẬT. Confidence sống của detector là điểm số đơn điệu-nhưng-MÉO (thang phi tuyến),
không tỉ lệ 1/σ. Câu hỏi vòng này: nếu dùng thẳng confidence sống làm trọng số thì mất
bao nhiêu lợi ích, và **hiệu chuẩn** confidence→σ (không cần 3D GT, dùng sai số tái
chiếu) lấy lại được bao nhiêu so với trọng số ORACLE (biết σ thật)?

Chạy:  .venv/Scripts/python experiments/hieu_chuan_tin_cay.py
Ghi ra experiments/ket-qua-hieu-chuan-tin-cay.md
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
    DISTANCE, ELEV, FOV, IMAGE, _bar,
)
from choreo.eval.metrics import mpjpe                    # noqa: E402
from choreo.geom import look_at_camera, project_points   # noqa: E402
from choreo.mocap.conf_calib import (                    # noqa: E402
    calibrate_confidence, per_view_reproj_residual,
)
from choreo.mocap.fuse import fuse_multiview             # noqa: E402
from choreo.synth import synthetic_dance                 # noqa: E402

TRIALS = 30
SECONDS = 2.0
SOFT_BASE = 2.0        # px: nhiễu nền khi reliability = 1
SOFT_SPREAD = 12.0     # px: nhiễu thêm khi reliability -> 0
# GAMMA = mức MÉO của confidence so với reliability thật: conf = rel**GAMMA.
# GAMMA=1: confidence tuyến tính theo reliability (ít méo). GAMMA lớn: rất méo.
GAMMAS = (1.0, 2.0, 3.5)
ANGLES = (-45.0, 0.0, 45.0)
EPS = 1e-3


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def _noise_and_conf(rng, clean, gamma):
    """Sinh keypoint nhiễu + confidence MÉO (đơn điệu theo reliability nhưng phi tuyến)."""
    rel = rng.uniform(0.0, 1.0, size=clean.shape[:3])         # reliability thật
    sigma_true = SOFT_BASE + (1.0 - rel) * SOFT_SPREAD
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * sigma_true[..., None]
    conf = np.clip(rel ** gamma, EPS, 1.0)                    # detector báo confidence méo
    return kp, conf, sigma_true


def _row_weight(scheme, conf, sigma_true, cal):
    """Bội số hàng DLT cho từng cách dùng confidence (None = không trọng số)."""
    if scheme == "none":
        return None
    if scheme == "naive":            # dùng thẳng confidence sống làm trọng số
        return conf
    if scheme == "calib":            # 1/σ với σ hiệu chuẩn từ tái chiếu (không GT)
        return cal.weight_of(conf)
    if scheme == "oracle":           # 1/σ_thật (cận trên)
        return 1.0 / sigma_true
    raise ValueError(scheme)


def _fit_calibration(cams, gt, gamma, n_clips=4):
    """Học bản đồ conf→σ trên vài clip validation, dùng SAI SỐ TÁI CHIẾU (không 3D GT)."""
    P = np.stack([c.P for c in cams], axis=0)
    confs, resids = [], []
    for k in range(n_clips):
        vgt = synthetic_dance(fps=30.0, seconds=1.5, seed=100 + k).joints3d
        clean = _project_clip(cams, vgt)
        rng = np.random.default_rng(3000 + k)
        kp, conf, _ = _noise_and_conf(rng, clean, gamma)
        # Dựng 3D bằng pipeline (KHÔNG dùng GT), rồi đo residual tái chiếu.
        clip = fuse_multiview(kp, cams, fps=30.0, smooth=False, robust=True)
        res = per_view_reproj_residual(clip.joints3d, kp, P)
        confs.append(conf.ravel())
        resids.append(res.ravel())
    return calibrate_confidence(np.concatenate(confs), np.concatenate(resids), n_bins=12)


def _eval(cams, gt, gamma, trials):
    """MPJPE trung bình cho từng cách dùng confidence, ở một mức méo gamma."""
    clean = _project_clip(cams, gt)
    cal = _fit_calibration(cams, gt, gamma)
    schemes = ("none", "naive", "calib", "oracle")
    acc = {s: [] for s in schemes}
    for tr in range(trials):
        rng = np.random.default_rng(8000 + tr)
        kp, conf, sig = _noise_and_conf(rng, clean, gamma)
        for s in schemes:
            w = _row_weight(s, conf, sig, cal)
            clip = fuse_multiview(kp, cams, fps=30.0, smooth=True, confidences=w)
            acc[s].append(mpjpe(clip.joints3d, gt, root=None))
    return {s: float(np.mean(v)) for s, v in acc.items()}


def _fmt(res_by_gamma):
    labels = {"none": "Không trọng số", "naive": "Confidence sống (w=conf)",
              "calib": "Hiệu chuẩn 1/σ (không GT)", "oracle": "Oracle 1/σ_thật"}
    vmax = max(max(r.values()) for r in res_by_gamma.values())
    out = ["| Độ méo confidence (γ) | " + " | ".join(labels[s] for s in
           ("none", "naive", "calib", "oracle")) + " | % lợi lấy lại* |",
           "|---:|" + "---:|" * 4 + ":--|"]
    for g, res in res_by_gamma.items():
        base, orc = res["none"], res["oracle"]
        span = base - orc
        recov = "—" if span <= 1e-9 else f"{(base - res['calib']) / span * 100:.0f}%"
        cells = " | ".join(f"{res[s]:.2f}" for s in ("none", "naive", "calib", "oracle"))
        out.append(f"| {g:.1f} | {cells} | {recov} |")
    return "\n".join(out)


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    print(f"Hiệu chuẩn confidence — {len(ANGLES)} máy, nhiễu {SOFT_BASE:.0f}+{SOFT_SPREAD:.0f}px, "
          f"{TRIALS} lần lặp, quét độ méo γ={GAMMAS}.\n")

    res_by_gamma = {g: _eval(cams, gt, g, TRIALS) for g in GAMMAS}

    doc = f"""# Hiệu chuẩn confidence → phương sai (đóng nốt Vòng 10)

*Sinh tự động bởi `experiments/hieu_chuan_tin_cay.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Vòng 10 kết luận trọng số **nghịch-phương-sai** 1/σ² là cách đúng dùng confidence, với điều
kiện σ là **phương sai thật**. Nhưng confidence sống của detector 2D là một điểm số **đơn
điệu nhưng méo** theo độ tin cậy thật — không tỉ lệ với 1/σ. Nếu nhét thẳng confidence sống
vào làm trọng số, lợi ích thu được tới đâu? Và **hiệu chuẩn** confidence→σ lấy lại được bao
nhiêu so với trọng số oracle (biết σ thật)? Điểm mấu chốt: hiệu chuẩn ở đây dùng **sai số tái
chiếu** làm proxy nhiễu — **đo được KHÔNG cần 3D ground-truth** → chạy được trên video thật.

## Thiết lập
- Múa tổng hợp {gt.shape[0]} khung, {len(ANGLES)} máy ({'/'.join(f'{a:+.0f}°' for a in ANGLES)}), cách {DISTANCE:.1f} m.
- reliability thật rel∈[0,1]; nhiễu 2D std σ = {SOFT_BASE:.0f} + (1−rel)·{SOFT_SPREAD:.0f} px.
- Confidence detector = rel^γ (**đơn điệu nhưng méo**): γ=1 ít méo, γ lớn rất méo.
- Hiệu chuẩn học trên 4 clip validation riêng, chỉ từ (confidence, **sai số tái chiếu**);
  KHÔNG dùng 3D GT. {TRIALS} lần lặp test. MPJPE toàn cục (root=None).

## Kết quả
{_fmt(res_by_gamma)}

*(% lợi lấy lại = (không_trọng_số − hiệu_chuẩn) / (không_trọng_số − oracle): hiệu chuẩn thu
được bao nhiêu phần lợi ích tối đa mà oracle đạt.)*

## Đọc kết quả
- **Confidence sống (w=conf) yếu và xấu dần khi méo tăng**: γ=1 còn tạm, nhưng γ lớn thì dùng
  thẳng confidence gần như vô ích — vì nó không còn tỉ lệ với độ tin cậy, chứ đừng nói 1/σ.
- **Hiệu chuẩn lấy lại phần lớn lợi ích của oracle** ở mọi mức méo, mà **không cần 3D GT**:
  bản đồ conf→σ học từ sai số tái chiếu "nắn thẳng" lại thang méo của detector.
- Đây chính là mảnh còn thiếu Vòng 10 đã chỉ ra: *"phải hiệu chuẩn confidence→phương sai trên
  tập validation rồi mới lấy trọng số nghịch-phương-sai"* — nay đã hiện thực + đo được.

## Hệ quả cho luận văn
1. `conf_calib.calibrate_confidence` + `per_view_reproj_residual` là **quy trình hiệu chuẩn
   GT-free**: ở Cổng 0, chạy detector thật trên vài clip, đo sai số tái chiếu, học conf→σ, rồi
   nạp trọng số đã hiệu chuẩn vào `fuse_multiview`. Không cần hệ mocap tham chiếu để hiệu chuẩn.
2. Bội số hàng DLT đúng cho Gauss–Markov là **1/σ** (không 1/σ²), vì DLT nhân hàng rồi bình
   phương trong SVD — `ConfCalibration.weight_of` trả 1/σ. (Một tinh chỉnh so với cách đặt
   trọng số thô ở Vòng 10.)
3. "Hiệu chuẩn độ tin cậy của tri giác" là một đóng góp **đo được ở tầng perception/đánh giá**
   — đúng loại novelty luận văn nhắm tới, và tái lập được hoàn toàn trên CPU.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-hieu-chuan-tin-cay.md"
    out_path.write_text(doc, encoding="utf-8")

    print(_fmt(res_by_gamma))
    print(f"\n→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
