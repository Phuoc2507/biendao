# Choreo 2-Cam — Bắt chuyển động múa 3D bằng 2 điện thoại + Sequencer sân khấu

Đồ án tốt nghiệp · ngành Robot & Trí tuệ nhân tạo, HCMUTE.
Tài liệu: `de-cuong-do-an-tot-nghiep.md`, `dac-ta-mvp-choreo-2cam.md`, `gate0-thiet-ke-thuc-nghiem.md`, `nghien-cuu-choreo-sequencer.md`.

## Kiến trúc (5 module)

```
choreo/
  schema.py          # Định dạng trao đổi giữa các module (MotionClip, BeatGrid, CameraCalib)
  ingest/  (M1)       # Nạp video, tách audio, đồng bộ 2 clip (clap + keypoint)
  calib/   (M2)       # Hiệu chỉnh ChArUco 2 camera
  mocap/   (M2)       # Adapter hợp nhất đa-view -> khung xương 3D (EasyMocap/XRMoCap cắm sau)
  cleanup/ (M3)       # Làm mượt, foot-lock, tách root motion, retarget
  eval/    (M5)       # Metric đánh giá: MPJPE, PA-MPJPE, jitter, foot-slip, reprojection
web/       (M4)       # Sequencer sân khấu 3D (React Three Fiber) — dựng sau
tests/                # Unit test cho phần thuần CPU (chạy được ngay, không cần GPU)
```

## Trạng thái

Phần chạy được ngay (không cần GPU/dữ liệu thật): **M1 sync**, **M5 metrics**, **interface adapter**.
Phần cần GPU lab + clip thật: **M2 fuse (EasyMocap)**, chạy sau khi thu dữ liệu.

## Chạy test

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -e ".[dev]"
pytest -q
```
