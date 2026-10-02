# Runbook Gate 0 — chạy DETECTOR THẬT trên video AIST++ (buổi GPU thuê)

*Thao tác cụ thể cho phần Đường A/§4-tuần-3 của [gate0-thiet-ke-thuc-nghiem.md](../gate0-thiet-ke-thuc-nghiem.md): thay keypoint curated bằng detector CỦA TA (RTMPose) chạy trên pixel thô. Mục tiêu: không phí giờ GPU thuê — mọi thứ CPU đã dựng + test sẵn, buổi GPU chỉ cài + chạy.*

Mã liên quan: [`choreo/datasets/aist_video.py`](../choreo/datasets/aist_video.py) (tên/URL video), [`choreo/datasets/detect2d.py`](../choreo/datasets/detect2d.py) (wrapper RTMPose), [`experiments/aist_detector_2view.py`](aist_detector_2view.py) (detect/compare).

---

## 0. Trước buổi GPU (làm ở máy thường, KHÔNG tốn tiền)

- [ ] **Đọc + đồng ý Terms of Use** AIST Dance Video DB: https://aistdancedb.ongaaccel.jp/terms_of_use/
  (downloader chính thức hỏi Y/N; không đồng ý thì KHÔNG tải). Đây là bước người dùng tự quyết.
- [ ] Biết danh sách bài + cặp camera sẽ dùng. `aist_detector_2view.py` chọn tất định: 10 thể loại
  × 2 bài đầu (theo tên đã sort), mỗi bài 1 cặp camera gần **~75°** giao hội. In ra kế hoạch:
  ```bash
  .venv/Scripts/python -c "from experiments.aist_detector_2view import *; from choreo.datasets.aist import AistData; a=AistData(); [print(s, p, f'{ang:.0f}°') for s,p,ang in plan_pairs(a, select_sequences(a, PER_GENRE))]"
  ```
  → 20 bài × 2 camera = **40 video** cần tải (mỗi ~720 frame @1080p, bản `10M`).

## 1. Tải video (cần đã đồng ý license ở bước 0)

Hai cách, chọn một:

**Cách A — downloader chính thức (tải TOÀN BỘ list, chắc chắn đúng):**
```bash
wget https://raw.githubusercontent.com/google/aistplusplus_api/main/downloader.py
python downloader.py --download_folder=D:/bien/data/aist_sample/video --num_processes=5
```
(Tải cả bộ ~hàng nghìn video — chỉ chọn cách này nếu băng thông/đĩa dư.)

**Cách B — chỉ 40 video cần (tiết kiệm, dùng hàm của ta):** chạy ở máy thường TRƯỚC buổi GPU.
```bash
.venv/Scripts/python - <<'PY'
from experiments.aist_detector_2view import plan_pairs, select_sequences, PER_GENRE
from choreo.datasets.aist import AistData, DEFAULT_CACHE
from choreo.datasets.aist_video import download_video, TERMS_OF_USE
print("ĐÃ đồng ý:", TERMS_OF_USE)   # tự xác nhận đã đọc license
a = AistData()
for stem, pair, _ in plan_pairs(a, select_sequences(a, PER_GENRE)):
    for v in pair:
        print(download_video(stem, v, DEFAULT_CACHE))
PY
```
→ video về `data/aist_sample/video/` (đã .gitignore). Tải ở máy thường được, mang theo khi thuê GPU
(hoặc tải lại trên máy GPU — băng thông AIST tốt).

## 2. Cài môi trường trên máy GPU

RTX A2000 6GB / RTX 3060 12GB (Ampere, CUDA 12.x) → wheel chuẩn, không phải build:
```bash
pip install -U openmim
mim install mmengine "mmcv>=2.0.1" "mmdet>=3.1.0" "mmpose>=1.1.0"
pip install numpy scipy   # nếu venv mới
```
Kiểm nhanh model tải được (lần đầu tự kéo checkpoint):
```bash
python -c "from mmpose.apis import MMPoseInferencer; MMPoseInferencer('human', device='cuda:0'); print('OK')"
```
> Nếu GPU Blackwell (sm_120, CUDA 13.x): cần PyTorch cu128 + có thể build mmcv từ nguồn → tránh,
> chọn Ampere cho nhẹ đầu.

## 3. Chạy detect (GPU) — CÓ CHECKPOINT

```bash
PYTHONIOENCODING=utf-8 .venv/Scripts/python experiments/aist_detector_2view.py detect
```
- Ghi `data/aist_sample/detect2d/<tên-video>.npz` mỗi video; **bỏ qua video đã có npz**.
- Mất kết nối / máy sập giữa chừng → chạy lại lệnh trên là tiếp đúng chỗ (uptime thấp không mất công).
- Ước lượng: 40 video × ~720 frame, RTMPose-l ~ vài phút/video trên A2000 → tổng **~20–40 phút** compute.

## 4. Chạy compare (CPU — máy nào cũng được, có thể làm sau khi trả GPU)

```bash
PYTHONIOENCODING=utf-8 .venv/Scripts/python experiments/aist_detector_2view.py compare
```
→ ghi `experiments/ket-qua-aist-detector-2view.md`: MPJPE detector-ta vs 3D 9-view, cột baseline
keypoint-curated, **ΔMPJPE = giá detector thật**, và 2D RMSE px.

## 5. Kỳ vọng số (neo từ tiên lượng offline)

Từ [`ket-qua-aist-noise-sweep.md`](ket-qua-aist-noise-sweep.md) (bơm nhiễu mô phỏng vào curated):
- Baseline curated sạch: **37.3 mm**.
- Dự đoán với nhiễu kiểu RTMPose (~4px + lẫn/sót nhẹ): **~42 mm** → **ΔMPJPE kỳ vọng ~ +5 mm**.
- **Cờ báo động:** nếu MPJPE detector-ta **≫ 55–60 mm** hoặc 2D RMSE **≫ 10 px** → nghi lỗi quy ước
  (thứ tự khớp, lệch frame video↔annotation, sai camera-view) chứ không phải "detector kém". Kiểm
  lại căn khớp COCO + alignment thời gian trước khi kết luận.

## 6. Chi phí ước tính

| Khoản | Ước |
|---|---|
| Tải 40 video (có thể làm trước ở máy thường) | 0 đ GPU |
| Cài mmpose + kéo checkpoint | ~15–20 phút |
| detect 40 video | ~20–40 phút |
| **Tổng giờ GPU** | **~1 giờ** |
| compare | 0 đ (CPU, sau khi trả GPU) |

Với máy ~3.000–3.300 đ/h (A2000/3060 đã khảo): **~3.000–4.000 đ** cho toàn bộ số Gate 0 end-to-end thật.

## 7. Giới hạn vẫn còn sau buổi này (ghi trung thực vào luận văn)

- 3D "tham chiếu" vẫn là tái dựng 9-view của AIST, **không phải GT cảm biến độc lập** → MPJPE là độ
  khớp 2-view↔9-view, không phải sai số tuyệt đối. (Đường B clip tự quay + held-out mới khép phần này.)
- Chưa lọc `ignore_list.txt` (chuỗi AIST tái dựng kém) → nếu cần baseline tuyệt đối sạch thì tải bộ
  splits, lọc rồi chạy lại; so sánh tương đối ΔMPJPE không bị ảnh hưởng.
