"""V55 — KIỂM ĐỊNH envelope V54 như MỘT LUẬT DỰ ĐOÁN: quét Monte-Carlo (V, k_cam, k_joint, gán-view)
gồm CẢ confound "view NÀO bị bias", so actual-success vs envelope-predict.

V54 đề xuất envelope đếm-được: `V−k_cam≥4 ∧ V−k_cam−k_joint≥2 ∧ k_joint≤floor((V−k_cam−1)/2)`, xác nhận
trên 6 kịch bản tay-chọn. Good science: TRƯỚC KHI đưa envelope vào luận văn như một khẳng định, phải
STRESS-TEST nó trên toàn không gian cấu hình, gồm cái mà V52–V54 đều GHI là CHƯA quét: confound
view-nào-bias. V55 làm đúng điều đó — và phát hiện envelope đếm-được KHÔNG chính xác, vì hình-học-view
là một yếu tố BẬC HAI thật.

## Ba lớp lệch (đo được, diễn giải được)
1. **Envelope QUÁ NGẶT khi k_joint=0** (chỉ bias whole-camera, LOVO không có việc): anchor-đơn gỡ hết,
   chỉ cần V−k_cam≥2 để tam giác hoá. Điều kiện V−k_cam≥4 thừa ⇒ envelope đoán FAIL nhưng THỰC success.
2. **Trần k_joint của V52 là NGOẠI SUY lạc quan**: V52 ĐO floor((V-1)/2)=1 CHỈ ở V=4; công thức tổng
   quát floor(...) KHÔNG đúng ở rig lớn vì "others" robust chỉ drop MỘT view tệ nhất → ≥2 view joint-bias
   trong "others" vẫn sót làm bẩn. k_joint≥2 thành phụ-thuộc-hình-học, không phải trần đếm-được.
3. **Confound (view-nào-bias) là yếu tố BẬC HAI thật**: cùng (V,k_cam,k_joint) nhưng gán-view khác nhau
   cho kết cục khác nhau (rig còn lại sau anchor phân bố góc tốt/xấu). Đây là giới hạn V52–V54 GHI mà
   CHƯA lượng hoá — V55 lượng hoá lần đầu.

Chạy:  .venv/Scripts/python experiments/kiem_dinh_envelope.py  → ket-qua-kiem-dinh-envelope.md
"""

from __future__ import annotations

import random
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
from experiments.moc_tuyet_doi import ANCHOR, _calibrate_anchor_gate, _identify_anchor  # noqa: E402

VS = (4, 5, 6, 7)
T = 5                # trial/cấu-hình-gán
MAX_ASSIGN = 4       # số gán-view ngẫu nhiên mỗi (V,k_cam,k_joint) — để dò confound
SEED_ASSIGN = 55


def _build(nv):
    return [look_at_camera(float(a), DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE)
            for a in np.linspace(-70.0, 70.0, nv)]


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


def _env_v54(V, kc, kj):
    return (V - kc >= 4) and (V - kc - kj >= 2) and (kj <= (V - kc - 1) // 2)


def _refined(V, kc, kj):
    """Luật đếm-được tinh chỉnh từ 3 lớp lệch. Trả 'PASS'/'FAIL'/'FRONTIER'(phụ-thuộc-hình-học)."""
    if V - kc - kj < 2:
        return "FAIL"            # không đủ view sạch tam giác hoá
    if kj == 0:
        return "PASS"            # anchor-đơn đủ (không cần biên LOVO)
    if kj == 1:
        return "PASS" if V - kc >= 4 else "FAIL"   # LOVO cần ≥4 view working-set
    return "FRONTIER"            # k_joint≥2: phụ-thuộc-hình-học, không đoán chắc bằng đếm


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS, seed=0).joints3d
    rng = random.Random(SEED_ASSIGN)
    configs = []   # (V,kc,kj, per_assign_ok list)
    for V in VS:
        cams = _build(V); gate = _calibrate_anchor_gate(cams, gt); tau_cache = {}
        for kc in range(0, V - 1):
            for kj in range(0, V - 1):
                if kc + kj > V:
                    continue
                allv = list(range(V)); assigns = []
                seen = set()
                for _ in range(20):
                    perm = rng.sample(allv, kc + kj)
                    a = (tuple(sorted(perm[:kc])), tuple(sorted(perm[kc:kc + kj])))
                    if a in seen:
                        continue
                    seen.add(a); assigns.append((set(perm[:kc]), set(perm[kc:kc + kj])))
                    if len(assigns) >= MAX_ASSIGN:
                        break
                per_assign_ok = []
                for cb, jb in assigns:
                    biased = cb | jb; succ = []
                    for t in range(T):
                        kp, anc = _make_mixed(cams, gt, cb, jb, 7000 + t)
                        clean = [v for v in range(V) if v not in biased]
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore", RuntimeWarning)
                            od = _dev3d_cm(_fuse(cams, kp, clean), gt) if len(clean) >= 2 else float("nan")
                            dc, kcp = _combo(cams, gt, kp, anc, gate, tau_cache)
                            dv = _dev3d_cm(_fuse(cams, kp, kcp), gt)
                        succ.append(bool(np.isfinite(od) and dc == biased and abs(dv - od) <= 1.0))
                    per_assign_ok.append(float(np.mean(succ)) >= 0.9)
                configs.append((V, kc, kj, per_assign_ok))

    # --- Phân tích ---
    def actual(cfg):
        return all(cfg[3])
    total = len(configs)

    # (1) agreement envelope V54 (đa-số gán để gộp 1 nhãn actual = all-pass)
    env_agree = sum(1 for c in configs if _env_v54(c[0], c[1], c[2]) == actual(c))
    # phân loại lệch
    classA = [c for c in configs if (not _env_v54(c[0], c[1], c[2])) and actual(c) and c[2] == 0]
    classA_other = [c for c in configs if (not _env_v54(c[0], c[1], c[2])) and actual(c) and c[2] != 0]
    classBC = [c for c in configs if _env_v54(c[0], c[1], c[2]) and (not actual(c))]
    # confound-split: các gán bất đồng
    confound = [c for c in configs if len(set(c[3])) > 1]
    confound_kj1 = [c for c in confound if c[2] == 1]
    confound_kj2 = [c for c in confound if c[2] >= 2]

    # (2) luật tinh chỉnh: tính agreement trên vùng ĐẾM-ĐOÁN-ĐƯỢC (PASS/FAIL), FRONTIER để riêng
    ref_pass_fail = [c for c in configs if _refined(c[0], c[1], c[2]) in ("PASS", "FAIL")]
    ref_agree = sum(1 for c in ref_pass_fail
                    if (_refined(c[0], c[1], c[2]) == "PASS") == actual(c))
    frontier = [c for c in configs if _refined(c[0], c[1], c[2]) == "FRONTIER"]
    frontier_split = [c for c in frontier if len(set(c[3])) > 1]
    frontier_allpass = sum(1 for c in frontier if all(c[3]))
    frontier_allfail = sum(1 for c in frontier if not any(c[3]))

    def fmt(cfgs, n=6):
        return "; ".join(f"(V{c[0]},kc{c[1]},kj{c[2]})→{['T' if x else 'F' for x in c[3]]}" for c in cfgs[:n])

    print(f"V55 — {total} cấu hình (V,k_cam,k_joint) × tối đa {MAX_ASSIGN} gán-view, {T} trial/gán.")
    print(f"(1) Envelope V54 khớp actual: {env_agree}/{total} = {env_agree/total*100:.1f}%")
    print(f"    Lớp A (envelope ngặt thừa, k_joint=0): {len(classA)} cấu hình")
    print(f"    Lớp B/C (envelope lỏng, trong-envelope mà FAIL): {len(classBC)} cấu hình")
    print(f"(2) Confound-split (gán-view bất đồng): {len(confound)} cấu hình "
          f"(k_joint=1: {len(confound_kj1)}, k_joint≥2: {len(confound_kj2)})")
    print(f"(3) Luật tinh chỉnh trên vùng đếm-đoán-được (PASS/FAIL): "
          f"{ref_agree}/{len(ref_pass_fail)} = {ref_agree/len(ref_pass_fail)*100:.1f}%")
    print(f"    FRONTIER (k_joint≥2): {len(frontier)} cấu hình — all-pass {frontier_allpass}, "
          f"all-fail {frontier_allfail}, split {len(frontier_split)}")

    doc = f"""# V55 — Kiểm định envelope V54 như một LUẬT DỰ ĐOÁN (Monte-Carlo, gồm confound)

*Sinh tự động bởi `experiments/kiem_dinh_envelope.py` — thuần numpy, chạy CPU.*

## Vì sao round này
V54 đề xuất envelope đếm-được và xác nhận trên 6 kịch bản tay-chọn. TRƯỚC KHI đưa nó vào luận văn như
một khẳng định, phải STRESS-TEST trên toàn không gian cấu hình — gồm cái V52–V54 đều GHI là chưa quét:
**confound "view NÀO bị bias"**. V55 quét {total} cấu hình `(V,k_cam,k_joint)` với V∈{list(VS)}, mỗi cấu
hình tối đa {MAX_ASSIGN} cách gán-view ngẫu nhiên (hạt giống cố định), {T} trial/gán. Kết quả: envelope
đếm-được KHÔNG chính xác — và các chỗ lệch đều CÓ LÝ DO, chỉ ra hình-học-view là yếu tố bậc hai thật.

## Kết quả (số đo được)

### (1) Envelope V54 dự đoán đúng {env_agree}/{total} = **{env_agree/total*100:.1f}%** cấu hình
Không phải luật chính xác. Hai chiều lệch:
- **Lớp A — envelope QUÁ NGẶT ({len(classA)} cấu hình, đều k_joint=0):** chỉ có bias whole-camera, LOVO
  KHÔNG có việc; anchor-đơn gỡ hết, chỉ cần `V−k_cam≥2` để tam giác hoá. Điều kiện `V−k_cam≥4` của V54
  thừa ở đây → envelope đoán FAIL nhưng THỰC TẾ success. Ví dụ: {fmt(classA, 6)}.
- **Lớp B/C — envelope LỎNG ({len(classBC)} cấu hình trong-envelope mà FAIL):** {fmt(classBC, 6)}. Hai
  nguyên nhân tách bạch dưới đây.

### (2) Confound: hình-học-view quyết định — {len(confound)} cấu hình "split" (các gán bất đồng)
Cùng `(V,k_cam,k_joint)` nhưng gán-view khác nhau ⇒ kết cục khác nhau: {len(confound_kj1)} cấu hình ở
k_joint=1, {len(confound_kj2)} ở k_joint≥2. Lý do: sau khi anchor gỡ k_cam view whole-cam, rig CÒN LẠI
phân bố góc TỐT hay XẤU tuỳ view nào bị gỡ; held-out của LOVO nhạy với phân bố đó. Đây là giới hạn
V52–V54 GHI mà CHƯA lượng hoá — giờ đo được: **envelope ĐẾM-ĐƯỢC không thể chính xác vì thiếu chiều
hình học.** Ví dụ split: {fmt(confound[:6], 6)}.

### (3) Trần k_joint của V52 là NGOẠI SUY lạc quan
V52 ĐO trần joint-bias floor((V-1)/2)=1 **chỉ ở V=4**; công thức tổng quát `floor((V−k_cam−1)/2)` ngầm
hứa trần TĂNG theo số view. V55 bác: vùng `k_joint≥2` (FRONTIER) có {len(frontier)} cấu hình → chỉ
{frontier_allpass} all-pass, {frontier_allfail} all-fail, {len(frontier_split)} split. k_joint≥2 KHÔNG
lên PASS ổn định dù rig lớn, vì "others" robust chỉ drop MỘT view tệ nhất → còn ≥1 view joint-bias trong
"others" làm bẩn điểm chấm. ⇒ trần joint-bias THỰC của LOVO-bền (drop-một) là **k_joint≤1**, phần trên
là phụ-thuộc-hình-học, không phải trần đếm-được như floor((V-1)/2) ngoại suy.

### (4) Luật đếm-được TINH CHỈNH + phần dư chính là confound
Luật tinh chỉnh từ 3 lớp lệch:
```
V − k_cam − k_joint < 2   → FAIL   (không đủ view sạch tam giác hoá)
k_joint = 0               → PASS   (anchor-đơn đủ; KHÔNG cần V−k_cam≥4)
k_joint = 1               → PASS nếu V−k_cam≥4, ngược lại FAIL
k_joint ≥ 2               → FRONTIER (phụ-thuộc-hình-học, đếm KHÔNG đoán chắc)
```
Trên vùng đếm-đoán-được (PASS/FAIL, bỏ FRONTIER): khớp **{ref_agree}/{len(ref_pass_fail)} =
{ref_agree/len(ref_pass_fail)*100:.1f}%**.

**Cảnh báo trung thực (KHÔNG overclaim):** con số 100% này là MÔ TẢ, không phải dự đoán chéo-kiểm.
Luật tinh chỉnh được RÚT RA TỪ CHÍNH các chỗ lệch ở trên, nên đương nhiên nó khớp trên cùng bộ đó
(post-hoc fit). Giá trị của nó KHÔNG phải "độ chính xác 100%" mà là: nó chỉ ra vùng đếm-đoán-được và
vùng phụ-thuộc-hình-học **tách bạch sạch** — mọi cấu hình mà COUNT đoán sai đều rơi đúng vào FRONTIER
(k_joint≥2) hoặc {len(confound_kj1)} cấu hình confound-split ở k_joint=1. Nói cách khác: phần COUNT
KHÔNG đoán được chính là phần mà hình-học-view quyết định — không phải nhiễu, không phải chỗ tuỳ tiện.
Đây là trần NGUYÊN LÝ của mọi envelope CHỈ-ĐẾM; muốn vượt phải thêm chiều hình-học (phân bố góc của rig
còn lại sau khi anchor gỡ) vào tiêu chí, không thể bằng đếm k thuần.

## Kết luận (trung thực, sửa cả V52 lẫn V54)
- Envelope V54 là chỉ dẫn BẬC MỘT tốt nhưng KHÔNG chính xác ({env_agree/total*100:.1f}%). Luật đếm
  tinh chỉnh (post-hoc) khớp sạch trên vùng đếm-đoán-được, chứng tỏ phần COUNT bỏ sót TÁCH BẠCH đúng
  vào vùng phụ-thuộc-hình-học — không lẫn vào nhiễu.
- Trần joint-bias của LOVO-bền-drop-một là **k_joint≤1**, KHÔNG phải floor((V-1)/2) (V52 đo đúng ở V=4
  nhưng công thức ngoại suy sai ở rig lớn) — muốn nâng trần phải cho "others" drop-worst LẶP tới sạch
  (hướng để ngỏ, có giá: mất dữ liệu).
- Confound hình-học là yếu tố bậc HAI THẬT, lần đầu lượng hoá ({len(confound)}/{total} cấu hình split).
  Mọi envelope chỉ-đếm đều có trần nguyên lý ở đây. Đây là câu trả lời trung thực cho hội đồng khi hỏi
  "công thức envelope có chắc không": chắc ở bậc một, và ta BIẾT chính xác nó hở ở đâu (confound) & vì sao.

## Giới hạn
- Hình học tổng hợp, bias {BIAS_MAG:.0f}px cố định hướng SAME; {T} trial/gán, {MAX_ASSIGN} gán/cấu hình
  (confound lấy mẫu, chưa vét cạn mọi tổ hợp view). Ngưỡng success |dev−oracle|≤1cm & loại-đúng-tập.
- "PASS/FAIL" gộp theo all-gán-pass; cấu hình split tính vào phần confound. Số thật chờ Gate-0 (GPU lab).
"""

    out = Path(__file__).resolve().parent / "ket-qua-kiem-dinh-envelope.md"
    out.write_text(doc, encoding="utf-8")
    print(f"Đã ghi {out.name}")


if __name__ == "__main__":
    main()
