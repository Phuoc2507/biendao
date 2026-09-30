# Tam giác hoá có trọng số tin cậy (weighted DLT)

*Sinh tự động bởi `experiments/trong_so_tin_cay.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Detector 2D thật xuất **confidence** mỗi khớp, và confidence thấp thường **trùng** với lúc
toạ độ 2D nhiễu nhất (khớp bị che, mờ do chuyển động, ra rìa ảnh). DLT bình phương tối thiểu
coi mọi view **như nhau** → bị quan sát tin-cậy-thấp kéo lệch. `triangulate_dlt(weights=…)`
nhân hàng DLT của mỗi view với confidence: view mờ **giảm ảnh hưởng** một cách mềm (khác với
`triangulate_robust` loại cứng lỗi thô). Câu hỏi: lợi ích phụ thuộc thế nào vào việc confidence
có **dự báo đúng** nhiễu hay không?

## Thiết lập
- Múa tổng hợp 60 khung, 3 máy (−45°/0°/+45°), khoảng cách 4.5 m.
- Mỗi quan sát có "độ xấu" thực σ∈[0,1]; nhiễu 2D std = 2 + σ·12 px.
- Confidence detector "báo" = ρ·(1−σ) + (1−ρ)·(ngẫu nhiên): **ρ = mức confidence biết nhiễu**
  (ρ=1 dự báo hoàn hảo, ρ=0 vô dụng). 40 lần lặp Monte-Carlo. MPJPE toàn cục (root=None).

## A. Lợi ích phụ thuộc confidence có "biết" nhiễu không (trọng số tuyến tính)
| Tương quan conf–nhiễu (ρ) | DLT thường (mm) | Weighted-tuyến-tính (mm) | Δ | (weighted) |
|---:|---:|---:|---:|:--|
| 0.0 | 24.58 | 29.90 | -22% | `############################` |
| 0.5 | 24.58 | 24.26 | +1% | `#######################.....` |
| 0.8 | 24.58 | 23.10 | +6% | `######################......` |
| 1.0 | 24.58 | 23.94 | +3% | `######################......` |

- **ρ=0 (confidence ngẫu nhiên)**: weighting **tệ hơn** DLT thường — trọng số sai thêm phương
  sai. Rác vào, rác ra: không được tin confidence nếu chưa kiểm.
- **ρ tăng**: lợi ích dương dần khi confidence dự báo đúng chỗ nhiễu. Nhưng trọng số **tuyến
  tính** chỉ vắt được lợi ích khiêm tốn (~vài %).

## B. Cách đặt trọng số quan trọng hơn (tại ρ=1, confidence dự báo đúng)
| Cách đặt trọng số | MPJPE (mm) | Δ vs không | |
|:--|---:|---:|:--|
| Không trọng số | 24.36 | — | `############################` |
| Tuyến tính (w=conf) | 23.61 | +3% | `###########################.` |
| Nghịch phương sai (w=1/σ²) | 22.22 | +9% | `##########################..` |

- **Tuyến tính (w=conf)**: đúng hướng nhưng dưới tối ưu.
- **Nghịch phương sai (w=1/σ²)**: coi confidence như **ước lượng phương sai** rồi lấy trọng số
  tối ưu Gauss–Markov → giảm MPJPE mạnh hơn hẳn (gấp ~3-4 lần lợi ích của tuyến tính). Đây là
  cách đặt trọng số **đúng thống kê** cho nhiễu Gaussian.
- (Bình phương w=conf² từng thử: **tệ hơn** — sắc quá thì khuếch đại chỗ confidence ước lượng
  sai. Không đưa vào bảng vì đã bị loại.)

## Đọc kết quả
- Weighting là bộ lọc nhiễu **mềm**: bổ trợ, không thay `triangulate_robust` (lỗi **thô**:
  đổi trái/phải, bắt nhầm người) — hai cơ chế đánh hai loại lỗi khác nhau.
- Lợi ích **có điều kiện kép**: (1) confidence phải tương quan với nhiễu (phần A), (2) phải
  chuyển confidence sang trọng số **đúng cách** — nghịch phương sai, không tuyến tính (phần B).

## Hệ quả cho luận văn
1. `fuse_multiview(confidences=…)` là **đường nạp confidence của detector 2D thật** ở Cổng 0 —
   một cải tiến pipeline cụ thể, có test, tận dụng thông tin detector vốn đã có sẵn (miễn phí).
2. **Phải HIỆU CHUẨN confidence → phương sai** trên tập validation (khớp confidence detector với
   sai số quan sát thực) rồi mới lấy trọng số nghịch-phương-sai. Bảng B là cận trên khi hiệu
   chuẩn tốt; bảng A cảnh báo cái giá khi confidence không đáng tin. Đây là một điểm đánh giá
   đo được, không hiển nhiên — đúng tinh thần novelty ở tầng perception/đánh giá.
3. Kết hợp khuyến nghị: **robust (lỗi thô) + weighted nghịch-phương-sai (nhiễu mềm) + ràng buộc
   xương (nhiễu radial)** là ba lớp khử nhiễu bổ sung nhau trong fuse/cleanup, mỗi lớp có thực
   nghiệm riêng.
