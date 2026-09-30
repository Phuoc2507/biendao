"""LOCO (leave-one-camera-out): khử tính tuỳ tiện của việc "chọn máy nào để giữ lại".

Vòng 13 cho thấy sai số tái chiếu camera **held-out** bám sát MPJPE thật → dùng làm thước đo
đánh giá GT-free ở Cổng 0. Nhưng nó có một điểm yếu đo được: **kết quả phụ thuộc CHỌN máy nào**
để giữ lại. Giữ nhầm một máy đặt lệch/nhiễu cao thì con số méo. Vòng 14 dùng **cross-validation
leave-one-camera-out**: lần lượt giữ lại TỪNG máy, trung bình lại (`reprojection_error_loco`).

Thực nghiệm kiểm ba điều, trung thực với số liệu:
  A. LOCO-mean có bám sát MPJPE thật không?
  B. Held-out ĐƠN phụ thuộc chọn máy tới mức nào (dải tương quan r theo từng máy giữ lại)?
     LOCO có ổn định hơn (độ phân tán ước lượng nhỏ hơn) không?
  C. Độ lệch giữa các fold (LOCO-std) có làm **tín hiệu chẩn đoán** (không cần GT) phát hiện
     một máy bị hỏng/lệch không?

Chạy:  .venv/Scripts/python experiments/danh_gia_loco.py
Ghi ra experiments/ket-qua-danh-gia-loco.md
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
from choreo.eval.metrics import (  # noqa: E402
    mpjpe, reprojection_error, reprojection_error_loco,
)
from choreo.geom import look_at_camera, project_points          # noqa: E402
from choreo.geom.triangulate import triangulate_robust          # noqa: E402
from choreo.synth import synthetic_dance                                    # noqa: E402

TRIALS = 30
SECONDS = 1.5
UNIFORM_NOISE = (2.0, 4.0, 7.0, 11.0)   # nhiễu đồng đều mọi máy (tạo dải chất lượng)
BAD_CAM = 0                              # máy bị "hỏng" trong kịch bản C
BAD_NOISE = 22.0                         # nhiễu máy hỏng
GOOD_NOISE = 3.0                         # nhiễu các máy còn lại
ANGLES = (-60.0, -20.0, 20.0, 60.0)     # 4 máy


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


def _fill_nan_time(X):
    """Lấp NaN theo thời gian cho từng khớp (nội suy tuyến tính) — như fuse lấp khoảng trống."""
    T = X.shape[0]
    Xf = X.copy()
    t = np.arange(T)
    for j in range(X.shape[1]):
        for c in range(3):
            col = Xf[:, j, c]
            m = np.isfinite(col)
            if m.all():
                continue
            if m.sum() >= 2:
                col[~m] = np.interp(t[~m], t[m], col[m])
            elif m.sum() == 1:
                col[~m] = col[m][0]
            else:
                col[~m] = 0.0
            Xf[:, j, c] = col
    return Xf


def _recon(kp_sub, P_sub):
    """Pipeline dựng 3D cho một tập máy: robust DLT từng khung + lấp NaN thời gian."""
    T, J = kp_sub.shape[1], kp_sub.shape[2]
    out = np.empty((T, J, 3))
    for f in range(T):
        out[f] = triangulate_robust(P_sub, kp_sub[:, f])
    return _fill_nan_time(out)


def _make_obs(rng, clean, per_cam_noise):
    kp = clean.copy()
    for v, s in enumerate(per_cam_noise):
        kp[v] += rng.normal(0.0, 1.0, size=clean[v].shape) * s
    return kp


def _trial(cams, gt, P, per_cam_noise, seed):
    """Trả (mpjpe_full, heldout_per_cam[list], loco_mean, loco_std)."""
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = _make_obs(rng, clean, per_cam_noise)
    V = len(cams)

    # "Sản phẩm": dựng từ TẤT CẢ máy -> MPJPE thật (đại lượng cần dự đoán GT-free).
    full = _recon(kp, P)
    m_true = mpjpe(full, gt, root=None)

    # Held-out ĐƠN cho từng lựa chọn máy giữ lại k.
    held = []
    for k in range(V):
        keep = [i for i in range(V) if i != k]
        j3d = _recon(kp[keep], P[keep])
        held.append(reprojection_error(j3d, kp[k], P[k]))

    loco_mean, loco_std = reprojection_error_loco(kp, P, _recon)
    return m_true, held, loco_mean, loco_std


def _run_uniform(cams, gt, P):
    pool = {"mpjpe": [], "loco": [], "held": [[] for _ in cams]}
    seed = 7000
    for noise in UNIFORM_NOISE:
        for _ in range(TRIALS):
            m, held, lm, _ = _trial(cams, gt, P, [noise] * len(cams), seed); seed += 1
            pool["mpjpe"].append(m); pool["loco"].append(lm)
            for k in range(len(cams)):
                pool["held"][k].append(held[k])
    return pool


def _cv(values):
    v = np.asarray(values, float)
    return float(v.std() / v.mean()) if v.mean() > 0 else 0.0


def _run_bad(cams, gt, P):
    """Kịch bản C: máy BAD_CAM nhiễu cao; xem LOCO-std có báo động + held-out lệch theo chọn máy."""
    V = len(cams)
    good = [GOOD_NOISE] * V
    bad = list(good); bad[BAD_CAM] = BAD_NOISE
    out = {}
    seed = 9000
    for name, noises in (("đồng đều (tốt)", good), (f"máy {BAD_CAM} hỏng", bad)):
        stds, means, mp = [], [], []
        held_k = [[] for _ in range(V)]
        for _ in range(TRIALS):
            m, held, lm, ls = _trial(cams, gt, P, noises, seed); seed += 1
            stds.append(ls); means.append(lm); mp.append(m)
            for k in range(V):
                held_k[k].append(held[k])
        out[name] = (float(np.mean(mp)), float(np.mean(means)), float(np.mean(stds)),
                     [float(np.mean(held_k[k])) for k in range(V)])
    return out


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]
    P = np.stack([c.P for c in cams], axis=0)

    print(f"LOCO — {len(ANGLES)} máy {ANGLES}; {len(UNIFORM_NOISE)} mức nhiễu × {TRIALS} lần lặp.\n")

    pool = _run_uniform(cams, gt, P)
    r_loco = _pearson(pool["mpjpe"], pool["loco"])
    r_held = [_pearson(pool["mpjpe"], pool["held"][k]) for k in range(len(cams))]
    r_min, r_max = min(r_held), max(r_held)

    # Ổn định: CV của ước lượng trong CÙNG một điều kiện nhiễu (2px, 30 lần đầu).
    n0 = TRIALS
    cv_loco = _cv(pool["loco"][:n0])
    cv_held = [_cv(pool["held"][k][:n0]) for k in range(len(cams))]

    bad = _run_bad(cams, gt, P)
    (_mp_g, _lm_g, std_g, _hk_g) = bad["đồng đều (tốt)"]
    bad_key = f"máy {BAD_CAM} hỏng"
    (_mp_b, _lm_b, std_b, hk_b) = bad[bad_key]
    hk_b_range = max(hk_b) - min(hk_b)

    held_tbl = "\n".join(
        f"| giữ lại máy {ANGLES[k]:+.0f}° | {r_held[k]:.3f} | {cv_held[k]:.3f} |"
        for k in range(len(cams))
    )
    hk_b_tbl = "\n".join(
        f"| giữ lại máy {ANGLES[k]:+.0f}°{' *(máy hỏng)*' if k == BAD_CAM else ''} | {hk_b[k]:.2f} |"
        for k in range(len(cams))
    )

    doc = f"""# LOCO: khử tính tuỳ tiện của việc chọn camera giữ lại

*Sinh tự động bởi `experiments/danh_gia_loco.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Vòng 13 chốt: sai số tái chiếu camera **held-out** là thước đo đánh giá **GT-free** đáng tin
(bám sát MPJPE thật). Nhưng nó phụ thuộc **chọn máy nào để giữ lại** — giữ nhầm một máy lệch/nhiễu
cao thì con số méo, và trên dữ liệu thật ta không biết máy nào "tốt" để chọn. **Leave-one-camera-out**
(`reprojection_error_loco`) lần lượt giữ lại TỪNG máy rồi trung bình, vừa cho điểm ổn định vừa cho
một **tín hiệu bất định** (độ lệch giữa các fold) — tất cả không cần 3D GT.

## Thiết lập
- Múa tổng hợp {gt.shape[0]} khung, **{len(ANGLES)} máy** ({'/'.join(f'{a:+.0f}°' for a in ANGLES)}), cách {DISTANCE:.1f} m.
- Pipeline mỗi fold: robust-DLT từng khung + lấp NaN theo thời gian. "Sản phẩm" (đại lượng cần
  dự đoán) = MPJPE của bản dựng từ **cả {len(ANGLES)} máy**.
- A/B: nhiễu **đồng đều** {{{', '.join(f'{n:.0f}' for n in UNIFORM_NOISE)}}} px × {TRIALS} lần lặp.
- C: một máy "hỏng" nhiễu {BAD_NOISE:.0f} px, các máy khác {GOOD_NOISE:.0f} px.

## A. LOCO-mean bám sát MPJPE
- **Pearson r(MPJPE, LOCO-mean) = {r_loco:.3f}** trên {len(pool['mpjpe'])} lần dựng — vẫn là proxy
  chặt cho sai số 3D thật, như held-out đơn nhưng không phải chọn máy.

## B. Lợi ích thật của LOCO: GIẢM PHƯƠNG SAI (không phải sửa tương quan)
Phải **trung thực với số liệu**: khi các máy **đồng đều chất lượng**, chọn máy nào để giữ lại
**gần như không** đổi tương quan — r dao động chỉ trong dải **{r_max - r_min:.3f}** ({r_min:.3f}–{r_max:.3f}).
Nghĩa là held-out đơn của Vòng 13 **không hề mong manh** ở chế độ đồng đều; LOCO **không** "sửa"
một tương quan gãy. Lợi ích đo được của LOCO là **độ ổn định của ước lượng**:

| Lựa chọn giữ lại | Pearson r với MPJPE | CV ước lượng (ở nhiễu {UNIFORM_NOISE[0]:.0f}px) |
|:--|---:|---:|
{held_tbl}
| **LOCO (trung bình mọi fold)** | **{r_loco:.3f}** | **{cv_loco:.3f}** |

- Hệ số biến thiên (CV) của LOCO = **{cv_loco:.3f}**, {'nhỏ hơn' if cv_loco < min(cv_held) else 'so với'}
  **mọi** held-out đơn (nhỏ nhất {min(cv_held):.3f}, lớn nhất {max(cv_held):.3f}): trung bình hoá
  {len(cams)} fold **giảm phương sai** của thước đo (~{(1 - cv_loco / (sum(cv_held) / len(cv_held))) * 100:.0f}%
  so với held-out trung bình) → **xếp hạng hai phương pháp gần nhau** đáng tin hơn, ít phụ thuộc may rủi.

## C. Choice-dependence lộ ra khi máy KHÔNG đồng đều — và LOCO-std báo động
Tính "phụ thuộc chọn máy" chỉ thật sự nguy hiểm khi một máy **kém hơn hẳn** — đúng lúc trên hiện
trường ta **không biết máy nào đáng tin**. Cho một máy nhiễu {BAD_NOISE:.0f}px (các máy khác {GOOD_NOISE:.0f}px),
giá trị held-out ĐƠN lệch hẳn theo chọn máy:

| Lựa chọn giữ lại | Held-out đơn (px) |
|:--|---:|
{hk_b_tbl}

- Dải giá trị held-out đơn nở tới **{hk_b_range:.1f} px** tuỳ chọn máy — giữ lại đúng máy hỏng thì
  đọc ra một con số, giữ máy tốt lại ra con số khác hẳn, mà **không có cách GT-free để biết nên tin
  cái nào**. LOCO trung bình cả {len(cams)} fold → một điểm duy nhất, không phải đánh cược.
- **LOCO-std làm cảnh báo GT-free**:

| Kịch bản | MPJPE thật (mm) | LOCO-mean (px) | **LOCO-std (px)** |
|:--|---:|---:|---:|
| đồng đều (mọi máy tốt) | {_mp_g:.2f} | {_lm_g:.2f} | {std_g:.2f} |
| {bad_key} (nhiễu {BAD_NOISE:.0f}px) | {_mp_b:.2f} | {_lm_b:.2f} | **{std_b:.2f}** |

- Khi một máy hỏng, **độ lệch giữa các fold tăng vọt** ({std_g:.2f} → {std_b:.2f} px,
  ×{std_b / max(std_g, 1e-9):.1f}): các fold "bất đồng" vì fold giữ lại máy hỏng cho lỗi lớn còn
  fold dựng-có-máy-hỏng cho 3D lệch. ⇒ LOCO-std cảnh báo bố trí máy có vấn đề **trước cả khi có
  ground-truth**, dùng được ngay tại chỗ quay.

## Hệ quả cho luận văn
1. `reprojection_error_loco` là **dạng cross-validation đúng đắn** của thước đo Vòng 13: bỏ lựa
   chọn tuỳ tiện "giữ máy nào", **giảm phương sai** ước lượng (~{(1 - cv_loco / (sum(cv_held) / len(cv_held))) * 100:.0f}%),
   và thêm chiều **bất định** — công cụ chấm điểm chuẩn cho Cổng 0. Trung thực: ở chế độ máy đồng
   đều, held-out đơn đã đủ tốt về tương quan; LOCO thắng ở độ ổn định và ở chẩn đoán.
2. LOCO-std cho một **quy trình QA hiện trường**: quay xong chạy LOCO; std cao bất thường → có máy
   lệch/đồng bộ sai/che khuất → quay lại, **không cần** hệ mocap tham chiếu.
3. Củng cố lần nữa lý do **≥3 máy** (LOCO cần còn ≥2 máy dựng mỗi fold); với đúng 2 máy không có
   cross-validation, chỉ còn một phép giữ-lại-đơn kém ổn định và không có tín hiệu bất định.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-danh-gia-loco.md"
    out_path.write_text(doc, encoding="utf-8")

    print(f"A) r(MPJPE, LOCO)={r_loco:.3f}")
    print(f"B) r held-out theo máy: {[round(x,3) for x in r_held]} (dải {r_max - r_min:.3f})")
    print(f"   CV: LOCO={cv_loco:.3f} vs held-out {[round(x,3) for x in cv_held]}")
    print(f"C) LOCO-std: đồng đều={std_g:.2f}px  máy hỏng={std_b:.2f}px  (×{std_b/max(std_g,1e-9):.1f})")
    print(f"→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
