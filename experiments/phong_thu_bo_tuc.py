"""V50 — Dựng bền (robust) vs cổng held-out: hai phòng thủ BỔ TÚC, không dư thừa.

V49 cố tình dùng `robust=False` để phơi CƠ CHẾ trần trụi. Câu hỏi hội đồng chắc chắn hỏi:
"tam giác hoá BỀN (robust, cổng tái chiếu 20px trong `fuse_multiview`) chẳng phải ĐÃ loại
view bị bias rồi sao? Vậy cổng held-out V49 có DƯ THỪA không?" V50 đo để trả lời.

## Hai dự đoán đi vào (một cái BỊ SỐ LIỆU BÁC — phần giá trị nhất)
Cổng robust loại view có sai số tái chiếu **> 20px** rồi dựng lại từ các view còn lại. Dự đoán:
- **bias NHỎ**: chưa quá 20px ⇒ robust **không** loại ⇒ 3D vẫn hỏng (y plain) ⇒ robust KHÔNG
  cứu — đúng điểm mù V48. (Số liệu XÁC NHẬN.)
- **bias LỚN**: vượt 20px ⇒ robust loại view bias ⇒ dựng lại từ 2 view sạch ⇒ 3D **phục hồi**.
  (Số liệu **BÁC BỎ**: robust loại NHẦM view SẠCH đối-góc, không loại view bias ⇒ **làm TỆ HƠN**.
  Đo `_drop_profile` chứng minh cơ chế: bias kéo nghiệm compromise về phía view bias nên view
  sạch đối-góc thành kẻ lệch-nhất, bị loại; view bias ở lại với trọng số cao hơn ⇒ khuếch đại.)

⇒ Kết quả THẬT còn mạnh hơn dự đoán: robust không chỉ **mù** với bias hệ thống mà có thể **hại**.
Đối chiếu **outlier THÔ thoáng qua** (địa hạt sở trường robust): robust dập tốt vì mỗi khung loại
độc lập — cùng lằn ranh NGẪU-NHIÊN/THOÁNG ↔ HỆ-THỐNG/DAI-DẲNG như tầng đánh giá (V47/V48), giờ ở
tầng DỰNG.

## Cách đo
Cùng cấu hình V49 (4 máy, dựng 3, giữ −20°, bias view −60°, khớp l_wrist, sàn Gauss 2px, 16
hạt). Với mỗi biên độ: dựng `robust=False` VÀ `robust=True`, đo dev3d (hỏng 3D) + reproj
held-out. Hai họ nhiễu: (I) bias HỆ THỐNG hằng số; (II) outlier THÔ thoáng qua (20% khung,
dịch ngẫu nhiên lớn) — để lộ địa hạt robust thật sự giỏi.

Chạy:  .venv/Scripts/python experiments/phong_thu_bo_tuc.py
Ghi ra experiments/ket-qua-phong-thu-bo-tuc.md
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

from experiments.synthetic_2view import DISTANCE, ELEV, FOV, IMAGE, _bar  # noqa: E402
from choreo.geom import look_at_camera, project_points                    # noqa: E402
from choreo.mocap.fuse import fuse_multiview                              # noqa: E402
from choreo.synth import synthetic_dance                                 # noqa: E402
from choreo.schema import JOINT_INDEX                                    # noqa: E402

ANGLES = (-60.0, -20.0, 20.0, 60.0)
RECON = (0, 2, 3)
HELDOUT = 1
BIAS_VIEW = 0
JOINT = JOINT_INDEX["l_wrist"]
SECONDS = 1.5
GAUSS_PX = 2.0
TRIALS = 16

BIASES_PX = (5.0, 10.0, 20.0, 30.0, 45.0, 60.0, 80.0)   # bias hệ thống (I)
GROSS_PX = (30.0, 60.0, 90.0, 130.0)                    # biên độ outlier thô (II)
GROSS_RATE = 0.20                                       # tỉ lệ khung bị outlier thô


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )


def _fuse(cams, kp, robust):
    recon_cams = [cams[i] for i in RECON]
    clip = fuse_multiview(kp[list(RECON)], recon_cams, fps=30.0, smooth=True,
                          fill_gaps=True, robust=robust)
    return clip.joints3d


def _dev3d_cm(j3d, nominal):
    # NaN-an toàn: fill_gaps thường lấp hết, nhưng phòng khi khớp bị loại còn sót.
    d = np.linalg.norm(j3d[:, JOINT, :] - nominal[:, JOINT, :], axis=1)
    d = d[np.isfinite(d)]
    return float(d.mean()) * 100.0 if d.size else float("nan")


def _reproj_held_cm(cams, j3d, kp):
    uv = project_points(cams[HELDOUT], j3d[:, JOINT, :])
    obs = kp[HELDOUT][:, JOINT, :]
    e = np.linalg.norm(uv - obs, axis=1)
    e = e[np.isfinite(e)]
    return float(e.mean()) if e.size else float("nan")


def _run_bias(cams, gt, bias_px, robust, seed):
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * GAUSS_PX
    kp[BIAS_VIEW, :, JOINT, 0] += bias_px            # lệch HẰNG SỐ mọi khung (hệ thống)
    kp[BIAS_VIEW, :, JOINT, 1] += 0.5 * bias_px
    j3d = _fuse(cams, kp, robust)
    return _dev3d_cm(j3d, gt), _reproj_held_cm(cams, j3d, kp)


def _run_gross(cams, gt, gross_px, robust, seed):
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * GAUSS_PX
    T = clean.shape[1]
    mask = rng.uniform(size=T) < GROSS_RATE          # ~20% khung bị outlier THÔ
    n = int(mask.sum())
    if n:
        jump = rng.uniform(-1.0, 1.0, size=(n, 2))
        jump = jump / np.maximum(np.linalg.norm(jump, axis=1, keepdims=True), 1e-9) * gross_px
        kp[BIAS_VIEW, mask, JOINT, :] += jump        # dịch NGẪU NHIÊN, THOÁNG QUA từng khung
    j3d = _fuse(cams, kp, robust)
    return _dev3d_cm(j3d, gt), _reproj_held_cm(cams, j3d, kp)


def _drop_profile(cams, gt, bias_px):
    """Đếm robust loại view DỰNG nào (cục bộ theo RECON) dưới bias hệ thống — chứng minh cơ chế.

    Tái hiện đúng cổng của `triangulate_robust` (giải hình-học-thuần, tái chiếu, loại view lệch
    nhất > 20px) trên riêng khớp khảo sát, đếm theo khung. Trả về (giữ_cả_3, {local_view: số_lần_loại})."""
    from choreo.geom.triangulate import _solve_one, _reproj_errs  # nội bộ, chỉ dùng cho chẩn đoán
    P = np.stack([cams[i].P for i in RECON])          # local 0=−60(bias), 1=20, 2=60
    bias_local = RECON.index(BIAS_VIEW)
    keep_all = 0; drop = {0: 0, 1: 0, 2: 0}; T = gt.shape[0]
    for f in range(T):
        uv = np.stack([project_points(cams[i], gt[f, JOINT]) for i in RECON])
        uv[bias_local, 0] += bias_px; uv[bias_local, 1] += 0.5 * bias_px
        idx = [0, 1, 2]
        while len(idx) >= 2:
            Xg = _solve_one(P[idx], uv[idx], None)
            if Xg is None:
                break
            errs = _reproj_errs(P[idx], Xg, uv[idx])
            if errs.max() <= 20.0:
                if len(idx) == 3:
                    keep_all += 1
                break
            if len(idx) <= 2:
                break
            w = idx[int(np.argmax(errs))]; drop[w] += 1; idx.pop(int(np.argmax(errs)))
    return keep_all, drop, bias_local, T


def _sweep(fn, cams, gt, values, robust):
    rows = []
    seed = 9000 if robust else 3000
    for v in values:
        dv, rp = [], []
        for _ in range(TRIALS):
            d, r = fn(cams, gt, v, robust, seed); seed += 1
            dv.append(d); rp.append(r)
        rows.append((v, float(np.nanmean(dv)), float(np.nanmean(rp))))
    return rows


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    print(f"V50 — robust vs held-out, khớp {JOINT}; dựng {RECON}, giữ {ANGLES[HELDOUT]:+.0f}°, "
          f"bias/outlier ở view {ANGLES[BIAS_VIEW]:+.0f}°.\n")

    bias_plain = _sweep(_run_bias, cams, gt, BIASES_PX, robust=False)
    bias_rob = _sweep(_run_bias, cams, gt, BIASES_PX, robust=True)
    gross_plain = _sweep(_run_gross, cams, gt, GROSS_PX, robust=False)
    gross_rob = _sweep(_run_gross, cams, gt, GROSS_PX, robust=True)

    # Điểm CHỚM loại: bias nhỏ nhất mà robust BẮT ĐẦU loại 1 view (không còn giữ cả 3).
    onset = None
    for b in BIASES_PX:
        ka, _, _, T = _drop_profile(cams, gt, b)
        if ka < T:
            onset = b; break
    # Hồ sơ loại ở bias LỚN NHẤT (chứng minh loại NHẦM view sạch, không loại view bias).
    ka_hi, drop_hi, bias_local, T = _drop_profile(cams, gt, BIASES_PX[-1])
    clean_locals = [k for k in (0, 1, 2) if k != bias_local]
    drop_clean = sum(drop_hi[k] for k in clean_locals)
    drop_bias = drop_hi[bias_local]
    # Robust có LÀM TỆ HƠN ở bias lớn không? (dev3d robust > plain)
    worsened = [(b, dp, dr) for (b, dp, _), (_, dr, _) in zip(bias_plain, bias_rob) if dr > dp * 1.05]

    print("HỆ THỐNG (bias hằng số):  b | dev3d plain→robust | reproj_held plain→robust")
    for (b, dp, rp), (_, dr, rr) in zip(bias_plain, bias_rob):
        tag = "  ← robust TỆ HƠN" if dr > dp * 1.05 else ""
        print(f"  b={b:5.0f}px  dev3d {dp:6.2f}→{dr:6.2f}cm   reproj {rp:7.2f}→{rr:7.2f}px{tag}")
    print(f"  ⇒ robust chớm loại view ở b≈{onset}px; ở b={BIASES_PX[-1]:.0f}px loại view SẠCH "
          f"{drop_clean}/{T} khung, loại view BIAS chỉ {drop_bias}/{T}\n")

    print("THÔ thoáng qua (20% khung):  g | dev3d plain→robust")
    for (g, dp, _), (_, dr, _) in zip(gross_plain, gross_rob):
        print(f"  g={g:5.0f}px  dev3d {dp:6.2f}→{dr:6.2f}cm")

    def _btbl(pl, rob, unit):
        vmax = max(max(r[1] for r in pl), 1e-6)
        out = []
        for (v, dp, rp), (_, dr, rr) in zip(pl, rob):
            out.append(f"| {v:.0f} | {dp:.2f} | {dr:.2f} | {rp:.2f} | {rr:.2f} "
                       f"| `{_bar(dp, vmax)}` |")
        return "\n".join(out)

    def _gtbl(pl, rob):
        vmax = max(max(r[1] for r in pl), 1e-6)
        out = []
        for (v, dp, _), (_, dr, _) in zip(pl, rob):
            out.append(f"| {v:.0f} | {dp:.2f} | {dr:.2f} | `{_bar(dp, vmax)}` |")
        return "\n".join(out)

    small_gain = next((rp for (b, dp, rp), (_, dr, rr) in zip(bias_plain, bias_rob)
                       if b <= 10), None)
    worst_b, worst_dp, worst_dr = (worsened[-1] if worsened else (BIASES_PX[-1], 0.0, 0.0))
    doc = f"""# V50 — Dựng bền (robust) vs cổng held-out: hai phòng thủ BỔ TÚC

*Sinh tự động bởi `experiments/phong_thu_bo_tuc.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V49 cố ý dùng `robust=False` để phơi cơ chế. Hội đồng sẽ hỏi: **tam giác hoá BỀN (cổng tái
chiếu 20px trong `fuse_multiview`) đã loại view bias rồi, cổng held-out V49 có dư thừa?**
V50 đo trực tiếp.

## Cơ chế robust (đọc từ `triangulate_robust`)
Mỗi khung/khớp: dựng từ mọi view, tái chiếu; nếu view nào lệch **> 20px** thì (≥3 view) **loại
dần view tệ nhất** rồi dựng lại; đúng 2 view thì trả NaN để nội suy. ⇒ Nó bắt **outlier THÔ**,
nhưng quyết định theo **ngưỡng tái chiếu** nên chỉ loại bias khi bias đủ lớn để **vượt ngưỡng**.

## Kết quả (số đo được)

### I. Bias HỆ THỐNG hằng số — robust chỉ cứu khi bias ĐỦ LỚN
| bias (px) | dev3d plain (cm) | dev3d robust (cm) | reproj_held plain (px) | reproj_held robust (px) | |
|---:|---:|---:|---:|---:|:--|
{_btbl(bias_plain, bias_rob, 'cm')}

- **Dải bias nhỏ** (b≤~30px, robust GIỮ CẢ 3 view): robust dev3d ≈ plain — sai số tái chiếu ở
  view bias **chưa** vượt 20px nên **không bị loại**, 3D vẫn hỏng. **Đây đúng điểm mù V48**: bias
  dai dẳng vừa phải KHÔNG phải outlier thô, robust bất lực. Cổng **held-out V49** vẫn báo reproj
  cao ({small_gain:.1f}px ở b≤10) ⇒ **V49 KHÔNG dư thừa, nó phủ đúng dải robust bỏ sót**.
- **Dải bias lớn** (b≥{onset:.0f}px, robust bắt đầu loại view): **dự đoán "robust phục hồi" BỊ SỐ
  LIỆU BÁC.** dev3d robust **TỆ HƠN** plain (b={worst_b:.0f}px: {worst_dp:.1f}→{worst_dr:.1f}cm).
  Cơ chế (đo bằng `_drop_profile`, tất định): ở b={BIASES_PX[-1]:.0f}px robust loại **view SẠCH
  đối-góc {drop_clean}/{T} khung**, loại view BIAS chỉ **{drop_bias}/{T}**. Vì bias kéo nghiệm
  compromise về phía nó, view sạch xa nhất (đối-góc) thành kẻ "lệch nhất" → bị loại → còn lại
  view bias + 1 view sạch = **trọng số bias tăng từ 1/3 lên 1/2** ⇒ **khuếch đại hỏng**. ⇒ Robust
  không chỉ **mù** với bias hệ thống mà có thể **HẠI** — càng khẳng định phải dùng chiều dữ liệu
  khác (held-out), không phải lọc mạnh hơn cùng chiều.

### II. Outlier THÔ thoáng qua (20% khung) — địa hạt sở trường của robust
| outlier (px) | dev3d plain (cm) | dev3d robust (cm) | |
|---:|---:|---:|:--|
{_gtbl(gross_plain, gross_rob)}

Outlier thô **thoáng qua** (mỗi khung độc lập): robust kéo dev3d xuống **gần sàn** ở MỌI biên
độ — vì mỗi khung loại view lỗi **riêng**, khung sạch không bị ảnh hưởng. Tương phản sắc với
bias hệ thống dải nhỏ (bảng I) mà robust **không** cứu.

## Kết luận: held-out V49 KHÔNG dư thừa với robust — robust còn HẠI ở bias lớn
| Nhiễu ở 1 view dựng | robust? | held-out V49 bắt? | Ai phủ |
|---|:---:|:---:|---|
| Outlier THÔ thoáng qua (mọi biên độ) | **Cứu** (loại theo khung) | (không cần) | robust |
| Bias hệ thống **nhỏ** (giữ cả 3 view) | **Mù** (không loại) | **Có** (reproj cao) | **held-out V49** |
| Bias hệ thống **lớn** (chớm loại view) | **HẠI** (loại nhầm view sạch → khuếch đại) | **Có** (reproj vẫn ≫τ) | **held-out V49** |

**Held-out V49 phủ TOÀN dải bias hệ thống** (reproj cao ở cả nhỏ lẫn lớn, robust-bất-biến); robust
chỉ giỏi outlier-thô-thoáng-qua và **phản tác dụng** với bias lớn. Hai cái **không dư thừa**: khác
địa hạt, và held-out là cái duy nhất phủ đúng điểm mù V48. Sâu hơn, đây là **cùng một lằn ranh cấu
trúc** xuyên đề tài — NGẪU-NHIÊN/THOÁNG-QUA bị trung-bình-hoá/loại-bỏ dễ (V47 iid ở tầng đánh giá,
robust outlier-thô ở tầng dựng), còn HỆ-THỐNG/DAI-DẲNG mới là kẻ khó (V48 điểm mù đánh giá, V50 khe
bias ở tầng dựng, nơi lọc-mạnh-hơn còn **làm tệ đi**) — chỉ chặn được bằng **chiều dữ liệu thêm**
(đa-view held-out), không bằng lọc mạnh hơn trong cùng một chiều. Đó là luận điểm kiến trúc lặp lại.

## Giới hạn (trung thực)
- Ngưỡng 20px + điểm chớm-loại b≈{onset:.0f}px **riêng cấu hình này** (góc máy, khoảng cách,
  khớp). Cơ chế (robust theo ngưỡng ⇒ mù bias-nhỏ, loại-nhầm-view-sạch ở bias-lớn) tổng quát cho
  mọi cấu hình mà bias kéo nghiệm compromise lệch khỏi các view sạch.
- Chỉ 3 view dựng (loại 1 còn 2 = giới hạn dưới của robust). Nhiều view dựng hơn có thể đổi hành
  vi loại-nhầm; chưa quét số-view — để ngỏ.
- Vẫn hình học tổng hợp; số trên detector thật 2–3 máy chờ Gate-0 (GPU lab).
"""

    out = Path(__file__).resolve().parent / "ket-qua-phong-thu-bo-tuc.md"
    out.write_text(doc, encoding="utf-8")
    print(f"\nĐã ghi {out.name}")


if __name__ == "__main__":
    main()
