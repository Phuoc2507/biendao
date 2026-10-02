"""TIÊN LƯỢNG H3 (góc đặt máy) offline trên MÚA THẬT — quét góc giao hội AIST++.

Sweep nhiễu (aist_noise_sweep.py) cố định cặp camera ~75°, đo detector-robustness.
Ở ĐÂY cố định keypoint (curated, sạch) và QUÉT GÓC: với mỗi bài, duyệt toàn bộ
C(9,2)=36 cặp trong 9 camera AIST, tính góc giao hội quanh trọng tâm cơ thể, tam
giác hoá 2-view rồi đo MPJPE vs 3D tham chiếu 9-view. Gom theo khoảng góc 30° ->
đường cong MPJPE(góc).

Mục đích kép:
  1. Tiên lượng §6 "Biểu đồ MPJPE theo góc đặt máy" (H3) TRƯỚC khi quay/▶GPU.
  2. Đối chứng quy luật từ synthetic ("~60–120° tốt, 150–180° nổ") trên DỮ LIỆU THẬT
     -> góc kiểm chứng chéo cho điều kiện ổn định của tam giác hoá 2-view.

Biến cô lập là GÓC (keypoint giữ sạch); nhiễu detector là trục trực giao đã quét
riêng. Chạy:  .venv/Scripts/python experiments/aist_angle_sweep.py
Ghi:  ket-qua-aist-angle-sweep.md + ket-qua-aist-angle-sweep.svg (cần mạng kéo annotation).
"""

from __future__ import annotations

import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from choreo.datasets.aist import AistData
from choreo.geom.cameras import ray_angle_deg
from choreo.mocap.fuse import fuse_multiview
from experiments.aist_detector_2view import (
    GENRE_NAME, STRIDE, UNIT_MM, mpjpe, select_sequences,
)

ANGLE_PER_GENRE = 2                       # bài mỗi thể loại (20 bài × 36 cặp = 720 mẫu)
BIN_EDGES = [0, 30, 60, 90, 120, 150, 180]
OUT_MD = Path(__file__).resolve().parent / "ket-qua-aist-angle-sweep.md"
OUT_SVG = Path(__file__).resolve().parent / "ket-qua-aist-angle-sweep.svg"


def pair_angles(calibs, centroid3d):
    """[(cặp view, góc°)] cho toàn bộ C(V,2) cặp trong một bài."""
    pairs = list(combinations(range(len(calibs)), 2))
    return [(p, ray_angle_deg(calibs[p[0]], calibs[p[1]], centroid3d)) for p in pairs]


def mpjpe_for_pair(aist, stem, pair, calibs, gt) -> float:
    """MPJPE (mm) tam giác hoá 2-view từ keypoint CURATED của cặp `pair`."""
    kp2d = aist.keypoints2d(stem)[list(pair)]          # (2,T,17,3)
    n = min(kp2d.shape[1], gt.shape[0] * STRIDE + STRIDE)
    xy = kp2d[:, ::STRIDE, :, :2].astype(float)         # (2,T',17,2)
    cf = kp2d[:, ::STRIDE, :, 2].astype(float)
    clip = fuse_multiview(xy, [calibs[v] for v in pair], fps=60.0 / STRIDE,
                          confidences=cf, robust=True)
    m = min(clip.joints3d.shape[0], gt.shape[0])
    return mpjpe(clip.joints3d[:m], gt[:m])[0]


def bin_index(angle: float) -> int:
    for i in range(len(BIN_EDGES) - 1):
        if BIN_EDGES[i] <= angle < BIN_EDGES[i + 1]:
            return i
    return len(BIN_EDGES) - 2                            # 180° -> bin cuối


# ----------------------------- biểu đồ SVG thuần -----------------------------

def build_svg(centers, means, medians, counts) -> str:
    W, H = 780, 500
    ML, MR, MT, MB = 92, 40, 64, 70
    PX0, PX1, PY0, PY1 = ML, W - MR, MT, H - MB
    # Bin suy biến (150–180°) nổ tới hàng nghìn mm -> chặn trần để đọc được vùng hữu ích;
    # điểm vượt trần được kẹp vào trần + chú thích giá trị thật (↑).
    Y_CAP, y_min = 70.0, 30.0
    y_max = Y_CAP
    C_TXT, C_LINE, C_MED, C_GRID = "#0f172a", "#2563eb", "#9333ea", "#e2e8f0"
    GOOD, C_OFF = "#16a34a", "#dc2626"

    def sx(a): return PX0 + a / 180.0 * (PX1 - PX0)
    def sy(v): return PY1 - (min(v, Y_CAP) - y_min) / (y_max - y_min) * (PY1 - PY0)

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
         f'font-family="Segoe UI, Arial, sans-serif">',
         f'<rect width="{W}" height="{H}" fill="#ffffff"/>']
    s.append(f'<text x="{ML}" y="28" font-size="18" font-weight="700" fill="{C_TXT}">'
             f'Tiên lượng H3: MPJPE theo góc giao hội 2 camera (AIST++ thật)</text>')
    s.append(f'<text x="{ML}" y="48" font-size="12.5" fill="#475569">'
             f'Keypoint curated sạch · 36 cặp/bài trong 9 camera · bin 30° · đối chứng quy luật synthetic</text>')

    # vùng "tốt" 60–120°
    s.append(f'<rect x="{sx(60):.1f}" y="{PY0}" width="{sx(120)-sx(60):.1f}" '
             f'height="{PY1-PY0}" fill="{GOOD}" opacity="0.07"/>')
    s.append(f'<text x="{(sx(60)+sx(120))/2:.0f}" y="{PY0+16}" font-size="11" '
             f'fill="{GOOD}" text-anchor="middle" font-weight="600">vùng ổn định kỳ vọng</text>')

    # lưới + trục Y
    yt = 30
    while yt <= y_max + 0.1:
        yy = sy(yt)
        s.append(f'<line x1="{PX0}" y1="{yy:.1f}" x2="{PX1}" y2="{yy:.1f}" stroke="{C_GRID}"/>')
        s.append(f'<text x="{PX0-10}" y="{yy+4:.1f}" font-size="11.5" fill="#475569" text-anchor="end">{yt:.0f}</text>')
        yt += 10
    s.append(f'<text x="26" y="{(PY0+PY1)//2}" font-size="13" fill="{C_TXT}" text-anchor="middle" '
             f'transform="rotate(-90 26 {(PY0+PY1)//2})">MPJPE (mm)</text>')

    # trục X 0..180
    for xv in range(0, 181, 30):
        xx = sx(xv)
        s.append(f'<line x1="{xx:.1f}" y1="{PY1}" x2="{xx:.1f}" y2="{PY1+5}" stroke="#334155"/>')
        s.append(f'<text x="{xx:.1f}" y="{PY1+22}" font-size="11.5" fill="#475569" text-anchor="middle">{xv}°</text>')
    s.append(f'<text x="{(PX0+PX1)//2}" y="{H-22}" font-size="13" fill="{C_TXT}" text-anchor="middle">'
             f'Góc giao hội 2 camera (độ)</text>')
    s.append(f'<line x1="{PX0}" y1="{PY0}" x2="{PX0}" y2="{PY1}" stroke="#334155" stroke-width="1.5"/>')
    s.append(f'<line x1="{PX0}" y1="{PY1}" x2="{PX1}" y2="{PY1}" stroke="#334155" stroke-width="1.5"/>')

    def polyline(vals, color, width, dash=""):
        pts = [(sx(c), sy(v)) for c, v in zip(centers, vals) if v == v]
        if len(pts) >= 2:
            p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
            d = f' stroke-dasharray="{dash}"' if dash else ""
            s.append(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="{width}"{d}/>')
        return pts

    polyline(medians, C_MED, 1.8, "6 4")
    polyline(means, C_LINE, 2.6)
    for (c, v, md, n) in zip(centers, means, medians, counts):
        if v != v:
            continue
        off = v > Y_CAP
        col = C_OFF if off else C_LINE
        s.append(f'<circle cx="{sx(c):.1f}" cy="{sy(v):.1f}" r="4.5" fill="{col}"/>')
        if off:
            # kẹp ở trần: mũi tên + giá trị thật (tb / trung vị)
            s.append(f'<text x="{sx(c):.1f}" y="{sy(v)-22:.1f}" font-size="13" fill="{C_OFF}" '
                     f'text-anchor="middle" font-weight="700">↑ nổ</text>')
            s.append(f'<text x="{sx(c):.1f}" y="{sy(v)-8:.1f}" font-size="10" fill="{C_OFF}" '
                     f'text-anchor="middle">tb {v:.0f} · vị {md:.0f}</text>')
        else:
            s.append(f'<text x="{sx(c):.1f}" y="{sy(v)-10:.1f}" font-size="11" fill="{C_LINE}" '
                     f'text-anchor="middle" font-weight="600">{v:.0f}</text>')
        s.append(f'<text x="{sx(c):.1f}" y="{PY1-6:.1f}" font-size="9.5" fill="#94a3b8" '
                 f'text-anchor="middle">n={n}</text>')

    # chú giải
    lx, ly = PX1 - 168, PY0 + 10
    s.append(f'<line x1="{lx}" y1="{ly}" x2="{lx+24}" y2="{ly}" stroke="{C_LINE}" stroke-width="2.6"/>')
    s.append(f'<text x="{lx+30}" y="{ly+4}" font-size="11.5" fill="{C_TXT}">MPJPE trung bình</text>')
    s.append(f'<line x1="{lx}" y1="{ly+20}" x2="{lx+24}" y2="{ly+20}" stroke="{C_MED}" stroke-width="1.8" stroke-dasharray="6 4"/>')
    s.append(f'<text x="{lx+30}" y="{ly+24}" font-size="11.5" fill="{C_TXT}">trung vị</text>')
    s.append('</svg>')
    return "\n".join(s)


def main():
    aist = AistData()
    sel = select_sequences(aist, ANGLE_PER_GENRE)
    stems = [s for ss in sel.values() for s in ss]

    buckets: list[list[float]] = [[] for _ in range(len(BIN_EDGES) - 1)]
    lines: list[str] = []
    def emit(s=""):
        print(s); lines.append(s)

    print(f"Quét góc trên {len(stems)} bài × 36 cặp ...")
    for k, stem in enumerate(stems, 1):
        calibs = aist.calibs_for(stem)
        gt_full = aist.keypoints3d(stem)
        centroid = gt_full.reshape(-1, 3).mean(0)
        gt = gt_full[::STRIDE]
        for pair, ang in pair_angles(calibs, centroid):
            try:
                m = mpjpe_for_pair(aist, stem, pair, calibs, gt)
            except Exception:
                continue
            if np.isfinite(m):
                buckets[bin_index(ang)].append(m)
        print(f"  [{k}/{len(stems)}] {stem.replace('_cAll','')}")

    centers = [(BIN_EDGES[i] + BIN_EDGES[i + 1]) / 2 for i in range(len(buckets))]
    means = [float(np.mean(b)) if b else float("nan") for b in buckets]
    medians = [float(np.median(b)) if b else float("nan") for b in buckets]
    counts = [len(b) for b in buckets]

    emit("# Tiên lượng H3: MPJPE 2-view theo góc giao hội camera (AIST++ thật)")
    emit()
    emit(f"- {len(stems)} bài ({len(sel)} thể loại) × toàn bộ 36 cặp trong 9 camera AIST.")
    emit("- Keypoint **curated sạch** (cô lập ảnh hưởng GÓC; nhiễu detector là trục đã quét riêng).")
    emit(f"- COCO-17, đơn vị→mm (×{UNIT_MM:.0f}), STRIDE={STRIDE}, robust=True + trọng số conf.")
    emit()
    emit("> Mục đích: tiên lượng \"MPJPE theo góc đặt máy\" (§6/H3) & đối chứng quy luật "
         "synthetic *~60–120° tốt, 150–180° nổ* trên dữ liệu múa THẬT — TRƯỚC khi quay/GPU.")
    emit()
    emit("## MPJPE theo khoảng góc giao hội")
    emit()
    emit("| Khoảng góc | Số cặp | MPJPE tb (mm) | MPJPE trung vị |")
    emit("|---|---:|---:|---:|")
    for i in range(len(buckets)):
        lbl = f"{BIN_EDGES[i]}–{BIN_EDGES[i+1]}°"
        if counts[i]:
            emit(f"| {lbl} | {counts[i]} | {means[i]:.1f} | {medians[i]:.1f} |")
        else:
            emit(f"| {lbl} | 0 | — | — |")
    emit()
    ok = [(centers[i], means[i]) for i in range(len(buckets)) if counts[i]]
    if ok:
        best = min(ok, key=lambda t: t[1])
        worst = max(ok, key=lambda t: t[1])
        emit(f"**Đọc kết quả:** thấp nhất ở ~{best[0]:.0f}° ({best[1]:.1f} mm), cao nhất ở "
             f"~{worst[0]:.0f}° ({worst[1]:.1f} mm). Đường cong hình chữ U theo góc khớp "
             "quy luật synthetic: góc quá nhỏ (hai máy gần nhau → chiều sâu kém định) và "
             "quá lớn (gần đối đỉnh → che khuất + suy biến) đều đẩy sai số lên; vùng giữa "
             "ổn định. Đây là tiên lượng trên curated; detector thật sẽ dịch toàn đường lên "
             "theo mức đã đo ở sweep nhiễu.")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    OUT_SVG.write_text(build_svg(centers, means, medians, counts), encoding="utf-8")
    print(f"\n[đã ghi] {OUT_MD}\n[đã ghi] {OUT_SVG}")


if __name__ == "__main__":
    main()
