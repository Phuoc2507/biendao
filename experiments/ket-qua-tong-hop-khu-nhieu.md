# Capstone: cộng dồn ba lớp khử nhiễu trên nhiễu hỗn hợp

*Sinh tự động bởi `experiments/tong_hop_khu_nhieu.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Ba vòng trước đã đo **riêng** từng lớp khử nhiễu, mỗi lớp trên đúng loại lỗi nó nhắm:
`triangulate_robust` (lỗi **thô**), weighted DLT nghịch-phương-sai (nhiễu **mềm** theo
confidence), ràng buộc xương PBD (nhiễu **radial** làm xương co giãn). Nhưng mocap
2-view thật dính **cả ba loại cùng lúc**. Câu hỏi ở đây: bật cả ba **cộng dồn** thì chúng
**hợp lực** hay **đánh nhau**? (Ví dụ: weighting hạ ảnh hưởng một view sạch có làm cổng
robust loại nhầm chính nó không — đúng lỗi đã phát hiện & sửa ở Vòng 11.)

## Thiết lập nhiễu hỗn hợp
- Múa tổng hợp 75 khung, 3 máy (-45°/+0°/+45°), cách 4.5 m.
- **Nhiễu mềm**: std = 2 + σ·10 px, σ = "độ xấu" thực ∈[0,1];
  confidence detector biết nhiễu ở mức ρ=0.85.
- **Lỗi thô**: 2% quan sát bị cộng lệch 60–220 px (bắt nhầm khớp);
  confidence ở các quan sát này bị kéo xuống (detector thật thường báo thấp khi nhầm).
- 30 lần lặp Monte-Carlo. MPJPE toàn cục (root=None); Std xương = độ lệch chuẩn
  chiều dài 15 xương qua thời gian (0 = cứng tuyệt đối).

## A. Kết quả cộng dồn (ngưỡng cổng mặc định 20px)
| Lớp khử nhiễu (cộng dồn) | MPJPE (mm) | Δ vs thô | Std xương (mm) | |
|:--|---:|---:|---:|:--|
| Thô (DLT thường) | 38.89 | — | 38.66 | `############################` |
| + robust (lỗi thô) | 26.08 (+33% bước) | +33% | 25.02 | `###################.........` |
| + weighted (nhiễu mềm) | 24.46 (+6% bước) | +37% | 23.88 | `##################..........` |
| + ràng buộc xương (radial) | 22.46 (+8% bước) | +42% | 0.00 | `################............` |

- **Mỗi lớp đánh một trục lỗi khác nhau** nên cộng dồn được: robust cắt đuôi lỗi thô (kéo
  MPJPE xuống mạnh nhất vì lỗi thô hại nhất), weighted vắt thêm phần nhiễu mềm cổng robust
  để lọt, ràng buộc xương ép lại độ cứng giải phẫu (Std xương → 0) mà **không** làm xấu
  MPJPE. Cả ba bước đều dương.

## B. Robust và weighted tương tác theo NGƯỠNG CỔNG
| Ngưỡng cổng (px) | robust-only (mm) | robust+weighted (mm) | Δ weighted | |
|---:|---:|---:|---:|:--|
| 10 | 26.72 | 25.88 | +3% | `########################....` |
| 15 | 26.05 | 24.61 | +6% | `######################......` |
| 20 | 26.18 | 24.55 | +6% | `######################......` |
| 30 | 27.60 | 25.82 | +6% | `#######################.....` |
| 45 | 29.47 | 27.03 | +8% | `#########################...` |
| 60 | 30.82 | 27.01 | +12% | `#########################...` |

Đây là phát hiện chính của vòng này, và **không hiển nhiên**:
- **Robust và weighted chia nhau một "ngân sách" nhiễu mềm.** Lợi ích cộng thêm của weighting
  **tăng dần theo ngưỡng cổng** (từ ~+3% ở 10px lên ~+12% ở 60px): ngưỡng cao thì cổng robust
  để lọt nhiều view chỉ bị nhiễu mềm hơn → còn nhiều việc cho weighting làm → weighting lãi
  nhiều hơn. Ngưỡng thấp thì cổng đã cắt bớt view nhiễu mềm → weighting còn ít việc → lãi nhỏ.
  Hai lớp bổ trợ (weighting không bao giờ âm ở đây) nhưng **không cộng dồn tuyến tính** — bật
  cái này làm giảm dư địa của cái kia.
- **Có ngưỡng tối ưu cho ĐỘ CHÍNH XÁC TỔNG HỢP** (~15–20px trong thiết lập này): thấp quá thì
  cổng cắt nhầm cả view chỉ nhiễu mềm (robust-only xấu đi ở 10px); cao quá thì lỗi thô lọt lưới
  (cả robust-only lẫn robust+weighted xấu đi rõ ở 45–60px). Quy tắc thiết kế: **đặt ngưỡng
  trên dải nhiễu mềm dự kiến nhưng dưới biên lỗi thô** — và dải đó ước được từ confidence detector.

Để hai lớp không đánh nhau ở tầng code, `triangulate_robust` tách bạch: cổng chọn inlier
bằng **hình học thuần** (giải & tái chiếu không trọng số) — quyết định "view nào lỗi thô"
độc lập confidence — rồi **chỉ phép khớp cuối** trên tập inlier mới áp trọng số. Không tách,
một view sạch bị hạ trọng số sẽ reproject tệ và bị cổng loại nhầm (đã bắt bằng unit-test).

## Hệ quả cho luận văn
1. Đây là **hình dạng cuối** của khối fuse/cleanup demo: pipeline khử nhiễu ba tầng, mỗi
   tầng có động cơ hình học riêng, có test riêng, cộng dồn được — đo trên cùng một kịch bản
   nhiễu hỗn hợp thay vì mỗi lớp một sân chơi thuận lợi.
2. Con số ở đây vẫn là **cận trên trên nhiễu MÔ PHỎNG**. Việc ở Cổng 0 là lặp lại đúng hai
   bảng này với **sai số detector THẬT** (2D pose trên video múa thật, confidence thật); khi
   đó thứ tự đóng góp ba lớp + ngưỡng cổng tối ưu mới là số liệu đánh giá thật, còn khung đo
   đã sẵn sàng và tái lập được.
3. Bài học "hai bộ lọc tốt vẫn có thể giẫm chân nhau nếu ghép ẩu, và điểm giao phụ thuộc
   tham số đo được" chính là loại phát hiện thuộc tầng perception/đánh giá mà luận văn nhắm
   tới — không phải tính năng app.
