# Kết quả: tam giác hoá 2-view trên AIST++ (dữ liệu múa THẬT)

- Mẫu: 20 bài, 10 thể loại (mỗi thể loại 2 bài đầu theo thứ tự tên).
- So 3D-lõi-dựng-từ-2-view với 3D THAM CHIẾU AIST (dựng từ 9 view + bundle).
- COCO-17, không remap. Đơn vị→mm (×10). Lấy mẫu thời gian STRIDE=3.
- fuse: robust=True + trọng số confidence (sát đầu ra detector thật).

> **Giới hạn phép đo:** đây dùng *keypoint 2D có sẵn* của AIST++ (họ đã chạy detector trên video), KHÔNG tự detect từ pixel — nên chỉ kiểm chứng khối hợp nhất 2D→3D, không phải detector. Hơn nữa 3D "tham chiếu" do chính AIST dựng từ 9 view + bundle adjustment, **không phải GT từ cảm biến độc lập** (mocap quang/IMU). Vậy MPJPE ở đây là *độ khớp của tái dựng 2-view với tái dựng 9-view* — một **cận dưới** của sai số tuyệt đối thật, không phải sai số tuyệt đối.

## 1. Tổng quát hoá: 10 thể loại, cặp camera gần ~75° giao hội

| Thể loại | Bài | Cặp cam | Góc° | MPJPE | PA-MPJPE |
|---|---|---|---:|---:|---:|
| Break | `gBR_sBM_d04_mBR0_ch01` | c04-c06 | 88 | 32.5 | 30.2 |
| Break | `gBR_sBM_d04_mBR0_ch02` | c04-c06 | 84 | 36.9 | 35.1 |
| House | `gHO_sBM_d19_mHO0_ch01` | c06-c08 | 88 | 26.1 | 22.9 |
| House | `gHO_sBM_d19_mHO0_ch02` | c01-c03 | 88 | 20.8 | 19.3 |
| Ballet Jazz | `gJB_sBM_d07_mJB0_ch01` | c06-c08 | 89 | 42.0 | 37.2 |
| Ballet Jazz | `gJB_sBM_d07_mJB0_ch02` | c06-c08 | 84 | 54.9 | 48.2 |
| Street Jazz | `gJS_sBM_d01_mJS0_ch01` | c06-c08 | 87 | 32.7 | 23.5 |
| Street Jazz | `gJS_sBM_d01_mJS0_ch02` | c06-c08 | 87 | 29.8 | 20.4 |
| Krump | `gKR_sBM_d28_mKR0_ch01` | c06-c08 | 85 | 35.8 | 34.0 |
| Krump | `gKR_sBM_d28_mKR0_ch02` | c06-c08 | 85 | 23.2 | 19.7 |
| LA HipHop | `gLH_sBM_d16_mLH0_ch01` | c02-c08 | 80 | 65.0 | 39.1 |
| LA HipHop | `gLH_sBM_d16_mLH0_ch02` | c02-c08 | 83 | 80.4 | 44.0 |
| Lock | `gLO_sBM_d13_mLO0_ch01` | c01-c03 | 87 | 22.6 | 18.9 |
| Lock | `gLO_sBM_d13_mLO0_ch02` | c01-c03 | 86 | 22.9 | 19.8 |
| Middle HipHop | `gMH_sBM_d22_mMH0_ch01` | c06-c08 | 85 | 38.9 | 33.9 |
| Middle HipHop | `gMH_sBM_d22_mMH0_ch02` | c06-c08 | 82 | 45.7 | 36.9 |
| Pop | `gPO_sBM_d10_mPO0_ch01` | c02-c08 | 88 | 21.0 | 20.3 |
| Pop | `gPO_sBM_d10_mPO0_ch02` | c04-c06 | 87 | 31.1 | 22.9 |
| Waack | `gWA_sBM_d25_mWA0_ch01` | c05-c07 | 86 | 40.8 | 37.2 |
| Waack | `gWA_sBM_d25_mWA0_ch02` | c05-c07 | 87 | 43.7 | 39.6 |

**MPJPE trung bình toàn mẫu: 37.3 mm** (trung vị 34.2, min 20.8, max 80.4).

## 2. Độ nhạy hình học: MPJPE theo góc giao hội (quét đủ 36 cặp)

Bài quét: Break, Pop, House, Waack, Krump (bài đầu mỗi thể loại). Mỗi điểm = 1 cặp camera của 1 bài.

| Góc giao hội | #cặp | MPJPE trung vị | MPJPE tb | PA-MPJPE tb |
|---|---:|---:|---:|---:|
| 0–15° | 5 | 44.9 | 50.0 | 41.7 |
| 15–30° | 0 | — | — | — |
| 30–60° | 50 | 34.7 | 45.9 | 36.6 |
| 60–90° | 27 | 26.0 | 41.1 | 30.5 |
| 90–120° | 23 | 26.6 | 27.4 | 25.1 |
| 120–150° | 50 | 36.5 | 46.6 | 38.2 |
| 150–180° | 25 | 356.1 | 1126.2 | 222.1 |

**Quan sát (dữ liệu thật):** sai số nhỏ nhất ở dải **~60–120°** giao hội; góc nhỏ (hai máy sát nhau) kém hơn, và **gần đối diện (150–180°) nổ to** vì hai tia gần thẳng hàng làm độ sâu suy biến (kèm lật dấu cheirality). PA-MPJPE (chỉ hình dạng) ổn định hơn **nhiều** so với MPJPE toàn cục ngay cả ở vùng tệ — xác nhận sai số nằm ở **đặt độ sâu/vị trí toàn cục**, không phải méo dáng. Quy luật này **khớp với dự đoán từ thực nghiệm tổng hợp** (synthetic_2view.py) — bằng chứng chéo giữa mô phỏng và dữ liệu thật.

**Hệ quả thực tế cho kịch bản "2 điện thoại":** đặt hai máy lệch nhau **~70–110°** (KHÔNG đối diện nhau, KHÔNG sát cạnh nhau) để tam giác hoá ổn định.
