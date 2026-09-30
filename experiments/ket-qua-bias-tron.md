# V54 — Bias TRỘN hai nguồn: giao thức 2-tầng (mốc→LOVO) compose tới đâu, và vì sao THỨ TỰ?

*Sinh tự động bởi `experiments/bias_tron.py` — thuần numpy, chạy CPU.*

## Câu hỏi (đóng mục V53 để ngỏ)
V53 để ngỏ: khi vừa lệch-calib (bias TOÀN-CAMERA) vừa lỗi-detector (bias 1-KHỚP) cùng xuất hiện, "dùng
CẢ hai thước (mốc rồi LOVO trên phần dư) là hướng hợp lý". V54 **ĐO** phối hợp đó — và thấy điều SẮC hơn
lời hứa: giao thức 2-tầng có một **ENVELOPE** (điều kiện vận hành); NGOÀI envelope, ghép ngây thơ còn
**HẠI**.

Ba tầng: LOVO-đơn (chỉ đồng-thuận), mốc-đơn (chỉ anchor tuyệt-đối), TRỘN (anchor TRƯỚC → LOVO trên phần
dư, τ hiệu chỉnh lại theo sub-rig). Bias 60px, 12 trial/ô. Cột "đúng%" = loại ĐÚNG
tập biased; "dev" = MPJPE-proxy sau khi dựng từ view giữ lại (cm).

## Kết quả (số đo được)
| kịch bản | V | sub sau anchor | envelope | LOVO-đơn %/dev | mốc-đơn %/dev | TRỘN a→L %/dev | oracle |
|---|---:|---:|:--:|---:|---:|---:|---:|
| TRÙNG 1 view: cam{0}+joint{0} | 4 | 3 | ✗ | 100% / 0.58 | 100% / 0.58 | 100% / 0.58 | 0.58 |
| disjoint rig NHỎ: cam{0}+joint{1} | 4 | 3 | ✗ | 0% / 31.06 | 0% / 19.39 | 0% / 39.93 | 0.78 |
| disjoint vừa đủ: cam{0}+joint{1} | 5 | 4 | ✔ | 100% / 0.63 | 0% / 15.41 | 100% / 0.63 | 0.63 |
| disjoint dư: cam{0}+joint{1} | 6 | 5 | ✔ | 100% / 0.55 | 0% / 12.77 | 100% / 0.55 | 0.55 |
| 2 whole-cam+1 joint: cam{0,1}+joint{2} | 6 | 4 | ✔ | 0% / 30.55 | 0% / 17.04 | 100% / 0.67 | 0.67 |
| 2 whole-cam+1 joint, rig lớn | 7 | 5 | ✔ | 0% / 30.49 | 0% / 13.87 | 100% / 0.56 | 0.56 |

*envelope ✔ = `V−k_cam ≥ 4` VÀ `V−k_cam−k_joint ≥ 2`.*

## Đọc kết quả — giao thức compose CÓ ĐIỀU KIỆN, và overturns lời hứa ngây thơ V53
- **TRÙNG 1 view (cam{0}+joint{0}): tầm thường.** Cùng camera hỏng cả hai kiểu = "1 camera xấu";
  LOVO-đơn, mốc-đơn, TRỘN đều loại đúng, dev 0.58=oracle 0.58. Không phải ca khó.
  (Ô này envelope ✗ vì sub=3<4, NHƯNG vẫn 100% — vì sau khi anchor gỡ view đó, KHÔNG còn joint-bias dư
  để LOVO phải bắt; envelope là điều kiện cho chế-độ DISJOINT nơi LOVO thực sự phải chạy trên phần dư.)
- **disjoint rig NHỎ (V=4, cam{0}+joint{1}, sub=3 < 4): ghép ngây thơ HỎNG/HẠI.** LOVO-đơn
  0% (dev 31.06); mốc-đơn chỉ gỡ whole-cam, joint còn lại → dev
  19.39; TRỘN dev **39.93** — KHÔNG cứu, thậm chí có thể tệ hơn mốc-đơn. Lý do:
  anchor gỡ view whole-cam làm rig CO xuống 3 view, DƯỚI biên-bền của LOVO (cần ≥3 "others" để drop-worst
  ⇒ cần ≥4 view) → confound V52 TRỞ LẠI, LOVO loại nhầm. Đây là chỗ overturns V53: "hướng hợp lý" CHỈ
  đúng CÓ ĐIỀU KIỆN.
- **disjoint vừa đủ (V=5, sub=4 = biên): phục hồi.** TRỘN 100% dev 0.63=oracle
  0.63. Đúng ngay khi chạm envelope `V−k_cam≥4`.
- **2 whole-cam + 1 joint disjoint (V=6, cam{0,1}+joint{2}): ô VÀNG chứng minh THỨ TỰ & tính vô-hạn
  của anchor.** LOVO-đơn **0%** (dev 30.55) — 2 view whole-cam nhấn chìm
  trần đồng-thuận. Nhưng anchor gỡ CẢ HAI view whole-cam KHÔNG cần đa-số (V53) → còn 4 view, 1 joint →
  LOVO-bền bắt đúng → TRỘN **100%** dev 0.67=oracle. ⇒ **anchor TRƯỚC**:
  dọn nguồn vô-hạn-trần trước, rồi LOVO chạy trong đúng chế độ hợp lệ. Đổi thứ tự (LOVO trước) hỏng vì
  whole-cam còn đó thổi phồng mọi reproj.

## Envelope (phát biểu gọn cho hội đồng)
Giao thức 2-tầng chạm oracle KHI VÀ CHỈ KHI:
```
V − k_cam ≥ 4                (LOVO-bền còn đủ biên sau khi anchor gỡ k_cam view whole-cam)
V − k_cam − k_joint ≥ 2      (còn ≥2 view sạch hẳn để tam giác hoá cuối)
k_joint ≤ floor((V − k_cam − 1)/2)   (trần V52 trên rig ĐÃ dọn)
```
Ý nghĩa thiết kế rig: **anchor mua khả năng gỡ whole-cam KHÔNG giới hạn đa-số, nhưng mỗi view gỡ đi làm
hao biên của LOVO** → phải chừa đủ view cho tầng sau. Hệ quả 2-điện-thoại (V=2): envelope KHÔNG thoả
(2−k_cam<4 ngay khi có bất kỳ bias nào cần gỡ) ⇒ cấu hình 2-máy KHÔNG tự chữa ca TRỘN; cần ≥5–6 máy
hoặc nhãn Gate-0 — ghi nhận trung thực, khớp giới hạn đã nêu ở V51–V53.

## Vị trí trong mạch đề tài
V54 HỢP NHẤT cung V49–V53 thành MỘT giao thức có envelope tường minh: held-out (V49) chẩn đoán → robust
vs held-out bổ túc (V50) → LOVO sửa bias-vừa robust để hở (V51) → trần đồng-thuận floor((V-1)/2) (V52) →
mốc tuyệt-đối phá trần cho bias-camera, mù bias-khớp (V53) → **ghép mốc→LOVO xử lý TRỘN, có điều kiện rig
V−k_cam≥4, thứ tự anchor-trước bất-hoán** (V54). Cùng motif xuyên suốt: lỗi HỆ-THỐNG một-nguồn chỉ trị
bằng bằng-chứng ĐÚNG granularity nguồn (mốc tuyệt-đối cho camera, đồng-thuận per-camera cho khớp), và
GHÉP các thước phải tôn trọng chế-độ-hợp-lệ của từng thước.

## Giới hạn (trung thực)
- Vẫn hình học tổng hợp; bias 60px cố định, hướng SAME; view-nào-bias cố định (confound
  chưa quét, như V52/V53). Envelope suy ra từ cơ chế + xác nhận bằng quét số-view, chưa chứng minh giải
  tích đầy đủ.
- Chỉ xét 1 khớp joint-bias mỗi ô; k_joint>1 và nhiều khớp cùng lỗi chưa quét (trần V52 dự đoán biên).
- Số thật trên detector/calib thật chờ Gate-0 (GPU lab).
