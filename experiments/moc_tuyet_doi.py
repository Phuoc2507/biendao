"""V53 — MỐC TUYỆT ĐỐI (tham chiếu ngoài đồng thuận) PHÁ trần V52 tới đâu, cho loại bias nào?

V52 kết luận: chọn-view dựa-đồng-thuận (LOVO) có TRẦN floor((V-1)/2); phá trần cần **tham chiếu
NGOÀI đồng thuận**. Đó mới là LỜI KHẲNG ĐỊNH — V53 ĐO nó, y như V42 đo "thước tuyệt-đối phá trần
nhóm-tương-đối V41". Tham chiếu ngoài hiện thực nhất trong pipeline 2-điện-thoại: **bảng calib
(ChArUco) — vài điểm 3D BIẾT TRƯỚC**. Với mỗi camera, tái chiếu mốc-3D-biết bằng calib của nó rồi
so điểm mốc QUAN SÁT → residual per-camera, KHÔNG cần đồng thuận, KHÔNG có giả định đa-số.

## Câu hỏi sắc hơn "tuyệt đối thắng tương đối": mốc thấy được bias LOẠI NÀO?
Bias ở tầng dựng có HAI nguồn vật lý khác nhau — và mốc tuyệt đối chỉ "thấy" một:
- **Bias TOÀN-CAMERA** (sai calib/extrinsic): mọi khớp VÀ mốc đều dời qua cùng camera-model sai →
  mốc THẤY (residual vọt) → loại được BẤT KỂ bao nhiêu camera bias (không cần đa-số).
- **Bias 1-KHỚP** (detector định vị sai riêng cổ tay: che khuất, lẫn trái-phải): chỉ l_wrist dời,
  mốc (góc bảng) KHÔNG dời → mốc MÙ → chỉ đồng thuận đa-view (LOVO) bắt được, chịu trần V52.

## Giả thuyết (ĐO, không tô số cho khớp)
Mốc phá trần V52 CHỈ cho bias toàn-camera, tới giới hạn CẤU TRÚC (cần ≥2 view sạch để tam giác hoá);
với bias 1-khớp mốc bất lực, LOVO là lối duy nhất (vẫn trần floor((V-1)/2)). ⇒ hai công cụ BÙ nhau
theo NGUỒN lỗi — như robust↔held-out (V50) và nhóm-tương-đối↔tuyệt-đối-nhãn (V41/V42).

Chạy:  .venv/Scripts/python experiments/moc_tuyet_doi.py
Ghi ra experiments/ket-qua-moc-tuyet-doi.md
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
    _bias_dirs, _fuse, _dev3d_cm, _iter_exclude, _calibrate_tau,
    ANGLES, JOINT, BIAS_ORDER, SECONDS, GAUSS_PX, BIAS_MAG, TAU_SAFETY,
    DISTANCE, ELEV, FOV, IMAGE,
)

TRIALS = 12
# Mốc tuyệt đối = 4 góc bảng calib 0.5m×0.4m dựng đứng ngang ngực (BIẾT 3D trước, như ChArUco).
ANCHOR = np.array([[-0.25, 1.0, 0.0], [0.25, 1.0, 0.0],
                   [-0.25, 1.4, 0.0], [0.25, 1.4, 0.0]])


def _make_kp(cams, gt, bias_map, seed, bias_type):
    """Trả (kp khớp, anc mốc). bias_type='camera' dời MỌI khớp+mốc (sai calib);
    'joint' chỉ dời l_wrist, mốc KHÔNG dời (sai detector 1 khớp)."""
    rng = np.random.default_rng(seed)
    T = gt.shape[0]
    clean = np.stack([np.stack([project_points(c, gt[f]) for f in range(T)], 0) for c in cams], 0)
    kp = clean + rng.normal(0, 1, clean.shape) * GAUSS_PX
    anc = np.stack([project_points(c, ANCHOR) for c in cams], 0)          # (V,4,2)
    anc = anc + rng.normal(0, 1, anc.shape) * GAUSS_PX
    for v, (dx, dy) in bias_map.items():
        if bias_type == "camera":
            kp[v, :, :, 0] += dx; kp[v, :, :, 1] += dy
            anc[v, :, 0] += dx;  anc[v, :, 1] += dy
        else:  # joint
            kp[v, :, JOINT, 0] += dx; kp[v, :, JOINT, 1] += dy
    return kp, anc


def _anchor_resid(cams, anc):
    """Residual mốc per-camera = |mốc quan sát − chiếu(3D-biết qua calib camera)|. Tuyệt đối,
    KHÔNG dùng đồng thuận nên KHÔNG có giả định đa-số."""
    out = {}
    for v in range(len(cams)):
        exp = project_points(cams[v], ANCHOR)
        out[v] = float(np.mean(np.linalg.norm(anc[v] - exp, axis=1)))
    return out


def _calibrate_anchor_gate(cams, gt):
    """Cổng mốc = trần residual mốc khi MỌI camera sạch × hệ số an toàn (giống cách V52 lấy τ từ
    sàn-sạch, không phải hằng số phù thuỷ)."""
    hi = 0.0
    seed = 53000
    for _ in range(TRIALS):
        _, anc = _make_kp(cams, gt, {}, seed, "camera"); seed += 1
        hi = max(hi, max(_anchor_resid(cams, anc).values()))
    return hi * TAU_SAFETY


def _identify_anchor(cams, anc, gate):
    return {v for v, r in _anchor_resid(cams, anc).items() if r > gate}


def _run_cell(cams, gt, k, bias_type, tau, gate):
    """Trung bình qua trial: (mốc loại-đúng %, mốc dev3d, LOVO loại-đúng %, LOVO dev3d, oracle dev3d)."""
    seed = 53500 + k * 97 + (0 if bias_type == "camera" else 43)
    a_ex, a_dev, l_ex, l_dev, o_dev = [], [], [], [], []
    for _ in range(TRIALS):
        dirs = _bias_dirs(k, "same"); biased = set(dirs)
        kp, anc = _make_kp(cams, gt, dirs, seed, bias_type); seed += 1
        # Mốc tuyệt đối
        bad = _identify_anchor(cams, anc, gate)
        keep_a = [v for v in range(len(cams)) if v not in bad]
        a_ex.append(1.0 if bad == biased else 0.0)
        a_dev.append(_dev3d_cm(_fuse(cams, kp, keep_a), gt))
        # LOVO bền (V52)
        keep_l, drop_l = _iter_exclude(cams, kp, tau, True)
        l_ex.append(1.0 if set(drop_l) == biased else 0.0)
        l_dev.append(_dev3d_cm(_fuse(cams, kp, keep_l), gt))
        # Oracle: dựng từ tập THẬT sạch
        clean = [v for v in range(len(cams)) if v not in biased]
        o_dev.append(_dev3d_cm(_fuse(cams, kp, clean), gt))
    with np.errstate(invalid="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # k=3: oracle toàn-NaN (giới hạn cấu trúc)
        return (float(np.mean(a_ex)), float(np.nanmean(a_dev)),
                float(np.mean(l_ex)), float(np.nanmean(l_dev)),
                float(np.nanmean(o_dev)))


def _ceiling(results, bias_type, which, KS):
    """k lớn nhất (≥1) mà phương pháp `which`∈{anchor,lovo} loại-đúng ≥90% VÀ dev bám oracle (≤+1cm).
    Trần bị chặn bởi CẤU TRÚC: chỉ xét k mà oracle lập nổi (≥2 view sạch)."""
    ok = []
    for k in KS:
        if k < 1:
            continue
        a_ex, a_dev, l_ex, l_dev, o_dev = results[(bias_type, k)]
        if not np.isfinite(o_dev):       # oracle bất lực → giới hạn cấu trúc, không tính
            continue
        ex, dev = (a_ex, a_dev) if which == "anchor" else (l_ex, l_dev)
        if ex >= 0.90 and abs(dev - o_dev) <= 1.0:
            ok.append(k)
    return max(ok) if ok else 0


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    tau, _ = _calibrate_tau(cams, gt, True)
    gate = _calibrate_anchor_gate(cams, gt)

    print(f"V53 — MỐC tuyệt đối vs LOVO; 4 camera, bias {BIAS_MAG:.0f}px, khớp {JOINT}.")
    print(f"  cổng mốc (trần-sạch ×{TAU_SAFETY}) = {gate:.2f}px ; τ[LOVO-bền] = "
          f"{', '.join(f'{n}v→{tau[n]:.1f}' for n in sorted(tau, reverse=True))}\n")

    KS = (0, 1, 2, 3)
    results = {}
    for bt in ("camera", "joint"):
        label = "TOÀN-CAMERA (sai calib)" if bt == "camera" else "1-KHỚP (sai detector)"
        print(f"[BIAS {label}]  k | mốc:đúng dev | LOVO:đúng dev | oracle")
        for k in KS:
            a_ex, a_dev, l_ex, l_dev, o_dev = _run_cell(cams, gt, k, bt, tau, gate)
            results[(bt, k)] = (a_ex, a_dev, l_ex, l_dev, o_dev)
            note = "  (<2 view sạch: cấu trúc)" if (len(cams) - k) < 2 else ""
            print(f"        {k} | {a_ex*100:4.0f}% {a_dev:6.2f} | {l_ex*100:4.0f}% {l_dev:6.2f} | {o_dev:6.2f}{note}")
        print()

    ceils = {(bt, w): _ceiling(results, bt, w, KS)
             for bt in ("camera", "joint") for w in ("anchor", "lovo")}
    print("TRẦN phá được (loại-đúng & bám-oracle, trong giới hạn cấu trúc ≥2 view sạch):")
    print(f"  BIAS toàn-camera:  mốc k≤{ceils[('camera','anchor')]} | LOVO k≤{ceils[('camera','lovo')]}")
    print(f"  BIAS 1-khớp     :  mốc k≤{ceils[('joint','anchor')]} | LOVO k≤{ceils[('joint','lovo')]}")

    def _tbl(bt):
        out = []
        for k in KS:
            a_ex, a_dev, l_ex, l_dev, o_dev = results[(bt, k)]
            nclean = len(cams) - k
            odev = f"{o_dev:.2f}" if np.isfinite(o_dev) else "—(cấu trúc)"
            flag = "" if nclean >= 2 else " ⚠struct"
            out.append(f"| {k} | {nclean} | {a_ex*100:.0f}% | {a_dev:.2f} | {l_ex*100:.0f}% | {l_dev:.2f} | {odev}{flag} |")
        return "\n".join(out)

    cam1 = results[("camera", 1)]; cam2 = results[("camera", 2)]
    joi1 = results[("joint", 1)]
    ca, la = ceils[("camera", "anchor")], ceils[("camera", "lovo")]
    ja, jl = ceils[("joint", "anchor")], ceils[("joint", "lovo")]

    doc = f"""# V53 — Mốc TUYỆT ĐỐI (tham chiếu ngoài đồng thuận) phá trần V52 tới đâu, cho bias nào?

*Sinh tự động bởi `experiments/moc_tuyet_doi.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V52 chứng minh chọn-view **dựa-đồng-thuận** (LOVO) có TRẦN `floor((V-1)/2)` và kết luận: phá trần
cần **tham chiếu NGOÀI đồng thuận**. Đó là khẳng định — V53 **ĐO** nó (y như V42 đo thước tuyệt-đối
phá trần nhóm-tương-đối V41). Tham chiếu ngoài hiện thực nhất trong pipeline 2-điện-thoại: **bảng
calib** — vài điểm 3D **biết trước**. Với mỗi camera, tái chiếu mốc-3D-biết qua calib của nó rồi so
với mốc **quan sát** → residual per-camera, KHÔNG cần đồng thuận, KHÔNG giả định đa-số.

Cổng mốc lấy từ SỐ LIỆU: trần residual khi mọi camera sạch ×{TAU_SAFETY} = **{gate:.2f}px** (không
phải hằng số phù thuỷ). Bias {BIAS_MAG:.0f}px, hướng SAME (mốc tuyệt-đối vốn bất biến hướng; LOVO-bền
đã chứng minh bất biến hướng ở V52).

## Câu hỏi sắc hơn "tuyệt đối thắng tương đối": mốc THẤY bias loại nào?
Bias tầng dựng có HAI nguồn vật lý — mốc chỉ "thấy" một:
- **Bias TOÀN-CAMERA** (sai calib/extrinsic): mọi khớp **và** mốc dời qua cùng camera-model sai →
  mốc THẤY (residual vọt) → loại được **bất kể** bao nhiêu camera bias.
- **Bias 1-KHỚP** (detector định vị sai riêng cổ tay — che khuất, lẫn trái-phải): chỉ l_wrist dời,
  mốc (góc bảng) KHÔNG dời → mốc **MÙ** → chỉ đồng thuận đa-view (LOVO) bắt được, chịu trần V52.

## Kết quả (số đo được)

### Bias TOÀN-CAMERA (sai calib) — mốc THẤY
| k bias | #view sạch | mốc loại-đúng | mốc dev3d (cm) | LOVO loại-đúng | LOVO dev3d (cm) | oracle (cm) |
|---:|---:|---:|---:|---:|---:|---:|
{_tbl('camera')}

### Bias 1-KHỚP (sai detector) — mốc MÙ
| k bias | #view sạch | mốc loại-đúng | mốc dev3d (cm) | LOVO loại-đúng | LOVO dev3d (cm) | oracle (cm) |
|---:|---:|---:|---:|---:|---:|---:|
{_tbl('joint')}

*⚠struct = chỉ còn 1 view sạch, oracle cũng KHÔNG lập nổi (<2 view để tam giác hoá) = giới hạn CẤU TRÚC.*

## Đọc kết quả — mốc phá trần CHỈ cho bias nó THẤY, tới giới hạn cấu trúc
- **Bias toàn-camera: mốc k≤{ca}, LOVO k≤{la}.** Mốc tuyệt đối PHÁ trần V52 (LOVO k≤{la}): nêu đúng
  **mọi** camera bias không cần đa-số (k=1 dev {cam1[1]:.2f}=oracle {cam1[4]:.2f}; k=2 dev {cam2[1]:.2f}=
  oracle {cam2[4]:.2f}cm — nơi LOVO gãy còn {cam2[3]:.2f}cm). Trần mốc = **giới hạn CẤU TRÚC** (k=3 chỉ
  1 view sạch, oracle cũng bất lực) chứ không phải trần đồng-thuận. Đây là geometric-twin của V42.
- **Bias 1-khớp: mốc k≤{ja} (MÙ), LOVO k≤{jl}.** Mốc BẤT LỰC vì nó tham chiếu điểm KHÁC (góc bảng),
  không thấy lỗi cổ tay (k=1 mốc loại-đúng {joi1[0]*100:.0f}%, dev {joi1[1]:.2f}cm — không cứu được).
  Ở nguồn lỗi này, đồng thuận đa-view (LOVO) là lối DUY NHẤT, và chịu đúng trần V52 floor((V-1)/2).
- **Kết luận BÙ-NHAU (không phải "tuyệt đối luôn thắng"):** tham chiếu ngoài phá trần đồng-thuận
  **chỉ cho nguồn lỗi mà tham chiếu đó THẤY**. Calib-anchor thấy sai-calib (phá trần), mù sai-detector;
  đồng-thuận thấy cả hai nhưng có trần đa-số. Không công cụ nào vượt giới hạn CẤU TRÚC (cần ≥2 view
  sạch). Đây là **cùng motif xuyên đề tài**: robust↔held-out (V50), nhóm-tương-đối↔tuyệt-đối-nhãn
  (V41/V42) — mỗi cặp thước bù nhau theo NGUỒN, và cặp đó khép kín khi CHỌN đúng thước cho đúng nguồn.

## Hệ quả pipeline 2-điện-thoại (thực dụng)
- **Sai calib** (điện thoại xê dịch giữa buổi, extrinsic lệch): dùng **mốc bảng calib** — bắt được kể
  cả khi CẢ HAI máy lệch, miễn còn ≥2 máy đúng để dựng. Rẻ, không cần đa-số.
- **Sai detector 1 khớp** (che khuất, lẫn trái-phải): mốc vô dụng; cần **≥3 máy + đa số sạch** cho LOVO
  (V51/V52), hoặc rơi về nhãn Gate-0. Cấu hình ĐÚNG-2-máy KHÔNG tự chữa nguồn này — ghi nhận trung thực.

## Giới hạn (trung thực)
- Mốc giả định bảng calib VISIBLE & 3D biết trước (đúng với pha calib ChArUco của pipeline); nếu bảng
  chỉ thấy lúc đầu rồi máy xê dịch, residual phản ánh lệch TẠI thời điểm thấy mốc — drift sau đó ngoài
  tầm, cần re-calib. Ghi nhận phụ thuộc.
- Hai loại bias đo RIÊNG; thực tế có thể TRỘN (vừa lệch calib vừa lỗi detector) — khi đó dùng CẢ hai
  thước (mốc rồi LOVO trên phần dư) là hướng hợp lý, chưa đo phối hợp.
- Bias {BIAS_MAG:.0f}px cố định; camera-nào-bias theo `BIAS_ORDER={BIAS_ORDER}` cố định (confound chưa
  quét, như V52). Vẫn hình học tổng hợp; số trên detector/calib thật chờ Gate-0 (GPU lab).
"""

    out = Path(__file__).resolve().parent / "ket-qua-moc-tuyet-doi.md"
    out.write_text(doc, encoding="utf-8")
    print(f"\nĐã ghi {out.name}")


if __name__ == "__main__":
    main()
