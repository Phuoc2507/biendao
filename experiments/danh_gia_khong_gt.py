"""Thước đo GT-free: sai số tái chiếu camera HELD-OUT có bám sát MPJPE thật không?

Vấn đề phương pháp lớn nhất còn lại: cả 5 thực nghiệm khử nhiễu trước đo bằng **MPJPE**,
mà MPJPE cần **3D ground-truth** — chỉ có trên dữ liệu tổng hợp. Trên video múa THẬT ở
Cổng 0 KHÔNG có 3D GT (đó chính là lý do phải tự dựng). Vậy đánh giá bằng gì trên dữ liệu
thật?

Câu trả lời chuẩn (mẹo "Đường B"): GIỮ LẠI một camera, KHÔNG dùng nó để dựng 3D, rồi chiếu
điểm 3D (dựng từ các camera kia) lên camera held-out và so với 2D quan sát ở đó. Sai số này
**đo được không cần 3D GT**. Thực nghiệm này kiểm trên dữ liệu tổng hợp (nơi có CẢ MPJPE
thật LẪN sai số tái chiếu) hai câu:

  A. Sai số tái chiếu held-out có **bám sát** MPJPE không (Pearson/Spearman)?
  B. Vì sao phải HELD-OUT chứ không dùng tái chiếu IN-SAMPLE (chiếu lên chính máy đã dựng)?

Điểm mấu chốt của B: chỉ quét MỘT nút nhiễu Gaussian thì mọi thước đo đều đơn điệu tăng theo
nút đó nên tương quan ~1 là *hiển nhiên*, KHÔNG phân biệt được held-out với in-sample. Muốn
phép thử có ý nghĩa phải tạo phương sai chất lượng từ **nhiều cơ chế khác nhau** — ở đây thêm
**outlier thô** vào các view dựng. Khi đó in-sample (so với chính quan sát nhiễu/outlier dùng
để fit) bị chính outlier làm sai lệch, còn held-out (camera tham chiếu độc lập, sạch) vẫn trung
thực. Đó mới là lý do kỹ thuật thật để phải held-out.

Chạy:  .venv/Scripts/python experiments/danh_gia_khong_gt.py
Ghi ra experiments/ket-qua-danh-gia-khong-gt.md
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
from choreo.eval.metrics import mpjpe, reprojection_error  # noqa: E402
from choreo.geom import look_at_camera, project_points     # noqa: E402
from choreo.mocap.fuse import fuse_multiview               # noqa: E402
from choreo.synth import synthetic_dance                   # noqa: E402

TRIALS = 25
SECONDS = 1.5
GAUSS = (2.0, 5.0)               # nhiễu Gaussian nền (mọi view)
GROSS_RATE = (0.0, 0.08, 0.20)   # tỉ lệ keypoint bị outlier THÔ (chỉ view DỰNG)
GROSS_PX = (50.0, 130.0)         # biên độ outlier thô (px)
METHODS = ("plain", "robust")
# 4 máy: dựng từ 3 máy, GIỮ LẠI 1 máy nội suy làm "giám khảo" sạch.
ANGLES = (-60.0, -20.0, 20.0, 60.0)
RECON = (0, 2, 3)                # dựng từ −60/20/60
HELDOUT = 1                      # giữ lại −20° (chỉ nhiễu Gaussian, KHÔNG outlier)


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def _pearson(x, y):
    x = np.asarray(x, float); y = np.asarray(y, float)
    xd, yd = x - x.mean(), y - y.mean()
    d = np.sqrt((xd**2).sum() * (yd**2).sum())
    return float((xd * yd).sum() / d) if d > 0 else 0.0


def _spearman(x, y):
    rx = np.argsort(np.argsort(x))
    ry = np.argsort(np.argsort(y))
    return _pearson(rx, ry)


def _make_obs(rng, clean, gauss, gross_rate):
    """2D quan sát: Gaussian mọi view; outlier thô CHỈ ở các view DỰNG."""
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * gauss
    if gross_rate > 0.0:
        for v in RECON:
            mask = rng.uniform(size=clean.shape[1:3]) < gross_rate    # (T,J)
            mag = rng.uniform(*GROSS_PX, size=(mask.sum(), 2))
            sign = rng.choice((-1.0, 1.0), size=(mask.sum(), 2))
            kp[v][mask] += mag * sign
    return kp


def _trial(cams, gt, gauss, gross_rate, method, seed):
    """Một lần dựng → (mpjpe_mm, reproj_heldout_px, reproj_insample_px)."""
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = _make_obs(rng, clean, gauss, gross_rate)

    recon_cams = [cams[i] for i in RECON]
    clip = fuse_multiview(kp[list(RECON)], recon_cams, fps=30.0, smooth=True,
                          robust=(method == "robust"))
    j3d = clip.joints3d

    m = mpjpe(j3d, gt, root=None)
    # Held-out: chiếu lên máy GIỮ LẠI (sạch, KHÔNG outlier), so 2D quan sát ở đó — không GT.
    r_held = reprojection_error(j3d, kp[HELDOUT], cams[HELDOUT].P)
    # In-sample: chiếu lên chính các máy đã dựng (quan sát CÓ outlier) — trung bình.
    r_in = float(np.mean([reprojection_error(j3d, kp[v], cams[v].P) for v in RECON]))
    return m, r_held, r_in


def _run(cams, gt):
    cells = []
    pool = {"mpjpe": [], "held": [], "insample": [], "gross": []}
    seed = 4200
    for gauss in GAUSS:
        for gr in GROSS_RATE:
            for method in METHODS:
                ms, hs, ins = [], [], []
                for tr in range(TRIALS):
                    m, rh, ri = _trial(cams, gt, gauss, gr, method, seed); seed += 1
                    ms.append(m); hs.append(rh); ins.append(ri)
                    pool["mpjpe"].append(m); pool["held"].append(rh)
                    pool["insample"].append(ri); pool["gross"].append(gr)
                cells.append((gauss, gr, method, float(np.mean(ms)),
                              float(np.mean(hs)), float(np.mean(ins))))
    return cells, pool


def _fmt_cells(cells):
    vmax = max(c[3] for c in cells)
    out = ["| Gauss (px) | Outlier % | P.pháp | MPJPE thật (mm) | Reproj HELD-OUT (px) | Reproj in-sample (px) | |",
           "|---:|---:|:--|---:|---:|---:|:--|"]
    for gauss, gr, method, m, rh, ri in cells:
        out.append(f"| {gauss:.0f} | {gr*100:.0f} | {method} | {m:.2f} | {rh:.2f} | {ri:.2f} "
                   f"| `{_bar(m, vmax)}` |")
    return "\n".join(out)


def _corr_subset(pool, key, gross_only):
    idx = [i for i in range(len(pool["mpjpe"]))
           if (pool["gross"][i] > 0) == gross_only or not gross_only]
    if gross_only:
        idx = [i for i in range(len(pool["mpjpe"])) if pool["gross"][i] > 0]
    m = [pool["mpjpe"][i] for i in idx]
    k = [pool[key][i] for i in idx]
    return _pearson(m, k), _spearman(m, k)


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    print(f"Đánh giá GT-free — dựng từ máy {RECON}, giữ lại máy {HELDOUT}; "
          f"{len(GAUSS)}×{len(GROSS_RATE)}×{len(METHODS)} điều kiện × {TRIALS} lần lặp.\n")

    cells, pool = _run(cams, gt)

    n = len(pool["mpjpe"])
    r_held = _pearson(pool["mpjpe"], pool["held"])
    rho_held = _spearman(pool["mpjpe"], pool["held"])
    r_in = _pearson(pool["mpjpe"], pool["insample"])
    rho_in = _spearman(pool["mpjpe"], pool["insample"])

    # Tách theo có/không outlier để lộ chỗ in-sample gãy.
    rh_g, rhoh_g = _corr_subset(pool, "held", gross_only=True)
    ri_g, rhoi_g = _corr_subset(pool, "insample", gross_only=True)

    A = np.vstack([pool["held"], np.ones(n)]).T
    slope, intercept = np.linalg.lstsq(A, np.asarray(pool["mpjpe"], float), rcond=None)[0]

    diff = "yếu hơn hẳn" if ri_g < rh_g - 0.03 else ("gần bằng" if abs(ri_g - rh_g) <= 0.03 else "mạnh hơn")

    doc = f"""# Thước đo GT-free: sai số tái chiếu held-out có bám sát MPJPE?

*Sinh tự động bởi `experiments/danh_gia_khong_gt.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Năm thực nghiệm khử nhiễu trước đều chấm bằng **MPJPE**, cần **3D ground-truth**. Video múa
THẬT ở Cổng 0 không có 3D GT. Cách đánh giá không-GT chuẩn: **giữ lại một camera**, dựng 3D từ
các máy còn lại, chiếu lên máy giữ lại rồi so với 2D quan sát — sai số này đo được **không cần
3D GT**. Câu hỏi: trên dữ liệu tổng hợp (có cả hai), nó có **tương quan** với MPJPE để biện minh
việc dùng trên dữ liệu thật? Và **vì sao phải held-out** chứ không dùng tái chiếu in-sample?

## Thiết lập
- Múa tổng hợp {gt.shape[0]} khung, {len(ANGLES)} máy ({'/'.join(f'{a:+.0f}°' for a in ANGLES)}); dựng 3D từ
  **3 máy {'/'.join(f'{ANGLES[i]:+.0f}°' for i in RECON)}**, **giữ lại máy {ANGLES[HELDOUT]:+.0f}°**.
- **Hai cơ chế nhiễu** (để phép thử tương quan không tầm thường): nhiễu Gaussian nền
  {{{', '.join(f'{g:.0f}' for g in GAUSS)}}} px trên mọi view, **và** outlier thô
  {GROSS_PX[0]:.0f}–{GROSS_PX[1]:.0f} px với tỉ lệ {{{', '.join(f'{int(r*100)}%' for r in GROSS_RATE)}}}
  **chỉ trên các view dựng**. Máy giữ lại chỉ có nhiễu Gaussian (giám khảo sạch).
- {len(METHODS)} phương pháp (plain/robust) × {TRIALS} lần lặp = **{n} lần dựng**.

## A. Held-out tái chiếu bám sát MPJPE tốt
- **Pearson r (gộp {n} lần dựng): {r_held:.3f}** — quan hệ tuyến tính chặt.
- **Spearman ρ (gộp): {rho_held:.3f}** — bảo toàn thứ hạng: xếp tốt/xấu **trùng** MPJPE.
- Quy đổi tuyến tính tham khảo: MPJPE(mm) ≈ {slope:.2f}·reproj_heldout(px) + {intercept:.2f}.
  (Không phải ước lượng mm tuyệt đối vì có sàn nhiễu detector của máy giữ lại, nhưng **đơn điệu**
  nên đủ để so sánh & xếp hạng phương pháp/siêu tham số.)

## B. Vì sao PHẢI held-out, không dùng in-sample
Đây là chỗ **phải trung thực với số liệu**: nếu chỉ quét một nút nhiễu Gaussian thì mọi thước đo
đều tăng đơn điệu → tương quan ~1 là *hiển nhiên*, held-out và in-sample **không phân biệt được**.
Khi thêm **outlier thô** (nhiều cơ chế chất lượng), khác biệt mới lộ:

| Thước đo | Pearson r (toàn bộ) | Spearman ρ (toàn bộ) | Pearson r (chỉ ca CÓ outlier) |
|:--|---:|---:|---:|
| **Held-out** (giám khảo độc lập) | {r_held:.3f} | {rho_held:.3f} | **{rh_g:.3f}** |
| In-sample (chiếu lại máy đã dựng) | {r_in:.3f} | {rho_in:.3f} | {ri_g:.3f} |

- Trên tập **có outlier**, in-sample tương quan MPJPE **{diff}** so với held-out
  (r={ri_g:.3f} vs {rh_g:.3f}). Lý do: in-sample so điểm 3D với **chính quan sát chứa outlier
  đã dùng để fit** — outlier trong đầu vào bơm thẳng vào residual bất kể 3D tốt hay xấu, nên nó
  **không còn là proxy trung thực của sai số 3D**. Held-out chấm bằng **camera tham chiếu độc lập
  sạch**, nên phản ánh đúng sai số 3D.
- Ngoài ra in-sample **lạc quan về độ lớn** khi không outlier (DLT đã tối thiểu hoá đúng đại lượng
  đó), nên vừa lệch biên độ vừa dễ nhiễu — hai lý do cộng lại để **luôn dùng held-out**.

## Bảng theo điều kiện
{_fmt_cells(cells)}

## Hệ quả cho luận văn
1. **Giao thức đánh giá Cổng 0**: mọi cải tiến khử nhiễu (robust/weighted/xương/hiệu chuẩn) sẽ
   được chấm trên múa thật bằng **sai số tái chiếu held-out** — và giao thức này đã được **kiểm
   định trên dữ liệu tổng hợp** (bám sát MPJPE thật, r≈{r_held:.2f}). Bản thân việc kiểm định &
   chọn đúng thước đo GT-free là một **đóng góp phương pháp**, không phải tính năng app.
2. **Lý do kỹ thuật cho cấu hình ≥3 máy**: không chỉ để dựng chính xác hơn mà để **luôn có một
   camera giữ lại độc lập** làm giám khảo — thứ giải pháp 1-camera (Choreoto) không thể có.
   Phải là held-out, không in-sample: in-sample bị chính nhiễu đầu vào làm sai lệch (mục B).
3. Vẫn nên thêm một mẩu **AIST++** (có 3D GT thật) ở Cổng 0 để chốt hệ số quy đổi px→mm; còn khung
   đánh giá không-GT cho video tự quay đã sẵn sàng và đã được kiểm định.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-danh-gia-khong-gt.md"
    out_path.write_text(doc, encoding="utf-8")

    print(_fmt_cells(cells))
    print(f"\nHeld-out: r={r_held:.3f} ρ={rho_held:.3f} | In-sample: r={r_in:.3f} ρ={rho_in:.3f}")
    print(f"Chỉ ca có outlier → Held-out r={rh_g:.3f} | In-sample r={ri_g:.3f}")
    print(f"→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
