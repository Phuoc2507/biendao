# Tiên lượng H3: MPJPE 2-view theo góc giao hội camera (AIST++ thật)

- 20 bài (10 thể loại) × toàn bộ 36 cặp trong 9 camera AIST.
- Keypoint **curated sạch** (cô lập ảnh hưởng GÓC; nhiễu detector là trục đã quét riêng).
- COCO-17, đơn vị→mm (×10), STRIDE=3, robust=True + trọng số conf.

> Mục đích: tiên lượng "MPJPE theo góc đặt máy" (§6/H3) & đối chứng quy luật synthetic *~60–120° tốt, 150–180° nổ* trên dữ liệu múa THẬT — TRƯỚC khi quay/GPU.

## MPJPE theo khoảng góc giao hội

| Khoảng góc | Số cặp | MPJPE tb (mm) | MPJPE trung vị |
|---|---:|---:|---:|
| 0–30° | 20 | 55.5 | 52.9 |
| 30–60° | 200 | 48.2 | 39.5 |
| 60–90° | 109 | 35.7 | 29.2 |
| 90–120° | 91 | 35.9 | 30.7 |
| 120–150° | 200 | 52.1 | 41.3 |
| 150–180° | 100 | 2488.8 | 277.0 |

**Đọc kết quả:** thấp nhất ở ~75° (35.7 mm), cao nhất ở ~165° (2488.8 mm). Đường cong hình chữ U theo góc khớp quy luật synthetic: góc quá nhỏ (hai máy gần nhau → chiều sâu kém định) và quá lớn (gần đối đỉnh → che khuất + suy biến) đều đẩy sai số lên; vùng giữa ổn định. Đây là tiên lượng trên curated; detector thật sẽ dịch toàn đường lên theo mức đã đo ở sweep nhiễu.
