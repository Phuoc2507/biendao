# V49 — Tầng đa-view tách "detector lệch hệ thống" khỏi "múa sai thật"

*Sinh tự động bởi `experiments/phan_biet_lech_he_thong.py` — thuần numpy, chạy CPU.*

## Vì sao đo cái này (đóng đúng giới hạn V48)
V48 ([nhiễu có cấu trúc](ket-qua-nhieu-cau-truc.md)) tìm ra **điểm mù duy nhất** của tầng đánh
giá: lỗi detector **hệ thống một người** (một khớp bị đặt lệch nhất quán) ở tầng toạ-độ-3D
**bất khả phân** với người đó múa sai — cả hai cho **cùng một độ lệch 3D** so với tham chiếu, nên
không núm nào của `sync.ts` tách được. V48 mới **chỉ ra bằng lập luận** rằng tầng perception
đa-view (V13, tái chiếu camera held-out) tách được. **V49 chạy để định lượng.**

## Ý tưởng vật lý
Xét một khớp (cổ tay trái). Dựng 3D từ **3 camera**, **giữ lại 1 camera** làm giám khảo sạch.
- **THẬT**: vũ công dời khớp d (m) trong 3D → **mọi** camera thấy nhất quán → 3D-dựng ≈ vị trí
  mới → chiếu lên máy giữ lại **khớp** quan sát ⇒ tái chiếu **THẤP**. Độ lệch 3D d là thật và
  **nhất quán vật lý** giữa các góc.
- **BIAS**: vũ công múa **đúng** (3D thật = gốc) nhưng **một** view dựng đặt khớp lệch b px →
  tam giác hoá kéo 3D khỏi gốc một đoạn d_bias (**tầng đánh giá thấy cùng độ lệch 3D**) → nhưng
  máy giữ lại quan sát khớp ở **vị trí gốc đúng** → chiếu 3D-hỏng lên đó **lệch hẳn** ⇒ tái chiếu
  **CAO**. Độ lệch 3D là **giả tạo một-view**, không nhất quán giữa các góc.

## Thiết lập
- Một vũ công, múa tổng hợp 45 khung; 4 máy (-60°/-20°/+20°/+60°);
  dựng từ **3 máy -60°/+20°/+60°**, **giữ lại -20°**.
  Bias đặt ở view dựng **-60°**.
- Khảo sát **một khớp** (cổ tay trái). Sàn nhiễu Gaussian 2px mọi view; 16
  hạt/mức, lấy trung bình. Tái chiếu đo **per-khớp** (không pha loãng 17 khớp — xem ghi chú V48).
- Quét: THẬT dời 3D {2, 4, 6, 10, 14, 20} cm; BIAS lệch
  {5, 10, 20, 30, 45, 60, 80} px trên một view.

## Kết quả (số đo được)

### THẬT — dời 3D thật: độ lệch 3D lớn nhưng tái chiếu held-out THẤP
| d dời (cm) | dev3d khớp (cm) | Reproj held-out (px) | |
|---:|---:|---:|:--|
| 2 | 2.11 | 2.80 | `#####.......................` |
| 4 | 3.99 | 2.79 | `#####.......................` |
| 6 | 6.02 | 2.78 | `#####.......................` |
| 10 | 10.02 | 2.76 | `#####.......................` |
| 14 | 14.01 | 2.71 | `#####.......................` |
| 20 | 20.02 | 2.72 | `#####.......................` |

Dời 3D thật tới 20cm mà tái chiếu held-out vẫn chỉ ~3px
(cỡ sàn nhiễu 2px): mọi camera **đồng thuận** vị trí mới nên giám khảo sạch **xác nhận**.

### BIAS — lệch pixel một view: cùng độ lệch 3D nhưng tái chiếu held-out VỌT
| b bias (px) | dev3d khớp (cm) | Reproj held-out (px) | |
|---:|---:|---:|:--|
| 5 | 1.83 | 4.26 | `#######.....................` |
| 10 | 3.66 | 7.55 | `#############...............` |
| 20 | 7.15 | 14.34 | `########################....` |
| 30 | 10.65 | 21.29 | `############################` |
| 45 | 16.05 | 31.55 | `############################` |
| 60 | 21.41 | 41.87 | `############################` |
| 80 | 28.62 | 55.60 | `############################` |

Bias một-view đẩy dev3d lên (tầng đánh giá **tưởng** khớp sai) trong khi tái chiếu held-out
**vọt cao** — giám khảo sạch quan sát khớp ở gốc đúng nên **tố** ngay 3D-dựng sai.

### Đối chiếu Ở CÙNG độ lệch 3D — chỗ tầng đánh giá mù, tầng đa-view sáng
| dev3d khớp (cm) | Reproj THẬT (px) | Reproj BIAS (px) | Tỉ số |
|---:|---:|---:|---:|
| 3 | 2.79 | 6.37 | **2.3×** |
| 5 | 2.79 | 10.16 | **3.6×** |
| 8 | 2.77 | 16.02 | **5.8×** |
| 12 | 2.74 | 23.84 | **8.7×** |

**Đây là luận điểm chính.** Tầng đánh giá chỉ thấy cột "dev3d" — với nó THẬT và BIAS **y hệt**.
Tầng đa-view thấy cột tái chiếu: ở cùng dev3d, BIAS cao hơn THẬT **2–9×**.

## Cổng tin cậy: ngưỡng tách và tỉ lệ bắt
- Lấy **τ = trần tái chiếu của toàn họ THẬT = 2.80px** (mọi ca THẬT lọt dưới theo định nghĩa).
- Trong họ BIAS, các ca có **dev3d ≥ 2cm** (đủ để tầng đánh giá **nêu**): **100%**
  (6/6) vượt τ ⇒ bị cổng đa-view **chặn đúng**.
- ⇒ Đặt cổng tái chiếu held-out **trước** phán quyết đánh giá: giữ mọi sai động tác THẬT (tái
  chiếu thấp) và **gỡ oan** cho người bị detector lệch hệ thống (tái chiếu cao). Điểm mù V48
  được **một tầng đã có sẵn** khép lại — bằng **số đo**, không phải lập luận.

## Vì sao phải ≥3 máy (nối tiếp danh_gia_khong_gt)
Cổng này cần **một camera giữ lại độc lập, sạch** làm giám khảo. Giải pháp 1-camera (Choreoto)
**không có** chiều dữ liệu này: nó không thể phân biệt "detector đặt khớp lệch" với "vũ công múa
sai", vì chỉ có một góc nhìn. Đây là lý do kỹ thuật thứ hai (ngoài dựng 3D chính xác) để hệ 2–3
máy tồn tại, và là mắt xích khép **điểm mù đánh giá ↔ giải pháp perception** thành một vòng.

## Giới hạn (trung thực)
- Đo trên **một khớp, một hướng dời, bias tĩnh** — đúng lát cắt V48 mô hình hoá. Bias thật đa
  dạng hơn (xoay/co giãn theo độ sâu, phụ thuộc tư thế); cơ chế (nhất quán-vật-lý giữa view) tổng
  quát nhưng **con số τ, tỉ số riêng cho cấu hình này**.
- Vẫn là **hình học tổng hợp** (chưa video thật). Bước Cổng 0 còn lại: chạy chính cổng này trên
  keypoint detector thật (RTMPose/ViTPose) 2–3 máy — cần GPU lab. V49 chứng minh **cơ chế tách
  đứng vững** và định lượng nó, đủ để đưa cổng vào giao thức Cổng 0.
