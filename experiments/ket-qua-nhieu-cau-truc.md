# V48 — Nhiễu CÓ CẤU TRÚC: điểm mù duy nhất & bản đồ phòng thủ xuyên tầng

**Script:** [`web/experiments/structured-noise.ts`](../web/experiments/structured-noise.ts)
**Chạy:** `cd web && npx esbuild experiments/structured-noise.ts --bundle --platform=node --format=cjs --outfile=sn.cjs && node sn.cjs`

## Câu hỏi

V47 ([ben-nhieu](ket-qua-ben-nhieu.md)) chứng minh metric đánh giá bền với nhiễu Gauss **iid** (FP=0
tới σ=20cm) và tự nêu giới hạn: nhiễu detector thật **không iid**. Vòng này **đo thẳng** ba thành
phần cấu trúc V47 để ngỏ — thay vì suy đoán — đúng kỷ luật "đo, đừng chỉ lý luận":

- **(A) Tương quan thời gian** (AR(1), hệ số ρ): jitter pose bám khung liền kề, **không tự triệt**
  trong cửa sổ 13 mẫu.
- **(B) Lệch hệ thống theo người** (bias β không đổi trên vài khớp của một người): 1 camera nhìn
  xiên đặt khớp bị che lệch **nhất quán**.
- **(C) Mất-bám thành đợt** (occlusion kéo dài D khung): tay trái bị dịch trong một đoạn liên tiếp.

Mỗi thành phần nhắm vào cổng RATIO theo một kiểu khác nhau. Mục tiêu: tìm xem cấu trúc nào **phá**
được FP=0 của V47, và nếu có thì **sửa ở đâu**.

## Thiết kế

- Nhóm N=5, nền vung tay phải, FPS=30, 240 khung. Bộ phân loại = `formOutlierIndex` sản phẩm (hằng số
  0.12/0.85/0.05/1.3). 24 mốc thời gian. Tất định (AR(1) gieo hạt `mulberry32`; (B)/(C) không PRNG).
- **(A)** nhóm đúng, σ=3cm **cố định**, AR(1) chuẩn hoá phương sai biên (x_t = ρ·x_{t−1} +
  √(1−ρ²)·w) nên **cô lập tác động tương quan**, không lẫn độ lớn. Quét ρ.
- **(B)** chỉ D0 bị bias β (tay trái), nhóm còn lại đúng + sạch. D0 **múa đúng** ⇒ mỗi lần nêu D0 là
  **dương-tính-giả mức-nhiệm-vụ**. Quét β thô (cm).
- **(C)** chỉ D0 bị dịch tay trái **30cm** (trên ngưỡng nêu) trong **D** khung liên tiếp giữa clip;
  D=0 sạch, D=240 = cả clip. Quét D.

## Kết quả (số đo được)

### (A) Tương quan thời gian — RATIO vẫn bền, FP=0 tới ρ=0.99

```
ρ          |   0.00  0.30  0.60  0.80  0.90  0.95  0.99
FP%        |      0     0     0     0     0     0     0
worst/mean |   1.02  1.02  1.02  1.02  1.04  1.05  1.08
worstV cm  |    6.0   6.4   6.8   7.1   7.2   7.3   6.7
```

Dù ρ→0.99 (nhiễu gần như không tự triệt trong cửa sổ, worstV phình ~6→7cm), tỉ số worst/mean chỉ
nhích **1.02→1.08**, xa dưới RATIO=1.3 ⇒ **FP=0**. Lý do: điều quyết định KHÔNG phải "iid theo thời
gian" mà là **độc lập GIỮA NGƯỜI**. Tương quan thời gian làm 5 người **cùng** phình residual ⇒ không
ai trội ⇒ RATIO không quy trách nhiệm. V47 mở rộng: RATIO chặn được cả nhiễu tương quan.

### (B) Lệch hệ thống một người = ĐIỂM MÙ THẬT — nhiễu có cấu trúc thì CÓ vu oan

```
β thô(cm)  |      0    10    20    26    30    35    40
nêu D0 %   |      0     0     0   100   100   100   100
```

D0 **múa hoàn toàn đúng** nhưng bị detector đặt lệch nhất quán ≥26cm ⇒ bị nêu **100%**. Ngưỡng nêu
(~26cm thô ≈ 12cm residual) khớp đúng đường đặc trưng V44. **Tương phản sắc nét với V47**: nhiễu
NGẪU NHIÊN không bao giờ nêu ai (FP=0 tới 20cm); nhiễu CÓ CẤU TRÚC (dai dẳng, một người) **thì có**.

Đây **không phải lỗi cài đặt** mà là **giới hạn thông tin**: ở tầng toạ-độ-3D, "detector đặt khớp
lệch" **giống hệt** "người đó múa sai". Không núm nào của `sync.ts` phân biệt được, vì cả hai cho
**cùng** `formResidual`. Muốn tách phải có **chiều dữ liệu khác** (xem "Bản đồ phòng thủ").

### (C) Mất-bám thành đợt — chuyển tiếp theo độ dài, hội tụ về (B)

```
D (khung)  |      0     1     3     6    13    30   240
nêu D0 %   |      0     0     0     0     0     8   100
```

Đợt **ngắn** (D≤13 khung ≈ một cửa sổ) → **0%**: phép trung bình 13 mẫu **pha loãng** occlusion
thoáng. Đợt **dài** dần → nêu tăng (D=30 → 8%), và D=240 (cả clip) → **100% = ĐÚNG BẰNG (B) ở
β=30cm** (kiểm chéo khớp). ⇒ mất-bám **thoáng qua** an toàn; mất-bám **dai dẳng** hoá thành chính
ca (B). Chuyển tiếp trơn theo tỉ lệ (độ dài đợt)/(cửa sổ).

## Kết luận: một điểm mù duy nhất, và nó nằm đúng chỗ tầng khác bù vào

**Cùng một phép trung bình 17-khớp × 13-mẫu** đứng sau `formResidual` vừa là **lá chắn** vừa là **gót
chân**:

| Loại nhiễu | Giữ độc lập giữa người? | Kết quả | Vòng |
|---|:---:|---|:---:|
| Gauss iid (mọi khớp/khung) | Có | FP=0 tới σ=20cm | V47 |
| Tương quan thời gian AR(1) ρ→0.99 | Có | FP=0, worst/mean≤1.08 | V48-A |
| Mất-bám thoáng (đợt ngắn ≤ cửa sổ) | Có (bị pha loãng) | FP=0 | V48-C |
| **Lệch hệ thống MỘT người (dai dẳng)** | **KHÔNG** | **nêu oan 100% khi ≥ngưỡng** | **V48-B** |
| Mất-bám dai dẳng (đợt ≈ cả clip) | KHÔNG | hội tụ về (B) | V48-C |

Metric nhóm-tương-đối bền với **mọi** nhiễu còn **độc lập giữa người** (ngẫu nhiên, tương quan thời
gian, thoáng qua). **Điểm mù DUY NHẤT** là **lỗi hệ thống một người** — vì nó là tín hiệu thật, dai
dẳng, một người, **bất khả phân** với sai động tác ở tầng toạ độ.

### Bản đồ phòng thủ xuyên tầng (không núm đơn lẻ nào sửa được B)

1. **Tầng perception — đa-view reprojection held-out (V13):** bias một-view lộ ra khi chiếu keypoint
   sang view kia (sai số reproj tăng vọt vì bias không **nhất quán vật lý** giữa hai góc). Lỗi múa
   thật thì nhất quán mọi view. ⇒ tách được "detector lệch" khỏi "múa sai" **trước khi** tới tầng
   đánh giá. Đây là lý do 2-camera không chỉ để dựng 3D mà còn để **kiểm nhiễu hệ thống**.
2. **Tầng đánh giá — thước TUYỆT ĐỐI theo tham chiếu (V42):** nếu có clip vũ đạo gốc (DAW clip-gán,
   Gate-0 held-out), so từng người với tham chiếu tuyệt đối thay vì so nhau — một bias hệ thống vẫn
   bị nêu, nhưng giờ có **nhãn đúng/sai** để đối chiếu và con người phân xử.
3. **Tầng trình bày — gộp theo lưới nhịp (V32):** (C) cho thấy chấm THÔ theo khung nhạy với đợt; gộp
   theo ô nhịp làm một đợt lẻ không át cả ô, giảm báo động nhấp nháy.

⇒ V48 biến "điểm mù" từ mối lo mơ hồ thành **một ô xác định** trên bản đồ, và chỉ ra **đúng ba tầng
đã có sẵn** trong hệ khép nó lại. Đây là luận điểm kiến trúc, không phải vá lỗi.

## Giới hạn (trung thực)

- Bias (B) mô hình hoá bằng **dịch tĩnh trên vài khớp cố định**; bias detector thật đa dạng hơn (xoay,
  co giãn theo độ sâu, phụ thuộc tư thế). Con số ngưỡng ~26cm là **riêng cho cấu hình này**; cơ chế
  (bất khả phân ở tầng toạ độ) thì tổng quát.
- Chưa **chạy** tầng đa-view V13 trên chính ca bias này để định lượng nó tách được bao nhiêu — đó là
  bước Gate-0 (cần pipeline 2-view thật). V48 mới **chỉ ra** lối tách bằng lập luận nhất-quán-vật-lý,
  và định vị điểm mù để Gate-0 kiểm chứng.
