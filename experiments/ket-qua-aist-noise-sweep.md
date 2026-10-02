# Tiên lượng Gate 0: lõi 2-view dưới nhiễu detector mô phỏng (AIST++)

- 20 bài (10 thể loại), mỗi bài 1 cặp camera ~75° giao hội.
- Bơm nhiễu kiểu RTMPose vào keypoint **curated** của AIST rồi đo MPJPE vs 3D tham chiếu 9-view. Dòng "sạch" = baseline curated (≈ aist_2view.py).
- COCO-17, đơn vị→mm (×10), STRIDE=3, robust=True + trọng số conf. rng cố định (seed=20261002) -> tái lập.

> Mục đích: biết TRƯỚC khi thuê GPU rằng detector thật (sai số vài px trên COCO) sẽ đẩy MPJPE lên bao nhiêu, và lõi bắt đầu suy biến ở mức nhiễu nào. Đây là *mô phỏng* nhiễu — số Gate 0 thật vẫn do aist_detector_2view.py cho.

## MPJPE trung bình theo mức nhiễu

| Cấu hình nhiễu | MPJPE tb | PA-MPJPE tb | Δ vs sạch |
|---|---:|---:|---:|
| sạch (curated) | 37.3 | 30.2 | +0.0 |
| jitter 2px | 38.4 | 31.2 | +1.1 |
| jitter 4px | 41.4 | 34.0 | +4.1 |
| jitter 8px | 51.3 | 43.7 | +14.0 |
| 4px + lẫn T/P 2% | 42.3 | 35.0 | +5.0 |
| 4px + sót khớp 5% | 42.0 | 34.7 | +4.7 |
| RTMPose ước (4px+1%+2%) | 42.2 | 34.8 | +4.8 |

**Đọc kết quả:** baseline sạch 37.3 mm. Jitter thuần làm MPJPE tăng gần tuyến tính theo σ (hình học DLT/robust hấp thụ nhiễu Gaussian khá tốt); lẫn T/P và sót khớp thêm đuôi nặng hơn. Với sai số RTMPose điển hình trên COCO (~vài px), dòng "RTMPose ước" cho **khoảng tiên lượng** của giá detector thật — đối chiếu với số Gate 0 thật khi có.

## Chi tiết theo bài (MPJPE từng cấu hình)

| Bài | sạch (curated) | jitter 2px | jitter 4px | jitter 8px | 4px + lẫn T/P 2% | 4px + sót khớp 5% | RTMPose ước (4px+1%+2%) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `gBR_sBM_d04_mBR0_ch01` | 32.5 | 33.6 | 36.5 | 47.7 | 38.1 | 37.7 | 37.5 |
| `gBR_sBM_d04_mBR0_ch02` | 36.9 | 37.8 | 41.2 | 52.9 | 42.6 | 42.3 | 42.4 |
| `gHO_sBM_d19_mHO0_ch01` | 26.1 | 27.3 | 30.6 | 40.7 | 31.2 | 31.6 | 31.3 |
| `gHO_sBM_d19_mHO0_ch02` | 20.8 | 22.4 | 27.0 | 38.7 | 28.1 | 27.7 | 27.9 |
| `gJB_sBM_d07_mJB0_ch01` | 42.0 | 43.0 | 46.2 | 55.0 | 47.4 | 46.6 | 46.7 |
| `gJB_sBM_d07_mJB0_ch02` | 54.9 | 56.0 | 58.6 | 69.5 | 59.8 | 59.4 | 60.3 |
| `gJS_sBM_d01_mJS0_ch01` | 32.7 | 33.8 | 37.0 | 46.6 | 38.2 | 37.6 | 37.4 |
| `gJS_sBM_d01_mJS0_ch02` | 29.8 | 30.8 | 33.9 | 43.0 | 35.6 | 34.5 | 34.3 |
| `gKR_sBM_d28_mKR0_ch01` | 35.8 | 36.9 | 39.7 | 50.1 | 40.9 | 41.0 | 40.5 |
| `gKR_sBM_d28_mKR0_ch02` | 23.2 | 24.3 | 27.4 | 38.2 | 28.8 | 28.3 | 28.2 |
| `gLH_sBM_d16_mLH0_ch01` | 65.0 | 65.6 | 67.3 | 73.3 | 68.1 | 67.1 | 68.2 |
| `gLH_sBM_d16_mLH0_ch02` | 80.4 | 80.9 | 82.1 | 86.6 | 82.2 | 81.9 | 82.5 |
| `gLO_sBM_d13_mLO0_ch01` | 22.6 | 23.9 | 27.0 | 39.1 | 28.0 | 27.8 | 28.0 |
| `gLO_sBM_d13_mLO0_ch02` | 22.9 | 24.5 | 28.1 | 40.3 | 29.1 | 28.9 | 28.9 |
| `gMH_sBM_d22_mMH0_ch01` | 38.9 | 39.7 | 42.7 | 52.8 | 42.7 | 43.4 | 43.2 |
| `gMH_sBM_d22_mMH0_ch02` | 45.7 | 46.5 | 48.8 | 57.2 | 49.4 | 49.4 | 49.0 |
| `gPO_sBM_d10_mPO0_ch01` | 21.0 | 22.2 | 25.9 | 35.9 | 26.7 | 26.3 | 26.5 |
| `gPO_sBM_d10_mPO0_ch02` | 31.1 | 32.1 | 34.4 | 44.0 | 35.5 | 34.9 | 35.3 |
| `gWA_sBM_d25_mWA0_ch01` | 40.8 | 42.1 | 45.6 | 57.5 | 45.4 | 46.2 | 46.2 |
| `gWA_sBM_d25_mWA0_ch02` | 43.7 | 45.3 | 48.2 | 56.9 | 48.9 | 47.4 | 48.6 |
