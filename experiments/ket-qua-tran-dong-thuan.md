# V52 — TRẦN của chọn-view-bằng-đồng-thuận (LOVO) khi NHIỀU camera cùng lệch

*Sinh tự động bởi `experiments/tran_dong_thuan.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V51 (LOVO) trị được **1** camera bias nhờ **đa số view sạch** đồng thuận chống lại nó. Hội đồng sẽ
hỏi: **đồng thuận đó hỏng khi nào?** V52 ép giả định tới GÃY: quét k∈{0..3}/4 camera bị bias
(supra-onset 60px), hai chế độ hướng, dùng **loại-lặp** (iterative LOVO, ngưỡng dừng
τ THEO số-view lấy từ trần-điểm-sạch ×1.5, quét MỌI tập con mỗi cỡ; τ phải theo số-view vì
phép dựng-con ít view đi thì sàn nhiễu tăng — dùng τ cố-định 4-view loại nhầm view sạch khi xuống 3
view, đã đo & sửa). Đo với **hai cách chấm đồng thuận** để lộ trần THẬT.

## Kết quả (số đo được)

### Cách 1 — LOVO NGÂY-THƠ (dựng "others" bằng phép thường)
Chấm view v = dựng 3D từ các view khác rồi tái chiếu về v. Vấn đề: "các view khác" còn chứa camera
bias thì bias làm bẩn phép dựng → điểm view SẠCH cũng bị thổi.

**SAME (bias cùng hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 0.0 | 100% | 0.53 | 0.53 |
| 1 | 3 | 1.0 | 100% | 0.64 | 0.64 |
| 2 | 2 | 2.0 | 0% | 30.61 | 0.85 |
| 3 | 1 | 2.0 | 0% | 30.51 | nan ⚠struct |

**DIFF (bias khác hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 0.0 | 100% | 0.54 | 0.54 |
| 1 | 3 | 2.0 | 0% | 51.46 | 0.61 |
| 2 | 2 | 2.0 | 0% | 39.27 | 0.83 |
| 3 | 1 | 2.0 | 0% | 79.22 | nan ⚠struct |

> **Phát hiện tầng 1 — confound nhiễm-bẩn, phụ thuộc HƯỚNG.** Ngay ở **k=1**, LOVO-ngây-thơ trị
> được hướng SAME (loại-đúng 100%) nhưng THẤT BẠI
> ở hướng DIFF (loại-đúng 0%, dev3d 51.46 vs oracle 0.61cm).
> Nguyên nhân ĐO ĐƯỢC: camera bias làm bẩn phép dựng dùng để chấm các view SẠCH, nên một view sạch
> "xuôi dòng" bẩn có thể có điểm CAO HƠN cả camera bias thật → argmax loại nhầm. Thắng/thua tuỳ hướng
> bias = đây KHÔNG phải trần thật, mà là lỗ hổng của cách chấm.

### Cách 2 — LOVO BỀN (dựng "others" kiểu bỏ-view-tệ-nhất)
Khi dựng từ "others", lặp bỏ view tái-chiếu tệ nhất (>20px) → một camera bias LẺ trong
others tự bị loại TRƯỚC KHI làm bẩn. Khử confound tầng 1.

**SAME (bias cùng hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 0.0 | 100% | 0.53 | 0.53 |
| 1 | 3 | 1.0 | 100% | 0.64 | 0.64 |
| 2 | 2 | 2.0 | 0% | 30.61 | 0.85 |
| 3 | 1 | 2.0 | 0% | 30.51 | nan ⚠struct |

**DIFF (bias khác hướng)**
| k bias | #view sạch | #loại | loại-ĐÚNG | dev3d LOVO (cm) | dev3d oracle (cm) |
|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 0.0 | 100% | 0.54 | 0.54 |
| 1 | 3 | 1.0 | 100% | 0.61 | 0.61 |
| 2 | 2 | 2.0 | 0% | 39.27 | 0.83 |
| 3 | 1 | 2.0 | 0% | 79.22 | nan ⚠struct |

*⚠struct = oracle cũng KHÔNG lập nổi vì <2 view sạch — giới hạn CẤU TRÚC, không phải lỗi thuật toán.*

> **Phát hiện tầng 2 — TRẦN THẬT, độc lập hướng.** LOVO-bền trị **k=1 CẢ HAI hướng**
> (loại-đúng SAME 100% / DIFF 100%, dev3d về oracle), rồi
> **gãy ở k=2 cả hai hướng** (SAME 0% dev3d 30.61 vs 0.85cm;
> DIFF 0% dev3d 39.27 vs 0.83cm).

## Đọc kết quả — TRẦN đồng thuận là floor((V-1)/2), song song V41
- **Trần: SAME k≤1, DIFF k≤1** (LOVO-bền) =
  **floor((V-1)/2)=1** cho V=4. Lý do CƠ CHẾ: chấm view v thì "others" có V-1=3 view; drop-worst
  trị được **thiểu số** bias trong 3 đó (≤1). k=1 → mọi bộ-others chỉ chứa ≤1 bias → khử sạch.
  k=2 → khi chấm một view sạch, others = {2 bias, 1 sạch}, drop-worst bỏ được 1, CÒN 1 bias → vẫn
  bẩn → view sạch bị thổi → loại nhầm. Đây là **cùng motif V41** (chấm nhóm-tương-đối sụp ở ~đa-số)
  tái hiện ở tầng HÌNH HỌC.
- **k=3**: chỉ còn **1 view sạch** — **giới hạn CẤU TRÚC**: bỏ 1 còn 2 mà có thể toàn bias, oracle
  cũng bất lực (không dựng nổi (dev3d = NaN)). Trần THÔNG TIN, không phải trần thuật toán.
- **Bài học cách-chấm**: LOVO-ngây-thơ phụ thuộc hướng bias (thắng SAME thua DIFF ngay k=1) vì nhiễm-bẩn; LOVO-bền khử confound cho trần độc-lập-hướng sạch sẽ.
  Chọn đúng cơ chế đồng thuận KHÔNG dời được trần nguyên lý (vẫn floor((V-1)/2)) nhưng khiến trần đó
  ĐÚNG-ĐẮN & đoán-trước-được thay vì phập phù theo hướng.

## Luận điểm: trần đồng thuận ⇒ cần LỐI THOÁT có-tham-chiếu (song song V42)
Như tầng đánh giá: chấm **nhóm-tương-đối** (V41) có trần ~đa-số, phá trần cần thước **tuyệt-đối
có-nhãn** (V42). Ở tầng dựng y hệt: chọn-view **dựa-đồng-thuận** (LOVO/robust) có trần floor((V-1)/2),
phá trần cần **tham chiếu NGOÀI đồng thuận** — hiệu chỉnh/khớp calib đã biết, hoặc rơi vào Gate-0 với
ground-truth. Đồng-thuận-nội-bộ là công cụ GT-free MẠNH nhưng có TRẦN nguyên lý; biết đúng trần đó
(và biết lối thoát là tham chiếu ngoài) là kết luận trung thực của cả cung V49–V52.

## Giới hạn (trung thực)
- Biên độ bias cố định 60px; chưa quét tương tác (k × biên độ). Ở bias nhỏ dưới onset,
  k không còn là biến chính (LOVO vốn đã không loại).
- Tập camera bị bias cố định theo `BIAS_ORDER=(0, 1, 2)` — CHỌN camera nào bias là confound chưa
  quét (góc lệch khác nhau đổi độ "lộ"). Kết luận về TRẦN-THEO-k và floor((V-1)/2) vững; số cụ thể
  theo cấu hình.
- ROBUST_THR=20px lấy từ triangulate_robust; ở bias dưới ngưỡng này drop-worst không
  kích hoạt (nhưng khi đó bias cũng chưa hại — xem V50/V51).
- τ hiệu chỉnh từ k=0 (pha mọi-view-sạch); hiện trường không có pha đó thì cần τ tiên nghiệm từ đặc
  tả detector — ghi nhận phụ thuộc.
- Vẫn hình học tổng hợp; số trên detector thật chờ Gate-0 (GPU lab).
