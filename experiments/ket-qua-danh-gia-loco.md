# LOCO: khử tính tuỳ tiện của việc chọn camera giữ lại

*Sinh tự động bởi `experiments/danh_gia_loco.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Vòng 13 chốt: sai số tái chiếu camera **held-out** là thước đo đánh giá **GT-free** đáng tin
(bám sát MPJPE thật). Nhưng nó phụ thuộc **chọn máy nào để giữ lại** — giữ nhầm một máy lệch/nhiễu
cao thì con số méo, và trên dữ liệu thật ta không biết máy nào "tốt" để chọn. **Leave-one-camera-out**
(`reprojection_error_loco`) lần lượt giữ lại TỪNG máy rồi trung bình, vừa cho điểm ổn định vừa cho
một **tín hiệu bất định** (độ lệch giữa các fold) — tất cả không cần 3D GT.

## Thiết lập
- Múa tổng hợp 45 khung, **4 máy** (-60°/-20°/+20°/+60°), cách 4.5 m.
- Pipeline mỗi fold: robust-DLT từng khung + lấp NaN theo thời gian. "Sản phẩm" (đại lượng cần
  dự đoán) = MPJPE của bản dựng từ **cả 4 máy**.
- A/B: nhiễu **đồng đều** {2, 4, 7, 11} px × 30 lần lặp.
- C: một máy "hỏng" nhiễu 22 px, các máy khác 3 px.

## A. LOCO-mean bám sát MPJPE
- **Pearson r(MPJPE, LOCO-mean) = 0.997** trên 120 lần dựng — vẫn là proxy
  chặt cho sai số 3D thật, như held-out đơn nhưng không phải chọn máy.

## B. Lợi ích thật của LOCO: GIẢM PHƯƠNG SAI (không phải sửa tương quan)
Phải **trung thực với số liệu**: khi các máy **đồng đều chất lượng**, chọn máy nào để giữ lại
**gần như không** đổi tương quan — r dao động chỉ trong dải **0.001** (0.996–0.998).
Nghĩa là held-out đơn của Vòng 13 **không hề mong manh** ở chế độ đồng đều; LOCO **không** "sửa"
một tương quan gãy. Lợi ích đo được của LOCO là **độ ổn định của ước lượng**:

| Lựa chọn giữ lại | Pearson r với MPJPE | CV ước lượng (ở nhiễu 2px) |
|:--|---:|---:|
| giữ lại máy -60° | 0.997 | 0.019 |
| giữ lại máy -20° | 0.996 | 0.014 |
| giữ lại máy +20° | 0.997 | 0.019 |
| giữ lại máy +60° | 0.998 | 0.021 |
| **LOCO (trung bình mọi fold)** | **0.997** | **0.011** |

- Hệ số biến thiên (CV) của LOCO = **0.011**, nhỏ hơn
  **mọi** held-out đơn (nhỏ nhất 0.014, lớn nhất 0.021): trung bình hoá
  4 fold **giảm phương sai** của thước đo (~40%
  so với held-out trung bình) → **xếp hạng hai phương pháp gần nhau** đáng tin hơn, ít phụ thuộc may rủi.

## C. Choice-dependence lộ ra khi máy KHÔNG đồng đều — và LOCO-std báo động
Tính "phụ thuộc chọn máy" chỉ thật sự nguy hiểm khi một máy **kém hơn hẳn** — đúng lúc trên hiện
trường ta **không biết máy nào đáng tin**. Cho một máy nhiễu 22px (các máy khác 3px),
giá trị held-out ĐƠN lệch hẳn theo chọn máy:

| Lựa chọn giữ lại | Held-out đơn (px) |
|:--|---:|
| giữ lại máy -60° *(máy hỏng)* | 27.64 |
| giữ lại máy -20° | 12.93 |
| giữ lại máy +20° | 6.40 |
| giữ lại máy +60° | 13.88 |

- Dải giá trị held-out đơn nở tới **21.2 px** tuỳ chọn máy — giữ lại đúng máy hỏng thì
  đọc ra một con số, giữ máy tốt lại ra con số khác hẳn, mà **không có cách GT-free để biết nên tin
  cái nào**. LOCO trung bình cả 4 fold → một điểm duy nhất, không phải đánh cược.
- **LOCO-std làm cảnh báo GT-free**:

| Kịch bản | MPJPE thật (mm) | LOCO-mean (px) | **LOCO-std (px)** |
|:--|---:|---:|---:|
| đồng đều (mọi máy tốt) | 12.02 | 4.88 | 0.18 |
| máy 0 hỏng (nhiễu 22px) | 30.38 | 15.21 | **7.73** |

- Khi một máy hỏng, **độ lệch giữa các fold tăng vọt** (0.18 → 7.73 px,
  ×43.2): các fold "bất đồng" vì fold giữ lại máy hỏng cho lỗi lớn còn
  fold dựng-có-máy-hỏng cho 3D lệch. ⇒ LOCO-std cảnh báo bố trí máy có vấn đề **trước cả khi có
  ground-truth**, dùng được ngay tại chỗ quay.

## Hệ quả cho luận văn
1. `reprojection_error_loco` là **dạng cross-validation đúng đắn** của thước đo Vòng 13: bỏ lựa
   chọn tuỳ tiện "giữ máy nào", **giảm phương sai** ước lượng (~40%),
   và thêm chiều **bất định** — công cụ chấm điểm chuẩn cho Cổng 0. Trung thực: ở chế độ máy đồng
   đều, held-out đơn đã đủ tốt về tương quan; LOCO thắng ở độ ổn định và ở chẩn đoán.
2. LOCO-std cho một **quy trình QA hiện trường**: quay xong chạy LOCO; std cao bất thường → có máy
   lệch/đồng bộ sai/che khuất → quay lại, **không cần** hệ mocap tham chiếu.
3. Củng cố lần nữa lý do **≥3 máy** (LOCO cần còn ≥2 máy dựng mỗi fold); với đúng 2 máy không có
   cross-validation, chỉ còn một phép giữ-lại-đơn kém ổn định và không có tín hiệu bất định.
