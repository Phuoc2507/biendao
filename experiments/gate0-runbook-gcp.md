# Runbook Gate 0 trên GCP — thuê L4 Spot bằng gói $300

*Phần GCP-cụ-thể, bổ sung cho [gate0-runbook-aist-detector.md](gate0-runbook-aist-detector.md). Runbook gốc tả **cái gì chạy** (license, detect, compare, kỳ vọng số); file này tả **chạy ở đâu**: dựng 1 máy Spot L4 trên Google Cloud, đẩy code lên, chạy `detect` trên GPU, kéo kết quả về chạy `compare` ở máy nhà, rồi **xoá máy**. Job ~1h ⇒ tốn vài nghìn đồng trong gói $300.*

> **3 việc chỉ MÌNH-BẠN làm được (mình không thao tác hộ):** (1) đồng ý Terms of Use AIST, (2) nâng tài khoản GCP lên trả-phí + xin quota L4, (3) bấm tạo/xoá máy. Mình soạn sẵn từng lệnh để bạn dán.

---

## 0. Một lần cho tài khoản GCP (làm trước, ~10 phút + chờ duyệt quota)

Gói dùng thử $300 **không** cho quota GPU (mặc định = 0). Phải:

1. **Nâng lên tài khoản trả phí** (Billing → *Upgrade*): thêm thẻ. **Credit $300 còn nguyên**, thẻ chỉ bị trừ khi vượt $300 — job này không tới mức đó.
2. **Xin quota L4** (IAM & Admin → *Quotas*): lọc `NVIDIA_L4`, chọn vùng định dùng (vd `us-central1`), *Edit* → đặt **1**. Google thường duyệt tự động trong **vài phút–vài giờ** (có khi ngay). Cũng nên set quota `GPUS_ALL_REGIONS ≥ 1`.
3. Cài **gcloud CLI** ở máy nhà + `gcloud init` (đăng nhập, chọn project).

> Mẹo vùng: L4 có ở `us-central1`, `us-east1`, `us-east4`, `europe-west4`, `asia-northeast1`, `asia-southeast1`... Chọn vùng gần (độ trễ SSH) **và** còn chỗ Spot. Ví dụ dưới dùng `us-central1-a`.

## 1. Đồng ý license AIST (bước 0 của runbook gốc)

Đọc + đồng ý: https://aistdancedb.ongaaccel.jp/terms_of_use/ — **không có hàng đợi duyệt**, video nằm ở permalink trực tiếp, đồng ý xong tải được ngay. Đây là cam kết pháp lý của bạn, mình không bấm hộ.

## 2. Tạo máy Spot L4 (bạn dán lệnh)

L4 bắt buộc dùng máy họ `g2-*`. Dùng image Deep Learning (PyTorch + CUDA cài sẵn) để khỏi vật lộn driver:

```bash
gcloud compute instances create aist-gate0 \
  --zone=us-central1-a \
  --machine-type=g2-standard-4 \
  --accelerator=type=nvidia-l4,count=1 \
  --provisioning-model=SPOT \
  --instance-termination-action=STOP \
  --maintenance-policy=TERMINATE \
  --image-family=pytorch-latest-gpu \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=100GB \
  --metadata="install-nvidia-driver=True"
```

- `SPOT` + `STOP`: giá rẻ 60–70%; nếu Google thu hồi máy giữa chừng thì máy **dừng chứ không xoá** → đĩa (gồm npz đã detect) còn nguyên, bật lại `gcloud compute instances start aist-gate0 --zone=...` rồi chạy tiếp (detect tự bỏ qua video đã xong).
- Lần đầu SSH vào, image sẽ hỏi cài driver NVIDIA → **Y**.

SSH vào:
```bash
gcloud compute ssh aist-gate0 --zone=us-central1-a
```
Kiểm GPU: `nvidia-smi` (phải thấy 1× L4, 24GB).

## 3. Đẩy code lên máy (chạy ở máy nhà, cửa sổ terminal KHÁC)

Repo không có remote → scp thẳng 2 thư mục cần (khỏi mang `.venv`, khỏi mang `data/`):

```bash
gcloud compute scp --recurse --zone=us-central1-a \
  D:/bien/choreo D:/bien/experiments \
  aist-gate0:~/bien/
```

Trên VM, lập môi trường (image đã có `torch`+CUDA, chỉ thêm mmpose + numpy):
```bash
cd ~/bien
pip install -U openmim numpy
mim install mmengine "mmcv>=2.0.1" "mmdet>=3.1.0" "mmpose>=1.1.0"
python -c "from mmpose.apis import MMPoseInferencer; MMPoseInferencer('human', device='cuda:0'); print('OK')"
```
> Nếu `mim install mmcv` kêu lệch phiên bản `torch` của image: ghim torch cho khớp bảng mmcv, hoặc đổi sang `--image-family=common-cu121` rồi tự `pip install torch`. Thường `pytorch-latest-gpu` + `mmcv>=2.1` là khớp.

> **Bộ pin ĐÃ chạy thật trên L4 (6/10/2026)** — nếu `mim` auto-resolve ra bản lệch, ghim thẳng bộ này cho chắc:
> ```bash
> pip install torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu121
> pip install numpy==1.26.4 opencv-python-headless==4.10.0.84
> mim install "mmcv==2.1.0" "mmdet==3.2.0" "mmpose==1.3.2" mmengine
> ```
> `numpy` phải < 2 (mmcv/mmdet build theo numpy 1.x). `opencv-*-headless` tránh lỗi thiếu `libGL` trên VM không màn hình.

## 4. Tải 40 video — THẲNG trên VM (băng thông Google↔AIST nhanh)

Trên VM (`cd ~/bien`), dùng đúng snippet Cách B của runbook gốc nhưng bằng `python` hệ thống:

```bash
PYTHONPATH=. python - <<'PY'
from experiments.aist_detector_2view import plan_pairs, select_sequences, PER_GENRE
from choreo.datasets.aist import AistData, DEFAULT_CACHE
from choreo.datasets.aist_video import download_video, TERMS_OF_USE
print("ĐÃ đồng ý:", TERMS_OF_USE)
a = AistData()
for stem, pair, _ in plan_pairs(a, select_sequences(a, PER_GENRE)):
    for v in pair:
        print(download_video(stem, v, DEFAULT_CACHE))
PY
```
(Annotation `.npz` của AIST++ loader tự kéo qua HTTP-Range, không cần license, không cần tải trước.)

> **BẪY (mất ~1 buổi để tìm):** `DEFAULT_CACHE` trong [`choreo/datasets/aist.py`](../choreo/datasets/aist.py) đang hard-code đường **Windows** `D:\bien\data\aist_sample`. Trên VM Linux, chuỗi `D:\...` bị coi là **một tên file literal** (dấu `\` không phải phân cách thư mục) → video tải sai chỗ, loader đọc ra **0 frame** mà không báo lỗi. Cách chữa trên VM: đừng dùng `DEFAULT_CACHE`, truyền tay một thư mục POSIX, ví dụ `cache = Path.home()/"aistcache"` rồi dùng `cache` ở cả `download_video(...)` lẫn khi chạy detect (`--cache` nếu có, hoặc sửa biến). Về máy nhà chạy `compare` thì `DEFAULT_CACHE` Windows lại đúng — chỉ lệch ở phía Linux.

## 5. Chạy detect trên GPU (CÓ CHECKPOINT)

```bash
cd ~/bien
PYTHONIOENCODING=utf-8 PYTHONPATH=. python experiments/aist_detector_2view.py detect
```
- Ghi `data/aist_sample/detect2d/<video>.npz` mỗi video, **bỏ qua video đã có npz** → đứt mạng/thu hồi Spot chỉ cần chạy lại.
- L4 nhanh hơn A2000 → ước **~15–30 phút** cho 40 video.

## 6. Kéo kết quả về + chạy compare ở máy nhà (CPU, sau khi xoá GPU)

Ở máy nhà:
```bash
gcloud compute scp --recurse --zone=us-central1-a \
  aist-gate0:~/bien/data/aist_sample/detect2d \
  D:/bien/data/aist_sample/

PYTHONIOENCODING=utf-8 .venv/Scripts/python experiments/aist_detector_2view.py compare
```

> **Nếu `scp`/`ssh` TREO (SSH bị firewall mạng nhà chặn — gặp thật 6/10):** `gcloud compute scp` và `gcloud cloud-shell scp` đều mở cổng SSH trực tiếp, treo vô hạn nếu cổng bị chặn. Đường vòng chỉ-HTTPS, chạy ngon:
> 1. Nén trên nguồn (VM hoặc Cloud Shell): `tar -czf ~/detect2d.tar.gz -C ~/bien/data/aist_sample detect2d`
> 2. Tạo thùng ở máy nhà: `gcloud storage buckets create gs://<tên-độc-nhất> --location=us-central1`
> 3. Đẩy lên (chạy **trong Cloud Shell web terminal** — websocket/HTTPS, không dính cổng SSH): `gcloud storage cp ~/detect2d.tar.gz gs://<tên-độc-nhất>/`
> 4. Kéo về máy nhà: `gcloud storage cp gs://<tên-độc-nhất>/detect2d.tar.gz .` rồi `tar -xzf detect2d.tar.gz -C D:/bien/data/aist_sample/`
> 5. Xoá thùng: `gcloud storage rm --recursive gs://<tên-độc-nhất>/`
> Nhớ kiểm `md5sum` hai đầu cho khớp.

→ sinh `experiments/ket-qua-aist-detector-2view.md`: MPJPE detector-ta vs 3D 9-view, ΔMPJPE = **giá detector thật**, 2D RMSE px. Đối chiếu kỳ vọng ở §5 runbook gốc (sạch 37.3 mm → kỳ vọng ~42 mm; cờ báo động nếu ≫55–60 mm hoặc RMSE ≫10 px).

> **KẾT QUẢ THẬT (6/10/2026), 20 bài:** MPJPE detector-ta **35.5 mm** (trung vị 33.1), baseline curated 37.3 mm, **ΔMPJPE ≈ −1.9 mm** → detector thật gần như KHÔNG phạt, còn tốt hơn tiên lượng offline +5mm (mô hình nhiễu Gaussian i.i.d. bi quan quá). 2D RMSE 13.1 px nhưng không lan sang 3D. Bài `gLH` (c02-c08) cao 64–79 mm ở **cả** hai cột (Δ nhỏ) ⇒ lỗi do cặp cam/tham chiếu, không phải detector.

## 7. XOÁ MÁY (bắt buộc — nếu không, đĩa vẫn tính tiền)

```bash
gcloud compute instances delete aist-gate0 --zone=us-central1-a
```
`STOP` thôi **chưa đủ**: máy dừng nhưng đĩa 100GB vẫn trừ credit mỗi ngày. Xong việc là `delete`.

## 8. Chi phí (trong gói $300)

| Khoản | Ước |
|---|---|
| g2-standard-4 + 1×L4, **Spot** | ~$0.22–0.28/giờ |
| Cài mmpose + kéo checkpoint | ~15–20 phút |
| detect 40 video | ~15–30 phút |
| Tải video + scp | ~10–15 phút |
| **Tổng 1 buổi (~1–1.5h)** | **~$0.30–0.70** (≈ 8.000–18.000 đ) |
| compare | $0 (CPU ở nhà) |

Tức **dưới 1% gói $300** cho toàn bộ số Gate 0 end-to-end thật. Nếu chạy lại 2–3 lần tinh chỉnh vẫn chưa tới $3.

## 9. Giới hạn vẫn còn (xem §7 runbook gốc)

3D "tham chiếu" vẫn là tái dựng 9-view của AIST (không phải GT cảm biến độc lập); `ignore_list.txt` chưa lọc. Những điều này Đường B (clip tự quay + held-out) mới khép — không thuộc buổi GPU này.
