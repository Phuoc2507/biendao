"""Bền vững với outlier 2D: DLT thường vs tam giác hoá bền vững (cổng tái chiếu).

Detector 2D thật (ViTPose/RTMPose) thỉnh thoảng cho khớp SAI HẲN (đổi trái/phải,
bắt nhầm người, nhiễu chuyển động). Một quan sát sai làm hỏng cả điểm 3D nếu dùng
DLT bình phương tối thiểu. Thực nghiệm này tiêm outlier thô với tỉ lệ tăng dần rồi
so MPJPE giữa: (a) DLT thường, (b) robust + nội suy — cho cả 2 máy và 3 máy.

Thông điệp: với 3 máy, robust LOẠI được view sai và gần như miễn nhiễm; với 2 máy,
robust biến "gai" thành khớp nội suy (giảm sốc), nhưng đây là lý do THỰC để cân
nhắc máy thứ 3 khi điều kiện quay khó (thiếu sáng, trang phục rộng).

Chạy:  .venv/Scripts/python experiments/robust_outliers.py
Ghi ra experiments/ket-qua-robust-outliers.md
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
from choreo.eval.metrics import mpjpe            # noqa: E402
from choreo.geom import look_at_camera, project_points  # noqa: E402
from choreo.mocap.fuse import fuse_multiview     # noqa: E402
from choreo.synth import synthetic_dance         # noqa: E402

TRIALS = 15
SECONDS = 2.0
RATES = (0.0, 0.02, 0.05, 0.10)   # tỉ lệ quan sát bị lỗi thô
OUTLIER_PX = 100.0                # độ lớn outlier (px) trên ảnh 1080p
REPROJ_THRESH = 20.0


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0)
         for c in cams],
        axis=0,
    )  # (V,T,J,2)


def _eval(cams, gt, rate, trials):
    """Trả về (mpjpe_plain, mpjpe_robust) trung bình qua trials."""
    clean = _project_clip(cams, gt)
    V, T, J, _ = clean.shape
    plain, robust = [], []
    for tr in range(trials):
        rng = np.random.default_rng(9000 + tr)
        kp = clean + rng.normal(0, DEFAULT_NOISE_PX, size=clean.shape)
        if rate > 0:
            mask = rng.random((V, T, J)) < rate
            kp[mask] += rng.normal(0, OUTLIER_PX, size=(int(mask.sum()), 2))
        p = fuse_multiview(kp, cams, fps=30.0, smooth=False, robust=False)
        r = fuse_multiview(kp, cams, fps=30.0, smooth=False, robust=True,
                           reproj_thresh_px=REPROJ_THRESH)
        plain.append(mpjpe(p.joints3d, gt, root=None))
        robust.append(mpjpe(r.joints3d, gt, root=None))
    return float(np.mean(plain)), float(np.mean(robust))


def _run(cams, gt):
    return [(rate, *_eval(cams, gt, rate, TRIALS)) for rate in RATES]


def _fmt(rows, vmax):
    out = ["| Tỉ lệ outlier | DLT thường (mm) | Robust (mm) | Giảm | (robust) |",
           "|---:|---:|---:|---:|:--|"]
    for rate, pl, rb in rows:
        drop = "—" if pl <= 0 else f"{(pl - rb) / pl * 100:.0f}%"
        out.append(f"| {rate*100:.0f}% | {pl:.1f} | {rb:.1f} | {drop} | `{_bar(rb, vmax)}` |")
    return "\n".join(out)


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams2 = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
             for a in (-45.0, 45.0)]
    cams3 = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
             for a in (-45.0, 0.0, 45.0)]

    print(f"Bền vững outlier — outlier {OUTLIER_PX:.0f}px, ngưỡng tái chiếu "
          f"{REPROJ_THRESH:.0f}px, {TRIALS} lần lặp.\n")

    r2 = _run(cams2, gt)
    r3 = _run(cams3, gt)
    vmax = max(max(x[1] for x in r2), max(x[1] for x in r3))

    doc = f"""# Bền vững với outlier 2D: DLT thường vs robust (cổng tái chiếu)

*Sinh tự động bởi `experiments/robust_outliers.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Detector 2D thật thỉnh thoảng cho khớp **sai hẳn** (lỗi thô: đổi trái/phải, bắt nhầm
người, mờ do chuyển động). DLT bình phương tối thiểu bị **một** quan sát sai kéo lệch
cả điểm 3D. `triangulate_robust` dựng thử → tái chiếu → nếu view nào lệch quá ngưỡng
thì (≥3 máy) loại dần view tệ nhất, (2 máy) trả NaN để nội suy thời gian.

## Thiết lập
- Múa tổng hợp {gt.shape[0]} khung; nhiễu nền {DEFAULT_NOISE_PX:.0f}px + outlier {OUTLIER_PX:.0f}px rải ngẫu nhiên.
- Ngưỡng cổng tái chiếu {REPROJ_THRESH:.0f}px; {TRIALS} lần lặp Monte-Carlo. MPJPE toàn cục (root=None).

## A. Hai máy (−45°/+45°)
{_fmt(r2, vmax)}

## B. Ba máy (−45°/0°/+45°)
{_fmt(r3, vmax)}

## Đọc kết quả (bức tranh đúng — có phần trái với trực giác)
- **Không outlier (0%)**: robust ≈ DLT thường → cổng không gây hại khi dữ liệu sạch.
- **Lợi ích LỚN NHẤT là bản thân cổng robust, ở CẢ hai cấu hình**: 2% outlier làm DLT
  thường nhảy ~27mm, robust kéo về ~15mm (giảm ~45%); 10% thì 85mm → 32mm (giảm ~62%).
- **Máy thứ 3 chỉ giúp THÊM một chút** ở đây (2%: 13.6 vs 15.0mm; 10%: 30.1 vs 32.1mm),
  **không** "gần miễn nhiễm" như trực giác leave-one-out gợi ý. Lý do: outlier được tiêm
  **độc lập** trên từng (view, khung, khớp), nên ở tỉ lệ cao, một khớp thường bị **≥2/3
  view sai cùng lúc** → leave-one-out hết đường cứu → khớp về NaN rồi nội suy (giống hệt
  trường hợp 2 máy). Máy thứ 3 chỉ thắng khi **đúng 1** view sai.
- **Khi nào máy thứ 3 mới kháng outlier mạnh?** Khi lỗi thô **tương quan theo view** —
  ví dụ một máy bị ngược sáng / bắt nhầm người trong cả một đoạn (lỗi dồn vào 1 view).
  Lúc đó 2 view còn lại luôn cứu được. Mô hình iid ở đây là **trường hợp bất lợi** cho
  máy thứ 3; thực tế occlusion-driven thường tương quan hơn nên lợi ích sẽ lớn hơn bảng này.

## Hệ quả cho luận văn
1. `fuse_multiview(robust=True)` là **cấu hình mặc định khi chạy detector 2D thật** ở
   Cổng 0 — cải tiến pipeline cụ thể, có test; lợi ích chính đến từ cổng tái chiếu, độc
   lập với số máy.
2. **Định vị lại vai trò máy thứ 3** một cách trung thực: nó kháng outlier rõ rệt chỉ khi
   lỗi tương quan theo view (occlusion, ngược sáng); dưới lỗi iid thì lợi ích khiêm tốn.
   Không thổi phồng — con số ở đây nói vậy.
3. Với **2 máy** (cấu hình chính của đề tài), robust biến "gai" thành khớp nội suy, nhưng
   không hồi phục hoàn hảo ⇒ chất lượng detector 2D + cleanup thời gian là bắt buộc.
4. Ngưỡng tái chiếu ({REPROJ_THRESH:.0f}px) là siêu tham số nghiệm thu, hiệu chỉnh lại
   trên dữ liệu thật ở Cổng 0.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-robust-outliers.md"
    out_path.write_text(doc, encoding="utf-8")

    print("2 máy:\n" + _fmt(r2, vmax), "\n")
    print("3 máy:\n" + _fmt(r3, vmax), "\n")
    print(f"→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
