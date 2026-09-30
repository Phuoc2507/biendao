"""Bản đồ đặt góc máy: quét lưới 2D cặp phương vị (máy A, máy B).

Đây là DELIVERABLE novelty mà teardown Choreoto nêu — "hướng dẫn đặt góc máy" —
thứ sản phẩm 1-camera của đối thủ không có. Khác với thí nghiệm A (chỉ quét góc
lệch ĐỐI XỨNG quanh mặt trước), bản đồ này quét ĐỘC LẬP vị trí từng máy, và chấm
điểm bằng cấu hình THỰC TẾ NHẤT: CÓ che khuất (mỗi khớp cần >=2 máy cùng thấy).

Với người múa xoay người, không có góc nào tối ưu mọi lúc; ta đo trung bình theo
cả đoạn múa (đã gồm xoay thân +-40°) rồi tìm vùng dung hoà độ phủ x độ chính xác.

Chạy:  .venv/Scripts/python experiments/ban_do_dat_may.py
Kết quả in ra màn hình VÀ ghi vào experiments/ket-qua-ban-do-dat-may.md
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

# Tái dùng đúng bộ đánh giá che khuất + cấu hình của thí nghiệm gốc (DRY, nhất quán).
from experiments.synthetic_2view import (  # noqa: E402
    DISTANCE, ELEV, FOV, IMAGE, DEFAULT_NOISE_PX,
    _run_config_occluded,
)
from choreo.geom import look_at_camera  # noqa: E402
from choreo.synth import synthetic_dance  # noqa: E402

# Lưới phương vị quét (độ). 0° = chính diện; âm = trái, dương = phải.
ANGLES = [-90, -60, -30, 0, 30, 60, 90]
TRIALS_MAP = 15        # ít hơn thí nghiệm chính vì lưới nhiều ô
SECONDS_MAP = 2.0
COV_FLOOR = 90.0       # ngưỡng độ phủ tối thiểu chấp nhận được (%)


def build_map(gt, angles=ANGLES, noise=DEFAULT_NOISE_PX, trials=TRIALS_MAP):
    """Tính (độ phủ %, MPJPE khớp khôi phục mm) cho mọi cặp máy A<B trong lưới.

    Trả về dict {(i, j): (cov, err)} với i<j là chỉ số trong `angles`.
    """
    pairs: dict[tuple[int, int], tuple[float, float]] = {}
    for i in range(len(angles)):
        for j in range(i + 1, len(angles)):
            cams = [
                look_at_camera(angles[i], DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE),
                look_at_camera(angles[j], DISTANCE, elevation_deg=ELEV, fov_y_deg=FOV, image_size=IMAGE),
            ]
            cov, err = _run_config_occluded(cams, gt, noise, trials)
            pairs[(i, j)] = (cov, err)
    return pairs


def recommend(pairs, angles=ANGLES, cov_floor=COV_FLOOR):
    """Chọn cặp máy khuyến nghị: MPJPE nhỏ nhất TRONG số cặp đạt độ phủ >= sàn.

    Đây đúng cách người dùng chọn: đảm bảo thấy đủ khớp trước, rồi tối ưu độ chính
    xác. Trả về dict mô tả cặp thắng (kèm phương án dự phòng nếu không cặp nào đạt sàn).
    """
    valid = {k: v for k, v in pairs.items() if v[0] >= cov_floor and np.isfinite(v[1])}
    fallback = False
    pool = valid
    if not pool:  # không cặp nào đạt sàn -> nới ra, chọn phủ cao nhất rồi err nhỏ nhất
        fallback = True
        pool = {k: v for k, v in pairs.items() if np.isfinite(v[1])}
    (i, j), (cov, err) = min(pool.items(), key=lambda kv: (kv[1][1] if not fallback else (-kv[1][0], kv[1][1])))
    return {
        "az_a": angles[i], "az_b": angles[j],
        "separation": angles[j] - angles[i],
        "coverage": cov, "mpjpe": err,
        "fallback": fallback, "cov_floor": cov_floor,
    }


def _cell_glyph(cov, err):
    """Ký hiệu ô: kết hợp độ phủ (chữ) và độ chính xác (đậm nhạt) trong 3 ký tự."""
    if not np.isfinite(err):
        return " x "
    # bậc độ chính xác theo MPJPE (mm)
    if err < 12:
        acc = "@"
    elif err < 20:
        acc = "o"
    elif err < 40:
        acc = "."
    else:
        acc = " "  # rất kém (thoái hoá)
    cov_ok = "+" if cov >= COV_FLOOR else "-"
    return f"{cov_ok}{acc} "


def _fmt_grid(pairs, angles, pick, kind):
    """Vẽ lưới tam giác trên (A theo hàng, B theo cột). kind='glyph'|'cov'|'err'."""
    header = "A\\B " + "".join(f"{a:>5}" for a in angles)
    lines = [header, "    " + "-----" * len(angles)]
    for i, a in enumerate(angles):
        cells = []
        for j in range(len(angles)):
            if j <= i or (i, j) not in pairs:
                cells.append("    .")
                continue
            cov, err = pairs[(i, j)]
            if kind == "cov":
                cells.append(f"{cov:5.0f}")
            elif kind == "err":
                cells.append("  inf" if not np.isfinite(err) else f"{err:5.0f}")
            else:
                g = _cell_glyph(cov, err)
                star = "*" if (i, j) == (pick["_i"], pick["_j"]) else " "
                cells.append(f"{g}{star}".rjust(5))
        lines.append(f"{a:>4}" + "".join(cells))
    return "\n".join(lines)


def main():
    gt = synthetic_dance(fps=30.0, seconds=SECONDS_MAP, seed=0).joints3d
    print(f"Bản đồ đặt góc máy — lưới {len(ANGLES)}×{len(ANGLES)} phương vị, "
          f"che khuất bật, {TRIALS_MAP} lần lặp/ô.\n")

    pairs = build_map(gt)
    rec = recommend(pairs)
    # gắn chỉ số ô thắng để đánh dấu * trên lưới
    for (i, j), (cov, err) in pairs.items():
        if ANGLES[i] == rec["az_a"] and ANGLES[j] == rec["az_b"]:
            rec["_i"], rec["_j"] = i, j
            break

    grid_glyph = _fmt_grid(pairs, ANGLES, rec, "glyph")
    grid_cov = _fmt_grid(pairs, ANGLES, rec, "cov")
    grid_err = _fmt_grid(pairs, ANGLES, rec, "err")

    # vài cặp tiêu biểu để nêu trong phần đọc kết quả
    def _find(a, b):
        i, j = ANGLES.index(a), ANGLES.index(b)
        if i > j:
            i, j = j, i
        return pairs.get((i, j), (float("nan"), float("nan")))

    fallback_note = ("\n> **Lưu ý:** không cặp nào đạt sàn độ phủ "
                     f"{COV_FLOOR:.0f}% → khuyến nghị lấy theo độ phủ cao nhất."
                     if rec["fallback"] else "")

    doc = f"""# Bản đồ đặt góc máy 2 camera (có che khuất)

*Sinh tự động bởi `experiments/ban_do_dat_may.py` — thuần numpy, chạy CPU.*

## Câu hỏi
"Đặt 2 điện thoại ở hai phương vị nào quanh sân khấu thì vừa **thấy đủ khớp**
(che khuất ít) vừa **dựng 3D chính xác**?" — thứ sản phẩm 1-camera (Choreoto)
không trả lời được, và là hướng dẫn thực dụng cho người dùng nghiệp dư.

## Thiết lập
- Chuyển động ground-truth: múa tổng hợp {gt.shape[0]} khung ({SECONDS_MAP:.0f}s @ 30fps),
  có xoay thân ±40° (nên che khuất thay đổi theo thời gian — sát thực tế).
- Camera pinhole: khoảng cách {DISTANCE}m, độ cao {ELEV:.0f}°, FOV {FOV:.0f}°, ảnh {IMAGE[0]}×{IMAGE[1]}.
- Mỗi ô: che khuất bật (khớp cần ≥2 máy cùng thấy), nhiễu {DEFAULT_NOISE_PX:.0f}px, {TRIALS_MAP} lần lặp.
- Chấm điểm 2 chiều: **độ phủ** (% khớp khôi phục được) và **MPJPE** trên khớp khôi phục được.
- Lưới đối xứng nên chỉ tính nửa trên (A < B); đường chéo = một máy (bỏ).

## Bản đồ tổng hợp (ô = độ_phủ · độ_chính_xác)
Ký hiệu mỗi ô `<phủ><acc>`: phủ `+`=đạt≥{COV_FLOOR:.0f}%, `-`=dưới sàn;
acc `@`<12mm, `o`<20mm, `.`<40mm, ` `≥40mm (hoặc `x`=thoái hoá). `*` = khuyến nghị.
```
{grid_glyph}
```

## Lưới độ phủ khớp (%)
```
{grid_cov}
```

## Lưới MPJPE khớp khôi phục (mm)
```
{grid_err}
```

## Khuyến nghị
**Đặt 2 máy ở {rec['az_a']:+d}° và {rec['az_b']:+d}°** (lệch {rec['separation']}°):
độ phủ **{rec['coverage']:.1f}%**, MPJPE **{rec['mpjpe']:.1f}mm** — MPJPE nhỏ nhất trong
các cặp đạt sàn phủ {COV_FLOOR:.0f}%.{fallback_note}

**Đọc kết quả:**
- Cặp gần đối xứng quanh chính diện, lệch ~60–90° (vd −30°/+30°: phủ {_find(-30,30)[0]:.0f}%,
  {_find(-30,30)[1]:.0f}mm; −45°… nằm giữa lưới), cho vùng dung hoà tốt nhất — khớp
  kết luận thí nghiệm A + D.
- Cặp lệch quá rộng ~180° (−90°/+90°: phủ {_find(-90,90)[0]:.0f}%, MPJPE {_find(-90,90)[1]:.0f}mm)
  vừa mất khớp do quay lưng vừa thoái hoá tam giác hoá → tránh.
- Cặp lệch quá hẹp (−30°/0° kề nhau: phủ {_find(-30,0)[0]:.0f}%, {_find(-30,0)[1]:.0f}mm)
  phủ cao nhưng độ sâu bất định → MPJPE kém.
- Đặt lệch tâm (cả hai cùng một phía, vd 0°/+60°: phủ {_find(0,60)[0]:.0f}%,
  {_find(0,60)[1]:.0f}mm) kém đối xứng: một bên thân bị che nhiều hơn.

## Hệ quả cho luận văn
1. Cho ra **hướng dẫn đặt máy định lượng** (bản đồ 2D), không chỉ một con số — đây là
   sản phẩm phụ có giá trị thực dụng cho tầng perception.
2. Củng cố khuyến nghị "hai điện thoại lệch ~60–90°, đối xứng quanh mặt trước sân khấu".
3. Khi biểu diễn xoay nhiều (quay lưng khán giả), cân nhắc máy thứ 3 để giữ độ phủ
   (đã chỉ ra ở thí nghiệm D).
"""

    out_path = Path(__file__).resolve().parent / "ket-qua-ban-do-dat-may.md"
    out_path.write_text(doc, encoding="utf-8")

    print(grid_glyph, "\n")
    print("Độ phủ (%):\n" + grid_cov, "\n")
    print("MPJPE (mm):\n" + grid_err, "\n")
    print(f"→ Khuyến nghị: {rec['az_a']:+d}°/{rec['az_b']:+d}° "
          f"(lệch {rec['separation']}°), phủ {rec['coverage']:.1f}%, MPJPE {rec['mpjpe']:.1f}mm")
    print(f"→ Đã ghi {out_path}")


if __name__ == "__main__":
    main()
