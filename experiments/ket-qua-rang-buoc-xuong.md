# Ràng buộc độ dài xương: khử nhiễu bằng chiếu ràng buộc đối xứng (PBD)

*Sinh tự động bởi `experiments/rang_buoc_xuong.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Tam giác hoá **từng khớp độc lập** nên độ dài xương (vốn phải **cứng**) lại dao động
theo khung — dấu hiệu nhiễu trực tiếp, đo được **không cần ground-truth** bằng
`bone_length_std`. Ép độ dài xương về hằng số là một bước cleanup dùng tiên nghiệm
giải phẫu. Nhưng "ép thế nào" mới là mấu chốt.

## Ba cách (ablation trung thực)
- **Baseline**: chỉ tam giác hoá + làm mượt Savitzky–Golay, không ràng buộc xương.
- **FK (bị loại)**: dựng lại bộ xương từ root theo **hướng gốc** + độ dài trung vị.
  Cho xương cứng tuyệt đối nhưng **dồn sai số** dọc chuỗi động học (một khớp gần root
  lệch → mọi khớp con lệch theo).
- **PBD (được chọn)**: chiếu ràng buộc đối xứng — mỗi xương dịch **cả hai đầu** về nhau
  nửa phần sai lệch, lặp 20 vòng. Xương cứng **và phân tán** sai số.

## Thiết lập
- Múa tổng hợp 60 khung; 2 máy chéo ±45°, khoảng cách 4.5 m.
- Nhiễu 2D (1.0, 3.0, 6.0) px; 20 lần lặp Monte-Carlo. MPJPE toàn cục (root=None).

## Kết quả
| Nhiễu 2D | Đại lượng | Baseline | FK (loại) | PBD (chọn) | Δ MPJPE (PBD vs base) | |
|---:|:--|---:|---:|---:|---:|:--|
| 1px | std xương (mm) | 4.51 | 0.000 | 0.001 | | |
| | MPJPE (mm) | 3.46 | 6.13 | 4.77 | -38% | `######......................` |
| 3px | std xương (mm) | 8.94 | 0.000 | 0.001 | | |
| | MPJPE (mm) | 9.95 | 12.72 | 9.50 | +5% | `###########.................` |
| 6px | std xương (mm) | 16.47 | 0.000 | 0.001 | | |
| | MPJPE (mm) | 19.78 | 23.69 | 17.58 | +11% | `#####################.......` |

## Đọc kết quả (bức tranh trung thực — có ngưỡng giao)
- **Cả FK và PBD đều làm xương gần như cứng hoàn toàn** (std xương → ~0), đúng kỳ vọng.
- **FK làm MPJPE TỆ hơn baseline ở MỌI mức nhiễu**: xương cứng mua bằng cái giá dồn
  sai số từ root ra đầu chi. Rigidity cao **không** đồng nghĩa vị trí đúng hơn — đây là
  phương án bị loại.
- **PBD có NGƯỠNG GIAO, không thắng vô điều kiện**:
  - Nhiễu **1px** (rất sạch): PBD **tệ hơn** baseline (~+38% MPJPE). Khi quan sát đã rất
    chính xác, ép về độ dài trung vị cứng nhắc lại **bỏ đi** thông tin đúng của từng khung.
  - Nhiễu **≥3px** (vùng thực của detector 2D trên 1080p, vd ViTPose/RTMPose): PBD
    **giảm** MPJPE, và lợi ích **tăng theo nhiễu** (3px: ~+5%; 6px: ~+11%). Nhiễu radial
    càng lớn thì tiên nghiệm cứng-xương càng đáng giá.
- Nói gọn: bước này là bộ **lọc nhiễu radial** — có ích đúng lúc dữ liệu đủ nhiễu để
  tiên nghiệm giải phẫu thắng quan sát từng khung. May mắn là đó chính là chế độ vận
  hành thực (detector 2D thật hiếm khi dưới 2–3px).

## Hệ quả cho luận văn
1. `enforce_bone_lengths` (PBD) là **bước cleanup M3 bật khi chạy detector 2D thật** ở
   Cổng 0: một cải tiến pipeline cụ thể, có test, **giảm MPJPE trong vùng nhiễu thực**.
   Ở dữ liệu cực sạch (tổng hợp không nhiễu) nên **tắt** — một siêu tham số nghiệm thu.
2. **Chọn phương pháp phải đo, không theo trực giác**: (a) trực giác "dựng lại xương
   cứng sẽ tốt hơn" (FK) **sai** — tệ hơn baseline ở mọi mức; (b) ngay cả PBD cũng chỉ
   thắng khi nhiễu vượt ngưỡng. Chỉ có bảng số này mới lộ ra hai điều đó.
3. `bone_length_std` là **metric không-cần-GT** hữu ích cho Cổng 0 (đánh giá được ngay
   trên video thật khi chưa có mocap tham chiếu), bổ trợ cho jitter và foot-slip.
4. Cứng xương cũng là **điều kiện cần cho retarget** (rig mannequin có xương cố định);
   PBD cho đầu vào cứng-xương mà vẫn bám sát quan sát — dùng lại được ở M4 dù ở chế độ
   nhiễu thấp ta ưu tiên độ chính xác vị trí hơn.
