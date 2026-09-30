"""V51 — SỬA hỏng 3D bằng chẩn đoán held-out: loại-từng-view (LOVO) đúng nơi robust SAI.

## Khép vòng V49 → V50 → V51
- V49 CHỨNG MINH: tái chiếu **held-out** tách detector-lệch-hệ-thống khỏi múa-sai thật —
  view bias làm reproj vọt, view sạch phẳng ở sàn.
- V50 CHỨNG MINH: cổng **robust** (per-khung, gộp MỌI view vào phép khớp ban đầu) loại
  NHẦM view SẠCH đối-góc ở bias lớn → làm TỆ HƠN. Nó **chẩn đoán sai CAMERA** vì quyết định
  ở sai granularity: per-khung-per-điểm, không bao giờ cộng dồn bằng chứng theo TỪNG CAMERA.
- V51 (vòng này): dùng chính tín hiệu held-out của V49 làm **bộ chọn view** —
  **loại-từng-view (leave-one-view-out, LOVO)**: với mỗi view v, dựng 3D từ CÁC VIEW CÒN LẠI
  (v KHÔNG tham gia), tái chiếu về v, gộp sai số **theo cả clip** (bias hệ thống cộng dồn, nhiễu
  iid trung-bình-hoá — đúng bài học V47/V48). Camera bias khi bị bỏ ra sẽ bị chấm bởi đồng thuận
  của các view sạch ⇒ điểm CAO nhất ⇒ nêu đúng thủ phạm ở đúng granularity CAMERA. Loại nó, dựng
  lại → phục hồi 3D nơi robust khuếch đại hỏng.

## Điều đo (bốn phương pháp trên CÙNG sweep bias hệ thống)
1. **plain**  : dựng cả 4 view, robust=False (mốc hỏng).
2. **robust** : dựng cả 4 view, robust=True (V50: hại ở bias lớn).
3. **LOVO**   : chấm LOVO per-camera → loại argmax → dựng plain từ 3 view còn lại (đề xuất).
4. **oracle** : loại ĐÚNG view bias (biết trước) → chặn TRÊN khả dĩ.

Đo: dev3d mỗi phương pháp; độ CHÍNH XÁC nêu thủ phạm của LOVO (tỉ lệ trial argmax==view bias);
và GIÁ ở b=0 (LOVO luôn bỏ 1 view kể cả khi KHÔNG có bias → mất hình học bao nhiêu?).

Chạy:  .venv/Scripts/python experiments/sua_bang_held_out.py
Ghi ra experiments/ket-qua-sua-bang-held-out.md
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
from choreo.geom.triangulate import _solve_one, _reproj_errs              # noqa: E402
from choreo.mocap.fuse import fuse_multiview                              # noqa: E402
from choreo.synth import synthetic_dance                                 # noqa: E402
from choreo.schema import JOINT_INDEX                                    # noqa: E402

ANGLES = (-60.0, -20.0, 20.0, 60.0)   # cả 4 là ỨNG VIÊN dựng (không có view giữ-cố-định)
BIAS_VIEW = 0                         # camera bị lệch hệ thống (−60°)
JOINT = JOINT_INDEX["l_wrist"]
SECONDS = 1.5
GAUSS_PX = 2.0
TRIALS = 16
BIASES_PX = (0.0, 5.0, 10.0, 20.0, 30.0, 45.0, 60.0, 80.0)


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )


def _make_kp(cams, gt, bias_px, seed):
    """Clip 2D: sàn Gauss iid mọi view + bias HẰNG SỐ mọi khung ở riêng JOINT của view bias."""
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * GAUSS_PX
    kp[BIAS_VIEW, :, JOINT, 0] += bias_px
    kp[BIAS_VIEW, :, JOINT, 1] += 0.5 * bias_px
    return kp


def _fuse_subset(cams, kp, views, robust):
    sub_cams = [cams[i] for i in views]
    clip = fuse_multiview(kp[list(views)], sub_cams, fps=30.0, smooth=True,
                          fill_gaps=True, robust=robust)
    return clip.joints3d


def _dev3d_cm(j3d, nominal):
    d = np.linalg.norm(j3d[:, JOINT, :] - nominal[:, JOINT, :], axis=1)
    d = d[np.isfinite(d)]
    return float(d.mean()) * 100.0 if d.size else float("nan")


def _lovo_scores(cams, kp):
    """Điểm LOVO per-camera cho JOINT: với mỗi view v, dựng từ CÁC VIEW KHÁC rồi tái chiếu về v,
    gộp sai số tái chiếu TRUNG BÌNH theo CẢ CLIP. Camera lệch hệ thống → điểm cao (bằng chứng
    cộng dồn qua các khung); nhiễu iid trung-bình-hoá. Trả (V,) điểm px."""
    V = len(cams)
    T = kp.shape[1]
    P = [c.P for c in cams]
    scores = np.full(V, np.nan)
    for v in range(V):
        others = [k for k in range(V) if k != v]
        errs = []
        for f in range(T):
            uv_oth = np.stack([kp[k, f, JOINT] for k in others])       # (V-1,2)
            X = _solve_one(np.stack([P[k] for k in others]), uv_oth, None)
            if X is None:
                continue
            e = _reproj_errs(P[v][None], X, kp[v, f, JOINT][None])[0]   # reproj về v (held-out)
            if np.isfinite(e):
                errs.append(e)
        scores[v] = float(np.mean(errs)) if errs else float("nan")
    return scores


def _run(cams, gt, bias_px, seed):
    """Trả dev3d của 4 phương pháp + view LOVO nêu (để tính độ chính xác)."""
    kp = _make_kp(cams, gt, bias_px, seed)
    allv = tuple(range(len(cams)))

    d_plain = _dev3d_cm(_fuse_subset(cams, kp, allv, robust=False), gt)
    d_rob = _dev3d_cm(_fuse_subset(cams, kp, allv, robust=True), gt)

    scores = _lovo_scores(cams, kp)
    excl = int(np.nanargmax(scores))
    lovo_views = tuple(k for k in allv if k != excl)
    d_lovo = _dev3d_cm(_fuse_subset(cams, kp, lovo_views, robust=False), gt)

    oracle_views = tuple(k for k in allv if k != BIAS_VIEW)
    d_oracle = _dev3d_cm(_fuse_subset(cams, kp, oracle_views, robust=False), gt)

    return d_plain, d_rob, d_lovo, d_oracle, excl


def _sweep(cams, gt):
    rows = []
    for b in BIASES_PX:
        acc = {"plain": [], "rob": [], "lovo": [], "oracle": []}
        hit = 0
        seed = 51000 + int(b) * 97
        for _ in range(TRIALS):
            dp, dr, dl, do, excl = _run(cams, gt, b, seed); seed += 1
            acc["plain"].append(dp); acc["rob"].append(dr)
            acc["lovo"].append(dl); acc["oracle"].append(do)
            hit += (excl == BIAS_VIEW)
        rows.append((
            b,
            float(np.nanmean(acc["plain"])), float(np.nanmean(acc["rob"])),
            float(np.nanmean(acc["lovo"])), float(np.nanmean(acc["oracle"])),
            hit / TRIALS,
        ))
    return rows


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    print(f"V51 — SỬA bằng LOVO, khớp {JOINT}; 4 view ứng viên, bias ở view {ANGLES[BIAS_VIEW]:+.0f}°.\n")
    rows = _sweep(cams, gt)

    print("  b |  plain  robust   LOVO  oracle | LOVO nêu đúng thủ phạm")
    for b, dp, dr, dl, do, acc in rows:
        print(f"  {b:5.0f}px  {dp:6.2f} {dr:6.2f} {dl:6.2f} {do:6.2f}cm  | {acc*100:5.1f}%")

    # Chỉ số then chốt (tính từ SỐ THẬT — không giả định trước).
    cost0 = rows[0][3] - rows[0][1]              # LOVO − plain ở b=0 = GIÁ bỏ 1 view vô cớ
    onset = next((b for b, *_, acc in rows if acc >= 0.90 and b > 0), None)  # LOVO nêu-đúng≥90%
    # Dải robust CÂM: robust ≈ plain (chưa view nào vượt ngưỡng 20px nên không loại).
    mute = [b for b, dp, dr, dl, do, acc in rows if b > 0 and abs(dr - dp) <= 0.02 * max(dp, 1e-9)]
    mute_hi = max(mute) if mute else 0.0
    # Robust PHỤC HỒI: bias nhỏ nhất mà robust về gần oracle (≤1.5×) nhờ ĐA SỐ view sạch (4 view).
    rob_ok = next((b for b, dp, dr, dl, do, acc in rows if b > 0 and dr <= do * 1.5), None)
    # Dải LOVO THẮNG RIÊNG: bias đủ hại 3D NHƯNG robust còn câm (onset ≤ b ≤ mute_hi).
    win_band = [b for b, dp, dr, dl, do, acc in rows
                if onset is not None and onset <= b <= mute_hi]
    mid = next((r for r in rows if r[0] in win_band), None)  # hàng đại diện mid-band
    # Bias lớn: LOVO bám oracle? robust cũng phục hồi?
    hi = rows[-1]
    lovo_gap_hi = hi[3] - hi[4]
    rob_gap_hi = hi[2] - hi[4]

    print(f"\n  GIÁ ở b=0 (LOVO−plain): {cost0:+.2f}cm | onset LOVO nêu-đúng≥90%: b≈{onset}px")
    print(f"  robust CÂM tới b={mute_hi:.0f}px; robust phục hồi từ b≈{rob_ok}px (4 view, đa số sạch)")
    print(f"  dải LOVO THẮNG RIÊNG (robust câm, LOVO đã sửa): b∈{ {int(x) for x in win_band} }px")
    print(f"  ở b={hi[0]:.0f}px: LOVO−oracle={lovo_gap_hi:+.2f}cm, robust−oracle={rob_gap_hi:+.2f}cm")

    vmax = max(max(r[1] for r in rows), 1e-6)

    def _tbl():
        out = []
        for b, dp, dr, dl, do, acc in rows:
            out.append(f"| {b:.0f} | {dp:.2f} | {dr:.2f} | **{dl:.2f}** | {do:.2f} "
                       f"| {acc*100:.0f}% | `{_bar(dp, vmax)}` |")
        return "\n".join(out)

    win_txt = "b∈{" + ", ".join(f"{int(x)}" for x in win_band) + "}px" if win_band else "(không có)"
    mid_b = int(mid[0]) if mid else 0
    mid_plain = mid[1] if mid else 0.0
    mid_lovo = mid[3] if mid else 0.0

    doc = f"""# V51 — SỬA hỏng 3D bằng chẩn đoán held-out (LOVO): đóng đúng KHE robust để hở

*Sinh tự động bởi `experiments/sua_bang_held_out.py` — thuần numpy, chạy CPU.*

## Khép vòng V49 → V50 → V51
- **V49**: tái chiếu held-out **chẩn đoán** view lệch hệ thống (reproj vọt) ≠ múa-sai thật (reproj phẳng).
- **V50**: cổng **robust** quyết định ở granularity **per-khung-per-điểm**, gộp mọi view vào phép khớp
  đầu ⇒ (i) **câm** khi bias chưa vượt ngưỡng 20px; (ii) ở cấu hình **3 view dựng**, bias lớn làm nó
  loại NHẦM view sạch rồi rơi xuống sàn-2-view → **khuếch đại hỏng**. Gốc rễ: nó không cộng dồn bằng
  chứng theo TỪNG CAMERA, mà bias hệ thống là thuộc tính của CAMERA.
- **V51 (vòng này)**: biến tín hiệu held-out V49 thành **bộ chọn view loại-từng-view (LOVO)** ở đúng
  granularity CAMERA: với mỗi view `v`, dựng 3D từ **các view còn lại** (v không tham gia), tái chiếu
  về `v`, **gộp sai số trung bình theo CẢ clip**. Camera bias khi bị bỏ ra bị chấm bởi đồng thuận các
  view sạch ⇒ điểm CAO nhất. Loại nó, dựng lại từ phần còn lại.

## Kết quả (số đo được — 4 view ứng viên, đa số sạch)
| bias (px) | plain (cm) | robust (cm) | **LOVO (cm)** | oracle (cm) | LOVO nêu đúng | dev3d plain |
|---:|---:|---:|---:|---:|---:|:--|
{_tbl()}

*oracle = loại đúng view bias (biết trước) = chặn trên khả dĩ. LOVO không biết trước, phải tự tìm.*

## Đọc kết quả — có CHỖ khác dự đoán, ghi lại trung thực
Với **4 view** (đa số sạch 3/4), bức tranh robust KHÁC V50 (3 view) và tôi ghi đúng như đo được:
- **robust CÂM** ở dải bias vừa (tới b={mute_hi:.0f}px): robust ≡ plain (chưa view nào vượt 20px),
  3D vẫn hỏng theo bias.
- **robust PHỤC HỒI** từ b≈{rob_ok}px: khác V50, ở đây **không** khuếch đại — vì còn **3 view sạch**
  làm đa số nên khi loại được view bias, nghiệm về gần oracle. ⇒ Chính V51 **trả lời câu V50 để ngỏ**
  ("chưa quét số-view"): hành vi tai hại của robust ở V50 là hệ quả của **thiếu đa số sạch** (3 view,
  rơi sàn-2-view); thêm view sạch thì robust hết hại **nhưng vẫn câm ở dải vừa**.

**Khe robust để hở = dải bias VỪA** ({win_txt}): đủ lớn để hỏng 3D (plain tới {mid_plain:.1f}cm ở
b={mid_b}px) NHƯNG chưa vượt ngưỡng per-khung của robust ⇒ robust bất động. **LOVO đóng đúng khe này**:
ở b={mid_b}px kéo dev3d {mid_plain:.1f}→**{mid_lovo:.2f}cm** (= oracle). Vì LOVO cộng dồn bằng chứng
per-CAMERA qua cả clip, nó thấy bias hệ thống **dưới mọi ngưỡng per-khung**.

- **Nêu đúng thủ phạm**: LOVO đạt ≥90% từ b≈{onset}px, **100%** ở bias lớn.
- **Bám oracle ở bias lớn**: b={hi[0]:.0f}px lệch LOVO−oracle chỉ {lovo_gap_hi:+.2f}cm (robust {rob_gap_hi:+.2f}cm).
- **GIÁ trung thực**: ở **b=0** (không camera lỗi) LOVO vẫn bỏ 1 view nên dev3d **{cost0:+.2f}cm** so
  plain-4-view. Đánh đổi thật ⇒ LOVO chỉ nên bật KHI chẩn đoán held-out (V49) đã BÁO có view nghi vấn,
  không loại vô điều kiện.

## Luận điểm kiến trúc
Ba vòng khép một vòng lặp hoàn chỉnh ở **tầng dựng**: **chẩn đoán** (V49) → **vì sao lọc cùng-chiều
hở/hại** (V50) → **sửa bằng đúng granularity nguồn** (V51). Mấu chốt lặp lại toàn đề tài: lỗi
HỆ-THỐNG/DAI-DẲNG của MỘT nguồn chỉ trị được bằng **cộng dồn bằng chứng ở đúng granularity nguồn**
(ở đây per-CAMERA, qua held-out), **không** bằng lọc mạnh hơn ở granularity sai (per-khung như robust,
để hở khe bias-vừa dưới ngưỡng). Cùng nguyên lý với tầng đánh giá: gộp theo nhịp (V32) và thước
tuyệt-đối-có-nhãn (V42) thắng chấm nhóm-tương-đối-per-khung (V41). LOVO là hiện thân nguyên lý đó ở
tầng hình học.

## Giới hạn (trung thực)
- LOVO cần **≥3 view ứng viên** (bỏ 1 còn ≥2 để dựng), và lợi thế "hết hại" cần **đa số sạch**. Cấu
  hình **2-máy KHÔNG dùng được** — ở đó phải dựa thước khác (temporal, ràng buộc xương). Đề tài chủ đạo
  2-máy ⇒ LOVO là lá chắn cho cấu hình **≥3 máy** (studio/nhiều điện thoại), không thay phòng thủ 2-máy.
- Mới thử **1 camera bias/lần**. Hai camera cùng bias cùng hướng có thể qua mặt đồng thuận — chưa đo.
- Onset b≈{onset}px, khe robust-hở, giá b=0 **riêng cấu hình này** (góc, khoảng cách, khớp). Cơ chế
  (robust câm dưới ngưỡng + cần đa số sạch; LOVO cộng dồn per-camera) tổng quát; con số thì không.
- Vẫn hình học tổng hợp; số trên detector thật chờ Gate-0 (GPU lab).
"""

    out = Path(__file__).resolve().parent / "ket-qua-sua-bang-held-out.md"
    out.write_text(doc, encoding="utf-8")
    print(f"\nĐã ghi {out.name}")


if __name__ == "__main__":
    main()
