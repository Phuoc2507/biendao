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

Chạy được ngay (không cần GPU/dữ liệu thật):
- **M1 sync**, **M3 cleanup**, **M5 metrics**, **interface adapter** (Python, có test).
- **M4 sequencer web** (`web/`): sân khấu 3D, nhiều vũ công, nhân bản/lật gương/lệch nhịp
  (canon), timeline 8-count. Đang chạy bằng clip demo tổng hợp.

Cần GPU lab + clip thật (dựng sau): **M2 fuse (EasyMocap/XRMoCap)**.

## Chạy test (Python)

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -e ".[dev]"
pytest -q
```

## Chạy sequencer web (M4)

```bash
python -m choreo.io.export_web   # sinh web/public/clips/demo.json
cd web && npm install && npm run dev
```

Mở http://localhost:5173. Định dạng clip do `choreo/io/export_web.py` xuất — đây là
ranh giới perception ↔ web: sau này chỉ cần thay clip demo bằng output mocap 2-cam thật.
