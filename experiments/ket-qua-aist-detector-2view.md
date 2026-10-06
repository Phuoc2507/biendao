# Kết quả: DETECTOR THẬT (RTMPose) trên video AIST++ — 2-view end-to-end

- So pose 3D dựng-từ-2-view bằng **keypoint detector CỦA TA** (RTMPose trên pixel thô) với 3D tham chiếu 9-view của AIST.
- Cột **baseline** = cùng lõi, cùng cặp camera, nhưng dùng *keypoint curated* của AIST (như aist_2view.py). HIỆU hai cột = **giá của detector thật**.
- COCO-17, không remap. Đơn vị→mm (×10). STRIDE=3. robust=True + trọng số confidence.

| Thể loại | Bài | Cặp cam | Góc° | MPJPE(ta) | MPJPE(base) | ΔMPJPE | PA(ta) | 2D RMSE px |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Break | `gBR_sBM_d04_mBR0_ch01` | c04-c06 | 88 | 33.3 | 32.5 | +0.8 | 30.5 | 13.9 |
| Break | `gBR_sBM_d04_mBR0_ch02` | c04-c06 | 84 | 36.0 | 36.9 | -0.9 | 32.9 | 17.1 |
| House | `gHO_sBM_d19_mHO0_ch01` | c06-c08 | 88 | 25.5 | 26.1 | -0.6 | 22.9 | 8.1 |
| House | `gHO_sBM_d19_mHO0_ch02` | c01-c03 | 88 | 20.3 | 20.8 | -0.5 | 17.9 | 5.8 |
| Ballet Jazz | `gJB_sBM_d07_mJB0_ch01` | c06-c08 | 89 | 41.6 | 42.0 | -0.3 | 37.5 | 19.5 |
| Ballet Jazz | `gJB_sBM_d07_mJB0_ch02` | c06-c08 | 84 | 43.2 | 54.9 | -11.7 | 34.8 | 25.8 |
| Street Jazz | `gJS_sBM_d01_mJS0_ch01` | c06-c08 | 87 | 32.9 | 32.7 | +0.2 | 21.6 | 6.4 |
| Street Jazz | `gJS_sBM_d01_mJS0_ch02` | c06-c08 | 87 | 30.9 | 29.8 | +1.1 | 22.3 | 4.3 |
| Krump | `gKR_sBM_d28_mKR0_ch01` | c06-c08 | 85 | 32.4 | 35.8 | -3.3 | 27.2 | 24.8 |
| Krump | `gKR_sBM_d28_mKR0_ch02` | c06-c08 | 85 | 27.2 | 23.2 | +4.0 | 21.6 | 5.2 |
| LA HipHop | `gLH_sBM_d16_mLH0_ch01` | c02-c08 | 80 | 63.8 | 65.0 | -1.1 | 38.1 | 6.0 |
| LA HipHop | `gLH_sBM_d16_mLH0_ch02` | c02-c08 | 83 | 78.9 | 80.4 | -1.4 | 43.9 | 9.9 |
| Lock | `gLO_sBM_d13_mLO0_ch01` | c01-c03 | 87 | 23.4 | 22.6 | +0.9 | 20.5 | 4.8 |
| Lock | `gLO_sBM_d13_mLO0_ch02` | c01-c03 | 86 | 22.8 | 22.9 | -0.2 | 20.9 | 6.8 |
| Middle HipHop | `gMH_sBM_d22_mMH0_ch01` | c06-c08 | 85 | 36.3 | 38.9 | -2.6 | 29.8 | 21.7 |
| Middle HipHop | `gMH_sBM_d22_mMH0_ch02` | c06-c08 | 82 | 40.7 | 45.7 | -5.0 | 30.0 | 14.2 |
| Pop | `gPO_sBM_d10_mPO0_ch01` | c02-c08 | 88 | 21.7 | 21.0 | +0.6 | 19.5 | 20.0 |
| Pop | `gPO_sBM_d10_mPO0_ch02` | c04-c06 | 87 | 28.3 | 31.1 | -2.8 | 20.5 | 8.4 |
| Waack | `gWA_sBM_d25_mWA0_ch01` | c05-c07 | 86 | 35.1 | 40.8 | -5.7 | 30.7 | 19.3 |
| Waack | `gWA_sBM_d25_mWA0_ch02` | c05-c07 | 87 | 34.7 | 43.7 | -9.0 | 31.6 | 21.0 |

**Tổng hợp (20 bài):** MPJPE detector-ta **35.5 mm** (trung vị 33.1); baseline keypoint-curated 37.3 mm; **giá của detector thật ≈ -1.9 mm** (trung vị -0.7); sai lệch 2D pixel tb 13.1 px.
