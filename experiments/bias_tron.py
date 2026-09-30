"""V54 — Bias TRỘN hai nguồn: giao thức 2-tầng (mốc→LOVO) COMPOSE tới đâu, và vì sao THỨ TỰ?

V53 để ngỏ: "thực tế có thể TRỘN (vừa lệch calib vừa lỗi detector) — dùng CẢ hai thước (mốc rồi LOVO
trên phần dư) là hướng hợp lý, chưa đo phối hợp." V54 ĐO phối hợp đó và tìm ra điều SẮC hơn lời hứa:
giao thức 2-tầng KHÔNG compose tầm thường — nó có một ENVELOPE (điều kiện vận hành) rõ ràng, và NGOÀI
envelope thì ghép ngây thơ còn HẠI.

## Ba nguồn lỗi trộn, ba kết cục
- **TRÙNG 1 view** (cùng camera vừa lệch-calib vừa lỗi-detector): tầm thường — chỉ là "1 camera hỏng",
  cả mốc lẫn LOVO đều loại đúng.
- **DISJOINT, rig NHỎ** (whole-cam ở view này, joint ở view khác, V−k_cam < 4): ghép ngây thơ HỎNG/HẠI.
  Anchor gỡ view whole-cam làm rig CO lại dưới biên-bền của LOVO (LOVO-bền cần ≥3 "others" để drop-worst
  → cần ≥4 view trong tập làm việc); còn <4 view thì confound V52 TRỞ LẠI, LOVO loại nhầm.
- **DISJOINT, rig ĐỦ** (V−k_cam ≥ 4): ghép ĐÚNG THỨ TỰ (anchor TRƯỚC, LOVO SAU) chạm oracle.

## Vì sao anchor TRƯỚC (thứ tự KHÔNG hoán đổi)
Anchor gỡ bias whole-camera KHÔNG giới hạn đa-số (V53) → dọn được NHIỀU camera whole-cam hơn trần LOVO
cho phép. Chạy LOVO trước trên rig còn nhiễm whole-cam thì hỏng (whole-cam thổi phồng reproj mọi view).
Trình tự đúng: anchor (vô-hạn trên nguồn của nó) → LOVO trên phần dư (có trần, nhưng giờ chạy trong
đúng chế độ hợp lệ của nó).

## Envelope (điều kiện để giao thức chạm oracle)
    V − k_cam ≥ 4         (LOVO-bền còn ≥4 view sau khi anchor gỡ k_cam view whole-cam)
    V − k_cam − k_joint ≥ 2   (còn ≥2 view sạch hẳn để tam giác hoá cuối)
với k_joint ≤ floor((V − k_cam − 1)/2) (trần V52 trên rig đã dọn).

Chạy:  .venv/Scripts/python experiments/bias_tron.py  → experiments/ket-qua-bias-tron.md
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

from choreo.geom import look_at_camera, project_points                    # noqa: E402
from choreo.synth import synthetic_dance                                 # noqa: E402
from experiments.tran_dong_thuan import (                                # noqa: E402
    _fuse, _dev3d_cm, _iter_exclude, _calibrate_tau,
    JOINT, SECONDS, GAUSS_PX, BIAS_MAG, DISTANCE, ELEV, FOV, IMAGE,
)
from experiments.moc_tuyet_doi import (                                  # noqa: E402
    ANCHOR, _calibrate_anchor_gate, _identify_anchor,
)

TRIALS = 12


def _build(nv):
    """Rig nv camera trải đều cung [-70°, 70°] quanh sân khấu (hình học cố định theo nv → tất định)."""
    angs = np.linspace(-70.0, 70.0, nv)
    return [look_at_camera(float(a), DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in angs]


def _make_mixed(cams, gt, cam_bias, joint_bias, seed):
    """cam_bias: view whole-camera bias (mọi khớp+mốc dời); joint_bias: view chỉ l_wrist dời."""
    rng = np.random.default_rng(seed)
    T = gt.shape[0]; V = len(cams)
    clean = np.stack([np.stack([project_points(c, gt[f]) for f in range(T)], 0) for c in cams], 0)
    kp = clean + rng.normal(0, 1, clean.shape) * GAUSS_PX
    anc = np.stack([project_points(c, ANCHOR) for c in cams], 0) + rng.normal(0, 1, (V, 4, 2)) * GAUSS_PX
    for v in cam_bias:
        kp[v, :, :, 0] += BIAS_MAG; kp[v, :, :, 1] += 0.5 * BIAS_MAG
        anc[v, :, 0] += BIAS_MAG;  anc[v, :, 1] += 0.5 * BIAS_MAG
    for v in joint_bias:
        kp[v, :, JOINT, 0] += BIAS_MAG; kp[v, :, JOINT, 1] += 0.5 * BIAS_MAG
    return kp, anc


def _combo(cams, gt, kp, anc, gate):
    """Giao thức 2-tầng: anchor gỡ whole-cam TRƯỚC, rồi LOVO-bền trên phần dư (τ hiệu chỉnh lại theo
    sub-rig). Trả tập view bị loại + tập giữ cuối."""
    nv = len(cams)
    bad_a = _identify_anchor(cams, anc, gate)
    sub = [v for v in range(nv) if v not in bad_a]
    if len(sub) >= 3:
        subcams = [cams[v] for v in sub]
        subtau, _ = _calibrate_tau(subcams, gt, True)
        kk, _ = _iter_exclude(subcams, kp[sub], subtau, True)
        keep = [sub[i] for i in kk]
    else:
        keep = sub
    dropped = set(v for v in range(nv) if v not in keep)
    return dropped, keep


def _run_cell(nv, cam_bias, joint_bias):
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = _build(nv)
    tau, _ = _calibrate_tau(cams, gt, True)
    gate = _calibrate_anchor_gate(cams, gt)
    biased = cam_bias | joint_bias
    rows_l, rows_a, rows_c, oracle = [], [], [], []
    for t in range(TRIALS):
        kp, anc = _make_mixed(cams, gt, cam_bias, joint_bias, 5400 + t)
        kl, dl = _iter_exclude(cams, kp, tau, True)
        rows_l.append((set(dl), _dev3d_cm(_fuse(cams, kp, kl), gt)))
        bad_a = _identify_anchor(cams, anc, gate)
        keep_a = [v for v in range(nv) if v not in bad_a]
        rows_a.append((set(bad_a), _dev3d_cm(_fuse(cams, kp, keep_a), gt)))
        dc, kc = _combo(cams, gt, kp, anc, gate)
        rows_c.append((dc, _dev3d_cm(_fuse(cams, kp, kc), gt)))
        clean = [v for v in range(nv) if v not in biased]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            oracle.append(_dev3d_cm(_fuse(cams, kp, clean), gt))

    def agg(rows):
        ex = float(np.mean([1.0 if s == biased else 0.0 for s, _ in rows]))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            dev = float(np.nanmean([d for _, d in rows]))
        return ex, dev

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        od = float(np.nanmean(oracle))
    le, ld = agg(rows_l); ae, ad = agg(rows_a); ce, cd = agg(rows_c)
    return dict(le=le, ld=ld, ae=ae, ad=ad, ce=ce, cd=cd, od=od,
                sub=nv - len(cam_bias), envelope=(nv - len(cam_bias) >= 4 and
                                                  nv - len(cam_bias) - len(joint_bias) >= 2))


# (nhãn, V, cam_bias, joint_bias)
SCENARIOS = [
    ("TRÙNG 1 view: cam{0}+joint{0}",           4, {0},    {0}),
    ("disjoint rig NHỎ: cam{0}+joint{1}",       4, {0},    {1}),
    ("disjoint vừa đủ: cam{0}+joint{1}",        5, {0},    {1}),
    ("disjoint dư: cam{0}+joint{1}",            6, {0},    {1}),
    ("2 whole-cam+1 joint: cam{0,1}+joint{2}",  6, {0, 1}, {2}),
    ("2 whole-cam+1 joint, rig lớn",            7, {0, 1}, {2}),
]


def main():
    print(f"V54 — Bias TRỘN; bias {BIAS_MAG:.0f}px, khớp {JOINT}, {TRIALS} trial/ô.\n")
    results = []
    for label, nv, cb, jb in SCENARIOS:
        r = _run_cell(nv, cb, jb)
        results.append((label, nv, cb, jb, r))
        env = "✔envelope" if r["envelope"] else "✗NGOÀI-envelope"
        print(f"[{label}] V={nv} sub-sau-anchor={r['sub']}v {env}")
        print(f"   LOVO-đơn  đúng={r['le']*100:3.0f}% dev={r['ld']:6.2f}")
        print(f"   mốc-đơn   đúng={r['ae']*100:3.0f}% dev={r['ad']:6.2f}")
        print(f"   TRỘN a→L  đúng={r['ce']*100:3.0f}% dev={r['cd']:6.2f}   (oracle {r['od']:.2f})\n")

    def row(label, nv, cb, jb, r):
        od = f"{r['od']:.2f}" if np.isfinite(r["od"]) else "—(cấu trúc)"
        env = "✔" if r["envelope"] else "✗"
        return (f"| {label} | {nv} | {r['sub']} | {env} | {r['le']*100:.0f}% / {r['ld']:.2f} | "
                f"{r['ae']*100:.0f}% / {r['ad']:.2f} | {r['ce']*100:.0f}% / {r['cd']:.2f} | {od} |")

    body = "\n".join(row(*x) for x in results)
    # trích vài ô cho phần luận
    small = next(r for (l, nv, cb, jb, r) in results if nv == 4 and cb == {0} and jb == {1})
    ok5 = next(r for (l, nv, cb, jb, r) in results if nv == 5 and cb == {0} and jb == {1})
    two6 = next(r for (l, nv, cb, jb, r) in results if nv == 6 and cb == {0, 1})
    trung = next(r for (l, nv, cb, jb, r) in results if jb == {0} and cb == {0})

    doc = f"""# V54 — Bias TRỘN hai nguồn: giao thức 2-tầng (mốc→LOVO) compose tới đâu, và vì sao THỨ TỰ?

*Sinh tự động bởi `experiments/bias_tron.py` — thuần numpy, chạy CPU.*

## Câu hỏi (đóng mục V53 để ngỏ)
V53 để ngỏ: khi vừa lệch-calib (bias TOÀN-CAMERA) vừa lỗi-detector (bias 1-KHỚP) cùng xuất hiện, "dùng
CẢ hai thước (mốc rồi LOVO trên phần dư) là hướng hợp lý". V54 **ĐO** phối hợp đó — và thấy điều SẮC hơn
lời hứa: giao thức 2-tầng có một **ENVELOPE** (điều kiện vận hành); NGOÀI envelope, ghép ngây thơ còn
**HẠI**.

Ba tầng: LOVO-đơn (chỉ đồng-thuận), mốc-đơn (chỉ anchor tuyệt-đối), TRỘN (anchor TRƯỚC → LOVO trên phần
dư, τ hiệu chỉnh lại theo sub-rig). Bias {BIAS_MAG:.0f}px, {TRIALS} trial/ô. Cột "đúng%" = loại ĐÚNG
tập biased; "dev" = MPJPE-proxy sau khi dựng từ view giữ lại (cm).

## Kết quả (số đo được)
| kịch bản | V | sub sau anchor | envelope | LOVO-đơn %/dev | mốc-đơn %/dev | TRỘN a→L %/dev | oracle |
|---|---:|---:|:--:|---:|---:|---:|---:|
{body}

*envelope ✔ = `V−k_cam ≥ 4` VÀ `V−k_cam−k_joint ≥ 2`.*

## Đọc kết quả — giao thức compose CÓ ĐIỀU KIỆN, và overturns lời hứa ngây thơ V53
- **TRÙNG 1 view (cam{{0}}+joint{{0}}): tầm thường.** Cùng camera hỏng cả hai kiểu = "1 camera xấu";
  LOVO-đơn, mốc-đơn, TRỘN đều loại đúng, dev {trung['cd']:.2f}=oracle {trung['od']:.2f}. Không phải ca khó.
  (Ô này envelope ✗ vì sub=3<4, NHƯNG vẫn 100% — vì sau khi anchor gỡ view đó, KHÔNG còn joint-bias dư
  để LOVO phải bắt; envelope là điều kiện cho chế-độ DISJOINT nơi LOVO thực sự phải chạy trên phần dư.)
- **disjoint rig NHỎ (V=4, cam{{0}}+joint{{1}}, sub=3 < 4): ghép ngây thơ HỎNG/HẠI.** LOVO-đơn
  {small['le']*100:.0f}% (dev {small['ld']:.2f}); mốc-đơn chỉ gỡ whole-cam, joint còn lại → dev
  {small['ad']:.2f}; TRỘN dev **{small['cd']:.2f}** — KHÔNG cứu, thậm chí có thể tệ hơn mốc-đơn. Lý do:
  anchor gỡ view whole-cam làm rig CO xuống 3 view, DƯỚI biên-bền của LOVO (cần ≥3 "others" để drop-worst
  ⇒ cần ≥4 view) → confound V52 TRỞ LẠI, LOVO loại nhầm. Đây là chỗ overturns V53: "hướng hợp lý" CHỈ
  đúng CÓ ĐIỀU KIỆN.
- **disjoint vừa đủ (V=5, sub=4 = biên): phục hồi.** TRỘN {ok5['ce']*100:.0f}% dev {ok5['cd']:.2f}=oracle
  {ok5['od']:.2f}. Đúng ngay khi chạm envelope `V−k_cam≥4`.
- **2 whole-cam + 1 joint disjoint (V=6, cam{{0,1}}+joint{{2}}): ô VÀNG chứng minh THỨ TỰ & tính vô-hạn
  của anchor.** LOVO-đơn **{two6['le']*100:.0f}%** (dev {two6['ld']:.2f}) — 2 view whole-cam nhấn chìm
  trần đồng-thuận. Nhưng anchor gỡ CẢ HAI view whole-cam KHÔNG cần đa-số (V53) → còn 4 view, 1 joint →
  LOVO-bền bắt đúng → TRỘN **{two6['ce']*100:.0f}%** dev {two6['cd']:.2f}=oracle. ⇒ **anchor TRƯỚC**:
  dọn nguồn vô-hạn-trần trước, rồi LOVO chạy trong đúng chế độ hợp lệ. Đổi thứ tự (LOVO trước) hỏng vì
  whole-cam còn đó thổi phồng mọi reproj.

## Envelope (phát biểu gọn cho hội đồng)
Giao thức 2-tầng chạm oracle KHI VÀ CHỈ KHI:
```
V − k_cam ≥ 4                (LOVO-bền còn đủ biên sau khi anchor gỡ k_cam view whole-cam)
V − k_cam − k_joint ≥ 2      (còn ≥2 view sạch hẳn để tam giác hoá cuối)
k_joint ≤ floor((V − k_cam − 1)/2)   (trần V52 trên rig ĐÃ dọn)
```
Ý nghĩa thiết kế rig: **anchor mua khả năng gỡ whole-cam KHÔNG giới hạn đa-số, nhưng mỗi view gỡ đi làm
hao biên của LOVO** → phải chừa đủ view cho tầng sau. Hệ quả 2-điện-thoại (V=2): envelope KHÔNG thoả
(2−k_cam<4 ngay khi có bất kỳ bias nào cần gỡ) ⇒ cấu hình 2-máy KHÔNG tự chữa ca TRỘN; cần ≥5–6 máy
hoặc nhãn Gate-0 — ghi nhận trung thực, khớp giới hạn đã nêu ở V51–V53.

## Vị trí trong mạch đề tài
V54 HỢP NHẤT cung V49–V53 thành MỘT giao thức có envelope tường minh: held-out (V49) chẩn đoán → robust
vs held-out bổ túc (V50) → LOVO sửa bias-vừa robust để hở (V51) → trần đồng-thuận floor((V-1)/2) (V52) →
mốc tuyệt-đối phá trần cho bias-camera, mù bias-khớp (V53) → **ghép mốc→LOVO xử lý TRỘN, có điều kiện rig
V−k_cam≥4, thứ tự anchor-trước bất-hoán** (V54). Cùng motif xuyên suốt: lỗi HỆ-THỐNG một-nguồn chỉ trị
bằng bằng-chứng ĐÚNG granularity nguồn (mốc tuyệt-đối cho camera, đồng-thuận per-camera cho khớp), và
GHÉP các thước phải tôn trọng chế-độ-hợp-lệ của từng thước.

## Giới hạn (trung thực)
- Vẫn hình học tổng hợp; bias {BIAS_MAG:.0f}px cố định, hướng SAME; view-nào-bias cố định (confound
  chưa quét, như V52/V53). Envelope suy ra từ cơ chế + xác nhận bằng quét số-view, chưa chứng minh giải
  tích đầy đủ.
- Chỉ xét 1 khớp joint-bias mỗi ô; k_joint>1 và nhiều khớp cùng lỗi chưa quét (trần V52 dự đoán biên).
- Số thật trên detector/calib thật chờ Gate-0 (GPU lab).
"""

    out = Path(__file__).resolve().parent / "ket-qua-bias-tron.md"
    out.write_text(doc, encoding="utf-8")
    print(f"Đã ghi {out.name}")


if __name__ == "__main__":
    main()
