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

## D. Độ phủ khớp khi CÓ che khuất (thân người che, cần ≥2 máy thấy mỗi khớp)
| Bố trí máy | Độ phủ khớp (%) | MPJPE khớp khôi phục (mm) | (độ phủ) |
|:--|---:|---:|:--|
| 2 máy cùng phía (lệch 20°) | 96.7 | 27.6 | `###########################.` |
| 2 máy lệch 60° | 92.5 | 12.6 | `##########################..` |
| 2 máy lệch 90° | 90.7 | 11.3 | `#########################...` |
| 2 máy lệch 120° | 89.4 | 12.3 | `#########################...` |
| 2 máy trước+sau (180°) | 84.0 | 239.7 | `########################....` |
| 3 máy phủ 180° | 98.5 | 9.7 | `############################` |

**Đọc kết quả — một sự ĐÁNH ĐỔI (đây mới là bức tranh đúng):** che khuất buộc mỗi
khớp phải được **≥2 máy CÙNG nhìn thấy** mới tam giác hoá được, nên hai chỉ số kéo
ngược nhau:
- **Độ phủ** thích hai máy **gần nhau** (tầm nhìn trùng, dư thừa) → 96.7% ở lệch 20°.
- **Độ chính xác** (giao hội) thích hai máy **lệch rộng** → nhưng lệch 20° cho MPJPE
  tận 27.6mm (giao hội kém), trong khi lệch 90° chỉ 11.3mm.
- **Lệch 60–90° là điểm dung hoà**: độ phủ vẫn ~90% mà MPJPE gần tốt nhất.
- **180° (trước+sau) tệ KÉP**: hai tia gần thẳng hàng → tam giác hoá THOÁI HOÁ
  (MPJPE ~240mm) và ít khớp cùng thấy → cấu hình cần tránh (khớp với khuyến nghị
  "không đặt hai máy đối đầu 180°").
- **Máy thứ 3 gỡ mâu thuẫn**: phủ 180° đạt 98.5% + 9.7mm vì mỗi khớp chỉ cần ≥2
  trong 3 máy thấy. Đây là lý do THỰC để cân nhắc máy thứ 3 — **bù che khuất khi
  xoay người**, khác với mục B (máy thứ 3 ở đó chỉ giảm nhẹ nhiễu).

## Kết luận cho luận văn
1. **Hình học ủng hộ 2-cam**: đặt 2 máy lệch 60–90° đạt MPJPE tốt gần tối ưu; baseline
   nhỏ là nguyên nhân chính gây sai số — khớp với số liệu tài liệu (1-cam ~64mm → 2-cam ~36mm).
2. **2 máy là điểm cân bằng chi phí/độ chính xác**: bão hoà nhanh sau đó (mục B).
3. **Che khuất tạo đánh đổi phủ↔chính xác** (mục D): độ phủ thích máy gần, độ chính
   xác thích máy lệch rộng; ~60–90° là dung hoà. Cần tránh 180° (thoái hoá kép). Máy
   thứ 3 chủ yếu mua thêm ĐỘ PHỦ khi xoay người, không phải giảm nhiễu.
4. **Nút thắt còn lại là detector 2D**: sai số ~tuyến tính theo nhiễu pixel (mục C).
5. Thí nghiệm này **tái lập được, thuần CPU** — dùng làm chương phương pháp/hiệu chỉnh
   trước khi có video múa thật + GPU lab (Gate 0).
