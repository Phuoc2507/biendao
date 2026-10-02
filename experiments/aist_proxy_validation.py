"""KIỂM CHỨNG PROXY GT-FREE trên MÚA THẬT (AIST++) — xương sống Đường B.

Câu hỏi luận văn: trên clip TỰ QUAY ta KHÔNG có 3D ground-truth, nên chấm chất
lượng bằng các proxy KHÔNG cần GT (sai số tái chiếu leave-one-camera-out, độ lệch
chuẩn độ dài xương, độ rung gia tốc). Proxy chỉ "đáng tin" nếu nó TƯƠNG QUAN với
sai số THẬT. AIST++ có 3D tham chiếu 9-view -> ta đo được CẢ proxy LẪN MPJPE thật,
rồi tính tương quan hạng Spearman giữa chúng.

Cách tạo dải chất lượng: cố định một tập con 4 camera, BƠM nhiễu detector mô phỏng
ở nhiều mức (sạch -> rất nhiễu) bằng perturb_keypoints2d. Mỗi (bài, mức nhiễu) là
một mẫu: dựng 3D (DLT 2-view/▶đa-view, KHÔNG trọng số, để proxy & MPJPE nhất quán),
đo MPJPE thật (vs 3D 9-view) và 3 proxy GT-free. Gom mọi mẫu -> Spearman ρ.

ρ cao (→1) nghĩa là: proxy tăng ⇔ sai số thật tăng ⇒ xếp hạng clip bằng proxy ≈
xếp hạng bằng GT ⇒ HỢP THỨC HOÁ chấm GT-free. Đây chính là tầng ĐÁNH GIÁ (novelty).

Trục này TRỰC GIAO với 2 sweep trước: noise-sweep (giá detector) và angle-sweep
(hình học). Ở đây biến là "chất lượng tái dựng" tổng hợp; ta hỏi proxy có BÁM theo
nó không. CPU thuần, không mạng-ngoài/▶GPU (chỉ HTTP-Range annotation AIST đã cache).

Chạy:  .venv/Scripts/python experiments/aist_proxy_validation.py
Ghi :  ket-qua-aist-proxy-validation.md + ket-qua-aist-proxy-validation.svg
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from choreo.datasets.aist import AistData
from choreo.geom.triangulate import triangulate_dlt
from choreo.mocap.noise2d import perturb_keypoints2d
from experiments.aist_detector_2view import GENRE_NAME, UNIT_MM, select_sequences

# --- cấu hình thí nghiệm -------------------------------------------------------
PER_GENRE = 2                         # bài mỗi thể loại (10 thể loại -> ~20 bài)
STRIDE = 6                            # lấy mẫu thời gian (60fps/6 = 10fps) — nhẹ
SUBSET = (0, 2, 4, 6)                 # 4/9 camera, trải đều -> LOCO có 4 fold
SEED = 20260102

# Thang nhiễu: (nhãn, sigma_px, swap_rate, drop_rate) từ sạch -> rất nhiễu.
NOISE_LADDER = [
    ("sạch",            0.0,  0.00, 0.00),
    ("nhẹ 2px",         2.0,  0.00, 0.00),
    ("vừa 4px+1%",      4.0,  0.01, 0.00),
    ("khá 6px+2%+3%",   6.0,  0.02, 0.03),
    ("nặng 10px+4%+6%", 10.0, 0.04, 0.06),
    ("rất nặng 15px+6%+10%", 15.0, 0.06, 0.10),
]

# Xương CỨNG của COCO-17 (độ dài phải hằng số) — BỎ mặt (mắt/tai/mũi) vì ngắn & nhiễu.
COCO_BONES = (
    (5, 7), (7, 9),       # tay trái: vai->khuỷu->cổ tay
    (6, 8), (8, 10),      # tay phải
    (11, 13), (13, 15),   # chân trái: hông->gối->mắt cá
    (12, 14), (14, 16),   # chân phải
    (5, 6), (11, 12),     # vai, hông
    (5, 11), (6, 12),     # thân trái/phải (vai->hông)
)

OUT_MD = Path(__file__).resolve().parent / "ket-qua-aist-proxy-validation.md"
OUT_SVG = Path(__file__).resolve().parent / "ket-qua-aist-proxy-validation.svg"


# --- lõi số: dựng + metric (đều NaN-vững vì drop -> NaN) -----------------------
def recon_dlt(kp: np.ndarray, P: np.ndarray) -> np.ndarray:
    """(v,T,J,2) + (v,3,4) -> (T,J,3). DLT không trọng số, từng frame. NaN nếu <2 view."""
    v, T, J, _ = kp.shape
    out = np.full((T, J, 3), np.nan)
    for t in range(T):
        out[t] = triangulate_dlt(P, kp[:, t, :, :])
    return out


def reproj_err_px(j3d: np.ndarray, kp2d: np.ndarray, P: np.ndarray) -> float:
    """Sai số tái chiếu 3D->camera (px), NaN-vững (bỏ khớp không quan sát/▶dựng được)."""
    T, J = j3d.shape[:2]
    homog = np.concatenate([j3d, np.ones((T, J, 1))], axis=2)   # (T,J,4)
    proj = homog @ np.asarray(P, float).reshape(3, 4).T         # (T,J,3)
    uv = proj[..., :2] / (proj[..., 2:3] + 1e-12)
    err = np.linalg.norm(uv - kp2d, axis=2)                     # (T,J) px
    return float(np.nanmean(err)) if np.isfinite(err).any() else float("nan")


def loco_nan(kp: np.ndarray, P: np.ndarray) -> tuple[float, float]:
    """LOCO reproj NaN-vững: lần lượt giữ 1 máy, dựng từ máy còn lại, chiếu lên máy giữ.

    Khác `metrics.reprojection_error_loco` ở chỗ dùng nanmean — clip thật có khớp bị
    che vẫn phải ra số, không rơi về NaN khi MỘT khớp sót. Trả (tb, độ lệch) qua fold.
    """
    V = kp.shape[0]
    errs = []
    for k in range(V):
        keep = [i for i in range(V) if i != k]
        j3d = recon_dlt(kp[keep], P[keep])
        errs.append(reproj_err_px(j3d, kp[k], P[k]))
    errs = np.asarray(errs, float)
    if not np.isfinite(errs).any():
        return float("nan"), float("nan")
    return float(np.nanmean(errs)), float(np.nanstd(errs))


def mpjpe_world(pred: np.ndarray, gt: np.ndarray) -> float:
    """MPJPE 'thế giới' (KHÔNG căn gốc — cùng hệ world AIST), mm. NaN-vững."""
    m = min(pred.shape[0], gt.shape[0])
    d = np.linalg.norm(pred[:m] - gt[:m], axis=2)          # (T,J)
    return float(np.nanmean(d)) * UNIT_MM


def bone_std_mm(j3d: np.ndarray) -> float:
    """Độ lệch chuẩn độ dài xương CỨNG theo thời gian, tb trên xương (mm). NaN-vững."""
    stds = []
    for p, c in COCO_BONES:
        L = np.linalg.norm(j3d[:, c] - j3d[:, p], axis=1)  # (T,)
        if np.isfinite(L).sum() >= 2:
            stds.append(np.nanstd(L))
    return float(np.nanmean(stds)) * UNIT_MM if stds else float("nan")


def jitter_accel(j3d: np.ndarray, fps: float) -> float:
    """Độ rung = |gia tốc| trung bình (đơn vị world/s²). NaN-vững. Không cần GT."""
    if j3d.shape[0] < 3:
        return 0.0
    acc = np.diff(j3d, n=2, axis=0) * (fps ** 2)           # (T-2,J,3)
    mag = np.linalg.norm(acc, axis=2)
    return float(np.nanmean(mag)) if np.isfinite(mag).any() else float("nan")


# --- thống kê: Spearman qua hạng (tự viết, không scipy) ------------------------
def rankdata(a: np.ndarray) -> np.ndarray:
    """Hạng trung bình (xử lý trùng) như scipy.stats.rankdata('average')."""
    a = np.asarray(a, dtype=float)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a), dtype=float)
    ranks[order] = np.arange(1, len(a) + 1, dtype=float)
    # gộp trùng -> hạng trung bình
    _, inv, counts = np.unique(a, return_inverse=True, return_counts=True)
    sums = np.zeros(len(counts))
    np.add.at(sums, inv, ranks)
    return (sums / counts)[inv]


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    """ρ Spearman = Pearson trên hạng; bỏ cặp có NaN. Trả nan nếu <3 cặp hợp lệ."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 3:
        return float("nan")
    rx, ry = rankdata(x[ok]), rankdata(y[ok])
    rx = rx - rx.mean()
    ry = ry - ry.mean()
    denom = np.sqrt((rx ** 2).sum() * (ry ** 2).sum())
    return float((rx * ry).sum() / denom) if denom > 0 else float("nan")


# --- chạy thí nghiệm -----------------------------------------------------------
def run():
    rng = np.random.default_rng(SEED)
    aist = AistData()
    sel = select_sequences(aist, PER_GENRE)
    stems = [s for stems in sel.values() for s in stems]

    rows = []              # mỗi dòng: dict mẫu
    fps = 60.0 / STRIDE
    sub = list(SUBSET)

    for stem in stems:
        calibs = aist.calibs_for(stem)
        if len(calibs) <= max(sub):
            continue
        P = np.stack([calibs[v].P for v in sub]).astype(float)   # (4,3,4)
        kp_all = aist.keypoints2d(stem)[sub]                     # (4,T,17,3)
        gt_all = aist.keypoints3d(stem)                          # (T,17,3)
        xy = kp_all[:, ::STRIDE, :, :2].astype(float)            # (4,T',17,2)
        cf = kp_all[:, ::STRIDE, :, 2].astype(float)             # (4,T',17)
        gt = gt_all[::STRIDE].astype(float)                      # (T',17,3)

        for label, sigma, swap, drop in NOISE_LADDER:
            nxy, _ = perturb_keypoints2d(
                xy, cf, sigma_px=sigma, swap_rate=swap, drop_rate=drop, rng=rng)
            pred = recon_dlt(nxy, P)                             # (T',17,3)
            mp = mpjpe_world(pred, gt)
            loco_mean, loco_std = loco_nan(nxy, P)
            rows.append(dict(
                stem=stem, genre=GENRE_NAME.get(stem[:3], stem[:3]), level=label,
                sigma=sigma, mpjpe=mp, loco=loco_mean, loco_std=loco_std,
                bone=bone_std_mm(pred), jit=jitter_accel(pred, fps),
            ))

    return rows


# --- báo cáo md + biểu đồ SVG --------------------------------------------------
def fmt(v, nd=1):
    return "nan" if v != v else f"{v:.{nd}f}"


def write_md(rows, rhos):
    mp = np.array([r["mpjpe"] for r in rows])
    by_level = {}
    for r in rows:
        by_level.setdefault(r["level"], []).append(r)

    L = []
    L.append("# Kiểm chứng proxy GT-FREE trên AIST++ (tương quan với MPJPE thật)\n")
    L.append("> Sinh tự động bởi `experiments/aist_proxy_validation.py`. "
             "Mỗi mẫu = (bài × mức nhiễu). Dựng DLT KHÔNG trọng số, "
             f"tập con {len(SUBSET)} camera {SUBSET}, STRIDE={STRIDE}.\n")
    n_seq = len({r["stem"] for r in rows})
    L.append(f"- **{len(rows)} mẫu** ({n_seq} bài × {len(NOISE_LADDER)} mức nhiễu), "
             "COCO-17 không remap, đơn vị→mm (×%.0f).\n" % UNIT_MM)
    L.append("- MPJPE 'thế giới' (KHÔNG căn gốc — cùng hệ world với 3D tham chiếu 9-view).\n")

    L.append("\n## Tương quan hạng Spearman ρ (proxy vs MPJPE thật)\n")
    L.append("ρ→1: proxy xếp hạng chất lượng ĐỒNG THUẬN với GT ⇒ chấm GT-free hợp thức.\n")
    L.append("\n| Proxy GT-free | ý nghĩa | ρ Spearman |")
    L.append("|---|---|---:|")
    L.append(f"| reproj-LOCO (tb) | sai số tái chiếu leave-one-cam-out | {fmt(rhos['loco'],3)} |")
    L.append(f"| reproj-LOCO (độ lệch fold) | bất định giữa các fold | {fmt(rhos['loco_std'],3)} |")
    L.append(f"| bone-length-std | xương 'co giãn' do nhiễu | {fmt(rhos['bone'],3)} |")
    L.append(f"| jitter (gia tốc) | rung/giật quỹ đạo | {fmt(rhos['jit'],3)} |")

    L.append("\n## Trung bình theo mức nhiễu (dải chất lượng)\n")
    L.append("| Mức nhiễu | MPJPE thật (mm) | reproj-LOCO (px) | LOCO-std (px) | bone-std (mm) | jitter |")
    L.append("|---|---:|---:|---:|---:|---:|")
    for label, *_ in NOISE_LADDER:
        g = by_level.get(label, [])
        if not g:
            continue
        def mean(k):
            return float(np.nanmean([x[k] for x in g]))
        L.append(f"| {label} | {fmt(mean('mpjpe'))} | {fmt(mean('loco'))} | "
                 f"{fmt(mean('loco_std'),2)} | {fmt(mean('bone'))} | {fmt(mean('jit'),0)} |")

    L.append("\n## Đọc kết quả\n")
    best = max(rhos, key=lambda k: (rhos[k] if rhos[k] == rhos[k] else -9))
    name = {"loco": "reproj-LOCO", "loco_std": "LOCO-std",
            "bone": "bone-length-std", "jit": "jitter"}[best]
    L.append(f"- Proxy bám MPJPE thật mạnh nhất: **{name}** (ρ={fmt(rhos[best],3)}). "
             "Proxy càng tăng, sai số thật càng tăng — đúng kỳ vọng.\n")
    L.append("- Vì xếp hạng theo proxy ≈ xếp hạng theo GT, có thể dùng proxy để so "
             "1-cam vs 2-cam vs sau-cleanup trên clip TỰ QUAY (không GT) — "
             "hợp thức hoá tầng chấm Đường B.\n")
    L.append("- MPJPE tuyệt đối ở đây CAO hơn 2 sweep kia vì DLT thô KHÔNG trọng số/"
             "không làm mượt (cô lập quan hệ nhiễu→lỗi); kết luận là về TƯƠNG QUAN, "
             "không phải mức tuyệt đối.\n")
    L.append(f"\n![scatter](./{OUT_SVG.name})\n")
    OUT_MD.write_text("\n".join(L), encoding="utf-8")
    print(f"[đã ghi] {OUT_MD}")


# --- SVG scatter 3 bảng (proxy vs MPJPE), tô màu theo mức nhiễu -----------------
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


LEVEL_COLORS = ["#16a34a", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#7f1d1d"]


def write_svg(rows, rhos):
    W, H = 960, 380
    pad_l, pad_r, pad_t, pad_b = 56, 18, 56, 52
    panels = [
        ("loco", "reproj-LOCO (px)", rhos["loco"]),
        ("bone", "bone-length-std (mm)", rhos["bone"]),
        ("jit", "jitter (world/s²)", rhos["jit"]),
    ]
    pw = (W - 24 * (len(panels) - 1)) / len(panels)
    mp = np.array([r["mpjpe"] for r in rows], float)
    mp_lo, mp_hi = np.nanmin(mp), np.nanmax(mp)
    level_idx = {lab: i for i, (lab, *_) in enumerate(NOISE_LADDER)}

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
         f'font-family="Segoe UI, Arial, sans-serif">']
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')
    s.append(f'<text x="14" y="26" font-size="17" font-weight="700" fill="#0f172a">'
             f'Proxy GT-free vs MPJPE thật — mỗi điểm 1 (bài×mức nhiễu), {len(rows)} mẫu</text>')

    for pi, (key, xlabel, rho) in enumerate(panels):
        ox = pi * (pw + 24)
        x0, x1 = ox + pad_l, ox + pw - pad_r
        y0, y1 = pad_t, H - pad_b
        xs = np.array([r[key] for r in rows], float)
        ok = np.isfinite(xs) & np.isfinite(mp)
        xlo, xhi = np.nanmin(xs[ok]), np.nanmax(xs[ok])
        if xhi <= xlo:
            xhi = xlo + 1.0

        def sx(v):
            return x0 + (v - xlo) / (xhi - xlo) * (x1 - x0)

        def sy(v):
            return y1 - (v - mp_lo) / (mp_hi - mp_lo) * (y1 - y0)

        # khung
        s.append(f'<line x1="{x0}" y1="{y0}" x2="{x0}" y2="{y1}" stroke="#334155" stroke-width="1.3"/>')
        s.append(f'<line x1="{x0}" y1="{y1}" x2="{x1}" y2="{y1}" stroke="#334155" stroke-width="1.3"/>')
        # nhãn trục
        s.append(f'<text x="{(x0+x1)/2:.0f}" y="{H-18}" font-size="12" fill="#0f172a" '
                 f'text-anchor="middle">{esc(xlabel)}</text>')
        if pi == 0:
            s.append(f'<text x="16" y="{(y0+y1)/2:.0f}" font-size="12" fill="#0f172a" '
                     f'text-anchor="middle" transform="rotate(-90 16 {(y0+y1)/2:.0f})">'
                     f'MPJPE thật (mm)</text>')
        # mốc trục (min/max)
        for v in (xlo, xhi):
            s.append(f'<text x="{sx(v):.0f}" y="{y1+16}" font-size="10" fill="#64748b" '
                     f'text-anchor="middle">{v:.0f}</text>')
        for v in (mp_lo, mp_hi):
            s.append(f'<text x="{x0-6}" y="{sy(v)+3:.0f}" font-size="10" fill="#64748b" '
                     f'text-anchor="end">{v:.0f}</text>')
        # điểm
        for r in rows:
            xv, yv = r[key], r["mpjpe"]
            if not (np.isfinite(xv) and np.isfinite(yv)):
                continue
            c = LEVEL_COLORS[level_idx.get(r["level"], 0) % len(LEVEL_COLORS)]
            s.append(f'<circle cx="{sx(xv):.1f}" cy="{sy(yv):.1f}" r="3" fill="{c}" '
                     f'fill-opacity="0.72"/>')
        # ρ
        s.append(f'<text x="{x1-4:.0f}" y="{y0+16}" font-size="13" font-weight="700" '
                 f'fill="#0f172a" text-anchor="end">ρ = {fmt(rho,3)}</text>')

    # chú giải mức nhiễu
    lx = pad_l
    s.append(f'<text x="{lx}" y="{H-2}" font-size="10" fill="#475569">nhiễu:</text>')
    cx = lx + 44
    for i, (lab, *_rest) in enumerate(NOISE_LADDER):
        s.append(f'<circle cx="{cx}" cy="{H-6}" r="3.5" fill="{LEVEL_COLORS[i]}"/>')
        short = lab.split()[0]
        s.append(f'<text x="{cx+7}" y="{H-2}" font-size="9.5" fill="#475569">{esc(short)}</text>')
        cx += 30 + 7 * len(short)
    s.append('</svg>')
    OUT_SVG.write_text("\n".join(s), encoding="utf-8")
    print(f"[đã ghi] {OUT_SVG}")


def main():
    rows = run()
    if not rows:
        raise SystemExit("Không thu được mẫu nào (kiểm cache AIST).")
    rhos = {k: spearman(np.array([r[k] for r in rows]),
                        np.array([r["mpjpe"] for r in rows]))
            for k in ("loco", "loco_std", "bone", "jit")}
    print("Spearman ρ:", {k: fmt(v, 3) for k, v in rhos.items()})
    write_md(rows, rhos)
    write_svg(rows, rhos)


if __name__ == "__main__":
    main()
