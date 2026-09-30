# Độ nhạy tam giác hoá 2-view với sai số đồng bộ & hiệu chỉnh

*Sinh tự động bởi `experiments/do_nhay_sync_calib.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này
Quay bằng 2 điện thoại tiêu dùng có hai nguồn sai số mà camera đơn không gặp:
1. **Không genlock** → hai máy lệch thời gian (thường < 1 khung hình).
2. **Hiệu chỉnh không hoàn hảo** → sai hướng ngắm / vị trí máy khi dựng ma trận chiếu.

Bảng dưới định lượng "được phép sai tới đâu" để đặt ngưỡng cho khâu đồng bộ (vỗ tay
+ 60fps) và hiệu chỉnh (ChArUco) ở §5.2/§5.3. Cấu hình: cặp máy lệch 90°
(-45/45°) — cấu hình khuyến nghị; MPJPE toàn cục (root=None).

## A. Sai số ĐỒNG BỘ (máy B trễ so với máy A)
| Lệch sync (ms) | (khung @240fps) | MPJPE (mm) | |
|---:|---:|---:|:--|
| 0.0 | 0 | 11.3 | `####################........` |
| 4.2 | 1 | 11.4 | `####################........` |
| 8.3 | 2 | 11.7 | `#####################.......` |
| 12.5 | 3 | 12.1 | `#####################.......` |
| 16.7 | 4 | 12.7 | `######################......` |
| 20.8 | 5 | 13.4 | `########################....` |
| 25.0 | 6 | 14.2 | `#########################...` |
| 29.2 | 7 | 15.0 | `##########################..` |
| 33.3 | 8 | 15.9 | `############################` |

**Đọc kết quả:** đồng bộ hoàn hảo cho MPJPE nền **11.3mm**. Lệch **nửa khung
@30fps** (~16.7ms) đã đẩy MPJPE lên **12.7mm**, lệch **trọn 1 khung**
(~33ms) lên **15.9mm**. Lưu ý: múa thật (nhất là footwork/vung tay
nhanh) di chuyển nhanh hơn đoạn tổng hợp này, nên cùng một độ lệch thời gian sẽ gây
sai số LỚN HƠN — bảng này là **cận dưới**. Kết luận: đồng bộ phải đạt **dưới ~nửa khung**.
Hệ quả trực tiếp: (1) quay **60fps** thay vì 30fps — mỗi khung chỉ 16.7ms nên cùng
một sai lệch tuyệt đối tính theo khung sẽ nhỏ hơn một nửa; (2) căn mốc **vỗ tay**
đầu clip để triệt tiêu độ trễ khởi động giữa hai máy về mức dưới-khung.

## B. Sai số HƯỚNG NGẮM hiệu chỉnh (xoay máy B)
| Sai số hướng ngắm (°) | MPJPE (mm) | |
|---:|---:|:--|
| 0.00 | 11.3 | `###.........................` |
| 0.10 | 12.2 | `####........................` |
| 0.25 | 16.2 | `#####.......................` |
| 0.50 | 26.0 | `########....................` |
| 1.00 | 48.3 | `##############..............` |
| 2.00 | 94.8 | `############################` |

**Đọc kết quả:** MPJPE **rất nhạy** với sai hướng — chỉ **1°** lệch hướng ngắm đã
làm sai số tăng mạnh (đòn bẩy góc ở khoảng cách 4m: 1° ≈ 79mm
dịch ở tâm sân khấu). ⇒ Hiệu chỉnh ngoại phải chính xác **dưới ~0.5°**; đây là lý do
dùng bảng **ChArUco** (nhiều điểm góc, ước lượng tư thế ổn định) thay vì căn tay.

## C. Sai số VỊ TRÍ máy hiệu chỉnh (dời tâm máy B)
| Sai số vị trí máy (cm) | MPJPE (mm) | |
|---:|---:|:--|
| 0.0 | 11.3 | `############................` |
| 0.5 | 11.6 | `############................` |
| 1.0 | 12.3 | `#############...............` |
| 2.0 | 15.0 | `################............` |
| 5.0 | 26.6 | `############################` |

**Đọc kết quả:** sai vị trí máy dịch gần như **1:1** vào sai số 3D (dời máy 1cm →
MPJPE tăng ~1cm). May là vị trí máy dễ đo chính xác hơn hướng (ChArUco + đo tay đạt
mm–cm), nên đây là nguồn lỗi phụ so với hướng ngắm.

## Kết luận cho luận văn (ngưỡng thiết kế Cổng 0)
1. **Đồng bộ < nửa khung** (⇒ quay 60fps + vỗ tay). Sai 1 khung @30fps ~16mm là không chấp nhận được.
2. **Hiệu chỉnh hướng < ~0.5°** (⇒ ChArUco bắt buộc; sai 1° đã hỏng).
3. **Vị trí máy < ~1–2cm** (lỗi tuyến tính, dễ kiểm soát hơn).
4. Ba ngưỡng này là **tiêu chí nghiệm thu khâu M1/M2** trước khi tin số MPJPE ở Cổng 0 —
   một đóng góp phương pháp mà giải pháp 1-camera không phải đối mặt.
