"""V49 — Tầng đa-view TÁCH "detector lệch hệ thống" khỏi "múa sai thật".

Đóng đúng GIỚI HẠN mà V48 tự nêu. V48 (tầng đánh giá) tìm ra ĐIỂM MÙ duy nhất: lỗi
detector HỆ THỐNG một người (một khớp bị đặt lệch nhất quán) ở tầng toạ-độ-3D **giống
hệt** người đó múa sai — không núm nào của `sync.ts` tách được, vì cả hai cho **cùng một
độ lệch 3D** so với tham chiếu. V48 chỉ **chỉ ra bằng lập luận** rằng tầng perception đa-view
(V13, tái chiếu camera held-out) tách được, nhưng **chưa chạy** để định lượng. V49 chạy.

## Ý tưởng vật lý (vì sao held-out tách được cái mà tầng toạ độ không tách được)
Xét MỘT khớp (cổ tay trái). Dựng 3D từ 3 camera, GIỮ LẠI 1 camera làm giám khảo sạch.

- **THẬT** (REAL): vũ công dời khớp đi d (mét) trong 3D. **Mọi** camera thấy vị trí mới nhất
  quán. Dựng ra 3D ≈ vị trí mới. Chiếu lên máy giữ lại → khớp với 2D quan sát ở đó (cũng là
  vị trí mới) ⇒ **sai số tái chiếu THẤP**. Độ lệch 3D so với gốc = d, nhưng nó **nhất quán
  vật lý** giữa các góc nhìn.
- **LỆCH HỆ THỐNG** (BIAS): vũ công múa ĐÚNG (3D thật = gốc), nhưng detector ở **một** view
  dựng đặt khớp lệch b pixel. Tam giác hoá kéo điểm 3D khỏi gốc một đoạn d_bias — tầng đánh
  giá thấy **cùng** độ lệch 3D như ca THẬT. Nhưng máy giữ lại quan sát khớp ở **vị trí gốc
  đúng** (nó không bị bias), nên chiếu 3D-hỏng lên đó **lệch hẳn** ⇒ **sai số tái chiếu CAO**.
  Độ lệch 3D là **giả tạo một-view**, **không nhất quán** giữa các góc.

⇒ Ở **cùng một độ lệch 3D** (thứ tầng đánh giá nhìn thấy), tái chiếu held-out **THẤP cho THẬT,
CAO cho BIAS**. Đó là chiều dữ liệu mà 1-camera (Choreoto) không có, và là cổng tin cậy đặt
TRƯỚC phán quyết đánh giá.

## Cách đo
Quét biên độ: họ THẬT quét d (dời 3D thật), họ BIAS quét b (bias pixel một view). Với mỗi ca đo
**độ lệch 3D của khớp so với gốc** (dev3d, cm) VÀ **tái chiếu held-out per-khớp** (px). Rồi so ở
**dev3d khớp nhau**: THẬT phải thấp, BIAS phải cao. Tính luôn ngưỡng tách + tỉ lệ bắt đúng.

Chạy:  .venv/Scripts/python experiments/phan_biet_lech_he_thong.py
Ghi ra experiments/ket-qua-phan-biet-lech.md
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

# Cấu hình camera y hệt thước GT-free (danh_gia_khong_gt): 4 máy, dựng 3, giữ 1.
ANGLES = (-60.0, -20.0, 20.0, 60.0)
RECON = (0, 2, 3)          # dựng từ −60/20/60
HELDOUT = 1                # giữ lại −20° làm giám khảo sạch (KHÔNG bias)
BIAS_VIEW = 0              # view dựng bị detector lệch hệ thống (−60°)

JOINT = JOINT_INDEX["l_wrist"]     # khớp khảo sát: cổ tay trái (biên độ lớn, tam giác hoá tốt)
SECONDS = 1.5
GAUSS_PX = 2.0             # sàn nhiễu detector ngẫu nhiên trên MỌI view (hiện thực)
TRIALS = 16               # trung bình nhiều hạt để số ổn định

# Biên độ quét. THẬT: dời khớp trong 3D (m). BIAS: lệch pixel trên 1 view dựng (px).
DISPS_M = (0.02, 0.04, 0.06, 0.10, 0.14, 0.20)
BIASES_PX = (5.0, 10.0, 20.0, 30.0, 45.0, 60.0, 80.0)
DISP_DIR = np.array([1.0, 0.0, 0.35])   # hướng dời THẬT (ngang + hơi ra trước), chuẩn hoá dưới
DISP_DIR = DISP_DIR / np.linalg.norm(DISP_DIR)


def _project_clip(cams, gt):
    """(V,T,J,2) chiếu GT sạch xuống mọi camera."""
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )


def _fuse(cams, kp):
    """Dựng 3D từ các view RECON (không robust — đo cơ chế trần trụi)."""
    recon_cams = [cams[i] for i in RECON]
    clip = fuse_multiview(kp[list(RECON)], recon_cams, fps=30.0, smooth=True, robust=False)
    return clip.joints3d


def _joint_dev3d_cm(j3d, nominal):
    """Độ lệch 3D TRUNG BÌNH của KHỚP khảo sát so với pose gốc (cm)."""
    d = np.linalg.norm(j3d[:, JOINT, :] - nominal[:, JOINT, :], axis=1)  # (T,)
    return float(d.mean()) * 100.0


def _heldout_reproj_joint_px(cams, j3d, kp):
    """Tái chiếu held-out CHỈ tại khớp khảo sát (px) — không pha loãng 17 khớp.

    Chiếu 3D-dựng lên máy giữ lại, so với 2D QUAN SÁT ở máy đó (sạch, không bias)."""
    uv = project_points(cams[HELDOUT], j3d[:, JOINT, :])  # (T,2)
    obs = kp[HELDOUT][:, JOINT, :]                        # (T,2)
    return float(np.linalg.norm(uv - obs, axis=1).mean())


def _run_real(cams, gt, disp_m, seed):
    """THẬT: dời khớp đi disp_m trong 3D THẬT; mọi view thấy nhất quán."""
    rng = np.random.default_rng(seed)
    gt2 = gt.copy()
    gt2[:, JOINT, :] += disp_m * DISP_DIR              # 3D thật đổi -> mọi camera đổi theo
    clean = _project_clip(cams, gt2)
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * GAUSS_PX
    j3d = _fuse(cams, kp)
    return _joint_dev3d_cm(j3d, gt), _heldout_reproj_joint_px(cams, j3d, kp)


def _run_bias(cams, gt, bias_px, seed):
    """BIAS: 3D thật = gốc (múa đúng); MỘT view dựng bị đặt khớp lệch bias_px px."""
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * GAUSS_PX
    # Lệch hệ thống: cộng hằng số pixel vào KHỚP ở MỘT view dựng, MỌI khung (nhất quán).
    kp[BIAS_VIEW, :, JOINT, 0] += bias_px
    kp[BIAS_VIEW, :, JOINT, 1] += 0.5 * bias_px
    j3d = _fuse(cams, kp)
    # dev3d so với gốc (máy giữ lại quan sát vị trí gốc đúng vì nó KHÔNG bị bias).
    return _joint_dev3d_cm(j3d, gt), _heldout_reproj_joint_px(cams, j3d, kp)


def _sweep(fn, cams, gt, values):
    rows = []
    seed = 7000
    for v in values:
        devs, reps = [], []
        for _ in range(TRIALS):
            d, r = fn(cams, gt, v, seed); seed += 1
            devs.append(d); reps.append(r)
        rows.append((v, float(np.mean(devs)), float(np.mean(reps)),
                     float(np.std(reps))))
    return rows


def _interp_reproj_at(rows, dev_target):
    """Nội suy tuyến tính tái chiếu held-out tại một dev3d mục tiêu (cm)."""
    devs = np.array([r[1] for r in rows]); reps = np.array([r[2] for r in rows])
    order = np.argsort(devs)
    return float(np.interp(dev_target, devs[order], reps[order]))


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    print(f"V49 — tách BIAS một-view khỏi THẬT tại KHỚP {JOINT} (l_wrist); "
          f"dựng {RECON}, giữ {ANGLES[HELDOUT]:+.0f}°, bias ở view {ANGLES[BIAS_VIEW]:+.0f}°.\n")

    real = _sweep(_run_real, cams, gt, DISPS_M)
    bias = _sweep(_run_bias, cams, gt, BIASES_PX)

    # Ngưỡng tách: lấy TRẦN tái chiếu của toàn họ THẬT làm τ (mọi THẬT phải lọt dưới).
    real_reps = [r[2] for r in real]
    tau = max(real_reps)
    # dải dev3d chung để so "ở cùng độ lệch 3D".
    dev_lo = max(min(r[1] for r in real), min(r[1] for r in bias))
    dev_hi = min(max(r[1] for r in real), max(r[1] for r in bias))
    targets = [t for t in (3.0, 5.0, 8.0, 12.0) if dev_lo <= t <= dev_hi]
    matched = [(t, _interp_reproj_at(real, t), _interp_reproj_at(bias, t)) for t in targets]

    # Bắt đúng: trong họ BIAS, ca nào dev3d ≥ 2cm (đủ để tầng đánh giá NÊU) mà reproj > τ.
    flaggable = [r for r in bias if r[1] >= 2.0]
    caught = [r for r in flaggable if r[2] > tau]
    tp = 100.0 * len(caught) / len(flaggable) if flaggable else 0.0

    real_tbl = "\n".join(
        f"| {v*100:.0f} | {dev:.2f} | {rep:.2f} | `{_bar(rep, tau*6)}` |"
        for v, dev, rep, _ in real)
    bias_tbl = "\n".join(
        f"| {v:.0f} | {dev:.2f} | {rep:.2f} | `{_bar(rep, tau*6)}` |"
        for v, dev, rep, _ in bias)
    matched_tbl = "\n".join(
        f"| {t:.0f} | {rr:.2f} | {rb:.2f} | **{rb/max(rr,1e-6):.1f}×** |"
        for t, rr, rb in matched)

    ratio_hi = max((rb / max(rr, 1e-6)) for _, rr, rb in matched) if matched else 0.0
    ratio_lo = min((rb / max(rr, 1e-6)) for _, rr, rb in matched) if matched else 0.0

    print("THẬT (dời 3D thật):")
    for v, dev, rep, sd in real:
        print(f"  d={v*100:5.0f}cm  dev3d={dev:6.2f}cm  reproj_held={rep:7.2f}px (±{sd:.2f})")
    print("\nBIAS (lệch pixel 1 view):")
    for v, dev, rep, sd in bias:
        print(f"  b={v:5.0f}px  dev3d={dev:6.2f}cm  reproj_held={rep:7.2f}px (±{sd:.2f})")
    print(f"\nτ (trần THẬT) = {tau:.2f}px;  bắt đúng BIAS (dev3d≥2cm): {tp:.0f}% "
          f"({len(caught)}/{len(flaggable)})")
    print("Ở dev3d khớp nhau, reproj BIAS/THẬT:")
    for t, rr, rb in matched:
        print(f"  dev3d={t:.0f}cm: THẬT={rr:.2f}px  BIAS={rb:.2f}px  ({rb/max(rr,1e-6):.1f}×)")

    doc = f"""# V49 — Tầng đa-view tách "detector lệch hệ thống" khỏi "múa sai thật"

*Sinh tự động bởi `experiments/phan_biet_lech_he_thong.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này (đóng đúng giới hạn V48)
V48 ([nhiễu có cấu trúc](ket-qua-nhieu-cau-truc.md)) tìm ra **điểm mù duy nhất** của tầng đánh
giá: lỗi detector **hệ thống một người** (một khớp bị đặt lệch nhất quán) ở tầng toạ-độ-3D
**bất khả phân** với người đó múa sai — cả hai cho **cùng một độ lệch 3D** so với tham chiếu, nên
không núm nào của `sync.ts` tách được. V48 mới **chỉ ra bằng lập luận** rằng tầng perception
đa-view (V13, tái chiếu camera held-out) tách được. **V49 chạy để định lượng.**

## Ý tưởng vật lý
Xét một khớp (cổ tay trái). Dựng 3D từ **3 camera**, **giữ lại 1 camera** làm giám khảo sạch.
- **THẬT**: vũ công dời khớp d (m) trong 3D → **mọi** camera thấy nhất quán → 3D-dựng ≈ vị trí
  mới → chiếu lên máy giữ lại **khớp** quan sát ⇒ tái chiếu **THẤP**. Độ lệch 3D d là thật và
  **nhất quán vật lý** giữa các góc.
- **BIAS**: vũ công múa **đúng** (3D thật = gốc) nhưng **một** view dựng đặt khớp lệch b px →
  tam giác hoá kéo 3D khỏi gốc một đoạn d_bias (**tầng đánh giá thấy cùng độ lệch 3D**) → nhưng
  máy giữ lại quan sát khớp ở **vị trí gốc đúng** → chiếu 3D-hỏng lên đó **lệch hẳn** ⇒ tái chiếu
  **CAO**. Độ lệch 3D là **giả tạo một-view**, không nhất quán giữa các góc.

## Thiết lập
- Một vũ công, múa tổng hợp {gt.shape[0]} khung; {len(ANGLES)} máy ({'/'.join(f'{a:+.0f}°' for a in ANGLES)});
  dựng từ **3 máy {'/'.join(f'{ANGLES[i]:+.0f}°' for i in RECON)}**, **giữ lại {ANGLES[HELDOUT]:+.0f}°**.
  Bias đặt ở view dựng **{ANGLES[BIAS_VIEW]:+.0f}°**.
- Khảo sát **một khớp** (cổ tay trái). Sàn nhiễu Gaussian {GAUSS_PX:.0f}px mọi view; {TRIALS}
  hạt/mức, lấy trung bình. Tái chiếu đo **per-khớp** (không pha loãng 17 khớp — xem ghi chú V48).
- Quét: THẬT dời 3D {{{', '.join(f'{int(d*100)}' for d in DISPS_M)}}} cm; BIAS lệch
  {{{', '.join(f'{int(b)}' for b in BIASES_PX)}}} px trên một view.

## Kết quả (số đo được)

### THẬT — dời 3D thật: độ lệch 3D lớn nhưng tái chiếu held-out THẤP
| d dời (cm) | dev3d khớp (cm) | Reproj held-out (px) | |
|---:|---:|---:|:--|
{real_tbl}

Dời 3D thật tới {int(DISPS_M[-1]*100)}cm mà tái chiếu held-out vẫn chỉ ~{max(real_reps):.0f}px
(cỡ sàn nhiễu {GAUSS_PX:.0f}px): mọi camera **đồng thuận** vị trí mới nên giám khảo sạch **xác nhận**.

### BIAS — lệch pixel một view: cùng độ lệch 3D nhưng tái chiếu held-out VỌT
| b bias (px) | dev3d khớp (cm) | Reproj held-out (px) | |
|---:|---:|---:|:--|
{bias_tbl}

Bias một-view đẩy dev3d lên (tầng đánh giá **tưởng** khớp sai) trong khi tái chiếu held-out
**vọt cao** — giám khảo sạch quan sát khớp ở gốc đúng nên **tố** ngay 3D-dựng sai.

### Đối chiếu Ở CÙNG độ lệch 3D — chỗ tầng đánh giá mù, tầng đa-view sáng
| dev3d khớp (cm) | Reproj THẬT (px) | Reproj BIAS (px) | Tỉ số |
|---:|---:|---:|---:|
{matched_tbl}

**Đây là luận điểm chính.** Tầng đánh giá chỉ thấy cột "dev3d" — với nó THẬT và BIAS **y hệt**.
Tầng đa-view thấy cột tái chiếu: ở cùng dev3d, BIAS cao hơn THẬT **{ratio_lo:.0f}–{ratio_hi:.0f}×**.

## Cổng tin cậy: ngưỡng tách và tỉ lệ bắt
- Lấy **τ = trần tái chiếu của toàn họ THẬT = {tau:.2f}px** (mọi ca THẬT lọt dưới theo định nghĩa).
- Trong họ BIAS, các ca có **dev3d ≥ 2cm** (đủ để tầng đánh giá **nêu**): **{tp:.0f}%**
  ({len(caught)}/{len(flaggable)}) vượt τ ⇒ bị cổng đa-view **chặn đúng**.
- ⇒ Đặt cổng tái chiếu held-out **trước** phán quyết đánh giá: giữ mọi sai động tác THẬT (tái
  chiếu thấp) và **gỡ oan** cho người bị detector lệch hệ thống (tái chiếu cao). Điểm mù V48
  được **một tầng đã có sẵn** khép lại — bằng **số đo**, không phải lập luận.

## Vì sao phải ≥3 máy (nối tiếp danh_gia_khong_gt)
Cổng này cần **một camera giữ lại độc lập, sạch** làm giám khảo. Giải pháp 1-camera (Choreoto)
**không có** chiều dữ liệu này: nó không thể phân biệt "detector đặt khớp lệch" với "vũ công múa
sai", vì chỉ có một góc nhìn. Đây là lý do kỹ thuật thứ hai (ngoài dựng 3D chính xác) để hệ 2–3
máy tồn tại, và là mắt xích khép **điểm mù đánh giá ↔ giải pháp perception** thành một vòng.

## Giới hạn (trung thực)
- Đo trên **một khớp, một hướng dời, bias tĩnh** — đúng lát cắt V48 mô hình hoá. Bias thật đa
  dạng hơn (xoay/co giãn theo độ sâu, phụ thuộc tư thế); cơ chế (nhất quán-vật-lý giữa view) tổng
  quát nhưng **con số τ, tỉ số riêng cho cấu hình này**.
- Vẫn là **hình học tổng hợp** (chưa video thật). Bước Cổng 0 còn lại: chạy chính cổng này trên
  keypoint detector thật (RTMPose/ViTPose) 2–3 máy — cần GPU lab. V49 chứng minh **cơ chế tách
  đứng vững** và định lượng nó, đủ để đưa cổng vào giao thức Cổng 0.
"""

    out = Path(__file__).resolve().parent / "ket-qua-phan-biet-lech.md"
    out.write_text(doc, encoding="utf-8")
    print(f"\nĐã ghi {out.name}")


if __name__ == "__main__":
    main()
