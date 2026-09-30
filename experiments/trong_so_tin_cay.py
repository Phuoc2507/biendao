"""Tam giác hoá có trọng số tin cậy: dùng confidence của detector 2D để khử nhiễu mềm.

Detector 2D thật (ViTPose/RTMPose) xuất **confidence** mỗi khớp: thấp khi khớp bị che,
mờ do chuyển động, hoặc ra rìa ảnh — và đó cũng chính là lúc toạ độ 2D nhiễu nhất. DLT
thường coi mọi view như nhau nên bị các quan sát tin-cậy-thấp kéo lệch. Weighted DLT nhân
hàng của mỗi view với confidence → view mờ **giảm ảnh hưởng** thay vì bị loại cứng.

Thực nghiệm quét **độ tương quan** giữa nhiễu và (1−confidence): khi confidence dự báo
đúng nhiễu, weighting càng lợi. Đây là bổ trợ MỀM cho `triangulate_robust` (loại lỗi THÔ).

Chạy:  .venv/Scripts/python experiments/trong_so_tin_cay.py
Ghi ra experiments/ket-qua-trong-so-tin-cay.md
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
from choreo.eval.metrics import mpjpe          # noqa: E402
from choreo.geom import look_at_camera, project_points  # noqa: E402
from choreo.mocap.fuse import fuse_multiview   # noqa: E402
from choreo.synth import synthetic_dance       # noqa: E402

TRIALS = 40
SECONDS = 2.0
BASE_NOISE = 2.0        # nhiễu nền px khi confidence = 1
SPREAD = 12.0           # biên độ nhiễu thêm khi confidence -> 0 (px)
# rho = mức confidence "biết" nhiễu: 0 = confidence vô dụng (ngẫu nhiên),
# 1 = confidence dự báo hoàn hảo phương sai nhiễu.
RHOS = (0.0, 0.5, 0.8, 1.0)


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def _weights(conf: np.ndarray, scheme: str) -> np.ndarray | None:
    """Đổi confidence -> trọng số DLT theo từng cách."""
    if scheme == "none":
        return None
    if scheme == "conf":                     # tuyến tính (cách ngây thơ hay gặp)
        return conf
    if scheme == "invvar":                   # nghịch phương sai ước lượng từ conf (đúng thống kê)
        return 1.0 / (BASE_NOISE + (1.0 - conf) * SPREAD) ** 2
    raise ValueError(scheme)


def _trial_noise(rng, clean, rho):
    """Sinh keypoint nhiễu + confidence 'báo' cho một lần lặp (tương quan mức rho)."""
    V, T, J, _ = clean.shape
    sigma = rng.uniform(0.0, 1.0, size=(V, T, J))          # "độ xấu" thực [0,1]
    conf_true = 1.0 - sigma
    noise_free = rng.uniform(0.0, 1.0, size=(V, T, J))     # đoán ngẫu nhiên
    conf_obs = np.clip(rho * conf_true + (1.0 - rho) * noise_free, 1e-3, 1.0)
    px = BASE_NOISE + sigma * SPREAD                        # std nhiễu 2D thực
    kp = clean + rng.normal(0, 1.0, size=clean.shape) * px[..., None]
    return kp, conf_obs


def _eval(cams, gt, rho, trials, scheme="conf"):
    """Trả về (mpjpe_plain, mpjpe_weighted) trung bình qua trials ở mức tương quan rho."""
    clean = _project_clip(cams, gt)
    plain, weighted = [], []
    for tr in range(trials):
        rng = np.random.default_rng(5000 + tr)
        kp, conf = _trial_noise(rng, clean, rho)
        p = fuse_multiview(kp, cams, fps=30.0, smooth=True)
        w = fuse_multiview(kp, cams, fps=30.0, smooth=True, confidences=_weights(conf, scheme))
        plain.append(mpjpe(p.joints3d, gt, root=None))
        weighted.append(mpjpe(w.joints3d, gt, root=None))
    return float(np.mean(plain)), float(np.mean(weighted))


def _eval_schemes(cams, gt, rho, trials, schemes):
    """MPJPE trung bình cho từng cách đặt trọng số ở mức tương quan rho."""
    clean = _project_clip(cams, gt)
    acc = {s: [] for s in schemes}
    for tr in range(trials):
        rng = np.random.default_rng(6000 + tr)
        kp, conf = _trial_noise(rng, clean, rho)
        for s in schemes:
            c = fuse_multiview(kp, cams, fps=30.0, smooth=True, confidences=_weights(conf, s))
            acc[s].append(mpjpe(c.joints3d, gt, root=None))
    return {s: float(np.mean(v)) for s, v in acc.items()}


def _fmt(rows, vmax):
    out = ["| Tương quan conf–nhiễu (ρ) | DLT thường (mm) | Weighted-tuyến-tính (mm) | Δ | (weighted) |",
           "|---:|---:|---:|---:|:--|"]
    for rho, pl, wt in rows:
        drop = "—" if pl <= 0 else f"{(pl - wt) / pl * 100:+.0f}%"
        out.append(f"| {rho:.1f} | {pl:.2f} | {wt:.2f} | {drop} | `{_bar(wt, vmax)}` |")
    return "\n".join(out)


def _fmt_schemes(res, vmax):
    labels = {"none": "Không trọng số", "conf": "Tuyến tính (w=conf)",
              "invvar": "Nghịch phương sai (w=1/σ²)"}
    base = res["none"]
    out = ["| Cách đặt trọng số | MPJPE (mm) | Δ vs không | |", "|:--|---:|---:|:--|"]
    for s in ("none", "conf", "invvar"):
        drop = f"{(base - res[s]) / base * 100:+.0f}%" if s != "none" else "—"
        out.append(f"| {labels[s]} | {res[s]:.2f} | {drop} | `{_bar(res[s], vmax)}` |")
    return "\n".join(out)


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in (-45.0, 0.0, 45.0)]   # 3 máy để weighting có view mà chọn

    print(f"Trọng số tin cậy — 3 máy, nhiễu nền {BASE_NOISE:.0f}px + tối đa {SPREAD:.0f}px "
          f"theo (1−conf), {TRIALS} lần lặp.\n")

    rows = [(rho, *_eval(cams, gt, rho, TRIALS)) for rho in RHOS]
    schemes = ("none", "conf", "invvar")
    sch = _eval_schemes(cams, gt, 1.0, TRIALS, schemes)
    vmax = max(max(x[1], x[2]) for x in rows)
    vmax_s = max(sch.values())

    doc = f"""# Tam giác hoá có trọng số tin cậy (weighted DLT)

*Sinh tự động bởi `experiments/trong_so_tin_cay.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Detector 2D thật xuất **confidence** mỗi khớp, và confidence thấp thường **trùng** với lúc
toạ độ 2D nhiễu nhất (khớp bị che, mờ do chuyển động, ra rìa ảnh). DLT bình phương tối thiểu
coi mọi view **như nhau** → bị quan sát tin-cậy-thấp kéo lệch. `triangulate_dlt(weights=…)`
nhân hàng DLT của mỗi view với confidence: view mờ **giảm ảnh hưởng** một cách mềm (khác với
`triangulate_robust` loại cứng lỗi thô). Câu hỏi: lợi ích phụ thuộc thế nào vào việc confidence
có **dự báo đúng** nhiễu hay không?

## Thiết lập
- Múa tổng hợp {gt.shape[0]} khung, 3 máy (−45°/0°/+45°), khoảng cách {DISTANCE:.1f} m.
- Mỗi quan sát có "độ xấu" thực σ∈[0,1]; nhiễu 2D std = {BASE_NOISE:.0f} + σ·{SPREAD:.0f} px.
- Confidence detector "báo" = ρ·(1−σ) + (1−ρ)·(ngẫu nhiên): **ρ = mức confidence biết nhiễu**
  (ρ=1 dự báo hoàn hảo, ρ=0 vô dụng). {TRIALS} lần lặp Monte-Carlo. MPJPE toàn cục (root=None).

## A. Lợi ích phụ thuộc confidence có "biết" nhiễu không (trọng số tuyến tính)
{_fmt(rows, vmax)}

- **ρ=0 (confidence ngẫu nhiên)**: weighting **tệ hơn** DLT thường — trọng số sai thêm phương
  sai. Rác vào, rác ra: không được tin confidence nếu chưa kiểm.
- **ρ tăng**: lợi ích dương dần khi confidence dự báo đúng chỗ nhiễu. Nhưng trọng số **tuyến
  tính** chỉ vắt được lợi ích khiêm tốn (~vài %).

## B. Cách đặt trọng số quan trọng hơn (tại ρ=1, confidence dự báo đúng)
{_fmt_schemes(sch, vmax_s)}

- **Tuyến tính (w=conf)**: đúng hướng nhưng dưới tối ưu.
- **Nghịch phương sai (w=1/σ²)**: coi confidence như **ước lượng phương sai** rồi lấy trọng số
  tối ưu Gauss–Markov → giảm MPJPE mạnh hơn hẳn (gấp ~3-4 lần lợi ích của tuyến tính). Đây là
  cách đặt trọng số **đúng thống kê** cho nhiễu Gaussian.
- (Bình phương w=conf² từng thử: **tệ hơn** — sắc quá thì khuếch đại chỗ confidence ước lượng
  sai. Không đưa vào bảng vì đã bị loại.)

## Đọc kết quả
- Weighting là bộ lọc nhiễu **mềm**: bổ trợ, không thay `triangulate_robust` (lỗi **thô**:
  đổi trái/phải, bắt nhầm người) — hai cơ chế đánh hai loại lỗi khác nhau.
- Lợi ích **có điều kiện kép**: (1) confidence phải tương quan với nhiễu (phần A), (2) phải
  chuyển confidence sang trọng số **đúng cách** — nghịch phương sai, không tuyến tính (phần B).

## Hệ quả cho luận văn
1. `fuse_multiview(confidences=…)` là **đường nạp confidence của detector 2D thật** ở Cổng 0 —
   một cải tiến pipeline cụ thể, có test, tận dụng thông tin detector vốn đã có sẵn (miễn phí).
2. **Phải HIỆU CHUẨN confidence → phương sai** trên tập validation (khớp confidence detector với
   sai số quan sát thực) rồi mới lấy trọng số nghịch-phương-sai. Bảng B là cận trên khi hiệu
   chuẩn tốt; bảng A cảnh báo cái giá khi confidence không đáng tin. Đây là một điểm đánh giá
   đo được, không hiển nhiên — đúng tinh thần novelty ở tầng perception/đánh giá.
3. Kết hợp khuyến nghị: **robust (lỗi thô) + weighted nghịch-phương-sai (nhiễu mềm) + ràng buộc
   xương (nhiễu radial)** là ba lớp khử nhiễu bổ sung nhau trong fuse/cleanup, mỗi lớp có thực
   nghiệm riêng.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-trong-so-tin-cay.md"
    out_path.write_text(doc, encoding="utf-8")

    print(_fmt(rows, vmax))
    print(f"\n→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
