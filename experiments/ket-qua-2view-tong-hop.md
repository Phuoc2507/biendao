# Kết quả thực nghiệm tổng hợp: độ chính xác tam giác hoá 2-view

*Sinh tự động bởi `experiments/synthetic_2view.py` — thuần numpy, chạy CPU.*

## Thiết lập
- Chuyển động **ground-truth**: đoạn múa tổng hợp 120 khung (4s @ 30fps),
  17 khớp (layout schema), có nhún gối + vung tay + xoay thân ±40°.
- Camera ảo pinhole: khoảng cách 4.5m, độ cao 8°, FOV 50°, ảnh 1920×1080.
- Quy trình: chiếu 3D→2D → cộng nhiễu Gaussian pixel → tam giác hoá DLT → MPJPE.
- Mỗi cấu hình lặp 30 lần Monte-Carlo, lấy trung bình theo cả thời gian.
- **MPJPE toàn cục**: sai số tuyệt đối trong hệ sân khấu (đặt người đúng chỗ trong phòng).
  **MPJPE root-relative**: căn gốc pelvis (chỉ đo sai số DÁNG, so được với tài liệu Human3.6M).

> Đây là **giới hạn trên do hình học** quyết định: giả định 2D đã ghép đúng khớp,
> chỉ còn nhiễu pixel. Sai số thật khi chạy mạng 2D sẽ cao hơn, nhưng bảng này
> cô lập và định lượng phần đóng góp của HÌNH HỌC ĐẶT MÁY.

## A. MPJPE theo góc lệch giữa 2 camera (nhiễu 2px)
| Góc lệch 2 máy | Góc giao hội TB | MPJPE toàn cục (mm) | MPJPE root-rel (mm) | (root-rel) |
|---:|---:|---:|---:|:--|
| 15° | 15° | 35.8 | 47.4 | `############################` |
| 30° | 30° | 19.6 | 26.0 | `###############.............` |
| 45° | 44° | 14.7 | 19.5 | `############................` |
| 60° | 59° | 12.6 | 16.7 | `##########..................` |
| 75° | 74° | 11.6 | 15.4 | `#########...................` |
| 90° | 89° | 11.3 | 14.9 | `#########...................` |
| 105° | 103° | 11.4 | 15.2 | `#########...................` |
| 120° | 118° | 12.2 | 16.2 | `##########..................` |
| 150° | 145° | 17.5 | 23.1 | `##############..............` |
| 170° | 160° | 34.3 | 42.1 | `#########################...` |

**Đọc kết quả:** góc lệch quá nhỏ (2 máy gần nhau, baseline ngắn) → góc giao hội
nhỏ → độ sâu ước lượng bất định → MPJPE nổ to. Sai số nhỏ nhất ở **90°**
(góc giao hội ~89°). So với cấu hình lệch 15° (gần như 1 hướng),
đặt máy đúng góc giảm MPJPE root-rel **~68%**. Vùng tốt nằm ở khoảng
**60–90°** — đúng khuyến nghị đặt máy trong luận văn, và tránh 150–170° (hai máy
gần đối đầu, dễ hỏng ghép 2D trên thực tế dù hình học vẫn ổn).

## B. MPJPE theo số camera (phủ đều cung 100°, nhiễu 2px)
| Số máy | MPJPE toàn cục (mm) | MPJPE root-rel (mm) | (root-rel) |
|---:|---:|---:|:--|
| 2 | 11.3 | 15.0 | `############################` |
| 3 | 9.4 | 12.5 | `#######################.....` |
| 4 | 8.3 | 11.1 | `#####################.......` |
| 5 | 7.6 | 10.1 | `###################.........` |

**Đọc kết quả:** thêm máy có giúp, nhưng **lợi ích bão hoà nhanh** — bước nhảy lớn
nhất là từ cấu hình 2 máy tốt trở đi đã đủ; 4–5 máy cải thiện biên. Củng cố quyết
định **đúng 2 điện thoại** cho người dùng phổ thông (dựng nhanh, rẻ), thay vì rig
nhiều máy như MAMMA (4 iPhone) hay DanceNet3D (29 cam).

## C. MPJPE theo mức nhiễu 2D (2 máy lệch 75°)
| Nhiễu 2D (px) | MPJPE toàn cục (mm) | MPJPE root-rel (mm) | (root-rel) |
|---:|---:|---:|:--|
| 0.5 | 2.9 | 3.8 | `##..........................` |
| 1.0 | 5.8 | 7.7 | `###.........................` |
| 2.0 | 11.6 | 15.4 | `#######.....................` |
| 4.0 | 23.2 | 30.7 | `##############..............` |
| 8.0 | 46.3 | 61.5 | `############################` |

**Đọc kết quả:** MPJPE tăng **xấp xỉ tuyến tính** theo nhiễu pixel → chất lượng
cuối phụ thuộc trực tiếp vào độ chính xác detector 2D (ViTPose/RTMPose). Đây là
lý do phần cleanup (làm mượt, foot-lock) và detector tốt là bắt buộc.

## Kết luận cho luận văn
1. **Hình học ủng hộ 2-cam**: đặt 2 máy lệch 60–90° đạt MPJPE tốt gần tối ưu; baseline
   nhỏ là nguyên nhân chính gây sai số — khớp với số liệu tài liệu (1-cam ~64mm → 2-cam ~36mm).
2. **2 máy là điểm cân bằng chi phí/độ chính xác**: bão hoà nhanh sau đó.
3. **Nút thắt còn lại là detector 2D**: sai số ~tuyến tính theo nhiễu pixel.
4. Thí nghiệm này **tái lập được, thuần CPU** — dùng làm chương phương pháp/hiệu chỉnh
   trước khi có video múa thật + GPU lab (Gate 0).
