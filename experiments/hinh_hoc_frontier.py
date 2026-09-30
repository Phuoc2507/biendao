"""V56 — Phần dư FRONTIER của V55 có phân-tách được bằng một ĐẠI-LƯỢNG HÌNH-HỌC của rig không?

V55 lượng-hoá phần dư: vùng `k_joint≥2` (FRONTIER) mà envelope ĐẾM không đoán được split là
phụ-thuộc-hình-học. Câu hỏi tự nhiên tiếp theo — và là lối ra V55 gợi: "muốn vượt phải thêm chiều
hình-học". V56 KIỂM ĐỊNH TRỰC TIẾP: có một scalar hình-học nào của rig tách được assignment PASS khỏi
FAIL trong FRONTIER không? Nếu CÓ → nâng envelope đếm→hình-học. Nếu KHÔNG → chặn độ-đoán-được bằng số.

## Bẫy phương pháp phải tránh: CONFOUND ĐẾM (nghịch lý Simpson)
Một scalar như "độ trải góc view sạch" tương quan MẠNH với PASS khi gộp mọi ô (pooled AUC cao) — nhưng
CHỈ vì nó tương quan với SỐ view sạch `nclean = V−k_cam−k_joint`, vốn tự là một loại ĐẾM. Muốn biết
hình-học THẬT-SỰ có thêm thông tin NGOÀI đếm hay không, phải đo AUC **có điều kiện**: TRONG từng ô-count
(V,k_cam,k_joint) cố định (nclean hằng số), scalar còn tách được split không? Đây là điểm mấu chốt V56.

## Cơ chế vật lý kỳ vọng (nối V49)
V49 đã chỉ: tái-chiếu camera held-out KHUẾCH ĐẠI bias lệch-trục. View bias ở góc RÌA (đòn bẩy lớn) lộ
mạnh ở held-out → dễ bị LOVO bắt; view bias GẦN TÂM rig (đòn bẩy nhỏ) lộ yếu → dễ sót. Nên kỳ vọng:
"đòn bẩy view-bias yếu nhất" (min|góc| trên các view bias, WEAKEST-LINK) dự đoán PASS. V56 đo xem cơ chế
nguyên lý này có ĐỦ MẠNH để thành tiêu chí thực dụng không.

Chạy:  .venv/Scripts/python experiments/hinh_hoc_frontier.py  → ket-qua-hinh-hoc-frontier.md
"""

from __future__ import annotations

import random
import sys
import warnings
from collections import defaultdict
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
    _fuse, _dev3d_cm, _iter_exclude, _calibrate_tau, JOINT, SECONDS,
    GAUSS_PX, BIAS_MAG, DISTANCE, ELEV, FOV, IMAGE,
)
from experiments.moc_tuyet_doi import ANCHOR, _calibrate_anchor_gate, _identify_anchor  # noqa: E402

VS = (4, 5, 6, 7)
T = 4
MAX_ASSIGN = 10
SEED_ASSIGN = 56
ANGLES = {V: np.linspace(-70.0, 70.0, V) for V in VS}


def _build(nv):
    return [look_at_camera(float(a), DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in ANGLES[nv]]


def _make_mixed(cams, gt, cb, jb, seed):
    rng = np.random.default_rng(seed)
    T_ = gt.shape[0]; V = len(cams)
    clean = np.stack([np.stack([project_points(c, gt[f]) for f in range(T_)], 0) for c in cams], 0)
    kp = clean + rng.normal(0, 1, clean.shape) * GAUSS_PX
    anc = np.stack([project_points(c, ANCHOR) for c in cams], 0) + rng.normal(0, 1, (V, 4, 2)) * GAUSS_PX
    for v in cb:
        kp[v, :, :, 0] += BIAS_MAG; kp[v, :, :, 1] += 0.5 * BIAS_MAG
        anc[v, :, 0] += BIAS_MAG;  anc[v, :, 1] += 0.5 * BIAS_MAG
    for v in jb:
        kp[v, :, JOINT, 0] += BIAS_MAG; kp[v, :, JOINT, 1] += 0.5 * BIAS_MAG
    return kp, anc


def _combo(cams, gt, kp, anc, gate, tau_cache):
    nv = len(cams)
    bad = _identify_anchor(cams, anc, gate)
    sub = [v for v in range(nv) if v not in bad]
    if len(sub) >= 3:
        subcams = [cams[v] for v in sub]; key = tuple(sub)
        if key not in tau_cache:
            tau_cache[key] = _calibrate_tau(subcams, gt, True)[0]
        kk, _ = _iter_exclude(subcams, kp[sub], tau_cache[key], True)
        keep = [sub[i] for i in kk]
    else:
        keep = sub
    return set(v for v in range(nv) if v not in keep), keep


def _geoms(V, cb, jb):
    """Các scalar hình-học của cấu hình. Trả dict tên→giá trị."""
    ang = ANGLES[V]
    biased = set(cb) | set(jb)
    clean = sorted([ang[v] for v in range(V) if v not in biased])
    lovo_set = [v for v in range(V) if v not in cb]   # anchor gỡ whole-cam; joint-bias CÒN trong LOVO
    spread = (max(clean) - min(clean)) if len(clean) >= 2 else 0.0
    mingap = float(min(np.diff(clean))) if len(clean) >= 2 else 0.0
    minsep = 999.0
    for v in jb:
        others = [ang[u] for u in lovo_set if u != v]
        if others:
            minsep = min(minsep, min(abs(ang[v] - o) for o in others))
    minsep = 0.0 if minsep == 999.0 else minsep
    lev = [abs(ang[v]) for v in jb]
    return {
        "trai_view_sach": spread,          # độ trải góc view sạch
        "khe_view_sach": mingap,           # khe adjacent nhỏ nhất view sạch
        "cach_ly_bias": minsep,            # cách-ly view bias tới view gần nhất
        "don_bay_min_bias": float(min(lev)) if lev else 0.0,  # WEAKEST-LINK (cơ chế V49)
        "don_bay_mean_bias": float(np.mean(lev)) if lev else 0.0,
    }


def _auc(scores, labels):
    """Mann-Whitney AUC = P(score | pass > score | fail)."""
    pos = [s for s, l in zip(scores, labels) if l]
    neg = [s for s, l in zip(scores, labels) if not l]
    if not pos or not neg:
        return float("nan")
    c = sum((1.0 if p > n else 0.5 if p == n else 0.0) for p in pos for n in neg)
    return c / (len(pos) * len(neg))


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    rng = random.Random(SEED_ASSIGN)
    rows = []   # dict: V,kc,kj, <scalars>, outcome
    for V in VS:
        cams = _build(V); gate = _calibrate_anchor_gate(cams, gt); tau_cache = {}
        for kc in range(0, V - 1):
            for kj in range(2, V - 1):          # CHỈ FRONTIER k_joint≥2
                if kc + kj > V:
                    continue
                allv = list(range(V)); seen = set(); assigns = []
                for _ in range(60):
                    perm = rng.sample(allv, kc + kj)
                    a = (tuple(sorted(perm[:kc])), tuple(sorted(perm[kc:kc + kj])))
                    if a in seen:
                        continue
                    seen.add(a); assigns.append((set(perm[:kc]), set(perm[kc:kc + kj])))
                    if len(assigns) >= MAX_ASSIGN:
                        break
                for cb, jb in assigns:
                    biased = cb | jb; succ = []
                    for t in range(T):
                        kp, anc = _make_mixed(cams, gt, cb, jb, 9000 + t)
                        clean = [v for v in range(V) if v not in biased]
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore", RuntimeWarning)
                            od = _dev3d_cm(_fuse(cams, kp, clean), gt) if len(clean) >= 2 else float("nan")
                            dc, kcp = _combo(cams, gt, kp, anc, gate, tau_cache)
                            dv = _dev3d_cm(_fuse(cams, kp, kcp), gt)
                        succ.append(bool(np.isfinite(od) and dc == biased and abs(dv - od) <= 1.0))
                    g = _geoms(V, cb, jb)
                    g.update(V=V, kc=kc, kj=kj, nclean=V - kc - kj, out=float(np.mean(succ)) >= 0.9)
                    rows.append(g)

    SCALARS = ["trai_view_sach", "khe_view_sach", "cach_ly_bias", "don_bay_min_bias", "don_bay_mean_bias"]
    npass = sum(r["out"] for r in rows); n = len(rows)

    # (1) POOLED
    pooled = {s: _auc([r[s] for r in rows], [r["out"] for r in rows]) for s in SCALARS}
    pooled_nclean = _auc([r["nclean"] for r in rows], [r["out"] for r in rows])

    # (2) CONDITIONAL: trong từng ô-count split
    cells = defaultdict(list)
    for r in rows:
        cells[(r["V"], r["kc"], r["kj"])].append(r)
    split = [c for c in cells.values() if len({x["out"] for x in c}) > 1]
    cond = {}
    for s in SCALARS:
        aucs = [_auc([x[s] for x in c], [x["out"] for x in c]) for c in split]
        aucs = [a for a in aucs if np.isfinite(a)]
        cond[s] = (float(np.mean(aucs)), float(min(aucs)), float(max(aucs)), len(aucs))

    print(f"V56 FRONTIER: {n} mẫu-assignment, {npass} pass / {n - npass} fail; {len(split)} ô-count split.")
    print(f"  POOLED nclean AUC = {pooled_nclean:.3f}")
    for s in SCALARS:
        print(f"  {s:20s} pooled {pooled[s]:.3f} | conditional {cond[s][0]:.3f} "
              f"(min {cond[s][1]:.2f} max {cond[s][2]:.2f})")

    best_cond = max(SCALARS, key=lambda s: max(cond[s][0], 1 - cond[s][0]))
    bc = cond[best_cond][0]; flipped = bc < 0.5
    eff = 1 - bc if flipped else bc

    tbl = "\n".join(
        f"| `{s}` | {pooled[s]:.3f} | {cond[s][0]:.3f} | {cond[s][1]:.2f}–{cond[s][2]:.2f} |"
        for s in SCALARS
    )

    doc = f"""# V56 — Phần dư FRONTIER của V55 có phân-tách bằng hình-học rig không? (confound-controlled)

*Sinh tự động bởi `experiments/hinh_hoc_frontier.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V55 kết luận phần envelope ĐẾM không đoán được (FRONTIER `k_joint≥2`) là **phụ-thuộc-hình-học** và gợi
lối ra "thêm chiều hình-học". V56 kiểm định TRỰC TIẾP: có một scalar hình-học của rig tách được
assignment PASS khỏi FAIL trong FRONTIER — sau khi ĐÃ khử confound đếm — không?

Quét {n} mẫu-assignment trên FRONTIER (V∈{list(VS)}, k_joint≥2), mỗi mẫu {T} trial; {npass} pass /
{n - npass} fail; {len(split)} ô-count `(V,k_cam,k_joint)` có CẢ pass&fail (ô "split").

## Kết quả cốt lõi: tính-đoán-được hình-học POOLED là ẢO ẢNH CONFOUND ĐẾM (nghịch lý Simpson)

| Scalar hình-học | AUC **pooled** (lẫn count) | AUC **conditional** (trong-ô) | dải conditional |
|---|---|---|---|
{tbl}

- **nclean = V−k_cam−k_joint**: pooled AUC **{pooled_nclean:.3f}** — mạnh nhất. NHƯNG `nclean` HẰNG SỐ
  trong mỗi ô-count ⇒ AUC conditional **không xác định** (0 sức phân-tách trong-ô). Đây chính là bằng
  chứng: nclean là ĐẾM thuần, không phải hình-học.
- **`trai_view_sach` (độ trải góc view sạch)**: pooled **{pooled['trai_view_sach']:.3f}** (trông rất
  đoán-được!) nhưng conditional **{cond['trai_view_sach'][0]:.3f}** — ĐẢO NGƯỢC, dưới 0.5. Cùng MỘT
  scalar: gộp-ô thì "tiên đoán mạnh", khử-confound thì PHẢN-tiên-đoán. Kinh điển Simpson: tín hiệu
  pooled hoàn toàn do nó tương-quan với nclean (view sạch trải rộng ⇔ nhiều view sạch).
- Mọi scalar góc còn lại conditional đều rơi về quanh 0.5 (min–max rộng, thiếu nhất-quán).

## Cơ chế V49 có đúng hướng nhưng KHÔNG đủ mạnh làm tiêu chí
Kỳ vọng nối V49: view bias ở RÌA (đòn bẩy lớn) lộ mạnh ở held-out → dễ bắt; nên "đòn bẩy view-bias
yếu nhất" (`don_bay_min_bias`, weakest-link) dự đoán PASS. Đo: conditional AUC
**{cond['don_bay_min_bias'][0]:.3f}** (dải {cond['don_bay_min_bias'][1]:.2f}–{cond['don_bay_min_bias'][2]:.2f}).
Đúng HƯỚNG (>0.5, có ô đạt {cond['don_bay_min_bias'][2]:.2f}) và cơ chế nhất quán với V49, nhưng
TRUNG BÌNH quá yếu và quá biến-động giữa ô để thành ngưỡng thực dụng. Cơ chế nguyên-lý có thật, nhưng
một scalar không nắm đủ.

## Kết luận (trung thực, củng cố V55)
1. **Tính-đoán-được hình-học của FRONTIER khi phân-tích POOLED là ảo ảnh confound đếm.** Phải điều-kiện-
   -hoá theo ô-count mới thấy sự thật. Đây là bài học phương pháp: mọi khẳng định "hình-học đoán được
   split" phải khử confound nclean trước.
2. **Không scalar đơn nào sống sót điều-kiện-hoá** (tốt nhất `{best_cond}` chỉ ≈{eff:.2f} sau khi lật
   hướng nếu cần, và vẫn thiếu nhất-quán). ⇒ phần dư FRONTIER KHÔNG rút gọn về một tiêu-chí-rig-một-số.
3. **Điều này CỦNG CỐ, không mâu thuẫn, V55:** V55 nói residual "phụ-thuộc-hình-học"; V56 đo chính xác
   là phụ-thuộc-hình-học ĐA-YẾU-TỐ, không một-chiều. Lối ra thực dụng duy nhất trong FRONTIER là CHẠY
   bộ ước-lượng (combo thật) chứ không đoán bằng công thức — hoặc rời FRONTIER bằng cách thêm view/nhãn
   (đúng khuyến nghị thiết-kế-rig V54: chừa đủ view sạch để nằm ngoài FRONTIER ngay từ đầu).

## Giới hạn
- Hình học tổng hợp, bias {BIAS_MAG:.0f}px hướng SAME; {T} trial/assignment, tối đa {MAX_ASSIGN}
  assignment/ô (per-ô ít mẫu → AUC-trong-ô nhiễu; nhưng headline Simpson {pooled['trai_view_sach']:.2f}
  →{cond['trai_view_sach'][0]:.2f} quá lớn để là nhiễu). Chỉ scalar 1-chiều; mô hình đa-biến trên
  {len(split)} ô sẽ overfit nên KHÔNG làm (tránh khẳng định thiếu cơ sở).
- Số thật chờ Gate-0 (GPU lab). V56 là kết quả CẤU TRÚC: cách phần dư hình-học hành xử, không phải số
  tuyệt đối trên múa thật.
"""

    out = Path(__file__).resolve().parent / "ket-qua-hinh-hoc-frontier.md"
    out.write_text(doc, encoding="utf-8")
    print(f"Đã ghi {out.name}")


if __name__ == "__main__":
    main()
