# Thước đo GT-free: sai số tái chiếu held-out có bám sát MPJPE?

*Sinh tự động bởi `experiments/danh_gia_khong_gt.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Năm thực nghiệm khử nhiễu trước đều chấm bằng **MPJPE**, cần **3D ground-truth**. Video múa
THẬT ở Cổng 0 không có 3D GT. Cách đánh giá không-GT chuẩn: **giữ lại một camera**, dựng 3D từ
các máy còn lại, chiếu lên máy giữ lại rồi so với 2D quan sát — sai số này đo được **không cần
3D GT**. Câu hỏi: trên dữ liệu tổng hợp (có cả hai), nó có **tương quan** với MPJPE để biện minh
việc dùng trên dữ liệu thật? Và **vì sao phải held-out** chứ không dùng tái chiếu in-sample?

## Thiết lập
- Múa tổng hợp 45 khung, 4 máy (-60°/-20°/+20°/+60°); dựng 3D từ
  **3 máy -60°/+20°/+60°**, **giữ lại máy -20°**.
- **Hai cơ chế nhiễu** (để phép thử tương quan không tầm thường): nhiễu Gaussian nền
  {2, 5} px trên mọi view, **và** outlier thô
  50–130 px với tỉ lệ {0%, 8%, 20%}
  **chỉ trên các view dựng**. Máy giữ lại chỉ có nhiễu Gaussian (giám khảo sạch).
- 2 phương pháp (plain/robust) × 25 lần lặp = **300 lần dựng**.

## A. Held-out tái chiếu bám sát MPJPE tốt
- **Pearson r (gộp 300 lần dựng): 0.988** — quan hệ tuyến tính chặt.
- **Spearman ρ (gộp): 0.977** — bảo toàn thứ hạng: xếp tốt/xấu **trùng** MPJPE.
- Quy đổi tuyến tính tham khảo: MPJPE(mm) ≈ 5.39·reproj_heldout(px) + -14.48.
  (Không phải ước lượng mm tuyệt đối vì có sàn nhiễu detector của máy giữ lại, nhưng **đơn điệu**
  nên đủ để so sánh & xếp hạng phương pháp/siêu tham số.)

## B. Vì sao PHẢI held-out, không dùng in-sample
Đây là chỗ **phải trung thực với số liệu**: nếu chỉ quét một nút nhiễu Gaussian thì mọi thước đo
đều tăng đơn điệu → tương quan ~1 là *hiển nhiên*, held-out và in-sample **không phân biệt được**.
Khi thêm **outlier thô** (nhiều cơ chế chất lượng), khác biệt mới lộ:

| Thước đo | Pearson r (toàn bộ) | Spearman ρ (toàn bộ) | Pearson r (chỉ ca CÓ outlier) |
|:--|---:|---:|---:|
| **Held-out** (giám khảo độc lập) | 0.988 | 0.977 | **0.990** |
| In-sample (chiếu lại máy đã dựng) | 0.878 | 0.926 | 0.776 |

- Trên tập **có outlier**, in-sample tương quan MPJPE **yếu hơn hẳn** so với held-out
  (r=0.776 vs 0.990). Lý do: in-sample so điểm 3D với **chính quan sát chứa outlier
  đã dùng để fit** — outlier trong đầu vào bơm thẳng vào residual bất kể 3D tốt hay xấu, nên nó
  **không còn là proxy trung thực của sai số 3D**. Held-out chấm bằng **camera tham chiếu độc lập
  sạch**, nên phản ánh đúng sai số 3D.
- Ngoài ra in-sample **lạc quan về độ lớn** khi không outlier (DLT đã tối thiểu hoá đúng đại lượng
  đó), nên vừa lệch biên độ vừa dễ nhiễu — hai lý do cộng lại để **luôn dùng held-out**.

## Bảng theo điều kiện
| Gauss (px) | Outlier % | P.pháp | MPJPE thật (mm) | Reproj HELD-OUT (px) | Reproj in-sample (px) | |
|---:|---:|:--|---:|---:|---:|:--|
| 2 | 0 | plain | 5.61 | 2.75 | 2.28 | `#...........................` |
| 2 | 0 | robust | 5.58 | 2.75 | 2.29 | `#...........................` |
| 2 | 8 | plain | 64.62 | 13.50 | 18.71 | `################............` |
| 2 | 8 | robust | 15.13 | 4.50 | 13.14 | `####........................` |
| 2 | 20 | plain | 114.10 | 23.25 | 36.84 | `############################` |
| 2 | 20 | robust | 46.98 | 10.43 | 31.25 | `###########.................` |
| 5 | 0 | plain | 13.79 | 6.91 | 5.69 | `###.........................` |
| 5 | 0 | robust | 13.71 | 6.90 | 5.70 | `###.........................` |
| 5 | 8 | plain | 67.84 | 15.52 | 20.62 | `################............` |
| 5 | 8 | robust | 25.65 | 8.72 | 16.62 | `######......................` |
| 5 | 20 | plain | 116.10 | 24.21 | 37.68 | `############################` |
| 5 | 20 | robust | 52.97 | 13.37 | 32.82 | `#############...............` |

## Hệ quả cho luận văn
1. **Giao thức đánh giá Cổng 0**: mọi cải tiến khử nhiễu (robust/weighted/xương/hiệu chuẩn) sẽ
   được chấm trên múa thật bằng **sai số tái chiếu held-out** — và giao thức này đã được **kiểm
   định trên dữ liệu tổng hợp** (bám sát MPJPE thật, r≈0.99). Bản thân việc kiểm định &
   chọn đúng thước đo GT-free là một **đóng góp phương pháp**, không phải tính năng app.
2. **Lý do kỹ thuật cho cấu hình ≥3 máy**: không chỉ để dựng chính xác hơn mà để **luôn có một
   camera giữ lại độc lập** làm giám khảo — thứ giải pháp 1-camera (Choreoto) không thể có.
   Phải là held-out, không in-sample: in-sample bị chính nhiễu đầu vào làm sai lệch (mục B).
3. Vẫn nên thêm một mẩu **AIST++** (có 3D GT thật) ở Cổng 0 để chốt hệ số quy đổi px→mm; còn khung
   đánh giá không-GT cho video tự quay đã sẵn sàng và đã được kiểm định.
