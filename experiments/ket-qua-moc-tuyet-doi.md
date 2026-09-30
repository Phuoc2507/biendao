# V53 — Mốc TUYỆT ĐỐI (tham chiếu ngoài đồng thuận) phá trần V52 tới đâu, cho bias nào?

*Sinh tự động bởi `experiments/moc_tuyet_doi.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V52 chứng minh chọn-view **dựa-đồng-thuận** (LOVO) có TRẦN `floor((V-1)/2)` và kết luận: phá trần
cần **tham chiếu NGOÀI đồng thuận**. Đó là khẳng định — V53 **ĐO** nó (y như V42 đo thước tuyệt-đối
phá trần nhóm-tương-đối V41). Tham chiếu ngoài hiện thực nhất trong pipeline 2-điện-thoại: **bảng
calib** — vài điểm 3D **biết trước**. Với mỗi camera, tái chiếu mốc-3D-biết qua calib của nó rồi so
với mốc **quan sát** → residual per-camera, KHÔNG cần đồng thuận, KHÔNG giả định đa-số.

Cổng mốc lấy từ SỐ LIỆU: trần residual khi mọi camera sạch ×1.5 = **7.08px** (không
phải hằng số phù thuỷ). Bias 60px, hướng SAME (mốc tuyệt-đối vốn bất biến hướng; LOVO-bền
đã chứng minh bất biến hướng ở V52).

## Câu hỏi sắc hơn "tuyệt đối thắng tương đối": mốc THẤY bias loại nào?
Bias tầng dựng có HAI nguồn vật lý — mốc chỉ "thấy" một:
- **Bias TOÀN-CAMERA** (sai calib/extrinsic): mọi khớp **và** mốc dời qua cùng camera-model sai →
  mốc THẤY (residual vọt) → loại được **bất kể** bao nhiêu camera bias.
- **Bias 1-KHỚP** (detector định vị sai riêng cổ tay — che khuất, lẫn trái-phải): chỉ l_wrist dời,
  mốc (góc bảng) KHÔNG dời → mốc **MÙ** → chỉ đồng thuận đa-view (LOVO) bắt được, chịu trần V52.

## Kết quả (số đo được)

### Bias TOÀN-CAMERA (sai calib) — mốc THẤY
| k bias | #view sạch | mốc loại-đúng | mốc dev3d (cm) | LOVO loại-đúng | LOVO dev3d (cm) | oracle (cm) |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 100% | 0.54 | 100% | 0.54 | 0.54 |
| 1 | 3 | 100% | 0.64 | 100% | 0.64 | 0.64 |
| 2 | 2 | 100% | 0.87 | 0% | 30.54 | 0.87 |
| 3 | 1 | 100% | nan | 0% | 30.58 | —(cấu trúc) ⚠struct |

### Bias 1-KHỚP (sai detector) — mốc MÙ
| k bias | #view sạch | mốc loại-đúng | mốc dev3d (cm) | LOVO loại-đúng | LOVO dev3d (cm) | oracle (cm) |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 100% | 0.55 | 100% | 0.55 | 0.55 |
| 1 | 3 | 0% | 15.02 | 100% | 0.62 | 0.62 |
| 2 | 2 | 0% | 25.01 | 0% | 30.55 | 0.86 |
| 3 | 1 | 0% | 29.88 | 0% | 30.56 | —(cấu trúc) ⚠struct |

*⚠struct = chỉ còn 1 view sạch, oracle cũng KHÔNG lập nổi (<2 view để tam giác hoá) = giới hạn CẤU TRÚC.*

## Đọc kết quả — mốc phá trần CHỈ cho bias nó THẤY, tới giới hạn cấu trúc
- **Bias toàn-camera: mốc k≤2, LOVO k≤1.** Mốc tuyệt đối PHÁ trần V52 (LOVO k≤1): nêu đúng
  **mọi** camera bias không cần đa-số (k=1 dev 0.64=oracle 0.64; k=2 dev 0.87=
  oracle 0.87cm — nơi LOVO gãy còn 30.54cm). Trần mốc = **giới hạn CẤU TRÚC** (k=3 chỉ
  1 view sạch, oracle cũng bất lực) chứ không phải trần đồng-thuận. Đây là geometric-twin của V42.
- **Bias 1-khớp: mốc k≤0 (MÙ), LOVO k≤1.** Mốc BẤT LỰC vì nó tham chiếu điểm KHÁC (góc bảng),
  không thấy lỗi cổ tay (k=1 mốc loại-đúng 0%, dev 15.02cm — không cứu được).
  Ở nguồn lỗi này, đồng thuận đa-view (LOVO) là lối DUY NHẤT, và chịu đúng trần V52 floor((V-1)/2).
- **Kết luận BÙ-NHAU (không phải "tuyệt đối luôn thắng"):** tham chiếu ngoài phá trần đồng-thuận
  **chỉ cho nguồn lỗi mà tham chiếu đó THẤY**. Calib-anchor thấy sai-calib (phá trần), mù sai-detector;
  đồng-thuận thấy cả hai nhưng có trần đa-số. Không công cụ nào vượt giới hạn CẤU TRÚC (cần ≥2 view
  sạch). Đây là **cùng motif xuyên đề tài**: robust↔held-out (V50), nhóm-tương-đối↔tuyệt-đối-nhãn
  (V41/V42) — mỗi cặp thước bù nhau theo NGUỒN, và cặp đó khép kín khi CHỌN đúng thước cho đúng nguồn.

## Hệ quả pipeline 2-điện-thoại (thực dụng)
- **Sai calib** (điện thoại xê dịch giữa buổi, extrinsic lệch): dùng **mốc bảng calib** — bắt được kể
  cả khi CẢ HAI máy lệch, miễn còn ≥2 máy đúng để dựng. Rẻ, không cần đa-số.
- **Sai detector 1 khớp** (che khuất, lẫn trái-phải): mốc vô dụng; cần **≥3 máy + đa số sạch** cho LOVO
  (V51/V52), hoặc rơi về nhãn Gate-0. Cấu hình ĐÚNG-2-máy KHÔNG tự chữa nguồn này — ghi nhận trung thực.

## Giới hạn (trung thực)
- Mốc giả định bảng calib VISIBLE & 3D biết trước (đúng với pha calib ChArUco của pipeline); nếu bảng
  chỉ thấy lúc đầu rồi máy xê dịch, residual phản ánh lệch TẠI thời điểm thấy mốc — drift sau đó ngoài
  tầm, cần re-calib. Ghi nhận phụ thuộc.
- Hai loại bias đo RIÊNG; thực tế có thể TRỘN (vừa lệch calib vừa lỗi detector) — khi đó dùng CẢ hai
  thước (mốc rồi LOVO trên phần dư) là hướng hợp lý, chưa đo phối hợp.
- Bias 60px cố định; camera-nào-bias theo `BIAS_ORDER=(0, 1, 2)` cố định (confound chưa
  quét, như V52). Vẫn hình học tổng hợp; số trên detector/calib thật chờ Gate-0 (GPU lab).
