# V40 — Bản đồ BIÊN GÃY của metric tách-pha đã ship: có đáng xây SRVF/DTW không?

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), chạy trên mã đã ship `phaseAlignAt`+`formOutlierIndex` (V36).
> Kịch bản: [`web/experiments/failure-frontier.ts`](../web/experiments/failure-frontier.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/failure-frontier.ts --bundle --platform=node --format=cjs --outfile=ff.cjs && node ff.cjs`

## Vì sao đo & kết luận thẳng

Bài học V37–39: nấc warping AFFINE đẹp trên cặp cô lập nhưng KHÔNG chuyển thành lợi ích ở
toàn pipeline ([kết quả âm](ket-qua-affine-toan-pipeline.md)). Trước khi xây nấc kế tiếp
(SRVF/DTW đàn hồi — đắt hơn NHIỀU), phải ĐO: sau V36, CÒN chế độ nào metric chỉ-dịch thật
sự gãy ở mức pipeline không, và affine có cứu được không?

**Kết luận: DỪNG leo thang warping.** Metric V36 (rigid-τ + thô→tinh) bền trên toàn biên
CÓ Ý NGHĨA VẬT LÝ. Chỗ duy nhất nó gãy (trôi tempo phi tuyến cực mạnh) nằm NGOÀI vùng vật
lý (nhịp đã đảo chiều) VÀ affine ở đó còn TỆ hơn → chỉ SRVF/DTW mới vươn tới, nhưng regime
đó gần như không xảy ra với "trôi nhịp" thật. SRVF/DTW ghi là hướng mở, chỉ kích hoạt nếu
mocap THẬT lộ trôi phi tuyến TRONG cửa sổ ở vùng vật lý.

## Kết quả

### (A) Trôi tempo PHI TUYẾN trong cửa sổ — φ(t)=t+A·sin(2π t/2.0), người 0, KHÔNG sai hình dáng

Nhịp tức thời φ′(t)=1+Aπ·cos(πt), cực tiểu **1−Aπ**. FP mong muốn 0; formSync cao = đúng.

| A (m) | 1−Aπ (nhịp min) | FP dịch | FP affine | fSync dịch | fSync affine |
|------:|:---------------:|:-------:|:---------:|:----------:|:------------:|
| 0.0 | 1.00 | 0% | 0% | 100 | 96 |
| 0.1 | 0.69 | 0% | 0% | 97 | 96 |
| 0.2 | 0.37 | 0% | 0% | 94 | 94 |
| 0.3 | 0.06 (gần đơ) | **0%** | 0% | 91 | 91 |
| 0.4 | **−0.26 (ĐẢO)** | **20%** | **30%** | 88 | 87 |
| 0.5 | −0.57 (ĐẢO) | 38% | 43% | 86 | 86 |

### (B) Lỗi KÉP — người 0 trễ τ HẰNG + múa B (sai hình dáng). TP phải giữ ~100

| τ (s) | TP dịch | TP affine | fSync dịch | fSync affine |
|------:|:-------:|:---------:|:----------:|:------------:|
| 0.0 | 100% | 100% | 78 | 76 |
| 0.2 | 100% | 100% | 78 | 76 |
| 0.4 | 100% | 100% | 78 | 76 |
| 0.6 | 100% | 100% | 78 | 76 |
| 0.8 | 100% | 100% | 78 | 76 |

### (C) Canon τ VƯỢT maxLag (=1.0s) — người 0 trễ τ HẰNG, KHÔNG sai hình dáng. FP phải 0

| τ (s) | FP dịch | fSync dịch | |
|------:|:-------:|:----------:|---|
| 0.5 | 0% | 100 | trong biên |
| 0.8 | 0% | 100 | trong biên |
| 1.0 | 0% | 100 | trong biên |
| 1.2 | 0% | 100 | **vượt biên** |
| 1.4 | 0% | 100 | vượt biên |
| 1.6 | 0% | 100 | vượt biên |

## Đọc kết quả

- **(A) Biên gãy TRÙNG KHỚP điểm nhịp đảo chiều.** FP=0 tới A=0.3 (nhịp min 0.06 — gần
  đơ nhưng VẪN tiến); FP bật lên đúng A=0.4 khi nhịp min hoá ÂM (−0.26) — vũ công lùi
  ngược routine trong cửa sổ. Đó không còn là "trôi nhịp" mà là chuyển động về bản chất
  KHÁC (thời gian phi đơn điệu). **Affine ở regime này còn TỆ HƠN** (FP 30–43% > dịch
  20–38%): bậc tự do ρ HẰNG cố khớp một nhịp trung bình cho đoạn có nhịp đảo dấu → lệch
  thêm. ⇒ nếu muốn phủ regime này phải dùng warping BIẾN THIÊN đầy đủ (SRVF/DTW), affine
  vô ích. Nhưng regime nằm ngoài vật lý của trôi tempo → KHÔNG ưu tiên.
- **(B) Lỗi kép được xử SẠCH.** TP giữ 100% ở MỌI τ cho cả hai cấu hình: metric gỡ đúng
  timing (tìm lag tối ưu) mà residual B-chi VẪN nổi → không bị timing che. formSync phẳng
  78 (≠100) bất kể τ. Đóng đúng lỗ hổng nguyên mẫu affine tự ghi là "chưa tách riêng".
- **(C) Quá maxLag vẫn an toàn.** FP=0, formSync=100 kể cả τ=1.6s (quá biên 0.6s). Clip
  TUẦN HOÀN: trễ hằng τ khớp tốt với một trễ τ′≈τ mod chu kỳ trong cửa sổ, cộng gộp trung
  vị 5 người (chỉ 1 người lệch) → không cần nới maxLag thêm.

## Kết luận cho luận văn

Cùng với kết quả âm affine (V39), vòng này khép **cung warping** bằng bằng chứng, không
bằng cảm tính: rigid-τ + coarse-to-fine (V36) là ĐIỂM PHỨC TẠP ĐÚNG của metric tách-pha.
Ba nấc đã đo — rigid-τ (ship), affine τ×ρ (cài, tắt: không đáng ở pipeline), SRVF/DTW
(không xây: regime nó giải nằm ngoài vật lý, affine chứng minh rẻ-hơn không tới). Đây là
ví dụ "dừng đúng lúc": thêm bậc tự do warping chỉ đáng khi DỮ LIỆU đòi, và dữ liệu (tổng
hợp, có kiểm soát) nói biên gãy còn lại trùng điểm phi vật lý. SRVF/DTW để ngỏ, kích hoạt
CÓ ĐIỀU KIỆN: nếu mocap THẬT ở Cổng 0 lộ trôi nhịp phi tuyến TRONG cửa sổ mà vẫn đơn điệu
(nhịp không đảo), đo lại biên này trên phân phối lỗi thật rồi mới quyết.
