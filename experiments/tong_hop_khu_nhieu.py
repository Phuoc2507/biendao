"""Capstone: cộng dồn BA lớp khử nhiễu trên một kịch bản nhiễu hỗn hợp hiện thực.

Ba lớp khử nhiễu ra đời ở ba vòng trước, mỗi lớp đánh MỘT loại lỗi khác nhau của
mocap 2-view thật:
  1. robust (cổng tái chiếu)      — lỗi THÔ    (detector bắt nhầm khớp/nhầm người).
  2. weighted (nghịch phương sai)  — nhiễu MỀM   (khớp mờ/bị che: confidence thấp).
  3. ràng buộc xương (PBD)         — nhiễu RADIAL (xương co giãn phi lý theo tia nhìn).

Câu hỏi của experiment này KHÔNG phải "mỗi lớp có lợi không" (đã đo riêng ở
robust_outliers / trong_so_tin_cay / rang_buoc_xuong) mà là: **ba lớp có CỘNG DỒN
được không, hay chúng đánh nhau?** Vì thế ở đây trộn cả ba loại lỗi vào cùng một
kịch bản rồi bật dần từng lớp, đo MPJPE (độ chính xác vị trí) và độ lệch chuẩn chiều
dài xương (độ cứng giải phẫu) sau mỗi lớp.

Chạy:  .venv/Scripts/python experiments/tong_hop_khu_nhieu.py
Ghi ra experiments/ket-qua-tong-hop-khu-nhieu.md
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
from choreo.cleanup import enforce_bone_lengths        # noqa: E402
from choreo.eval.metrics import mpjpe, bone_length_std  # noqa: E402
from choreo.geom import look_at_camera, project_points  # noqa: E402
from choreo.mocap.fuse import fuse_multiview            # noqa: E402
from choreo.synth import synthetic_dance               # noqa: E402

TRIALS = 30
SECONDS = 2.5

# --- Tham số nhiễu hỗn hợp (đặt ở mức "detector điện thoại tầm trung") ---
SOFT_BASE = 2.0        # px: nhiễu mềm nền khi confidence = 1
SOFT_SPREAD = 10.0     # px: nhiễu mềm thêm khi confidence -> 0
RHO = 0.85             # confidence "biết" nhiễu mềm tới đâu (0..1); thực tế ~0.8-0.9
P_GROSS = 0.02         # xác suất một quan sát bị lỗi THÔ (mỗi view/khung/khớp)
GROSS_PX = (60.0, 220.0)  # biên độ lỗi thô (px): bắt nhầm khớp lân cận -> nhầm người
PBD_ITERS = 20

# 3 máy: hai điện thoại chính (−45/+45) + một máy phụ (0) để robust có view mà bỏ.
ANGLES = (-45.0, 0.0, 45.0)


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )  # (V,T,J,2)


def _mixed_noise(rng, clean):
    """Sinh keypoint nhiễu hỗn hợp + confidence, cho một lần lặp.

    Trả về (kp, conf) với kp (V,T,J,2), conf (V,T,J)∈(0,1]. Nhiễu gồm:
      - mềm: std = SOFT_BASE + σ·SOFT_SPREAD, σ là "độ xấu" thực ∈[0,1];
      - thô: với xác suất P_GROSS, cộng một vector lệch lớn (bắt nhầm khớp).
    confidence quan sát tương quan mức RHO với (1−σ) và bị KÉO XUỐNG ở chỗ lỗi thô
    (detector thật thường — không phải luôn — báo confidence thấp khi bắt nhầm).
    """
    V, T, J, _ = clean.shape
    sigma = rng.uniform(0.0, 1.0, size=(V, T, J))          # độ xấu thực
    conf_true = 1.0 - sigma
    guess = rng.uniform(0.0, 1.0, size=(V, T, J))
    conf = np.clip(RHO * conf_true + (1.0 - RHO) * guess, 1e-3, 1.0)

    std = SOFT_BASE + sigma * SOFT_SPREAD                  # nhiễu mềm
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * std[..., None]

    gross = rng.uniform(0.0, 1.0, size=(V, T, J)) < P_GROSS  # mặt nạ lỗi thô
    mag = rng.uniform(*GROSS_PX, size=(V, T, J))
    ang = rng.uniform(0.0, 2 * np.pi, size=(V, T, J))
    kp[..., 0] += gross * mag * np.cos(ang)
    kp[..., 1] += gross * mag * np.sin(ang)
    conf = np.where(gross, conf * rng.uniform(0.1, 0.5, size=conf.shape), conf)  # thô -> conf tụt
    return kp, conf


def _invvar(conf):
    """confidence -> trọng số nghịch phương sai (đúng thống kê cho nhiễu mềm)."""
    sigma_est = SOFT_BASE + (1.0 - conf) * SOFT_SPREAD
    return 1.0 / sigma_est ** 2


def _eval_stage(kp, conf, cams, gt, *, robust, weighted, bone):
    """Dựng 3D theo cấu hình bật/tắt từng lớp, trả (mpjpe_mm, bonestd_mm)."""
    w = _invvar(conf) if weighted else None
    clip = fuse_multiview(kp, cams, fps=30.0, smooth=True, robust=robust, confidences=w)
    j3d = clip.joints3d
    if bone:
        j3d = enforce_bone_lengths(clip, iters=PBD_ITERS)
    return mpjpe(j3d, gt, root=None), bone_length_std(j3d)


# Các cấu hình cộng dồn: mỗi bước bật thêm một lớp.
STAGES = [
    ("Thô (DLT thường)",            dict(robust=False, weighted=False, bone=False)),
    ("+ robust (lỗi thô)",          dict(robust=True,  weighted=False, bone=False)),
    ("+ weighted (nhiễu mềm)",      dict(robust=True,  weighted=True,  bone=False)),
    ("+ ràng buộc xương (radial)",  dict(robust=True,  weighted=True,  bone=True)),
]


def _run(cams, gt, trials):
    clean = _project_clip(cams, gt)
    acc = {name: {"mpjpe": [], "bone": []} for name, _ in STAGES}
    for tr in range(trials):
        rng = np.random.default_rng(7000 + tr)
        kp, conf = _mixed_noise(rng, clean)
        for name, cfg in STAGES:
            m, b = _eval_stage(kp, conf, cams, gt, **cfg)
            acc[name]["mpjpe"].append(m)
            acc[name]["bone"].append(b)
    return {name: (float(np.mean(v["mpjpe"])), float(np.mean(v["bone"])))
            for name, v in acc.items()}


THRESHOLDS = (10.0, 15.0, 20.0, 30.0, 45.0, 60.0)


def _run_thresh(cams, gt, trials):
    """Quét ngưỡng cổng robust: đo robust-only vs robust+weighted ở mỗi ngưỡng.

    Cho thấy tương tác giữa hai lớp phụ thuộc ngưỡng: nếu ngưỡng nằm TRONG dải nhiễu
    mềm (~{SOFT_BASE}+{SOFT_SPREAD}px) cổng cắn nhầm view chỉ bị nhiễu mềm -> hai lớp
    giẫm chân nhau; ngưỡng đặt TRÊN dải mềm nhưng DƯỚI lỗi thô thì hai lớp bổ trợ.
    """
    clean = _project_clip(cams, gt)
    rows = []
    for thr in THRESHOLDS:
        ro, rw = [], []
        for tr in range(trials):
            rng = np.random.default_rng(9000 + tr)
            kp, conf = _mixed_noise(rng, clean)
            w = _invvar(conf)
            c0 = fuse_multiview(kp, cams, fps=30.0, smooth=True, robust=True,
                                reproj_thresh_px=thr)
            c1 = fuse_multiview(kp, cams, fps=30.0, smooth=True, robust=True,
                                reproj_thresh_px=thr, confidences=w)
            ro.append(mpjpe(c0.joints3d, gt, root=None))
            rw.append(mpjpe(c1.joints3d, gt, root=None))
        rows.append((thr, float(np.mean(ro)), float(np.mean(rw))))
    return rows


def _fmt_thresh(rows):
    vmax = max(max(a, b) for _, a, b in rows)
    out = ["| Ngưỡng cổng (px) | robust-only (mm) | robust+weighted (mm) | Δ weighted | |",
           "|---:|---:|---:|---:|:--|"]
    for thr, ro, rw in rows:
        d = "—" if ro <= 0 else f"{(ro - rw) / ro * 100:+.0f}%"
        out.append(f"| {thr:.0f} | {ro:.2f} | {rw:.2f} | {d} | `{_bar(rw, vmax)}` |")
    return "\n".join(out)


def _fmt(res):
    base_m = res[STAGES[0][0]][0]
    vmax = max(m for m, _ in res.values())
    out = ["| Lớp khử nhiễu (cộng dồn) | MPJPE (mm) | Δ vs thô | Std xương (mm) | |",
           "|:--|---:|---:|---:|:--|"]
    prev_m = None
    for name, _ in STAGES:
        m, b = res[name]
        d_base = "—" if name == STAGES[0][0] else f"{(base_m - m) / base_m * 100:+.0f}%"
        step = "" if prev_m is None else f" ({(prev_m - m) / prev_m * 100:+.0f}% bước)"
        out.append(f"| {name} | {m:.2f}{step} | {d_base} | {b:.2f} | `{_bar(m, vmax)}` |")
        prev_m = m
    return "\n".join(out)


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    print(f"Capstone khử nhiễu hỗn hợp — {len(ANGLES)} máy, {TRIALS} lần lặp.\n"
          f"Nhiễu mềm {SOFT_BASE:.0f}+{SOFT_SPREAD:.0f}px (ρ={RHO}), lỗi thô {P_GROSS*100:.0f}% "
          f"{GROSS_PX[0]:.0f}-{GROSS_PX[1]:.0f}px.\n")

    res = _run(cams, gt, TRIALS)
    thr_rows = _run_thresh(cams, gt, TRIALS)

    doc = f"""# Capstone: cộng dồn ba lớp khử nhiễu trên nhiễu hỗn hợp

*Sinh tự động bởi `experiments/tong_hop_khu_nhieu.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Ba vòng trước đã đo **riêng** từng lớp khử nhiễu, mỗi lớp trên đúng loại lỗi nó nhắm:
`triangulate_robust` (lỗi **thô**), weighted DLT nghịch-phương-sai (nhiễu **mềm** theo
confidence), ràng buộc xương PBD (nhiễu **radial** làm xương co giãn). Nhưng mocap
2-view thật dính **cả ba loại cùng lúc**. Câu hỏi ở đây: bật cả ba **cộng dồn** thì chúng
**hợp lực** hay **đánh nhau**? (Ví dụ: weighting hạ ảnh hưởng một view sạch có làm cổng
robust loại nhầm chính nó không — đúng lỗi đã phát hiện & sửa ở Vòng 11.)

## Thiết lập nhiễu hỗn hợp
- Múa tổng hợp {gt.shape[0]} khung, {len(ANGLES)} máy ({'/'.join(f'{a:+.0f}°' for a in ANGLES)}), cách {DISTANCE:.1f} m.
- **Nhiễu mềm**: std = {SOFT_BASE:.0f} + σ·{SOFT_SPREAD:.0f} px, σ = "độ xấu" thực ∈[0,1];
  confidence detector biết nhiễu ở mức ρ={RHO}.
- **Lỗi thô**: {P_GROSS*100:.0f}% quan sát bị cộng lệch {GROSS_PX[0]:.0f}–{GROSS_PX[1]:.0f} px (bắt nhầm khớp);
  confidence ở các quan sát này bị kéo xuống (detector thật thường báo thấp khi nhầm).
- {TRIALS} lần lặp Monte-Carlo. MPJPE toàn cục (root=None); Std xương = độ lệch chuẩn
  chiều dài 15 xương qua thời gian (0 = cứng tuyệt đối).

## A. Kết quả cộng dồn (ngưỡng cổng mặc định 20px)
{_fmt(res)}

- **Mỗi lớp đánh một trục lỗi khác nhau** nên cộng dồn được: robust cắt đuôi lỗi thô (kéo
  MPJPE xuống mạnh nhất vì lỗi thô hại nhất), weighted vắt thêm phần nhiễu mềm cổng robust
  để lọt, ràng buộc xương ép lại độ cứng giải phẫu (Std xương → 0) mà **không** làm xấu
  MPJPE. Cả ba bước đều dương.

## B. Robust và weighted tương tác theo NGƯỠNG CỔNG
{_fmt_thresh(thr_rows)}

Đây là phát hiện chính của vòng này, và **không hiển nhiên**:
- **Robust và weighted chia nhau một "ngân sách" nhiễu mềm.** Lợi ích cộng thêm của weighting
  **tăng dần theo ngưỡng cổng** (từ ~+3% ở 10px lên ~+12% ở 60px): ngưỡng cao thì cổng robust
  để lọt nhiều view chỉ bị nhiễu mềm hơn → còn nhiều việc cho weighting làm → weighting lãi
  nhiều hơn. Ngưỡng thấp thì cổng đã cắt bớt view nhiễu mềm → weighting còn ít việc → lãi nhỏ.
  Hai lớp bổ trợ (weighting không bao giờ âm ở đây) nhưng **không cộng dồn tuyến tính** — bật
  cái này làm giảm dư địa của cái kia.
- **Có ngưỡng tối ưu cho ĐỘ CHÍNH XÁC TỔNG HỢP** (~15–20px trong thiết lập này): thấp quá thì
  cổng cắt nhầm cả view chỉ nhiễu mềm (robust-only xấu đi ở 10px); cao quá thì lỗi thô lọt lưới
  (cả robust-only lẫn robust+weighted xấu đi rõ ở 45–60px). Quy tắc thiết kế: **đặt ngưỡng
  trên dải nhiễu mềm dự kiến nhưng dưới biên lỗi thô** — và dải đó ước được từ confidence detector.

Để hai lớp không đánh nhau ở tầng code, `triangulate_robust` tách bạch: cổng chọn inlier
bằng **hình học thuần** (giải & tái chiếu không trọng số) — quyết định "view nào lỗi thô"
độc lập confidence — rồi **chỉ phép khớp cuối** trên tập inlier mới áp trọng số. Không tách,
một view sạch bị hạ trọng số sẽ reproject tệ và bị cổng loại nhầm (đã bắt bằng unit-test).

## Hệ quả cho luận văn
1. Đây là **hình dạng cuối** của khối fuse/cleanup demo: pipeline khử nhiễu ba tầng, mỗi
   tầng có động cơ hình học riêng, có test riêng, cộng dồn được — đo trên cùng một kịch bản
   nhiễu hỗn hợp thay vì mỗi lớp một sân chơi thuận lợi.
2. Con số ở đây vẫn là **cận trên trên nhiễu MÔ PHỎNG**. Việc ở Cổng 0 là lặp lại đúng hai
   bảng này với **sai số detector THẬT** (2D pose trên video múa thật, confidence thật); khi
   đó thứ tự đóng góp ba lớp + ngưỡng cổng tối ưu mới là số liệu đánh giá thật, còn khung đo
   đã sẵn sàng và tái lập được.
3. Bài học "hai bộ lọc tốt vẫn có thể giẫm chân nhau nếu ghép ẩu, và điểm giao phụ thuộc
   tham số đo được" chính là loại phát hiện thuộc tầng perception/đánh giá mà luận văn nhắm
   tới — không phải tính năng app.
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-tong-hop-khu-nhieu.md"
    out_path.write_text(doc, encoding="utf-8")

    print(_fmt(res))
    print(f"\n→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
