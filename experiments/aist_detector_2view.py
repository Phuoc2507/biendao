"""Gate 0: chạy DETECTOR THẬT trên video AIST++, rồi đo end-to-end 2-view.

Khác aist_2view.py ở chỗ then chốt: aist_2view.py nạp *keypoint 2D curated* của
AIST (họ đã chạy detector của họ trên video) -> MPJPE ~37mm là **cận dưới**. Ở đây
ta chạy DETECTOR CỦA TA (RTMPose) trên PIXEL thô, đưa keypoint đó vào cùng lõi
fuse_multiview, rồi so với 3D tham chiếu 9-view của AIST. Con số thu được là sai
số *end-to-end thật*; HIỆU so với 37mm = "giá của việc dùng detector thật".

Tách hai bước vì chỉ một bước cần GPU:
  detect   (GPU)  — RTMPose trên video đã tải -> ghi .npz (T,17,3) mỗi (bài,cam).
                    Có checkpoint: bỏ qua video đã có .npz -> uptime thấp chỉ cần chạy lại.
  compare  (CPU)  — đọc .npz, đưa vào fuse_multiview, tính:
                    (a) MPJPE detector-ta vs 3D tham chiếu AIST,
                    (b) so với baseline keypoint-curated (chạy lại khối hợp nhất tại chỗ),
                    (c) độ khớp 2D pixel detector-ta vs keypoint-AIST (sai số thuần 2D).
                    Ghi experiments/ket-qua-aist-detector-2view.md.

Toàn bộ logic ghép/căn-thời-gian/so-sánh ở compare là THUẦN, test được ngay trên
CPU không cần GPU (xem tests/test_aist_detector.py). Chỉ `detect` cần mmpose+GPU.

Chạy (máy GPU, sau khi đã tải video + đồng ý license AIST):
    .venv/Scripts/python experiments/aist_detector_2view.py detect
Chạy (máy nào cũng được, sau khi đã có .npz):
    .venv/Scripts/python experiments/aist_detector_2view.py compare
"""

from __future__ import annotations

import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from choreo.datasets.aist import AistData, COCO, DEFAULT_CACHE
from choreo.geom.cameras import ray_angle_deg
from choreo.mocap.fuse import fuse_multiview
from choreo.eval.metrics import procrustes_align

UNIT_MM = 10.0          # 1 đơn vị AIST ≈ 1 cm -> mm (giống aist_2view.py)
STRIDE = 3              # lấy mẫu thời gian cho nhẹ
PER_GENRE = 2           # số bài mỗi thể loại
TARGET_ANGLE = 75.0     # góc giao hội "đẹp" để chọn cặp camera
VIEWS_PER_STEM = 2      # chỉ tải/detect 2 camera của cặp đã chọn (tiết kiệm GPU/tải)

DETECT_SUBDIR = "detect2d"
RESULT_MD = "ket-qua-aist-detector-2view.md"

GENRE_NAME = {
    "gBR": "Break", "gPO": "Pop", "gLO": "Lock", "gHO": "House", "gWA": "Waack",
    "gKR": "Krump", "gJS": "Street Jazz", "gJB": "Ballet Jazz",
    "gMH": "Middle HipHop", "gLH": "LA HipHop",
}


# ----------------------------- hàm THUẦN (test được) -----------------------------

def detect_npz_path(cache_dir, stem: str, view_idx: int) -> Path:
    """Đường dẫn .npz keypoint detector cho (bài, camera). Tên KHỚP video camera đó
    (gBR_..._c01_...) để dễ đối chiếu npz<->video trên đĩa."""
    from choreo.datasets.aist_video import video_name
    return Path(cache_dir) / DETECT_SUBDIR / f"{video_name(stem, view_idx)}.npz"


def align_time(arrays: list[np.ndarray]) -> list[np.ndarray]:
    """Cắt mọi mảng về cùng độ dài theo trục thời gian (axis 0) = min T.

    Detector-ta, keypoint-AIST-2D và 3D-AIST có thể lệch vài frame (giải mã video,
    annotation) -> căn về min để so cùng mốc. Giữ nguyên các trục còn lại.
    """
    if not arrays:
        return []
    T = min(a.shape[0] for a in arrays)
    return [a[:T] for a in arrays]


def pick_pair_by_angle(calibs, centroid3d, target_angle: float = TARGET_ANGLE):
    """Chọn cặp view có góc giao hội gần `target_angle` nhất. Trả (pair, góc°)."""
    pairs = list(combinations(range(len(calibs)), 2))
    ang = {p: ray_angle_deg(calibs[p[0]], calibs[p[1]], centroid3d) for p in pairs}
    best = min(pairs, key=lambda p: abs(ang[p] - target_angle))
    return best, ang[best]


def stack_views(per_view: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """[ (T,17,3) mỗi view ] -> (kp (V,T,17,2), conf (V,T,17)) đã căn thời gian.

    Tách [x,y] và conf đúng định dạng fuse_multiview mong đợi.
    """
    aligned = align_time(per_view)
    stacked = np.stack(aligned, axis=0)          # (V,T,17,3)
    return stacked[..., :2], stacked[..., 2]


def px_rmse(pred2d: np.ndarray, ref2d: np.ndarray) -> float:
    """RMSE pixel giữa 2D detector-ta và 2D-AIST (bỏ frame/khớp NaN)."""
    d = np.linalg.norm(pred2d - ref2d, axis=-1)   # (...,J)
    d = d[np.isfinite(d)]
    return float(np.sqrt(np.mean(d ** 2))) if d.size else float("nan")


def mpjpe(pred3d: np.ndarray, gt3d: np.ndarray) -> tuple[float, float]:
    """(MPJPE toàn cục, PA-MPJPE) mm — giống aist_2view.errors (bỏ cột median)."""
    g = np.linalg.norm(pred3d - gt3d, axis=2)
    pa = np.linalg.norm(procrustes_align(pred3d, gt3d) - gt3d, axis=2)
    return g.mean() * UNIT_MM, pa.mean() * UNIT_MM


# ----------------------------- chọn mẫu (dùng chung) -----------------------------

def select_sequences(aist: AistData, per_genre: int) -> dict[str, list[str]]:
    inter = sorted(aist.stems("keypoints2d") & aist.stems("keypoints3d"))
    by_genre: dict[str, list[str]] = defaultdict(list)
    for s in inter:
        by_genre[s[:3]].append(s)
    return {g: ss[:per_genre] for g, ss in sorted(by_genre.items())}


def plan_pairs(aist: AistData, sel: dict[str, list[str]]):
    """Mỗi bài -> (stem, cặp view, góc°). Tất định; dùng chung cho detect và compare."""
    plan = []
    for stems in sel.values():
        for stem in stems:
            calibs = aist.calibs_for(stem)
            c = aist.keypoints3d(stem).reshape(-1, 3).mean(0)
            pair, ang = pick_pair_by_angle(calibs, c)
            plan.append((stem, pair, ang))
    return plan


# ----------------------------- detect (CẦN GPU) -----------------------------

def run_detect(cache_dir=DEFAULT_CACHE, device: str = "cuda:0"):  # pragma: no cover - cần GPU
    """Chạy RTMPose trên video 2 camera của mỗi bài -> ghi .npz (bỏ qua nếu đã có).

    TIỀN ĐIỀU KIỆN: video đã tải về <cache>/video/ (cần đồng ý license AIST) và đã
    cài mmpose. Khối này có checkpoint: mất kết nối giữa chừng -> chạy lại là tiếp.
    """
    from choreo.datasets.aist_video import video_name
    from choreo.datasets.detect2d import Rtmpose2D

    aist = AistData(cache_dir=cache_dir)
    plan = plan_pairs(aist, select_sequences(aist, PER_GENRE))
    det = Rtmpose2D(device=device)
    out_dir = Path(cache_dir) / DETECT_SUBDIR
    out_dir.mkdir(parents=True, exist_ok=True)

    for stem, pair, ang in plan:
        for v in pair:
            npz = detect_npz_path(cache_dir, stem, v)
            if npz.exists():
                print(f"[bỏ qua] {npz.name} (đã có)")
                continue
            vid = Path(cache_dir) / "video" / f"{video_name(stem, v)}.mp4"
            if not vid.exists():
                print(f"[THIẾU VIDEO] {vid.name} — tải trước khi detect"); continue
            print(f"[detect] {vid.name} (góc cặp {ang:.0f}°) ...")
            kp = det.detect_video(vid)               # (T,17,3)
            np.savez_compressed(npz, keypoints=kp.astype(np.float32))
            print(f"  -> ghi {npz.name}  ({kp.shape[0]} frame)")


# ----------------------------- compare (CPU, test được) -----------------------------

def _load_detect(cache_dir, stem, view_idx) -> np.ndarray | None:
    npz = detect_npz_path(cache_dir, stem, view_idx)
    if not npz.exists():
        return None
    with np.load(npz) as z:
        return z["keypoints"].astype(float)


def run_compare(cache_dir=DEFAULT_CACHE):
    aist = AistData(cache_dir=cache_dir)
    sel = select_sequences(aist, PER_GENRE)
    plan = plan_pairs(aist, sel)
    genre_of = {s: g for g, ss in sel.items() for s in ss}

    lines: list[str] = []
    def emit(s=""):
        print(s); lines.append(s)

    emit("# Kết quả: DETECTOR THẬT (RTMPose) trên video AIST++ — 2-view end-to-end")
    emit()
    emit("- So pose 3D dựng-từ-2-view bằng **keypoint detector CỦA TA** (RTMPose trên "
         "pixel thô) với 3D tham chiếu 9-view của AIST.")
    emit("- Cột **baseline** = cùng lõi, cùng cặp camera, nhưng dùng *keypoint curated* "
         "của AIST (như aist_2view.py). HIỆU hai cột = **giá của detector thật**.")
    emit(f"- COCO-17, không remap. Đơn vị→mm (×{UNIT_MM:.0f}). STRIDE={STRIDE}. "
         f"robust=True + trọng số confidence.")
    emit()

    rows = []
    missing = []
    for stem, pair, ang in plan:
        dets = [_load_detect(cache_dir, stem, v) for v in pair]
        if any(d is None for d in dets):
            missing.append((stem, pair))
            continue
        calibs = aist.calibs_for(stem)
        kp2d_aist = aist.keypoints2d(stem)       # (V_all,T,17,3)
        gt_full = aist.keypoints3d(stem)

        # căn thời gian: detector-ta (2 view) + 2D-AIST (2 view) + 3D-AIST, cùng min T
        det_a, det_b = dets
        ref2d = kp2d_aist[list(pair)]            # (2,T,17,3)
        n = min(det_a.shape[0], det_b.shape[0], ref2d.shape[1], gt_full.shape[0])
        det_a, det_b = det_a[:n], det_b[:n]
        ref2d = ref2d[:, :n]
        gt = gt_full[:n][::STRIDE]

        # --- (a) pose từ DETECTOR-TA ---
        xy, conf = stack_views([det_a[::STRIDE], det_b[::STRIDE]])
        clip = fuse_multiview(xy, [calibs[v] for v in pair], fps=60.0 / STRIDE,
                              confidences=conf, robust=True)
        mp_our, pa_our = mpjpe(clip.joints3d, gt)

        # --- (b) baseline: keypoint CURATED của AIST, cùng cặp/robust ---
        bxy = ref2d[:, ::STRIDE, :, :2].astype(float)
        bcf = ref2d[:, ::STRIDE, :, 2].astype(float)
        bclip = fuse_multiview(bxy, [calibs[v] for v in pair], fps=60.0 / STRIDE,
                               confidences=bcf, robust=True)
        mp_base, pa_base = mpjpe(bclip.joints3d, gt)

        # --- (c) độ khớp 2D pixel detector-ta vs AIST (trên 2 view, cùng mốc) ---
        our2d = np.stack([det_a[::STRIDE, :, :2], det_b[::STRIDE, :, :2]], axis=0)
        aist2d = ref2d[:, ::STRIDE, :, :2].astype(float)
        rmse2d = px_rmse(our2d, aist2d)

        rows.append((stem, pair, ang, mp_our, pa_our, mp_base, pa_base, rmse2d))

    if not rows:
        emit("> ⚠️ Chưa có .npz detector nào. Chạy `detect` trên máy GPU trước "
             "(cần video đã tải + mmpose). Dưới đây chỉ là khung báo cáo.")
    else:
        emit("| Thể loại | Bài | Cặp cam | Góc° | MPJPE(ta) | MPJPE(base) | ΔMPJPE | "
             "PA(ta) | 2D RMSE px |")
        emit("|---|---|---|---:|---:|---:|---:|---:|---:|")
        for stem, pair, ang, mo, po, mb, pb, r2 in rows:
            short = stem.replace("_cAll", "")
            emit(f"| {GENRE_NAME[stem[:3]]} | `{short}` | c%02d-c%02d | %.0f | "
                 "%.1f | %.1f | %+.1f | %.1f | %.1f |"
                 % (pair[0] + 1, pair[1] + 1, ang, mo, mb, mo - mb, po, r2))
        arr = np.array([(r[3], r[5], r[3] - r[5], r[7]) for r in rows])
        emit()
        emit(f"**Tổng hợp ({len(rows)} bài):** MPJPE detector-ta "
             f"**{arr[:,0].mean():.1f} mm** (trung vị {np.median(arr[:,0]):.1f}); "
             f"baseline keypoint-curated {arr[:,1].mean():.1f} mm; "
             f"**giá của detector thật ≈ {arr[:,2].mean():+.1f} mm** "
             f"(trung vị {np.median(arr[:,2]):+.1f}); "
             f"sai lệch 2D pixel tb {arr[:,3].mean():.1f} px.")
    if missing:
        emit()
        emit(f"> Thiếu .npz cho {len(missing)} bài (chưa detect): "
             + ", ".join(f"`{s.replace('_cAll','')}` c{p[0]+1:02d}/c{p[1]+1:02d}"
                         for s, p in missing[:8])
             + (" ..." if len(missing) > 8 else ""))

    out = Path(__file__).resolve().parent / RESULT_MD
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n[đã ghi] {out}")


def main(argv: list[str] | None = None):
    argv = sys.argv[1:] if argv is None else argv
    cmd = argv[0] if argv else "compare"
    if cmd == "detect":
        run_detect()
    elif cmd == "compare":
        run_compare()
    else:
        print(f"Lệnh không rõ: {cmd!r}. Dùng 'detect' (GPU) hoặc 'compare' (CPU).")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
