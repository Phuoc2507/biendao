# Bền vững với outlier 2D: DLT thường vs robust (cổng tái chiếu)

*Sinh tự động bởi `experiments/robust_outliers.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Detector 2D thật thỉnh thoảng cho khớp **sai hẳn** (lỗi thô: đổi trái/phải, bắt nhầm
người, mờ do chuyển động). DLT bình phương tối thiểu bị **một** quan sát sai kéo lệch
cả điểm 3D. `triangulate_robust` dựng thử → tái chiếu → nếu view nào lệch quá ngưỡng
thì (≥3 máy) loại dần view tệ nhất, (2 máy) trả NaN để nội suy thời gian.

## Thiết lập
- Múa tổng hợp 60 khung; nhiễu nền 2px + outlier 100px rải ngẫu nhiên.
- Ngưỡng cổng tái chiếu 20px; 15 lần lặp Monte-Carlo. MPJPE toàn cục (root=None).

## A. Hai máy (−45°/+45°)
| Tỉ lệ outlier | DLT thường (mm) | Robust (mm) | Giảm | (robust) |
|---:|---:|---:|---:|:--|
| 0% | 11.3 | 11.3 | 0% | `####........................` |
| 2% | 27.1 | 15.0 | 45% | `#####.......................` |
| 5% | 48.8 | 21.3 | 56% | `#######.....................` |
| 10% | 85.2 | 32.1 | 62% | `##########..................` |

## B. Ba máy (−45°/0°/+45°)
| Tỉ lệ outlier | DLT thường (mm) | Robust (mm) | Giảm | (robust) |
|---:|---:|---:|---:|:--|
| 0% | 9.6 | 9.6 | 0% | `###.........................` |
| 2% | 25.8 | 13.6 | 47% | `####........................` |
| 5% | 49.1 | 20.1 | 59% | `######......................` |
| 10% | 86.7 | 30.1 | 65% | `##########..................` |

## Đọc kết quả (bức tranh đúng — có phần trái với trực giác)
- **Không outlier (0%)**: robust ≈ DLT thường → cổng không gây hại khi dữ liệu sạch.
- **Lợi ích LỚN NHẤT là bản thân cổng robust, ở CẢ hai cấu hình**: 2% outlier làm DLT
  thường nhảy ~27mm, robust kéo về ~15mm (giảm ~45%); 10% thì 85mm → 32mm (giảm ~62%).
- **Máy thứ 3 chỉ giúp THÊM một chút** ở đây (2%: 13.6 vs 15.0mm; 10%: 30.1 vs 32.1mm),
  **không** "gần miễn nhiễm" như trực giác leave-one-out gợi ý. Lý do: outlier được tiêm
  **độc lập** trên từng (view, khung, khớp), nên ở tỉ lệ cao, một khớp thường bị **≥2/3
  view sai cùng lúc** → leave-one-out hết đường cứu → khớp về NaN rồi nội suy (giống hệt
  trường hợp 2 máy). Máy thứ 3 chỉ thắng khi **đúng 1** view sai.
- **Khi nào máy thứ 3 mới kháng outlier mạnh?** Khi lỗi thô **tương quan theo view** —
  ví dụ một máy bị ngược sáng / bắt nhầm người trong cả một đoạn (lỗi dồn vào 1 view).
  Lúc đó 2 view còn lại luôn cứu được. Mô hình iid ở đây là **trường hợp bất lợi** cho
  máy thứ 3; thực tế occlusion-driven thường tương quan hơn nên lợi ích sẽ lớn hơn bảng này.

## Hệ quả cho luận văn
1. `fuse_multiview(robust=True)` là **cấu hình mặc định khi chạy detector 2D thật** ở
   Cổng 0 — cải tiến pipeline cụ thể, có test; lợi ích chính đến từ cổng tái chiếu, độc
   lập với số máy.
2. **Định vị lại vai trò máy thứ 3** một cách trung thực: nó kháng outlier rõ rệt chỉ khi
   lỗi tương quan theo view (occlusion, ngược sáng); dưới lỗi iid thì lợi ích khiêm tốn.
   Không thổi phồng — con số ở đây nói vậy.
3. Với **2 máy** (cấu hình chính của đề tài), robust biến "gai" thành khớp nội suy, nhưng
   không hồi phục hoàn hảo ⇒ chất lượng detector 2D + cleanup thời gian là bắt buộc.
4. Ngưỡng tái chiếu (20px) là siêu tham số nghiệm thu, hiệu chỉnh lại
   trên dữ liệu thật ở Cổng 0.
