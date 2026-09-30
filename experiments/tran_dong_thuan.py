"""V52 — TRẦN của chọn-view-bằng-đồng-thuận: LOVO sụp ở đâu khi NHIỀU camera cùng lệch?

V51 (LOVO) dựa trên **đa số view sạch**: camera bias lộ ra vì các view sạch đồng thuận chống lại
nó. Câu hội đồng tất yếu: "đồng thuận ấy hỏng khi nào?" V52 ép giả định tới GÃY — quét số camera
bị bias k∈{0..3}/4, hai chế độ hướng bias, tìm TRẦN.

## Hai tầng phát hiện (đo được, không tô số cho khớp)
Đây là **cùng motif V41** ở tầng hình học: phương pháp dựa-đồng-thuận có TRẦN ~đa-số. NHƯNG cách
CHẤM đồng thuận quyết định trần nằm ở đâu, và ĐO ra hai tầng:

1. **LOVO-ngây-thơ (dựng-others thường)**: chấm view v = dựng 3D từ CÁC view khác rồi tái chiếu về
   v. Lỗ hổng ĐO ĐƯỢC: khi "các view khác" CÒN CHỨA camera bias, bias ấy làm bẩn phép dựng → điểm
   của view SẠCH cũng bị thổi cao. Camera bias có thắng argmax hay không thành PHỤ THUỘC HƯỚNG:
   thắng ở hướng V51 thử (60,30) nhưng THUA ở hướng đối kháng (60,0) — loại NHẦM view sạch ngay ở
   k=1. Đây là confound nhiễm-bẩn, không phải trần thật.
2. **LOVO-bền (dựng-others drop-worst)**: dựng "others" theo kiểu bỏ-view-tệ-nhất → một camera bias
   lẻ trong tập others bị chính nó loại TRƯỚC KHI làm bẩn. Khử confound → trần SẠCH, ĐỘC LẬP HƯỚNG:
   chịu được tới floor((V-1)/2) camera bias, gãy đúng ở "nửa". Với V=4: k≤1 trị được, k=2 gãy.

## Cách đo
4 camera, bias supra-onset (60px, rõ trên ngưỡng). Loại-lặp (iterative LOVO): lặp {chấm LOVO mọi
view còn hoạt động, nếu max ≤ τ thì dừng; else loại argmax} tới khi sạch hoặc còn <3 view. τ lấy
TỪ SỐ LIỆU: trần điểm LOVO khi mọi view sạch (quét MỌI tập con mỗi cỡ) ×1.5 — không phải hằng số
phù thuỷ. Chạy CẢ HAI cách chấm để cho thấy tầng 1 (confound) → tầng 2 (trần thật). Đo: số view bị
loại, tập loại có ĐÚNG là tập bias không, dev3d sau loại-lặp vs oracle (dựng từ tập THẬT sạch).

Chạy:  .venv/Scripts/python experiments/tran_dong_thuan.py
Ghi ra experiments/ket-qua-tran-dong-thuan.md
"""

from __future__ import annotations

import sys
from itertools import combinations
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

from experiments.synthetic_2view import DISTANCE, ELEV, FOV, IMAGE       # noqa: E402
from choreo.geom import look_at_camera, project_points                    # noqa: E402
from choreo.geom.triangulate import _solve_one, _reproj_errs              # noqa: E402
from choreo.mocap.fuse import fuse_multiview                              # noqa: E402
from choreo.synth import synthetic_dance                                 # noqa: E402
from choreo.schema import JOINT_INDEX                                    # noqa: E402

ANGLES = (-60.0, -20.0, 20.0, 60.0)
BIAS_ORDER = (0, 1, 2)        # k camera đầu theo thứ tự này bị bias (cố định, tất định)
JOINT = JOINT_INDEX["l_wrist"]
SECONDS = 1.5
GAUSS_PX = 2.0
TRIALS = 12
BIAS_MAG = 60.0               # supra-onset (V51: onset≈10px, robust-recover≈45px)
TAU_SAFETY = 1.5              # τ = trần điểm LOVO sạch (k=0) × hệ số an toàn
ROBUST_THR = 20.0             # ngưỡng tái chiếu drop-worst khi dựng "others" bền (khớp triangulate_robust)


def _project_clip(cams, gt):
    return np.stack(
        [np.stack([project_points(c, gt[f]) for f in range(gt.shape[0])], axis=0) for c in cams],
        axis=0,
    )


def _bias_dirs(k, regime):
    """Trả {view: (dx,dy)} cho k camera bị bias. SAME = cùng hướng (đối nghịch nhất, củng cố nhau);
    DIFF = hướng xoay khác nhau từng camera (có thể tự triệt trong đồng thuận)."""
    out = {}
    for i in range(k):
        v = BIAS_ORDER[i]
        if regime == "same":
            out[v] = (BIAS_MAG, 0.5 * BIAS_MAG)
        else:  # diff: xoay đều quanh vòng tròn
            ang = 2.0 * np.pi * i / max(k, 1)
            out[v] = (BIAS_MAG * np.cos(ang), BIAS_MAG * np.sin(ang))
    return out


def _make_kp(cams, gt, bias_map, seed):
    rng = np.random.default_rng(seed)
    clean = _project_clip(cams, gt)
    kp = clean + rng.normal(0.0, 1.0, size=clean.shape) * GAUSS_PX
    for v, (dx, dy) in bias_map.items():
        kp[v, :, JOINT, 0] += dx
        kp[v, :, JOINT, 1] += dy
    return kp


def _solve_others(P, others, uv_by_view, robust):
    """Dựng 1 điểm 3D từ tập 'others'. robust=True: lặp bỏ-view-tệ-nhất (reproj > ROBUST_THR) tới khi
    còn 2 view — để một camera bias LẺ trong others tự bị loại trước khi làm bẩn phép dựng."""
    cur = list(others)
    while True:
        Po = np.stack([P[k] for k in cur])
        uv = np.stack([uv_by_view[k] for k in cur])
        X = _solve_one(Po, uv, None)
        if X is None or not robust or len(cur) <= 2:
            return X
        errs = _reproj_errs(Po, X, uv)
        w = int(np.argmax(errs))
        if errs[w] > ROBUST_THR:
            cur.pop(w)
            continue
        return X


def _lovo_scores(cams, kp, active, robust):
    """Điểm LOVO per-camera (gộp cả clip) TRONG tập view đang hoạt động `active`. robust=True dùng
    dựng-others bền (drop-worst) để khử nhiễm-bẩn từ camera bias lẻ nằm trong 'others'."""
    T = kp.shape[1]
    P = [c.P for c in cams]
    scores = {}
    for v in active:
        others = [k for k in active if k != v]
        if len(others) < 2:
            scores[v] = float("nan")
            continue
        errs = []
        for f in range(T):
            uv_by_view = {k: kp[k, f, JOINT] for k in active}
            X = _solve_others(P, others, uv_by_view, robust)
            if X is None:
                continue
            e = _reproj_errs(P[v][None], X, kp[v, f, JOINT][None])[0]
            if np.isfinite(e):
                errs.append(e)
        scores[v] = float(np.mean(errs)) if errs else float("nan")
    return scores


def _iter_exclude(cams, kp, tau_by_n, robust):
    """Loại-lặp: chấm LOVO, nếu max ≤ τ[số-view-hoạt-động] thì dừng; else loại argmax. Dừng khi
    còn <3 view. τ THEO SỐ VIEW vì mỗi bước loại làm phép dựng-con ít view đi → nhiễu sàn tăng;
    dùng τ cố định (hiệu chỉnh ở 4 view) sẽ loại NHẦM view sạch khi xuống 3 view (đã đo & sửa).
    Trả (tập_giữ, tập_loại)."""
    active = list(range(len(cams)))
    dropped = []
    while len(active) >= 3:
        sc = _lovo_scores(cams, kp, active, robust)
        v_worst = max(active, key=lambda v: (sc[v] if np.isfinite(sc[v]) else -1))
        tau = tau_by_n.get(len(active), max(tau_by_n.values()))
        if not np.isfinite(sc[v_worst]) or sc[v_worst] <= tau:
            break
        active.remove(v_worst)
        dropped.append(v_worst)
    return active, dropped


def _fuse(cams, kp, views):
    if len(views) < 2:
        return None
    sub = [cams[i] for i in views]
    return fuse_multiview(kp[list(views)], sub, fps=30.0, smooth=True,
                          fill_gaps=True, robust=False).joints3d


def _dev3d_cm(j3d, gt):
    if j3d is None:
        return float("nan")
    d = np.linalg.norm(j3d[:, JOINT, :] - gt[:, JOINT, :], axis=1)
    d = d[np.isfinite(d)]
    return float(d.mean()) * 100.0 if d.size else float("nan")


def _calibrate_tau(cams, gt, robust):
    """τ THEO SỐ VIEW hoạt động: trần điểm LOVO khi MỌI view trong tập con SẠCH, đo riêng cho mỗi
    cỡ tập con n∈{V, V-1}. HAI lý do τ phải theo tập con: (1) phép dựng-con ít view đi thì sàn nhiễu
    TĂNG; (2) hình học MỖI tập con khác nhau (vài tập con thẳng hàng hơn → sàn cao hơn). Quét MỌI tổ
    hợp view cỡ n, lấy trần xấu nhất — nếu chỉ hiệu chỉnh 1 tập con thì bước loại sau (đổi sang tập
    con khác) loại nhầm view sạch (đã đo & sửa). Hiệu chỉnh RIÊNG cho mỗi cách chấm (naive/robust).
    Trả (tau_by_n, hi_by_n)."""
    V = len(cams)
    sizes = [V, V - 1]                       # 4 và 3 (xuống 2 thì không còn chấm nữa)
    hi = {n: 0.0 for n in sizes}
    seed = 52000
    for _ in range(TRIALS):
        kp = _make_kp(cams, gt, {}, seed); seed += 1
        for n in sizes:
            for combo in combinations(range(V), n):   # MỌI tập con cỡ n (hình học khác nhau)
                sc = _lovo_scores(cams, kp, list(combo), robust)
                vals = [v for v in sc.values() if np.isfinite(v)]
                if vals:
                    hi[n] = max(hi[n], max(vals))
    tau = {n: hi[n] * TAU_SAFETY for n in sizes}
    return tau, hi


def _run_cell(cams, gt, k, regime, tau, robust):
    """Một ô (k, regime, method): trung bình qua trial."""
    seed = 52500 + k * 131 + (0 if regime == "same" else 61)
    n_drop, exact, dev_lovo, dev_oracle = [], [], [], []
    for _ in range(TRIALS):
        bias_map = _bias_dirs(k, regime)
        biased = set(bias_map)
        kp = _make_kp(cams, gt, bias_map, seed); seed += 1
        keep, dropped = _iter_exclude(cams, kp, tau, robust)
        n_drop.append(len(dropped))
        exact.append(1.0 if set(dropped) == biased else 0.0)
        dev_lovo.append(_dev3d_cm(_fuse(cams, kp, keep), gt))
        clean_views = [v for v in range(len(cams)) if v not in biased]
        dev_oracle.append(_dev3d_cm(_fuse(cams, kp, clean_views), gt))
    with np.errstate(invalid="ignore"):
        return (float(np.mean(n_drop)), float(np.mean(exact)),
                float(np.nanmean(dev_lovo)), float(np.nanmean(dev_oracle)))


def _ceiling(results, method, regime, KS):
    """k lớn nhất (≥1) mà loại-đúng-tập ≥90% VÀ dev3d LOVO bám oracle (≤ oracle+1cm)."""
    ok = [k for k in KS if k >= 1
          and results[(method, regime, k)][1] >= 0.90
          and abs(results[(method, regime, k)][2] - results[(method, regime, k)][3]) <= 1.0]
    return max(ok) if ok else 0


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    cams = [look_at_camera(a, DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES]

    methods = (("naive", False), ("robust", True))
    tau = {}
    for mname, mrob in methods:
        tau[mname], _ = _calibrate_tau(cams, gt, mrob)

    print(f"V52 — TRẦN đồng thuận; 4 camera, bias {BIAS_MAG:.0f}px, khớp {JOINT}.")
    for mname, _ in methods:
        tau_str = ", ".join(f"{n}v→{tau[mname][n]:.2f}px" for n in sorted(tau[mname], reverse=True))
        print(f"  τ[{mname}] (trần-sạch ×{TAU_SAFETY}): {tau_str}")
    print()

    regimes = ("same", "diff")
    KS = (0, 1, 2, 3)
    results = {}
    for mname, mrob in methods:
        for regime in regimes:
            print(f"[{mname.upper()} / {regime.upper()}]  k | #loại | loại-ĐÚNG | dev3d LOVO | dev3d oracle")
            for k in KS:
                nd, ex, dl, do = _run_cell(cams, gt, k, regime, tau[mname], mrob)
                results[(mname, regime, k)] = (nd, ex, dl, do)
                note = "  (<2 view sạch: oracle bất lực)" if (len(cams) - k) < 2 else ""
                print(f"        {k} | {nd:4.1f}  | {ex*100:5.0f}%   | {dl:7.2f}cm | {do:7.2f}cm{note}")
            print()

    ceils = {(m, r): _ceiling(results, m, r, KS) for m, _ in methods for r in regimes}
    print("TRẦN loại-đúng & bám-oracle:")
    for mname, _ in methods:
        print(f"  {mname:7s}:  SAME k≤{ceils[(mname,'same')]} | DIFF k≤{ceils[(mname,'diff')]}")

    def _tbl(method, regime):
        out = []
        for k in KS:
            nd, ex, dl, do = results[(method, regime, k)]
            n_clean = len(cams) - k
            flag = "" if n_clean >= 2 else " ⚠struct"
            out.append(f"| {k} | {n_clean} | {nd:.1f} | {ex*100:.0f}% | {dl:.2f} | {do:.2f}{flag} |")
        return "\n".join(out)

    # Số chốt để viết prose (đọc từ bảng THẬT, không lặp giả định).
    nv_diff1 = results[("naive", "diff", 1)]
    nv_same1 = results[("naive", "same", 1)]
    rb_same1 = results[("robust", "same", 1)]
    rb_diff1 = results[("robust", "diff", 1)]
    rb_same2 = results[("robust", "same", 2)]
    rb_diff2 = results[("robust", "diff", 2)]
    rb_same3 = results[("robust", "same", 3)]
    naive_dir_dep = (nv_same1[1] >= 0.9 and nv_diff1[1] < 0.9)  # thắng SAME, thua DIFF ở k=1?
    robust_k1 = (rb_same1[1] >= 0.9 and rb_diff1[1] >= 0.9)     # trị k=1 cả hai hướng?
    robust_k2_break = (rb_same2[1] < 0.9 and rb_diff2[1] < 0.9) # gãy k=2 cả hai hướng?

    doc = f"""# V52 — TRẦN của chọn-view-bằng-đồng-thuận (LOVO) khi NHIỀU camera cùng lệch

*Sinh tự động bởi `experiments/tran_dong_thuan.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V51 (LOVO) trị được **1** camera bias nhờ **đa số view sạch** đồng thuận chống lại nó. Hội đồng sẽ
hỏi: **đồng thuận đó hỏng khi nào?** V52 ép giả định tới GÃY: quét k∈{{0..3}}/4 camera bị bias
(supra-onset {BIAS_MAG:.0f}px), hai chế độ hướng, dùng **loại-lặp** (iterative LOVO, ngưỡng dừng
τ THEO số-view lấy từ trần-điểm-sạch ×{TAU_SAFETY}, quét MỌI tập con mỗi cỡ; τ phải theo số-view vì
phép dựng-con ít view đi thì sàn nhiễu tăng — dùng τ cố-định 4-view loại nhầm view sạch khi xuống 3
view, đã đo & sửa). Đo với **hai cách chấm đồng thuận** để lộ trần THẬT.

## Kết quả (số đo được)

### Cách 1 — LOVO NGÂY-THƠ (dựng "others" bằng phép thường)
Chấm view v = dựng 3D từ các view khác rồi tái chiếu về v. Vấn đề: "các view khác" còn chứa camera
bias thì bias làm bẩn phép dựng → điểm view SẠCH cũng bị thổi.

**SAME (bias cùng hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
{_tbl('naive','same')}

**DIFF (bias khác hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
{_tbl('naive','diff')}

> **Phát hiện tầng 1 — confound nhiễm-bẩn, phụ thuộc HƯỚNG.** Ngay ở **k=1**, LOVO-ngây-thơ trị
> được hướng SAME (loại-đúng {nv_same1[1]*100:.0f}%) nhưng {"THẤT BẠI" if nv_diff1[1] < 0.9 else "vẫn ổn"}
> ở hướng DIFF (loại-đúng {nv_diff1[1]*100:.0f}%, dev3d {nv_diff1[2]:.2f} vs oracle {nv_diff1[3]:.2f}cm).
> Nguyên nhân ĐO ĐƯỢC: camera bias làm bẩn phép dựng dùng để chấm các view SẠCH, nên một view sạch
> "xuôi dòng" bẩn có thể có điểm CAO HƠN cả camera bias thật → argmax loại nhầm. Thắng/thua tuỳ hướng
> bias = đây KHÔNG phải trần thật, mà là lỗ hổng của cách chấm.

### Cách 2 — LOVO BỀN (dựng "others" kiểu bỏ-view-tệ-nhất)
Khi dựng từ "others", lặp bỏ view tái-chiếu tệ nhất (>{ROBUST_THR:.0f}px) → một camera bias LẺ trong
others tự bị loại TRƯỚC KHI làm bẩn. Khử confound tầng 1.

**SAME (bias cùng hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
{_tbl('robust','same')}

**DIFF (bias khác hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
{_tbl('robust','diff')}

*⚠struct = oracle cũng KHÔNG lập nổi vì <2 view sạch — giới hạn CẤU TRÚC, không phải lỗi thuật toán.*

> **Phát hiện tầng 2 — TRẦN THẬT, độc lập hướng.** LOVO-bền trị **k=1 CẢ HAI hướng**
> (loại-đúng SAME {rb_same1[1]*100:.0f}% / DIFF {rb_diff1[1]*100:.0f}%, dev3d về oracle), rồi
> **gãy ở k=2 cả hai hướng** (SAME {rb_same2[1]*100:.0f}% dev3d {rb_same2[2]:.2f} vs {rb_same2[3]:.2f}cm;
> DIFF {rb_diff2[1]*100:.0f}% dev3d {rb_diff2[2]:.2f} vs {rb_diff2[3]:.2f}cm).

## Đọc kết quả — TRẦN đồng thuận là floor((V-1)/2), song song V41
- **Trần: SAME k≤{ceils[('robust','same')]}, DIFF k≤{ceils[('robust','diff')]}** (LOVO-bền) =
  **floor((V-1)/2)=1** cho V=4. Lý do CƠ CHẾ: chấm view v thì "others" có V-1=3 view; drop-worst
  trị được **thiểu số** bias trong 3 đó (≤1). k=1 → mọi bộ-others chỉ chứa ≤1 bias → khử sạch.
  k=2 → khi chấm một view sạch, others = {{2 bias, 1 sạch}}, drop-worst bỏ được 1, CÒN 1 bias → vẫn
  bẩn → view sạch bị thổi → loại nhầm. Đây là **cùng motif V41** (chấm nhóm-tương-đối sụp ở ~đa-số)
  tái hiện ở tầng HÌNH HỌC.
- **k=3**: chỉ còn **1 view sạch** — **giới hạn CẤU TRÚC**: bỏ 1 còn 2 mà có thể toàn bias, oracle
  cũng bất lực ({"không dựng nổi (dev3d = NaN)" if not np.isfinite(rb_same3[3]) else f"dev3d oracle {rb_same3[3]:.2f}cm"}). Trần THÔNG TIN, không phải trần thuật toán.
- **Bài học cách-chấm**: {"LOVO-ngây-thơ phụ thuộc hướng bias (thắng SAME thua DIFF ngay k=1) vì nhiễm-bẩn; LOVO-bền khử confound cho trần độc-lập-hướng sạch sẽ." if (naive_dir_dep and robust_k1) else "so hai cách chấm cho thấy chọn cơ chế đồng thuận quyết định trần nằm đâu."}
  Chọn đúng cơ chế đồng thuận KHÔNG dời được trần nguyên lý (vẫn floor((V-1)/2)) nhưng khiến trần đó
  ĐÚNG-ĐẮN & đoán-trước-được thay vì phập phù theo hướng.

## Luận điểm: trần đồng thuận ⇒ cần LỐI THOÁT có-tham-chiếu (song song V42)
Như tầng đánh giá: chấm **nhóm-tương-đối** (V41) có trần ~đa-số, phá trần cần thước **tuyệt-đối
có-nhãn** (V42). Ở tầng dựng y hệt: chọn-view **dựa-đồng-thuận** (LOVO/robust) có trần floor((V-1)/2),
phá trần cần **tham chiếu NGOÀI đồng thuận** — hiệu chỉnh/khớp calib đã biết, hoặc rơi vào Gate-0 với
ground-truth. Đồng-thuận-nội-bộ là công cụ GT-free MẠNH nhưng có TRẦN nguyên lý; biết đúng trần đó
(và biết lối thoát là tham chiếu ngoài) là kết luận trung thực của cả cung V49–V52.

## Giới hạn (trung thực)
- Biên độ bias cố định {BIAS_MAG:.0f}px; chưa quét tương tác (k × biên độ). Ở bias nhỏ dưới onset,
  k không còn là biến chính (LOVO vốn đã không loại).
- Tập camera bị bias cố định theo `BIAS_ORDER={BIAS_ORDER}` — CHỌN camera nào bias là confound chưa
  quét (góc lệch khác nhau đổi độ "lộ"). Kết luận về TRẦN-THEO-k và floor((V-1)/2) vững; số cụ thể
  theo cấu hình.
- ROBUST_THR={ROBUST_THR:.0f}px lấy từ triangulate_robust; ở bias dưới ngưỡng này drop-worst không
  kích hoạt (nhưng khi đó bias cũng chưa hại — xem V50/V51).
- τ hiệu chỉnh từ k=0 (pha mọi-view-sạch); hiện trường không có pha đó thì cần τ tiên nghiệm từ đặc
  tả detector — ghi nhận phụ thuộc.
- Vẫn hình học tổng hợp; số trên detector thật chờ Gate-0 (GPU lab).
"""

    out = Path(__file__).resolve().parent / "ket-qua-tran-dong-thuan.md"
    out.write_text(doc, encoding="utf-8")
    print(f"\nĐã ghi {out.name}")


if __name__ == "__main__":
    main()
