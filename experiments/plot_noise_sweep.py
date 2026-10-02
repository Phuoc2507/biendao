"""Vẽ biểu đồ σ_px -> MPJPE cho sweep nhiễu detector (SVG thuần, KHÔNG phụ thuộc).

Đọc bảng "MPJPE trung bình theo mức nhiễu" trong ket-qua-aist-noise-sweep.md và
xuất experiments/ket-qua-aist-noise-sweep.svg — hình luận văn: đường jitter thuần
0/2/4/8 px, đường nền "sạch (curated)", và cụm điểm tại 4px (lẫn T/P, sót khớp,
"RTMPose ước") để thấy giá detector thật kỳ vọng và ngưỡng suy biến của lõi.

Không matplotlib (repo giữ thuần numpy); tự dựng toạ độ -> SVG. Tái chạy sau mỗi
lần sweep đổi số: .venv/Scripts/python experiments/plot_noise_sweep.py
"""

from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC_MD = HERE / "ket-qua-aist-noise-sweep.md"
OUT_SVG = HERE / "ket-qua-aist-noise-sweep.svg"

# Khung vẽ
W, H = 780, 500
ML, MR, MT, MB = 92, 210, 64, 70          # lề (chừa phải cho chú giải)
PX0, PX1 = ML, W - MR                       # vùng vẽ ngang
PY0, PY1 = MT, H - MB                        # vùng vẽ dọc (PY0 = trên)

# Trục
X_MAX = 8.5                                   # σ_px
Y_MIN, Y_MAX = 30.0, 55.0                     # mm, bao trùm 37.3..51.3

C_AXIS = "#334155"
C_GRID = "#e2e8f0"
C_JIT = "#2563eb"      # đường jitter thuần
C_BASE = "#16a34a"     # nền sạch
C_SWAP = "#ea580c"     # 4px + lẫn T/P
C_DROP = "#9333ea"     # 4px + sót khớp
C_RTM = "#dc2626"      # RTMPose ước
C_TXT = "#0f172a"


def parse_means(md: str) -> dict[str, float]:
    """Lấy {nhãn cấu hình -> MPJPE tb} từ bảng markdown đầu tiên có cột MPJPE tb."""
    out: dict[str, float] = {}
    for m in re.finditer(r"^\|\s*(.+?)\s*\|\s*([\d.]+)\s*\|\s*[\d.]+\s*\|\s*[+\-][\d.]+\s*\|$",
                          md, flags=re.M):
        label = m.group(1).strip()
        if label.lower().startswith("cấu hình") or set(label) <= {"-", ":"}:
            continue
        out[label] = float(m.group(2))
    return out


def sx(v: float) -> float:
    return PX0 + (v / X_MAX) * (PX1 - PX0)


def sy(v: float) -> float:
    return PY1 - (v - Y_MIN) / (Y_MAX - Y_MIN) * (PY1 - PY0)


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_svg(means: dict[str, float]) -> str:
    clean = means["sạch (curated)"]
    jitter = [(0.0, clean), (2.0, means["jitter 2px"]),
              (4.0, means["jitter 4px"]), (8.0, means["jitter 8px"])]
    pt_swap = means["4px + lẫn T/P 2%"]
    pt_drop = means["4px + sót khớp 5%"]
    pt_rtm = means["RTMPose ước (4px+1%+2%)"]

    s: list[str] = []
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
             f'font-family="Segoe UI, Arial, sans-serif">')
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')

    # Tiêu đề
    s.append(f'<text x="{ML}" y="28" font-size="18" font-weight="700" fill="{C_TXT}">'
             f'Tiên lượng Gate 0: MPJPE theo mức nhiễu detector (2-view, AIST++)</text>')
    s.append(f'<text x="{ML}" y="48" font-size="12.5" fill="#475569">'
             f'Bơm nhiễu mô phỏng vào keypoint curated · 20 bài · cặp camera ~75° · robust + trọng số conf</text>')

    # Lưới + nhãn trục Y
    y = 30
    while y <= Y_MAX + 0.01:
        yy = sy(y)
        s.append(f'<line x1="{PX0}" y1="{yy:.1f}" x2="{PX1}" y2="{yy:.1f}" '
                 f'stroke="{C_GRID}" stroke-width="1"/>')
        s.append(f'<text x="{PX0-10}" y="{yy+4:.1f}" font-size="11.5" fill="#475569" '
                 f'text-anchor="end">{y:.0f}</text>')
        y += 5
    s.append(f'<text x="26" y="{(PY0+PY1)/2:.0f}" font-size="13" fill="{C_TXT}" '
             f'text-anchor="middle" transform="rotate(-90 26 {(PY0+PY1)/2:.0f})">MPJPE (mm)</text>')

    # Nhãn trục X (các mốc σ ta có số)
    for xv in (0, 2, 4, 8):
        xx = sx(xv)
        s.append(f'<line x1="{xx:.1f}" y1="{PY1}" x2="{xx:.1f}" y2="{PY1+5}" stroke="{C_AXIS}" stroke-width="1"/>')
        s.append(f'<text x="{xx:.1f}" y="{PY1+22}" font-size="11.5" fill="#475569" '
                 f'text-anchor="middle">{xv}</text>')
    s.append(f'<text x="{(PX0+PX1)/2:.0f}" y="{H-22}" font-size="13" fill="{C_TXT}" '
             f'text-anchor="middle">Nhiễu jitter σ (pixel, ở khớp tin cậy đầy)</text>')

    # Khung trục
    s.append(f'<line x1="{PX0}" y1="{PY0}" x2="{PX0}" y2="{PY1}" stroke="{C_AXIS}" stroke-width="1.5"/>')
    s.append(f'<line x1="{PX0}" y1="{PY1}" x2="{PX1}" y2="{PY1}" stroke="{C_AXIS}" stroke-width="1.5"/>')

    # Đường nền sạch (ngang, đứt)
    yb = sy(clean)
    s.append(f'<line x1="{PX0}" y1="{yb:.1f}" x2="{PX1}" y2="{yb:.1f}" '
             f'stroke="{C_BASE}" stroke-width="1.6" stroke-dasharray="7 5"/>')

    # Đường jitter thuần
    pts = " ".join(f"{sx(x):.1f},{sy(v):.1f}" for x, v in jitter)
    s.append(f'<polyline points="{pts}" fill="none" stroke="{C_JIT}" stroke-width="2.6"/>')
    for x, v in jitter:
        s.append(f'<circle cx="{sx(x):.1f}" cy="{sy(v):.1f}" r="4.5" fill="{C_JIT}"/>')
        s.append(f'<text x="{sx(x):.1f}" y="{sy(v)-11:.1f}" font-size="11" fill="{C_JIT}" '
                 f'text-anchor="middle" font-weight="600">{v:.1f}</text>')

    # Cụm điểm cấu hình phức ở σ=4 (lệch ngang nhẹ cho dễ đọc)
    combos = [(3.5, pt_swap, C_SWAP, "lẫn T/P 2%"),
              (4.0, pt_drop, C_DROP, "sót khớp 5%"),
              (4.5, pt_rtm, C_RTM, "RTMPose ước")]
    for x, v, c, _ in combos:
        s.append(f'<circle cx="{sx(x):.1f}" cy="{sy(v):.1f}" r="5" fill="{c}" '
                 f'stroke="#ffffff" stroke-width="1.3"/>')
    # nhấn RTMPose ước bằng mũi tên Δ so với nền
    xr, yr = sx(4.5), sy(pt_rtm)
    s.append(f'<line x1="{xr:.1f}" y1="{yb:.1f}" x2="{xr:.1f}" y2="{yr:.1f}" '
             f'stroke="{C_RTM}" stroke-width="1" stroke-dasharray="2 3"/>')
    s.append(f'<text x="{xr+8:.1f}" y="{(yb+yr)/2+4:.1f}" font-size="11" fill="{C_RTM}" '
             f'font-weight="700">Δ +{pt_rtm-clean:.1f} mm</text>')

    # Chú giải (bên phải)
    lx, ly = PX1 + 24, PY0 + 6
    def legend(dy, color, label, dashed=False, marker="line"):
        yy = ly + dy
        if marker == "line":
            dash = ' stroke-dasharray="7 5"' if dashed else ""
            s.append(f'<line x1="{lx}" y1="{yy}" x2="{lx+26}" y2="{yy}" stroke="{color}" '
                     f'stroke-width="2.6"{dash}/>')
        else:
            s.append(f'<circle cx="{lx+13}" cy="{yy}" r="5" fill="{color}" stroke="#fff" stroke-width="1.3"/>')
        s.append(f'<text x="{lx+34}" y="{yy+4}" font-size="11.5" fill="{C_TXT}">{esc(label)}</text>')

    s.append(f'<text x="{lx}" y="{ly-14}" font-size="12.5" font-weight="700" fill="{C_TXT}">Chú giải</text>')
    legend(6, C_JIT, "jitter thuần (0→8px)")
    legend(30, C_BASE, f"nền sạch curated {clean:.1f}mm", dashed=True)
    legend(58, C_SWAP, f"4px + lẫn T/P 2% ({pt_swap:.1f})", marker="dot")
    legend(80, C_DROP, f"4px + sót khớp 5% ({pt_drop:.1f})", marker="dot")
    legend(102, C_RTM, f"RTMPose ước ({pt_rtm:.1f})", marker="dot")

    # Ghi chú đọc hình
    s.append(f'<text x="{lx}" y="{ly+140}" font-size="10.8" fill="#64748b">Jitter chi phối, gần</text>')
    s.append(f'<text x="{lx}" y="{ly+155}" font-size="10.8" fill="#64748b">tuyến tính; lẫn T/P &amp;</text>')
    s.append(f'<text x="{lx}" y="{ly+170}" font-size="10.8" fill="#64748b">sót khớp bị robust +</text>')
    s.append(f'<text x="{lx}" y="{ly+185}" font-size="10.8" fill="#64748b">nội suy hấp thụ gần hết.</text>')

    s.append('</svg>')
    return "\n".join(s)


def main() -> None:
    means = parse_means(SRC_MD.read_text(encoding="utf-8"))
    need = ["sạch (curated)", "jitter 2px", "jitter 4px", "jitter 8px",
            "4px + lẫn T/P 2%", "4px + sót khớp 5%", "RTMPose ước (4px+1%+2%)"]
    missing = [k for k in need if k not in means]
    if missing:
        raise SystemExit(f"Thiếu cấu hình trong {SRC_MD.name}: {missing}\nĐọc được: {list(means)}")
    OUT_SVG.write_text(build_svg(means), encoding="utf-8")
    print(f"[đã ghi] {OUT_SVG}  ({len(means)} cấu hình)")


if __name__ == "__main__":
    main()
