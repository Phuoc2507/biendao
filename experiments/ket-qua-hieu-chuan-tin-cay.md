# Hiệu chuẩn confidence → phương sai (đóng nốt Vòng 10)

*Sinh tự động bởi `experiments/hieu_chuan_tin_cay.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Vòng 10 kết luận trọng số **nghịch-phương-sai** 1/σ² là cách đúng dùng confidence, với điều
kiện σ là **phương sai thật**. Nhưng confidence sống của detector 2D là một điểm số **đơn
điệu nhưng méo** theo độ tin cậy thật — không tỉ lệ với 1/σ. Nếu nhét thẳng confidence sống
vào làm trọng số, lợi ích thu được tới đâu? Và **hiệu chuẩn** confidence→σ lấy lại được bao
nhiêu so với trọng số oracle (biết σ thật)? Điểm mấu chốt: hiệu chuẩn ở đây dùng **sai số tái
chiếu** làm proxy nhiễu — **đo được KHÔNG cần 3D ground-truth** → chạy được trên video thật.

## Thiết lập
- Múa tổng hợp 60 khung, 3 máy (-45°/+0°/+45°), cách 4.5 m.
- reliability thật rel∈[0,1]; nhiễu 2D std σ = 2 + (1−rel)·12 px.
- Confidence detector = rel^γ (**đơn điệu nhưng méo**): γ=1 ít méo, γ lớn rất méo.
- Hiệu chuẩn học trên 4 clip validation riêng, chỉ từ (confidence, **sai số tái chiếu**);
  KHÔNG dùng 3D GT. 30 lần lặp test. MPJPE toàn cục (root=None).

## Kết quả
| Độ méo confidence (γ) | Không trọng số | Confidence sống (w=conf) | Hiệu chuẩn 1/σ (không GT) | Oracle 1/σ_thật | % lợi lấy lại* |
|---:|---:|---:|---:|---:|:--|
| 1.0 | 24.44 | 23.68 | 22.00 | 21.57 | 85% |
| 2.0 | 24.44 | 25.18 | 22.00 | 21.57 | 85% |
| 3.5 | 24.44 | 25.57 | 22.00 | 21.57 | 85% |

*(% lợi lấy lại = (không_trọng_số − hiệu_chuẩn) / (không_trọng_số − oracle): hiệu chuẩn thu
được bao nhiêu phần lợi ích tối đa mà oracle đạt.)*

## Đọc kết quả
- **Confidence sống (w=conf) yếu và xấu dần khi méo tăng**: γ=1 còn tạm, nhưng γ lớn thì dùng
  thẳng confidence gần như vô ích — vì nó không còn tỉ lệ với độ tin cậy, chứ đừng nói 1/σ.
- **Hiệu chuẩn lấy lại phần lớn lợi ích của oracle** ở mọi mức méo, mà **không cần 3D GT**:
  bản đồ conf→σ học từ sai số tái chiếu "nắn thẳng" lại thang méo của detector.
- Đây chính là mảnh còn thiếu Vòng 10 đã chỉ ra: *"phải hiệu chuẩn confidence→phương sai trên
  tập validation rồi mới lấy trọng số nghịch-phương-sai"* — nay đã hiện thực + đo được.

## Hệ quả cho luận văn
1. `conf_calib.calibrate_confidence` + `per_view_reproj_residual` là **quy trình hiệu chuẩn
   GT-free**: ở Cổng 0, chạy detector thật trên vài clip, đo sai số tái chiếu, học conf→σ, rồi
   nạp trọng số đã hiệu chuẩn vào `fuse_multiview`. Không cần hệ mocap tham chiếu để hiệu chuẩn.
2. Bội số hàng DLT đúng cho Gauss–Markov là **1/σ** (không 1/σ²), vì DLT nhân hàng rồi bình
   phương trong SVD — `ConfCalibration.weight_of` trả 1/σ. (Một tinh chỉnh so với cách đặt
   trọng số thô ở Vòng 10.)
3. "Hiệu chuẩn độ tin cậy của tri giác" là một đóng góp **đo được ở tầng perception/đánh giá**
   — đúng loại novelty luận văn nhắm tới, và tái lập được hoàn toàn trên CPU.
