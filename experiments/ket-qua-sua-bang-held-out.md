# V51 — SỬA hỏng 3D bằng chẩn đoán held-out (LOVO): đóng đúng KHE robust để hở

*Sinh tự động bởi `experiments/sua_bang_held_out.py` — thuần numpy, chạy CPU.*

## Khép vòng V49 → V50 → V51
- **V49**: tái chiếu held-out **chẩn đoán** view lệch hệ thống (reproj vọt) ≠ múa-sai thật (reproj phẳng).
- **V50**: cổng **robust** quyết định ở granularity **per-khung-per-điểm**, gộp mọi view vào phép khớp
  đầu ⇒ (i) **câm** khi bias chưa vượt ngưỡng 20px; (ii) ở cấu hình **3 view dựng**, bias lớn làm nó
  loại NHẦM view sạch rồi rơi xuống sàn-2-view → **khuếch đại hỏng**. Gốc rễ: nó không cộng dồn bằng
  chứng theo TỪNG CAMERA, mà bias hệ thống là thuộc tính của CAMERA.
- **V51 (vòng này)**: biến tín hiệu held-out V49 thành **bộ chọn view loại-từng-view (LOVO)** ở đúng
  granularity CAMERA: với mỗi view `v`, dựng 3D từ **các view còn lại** (v không tham gia), tái chiếu
  về `v`, **gộp sai số trung bình theo CẢ clip**. Camera bias khi bị bỏ ra bị chấm bởi đồng thuận các
  view sạch ⇒ điểm CAO nhất. Loại nó, dựng lại từ phần còn lại.

## Kết quả (số đo được — 4 view ứng viên, đa số sạch)
| bias (px) | plain (cm) | robust (cm) | **LOVO (cm)** | oracle (cm) | LOVO nêu đúng | dev3d plain |
|---:|---:|---:|---:|---:|---:|:--|
| 0 | 0.53 | 0.53 | **0.71** | 0.60 | 0% | `#...........................` |
| 5 | 1.33 | 1.33 | **1.40** | 0.60 | 50% | `##..........................` |
| 10 | 2.55 | 2.55 | **0.65** | 0.65 | 100% | `####........................` |
| 20 | 4.97 | 4.97 | **0.63** | 0.63 | 100% | `#######.....................` |
| 30 | 7.43 | 6.32 | **0.64** | 0.64 | 100% | `##########..................` |
| 45 | 11.20 | 0.61 | **0.61** | 0.61 | 100% | `################............` |
| 60 | 15.01 | 0.62 | **0.62** | 0.62 | 100% | `#####################.......` |
| 80 | 20.17 | 0.62 | **0.62** | 0.62 | 100% | `############################` |

*oracle = loại đúng view bias (biết trước) = chặn trên khả dĩ. LOVO không biết trước, phải tự tìm.*

## Đọc kết quả — có CHỖ khác dự đoán, ghi lại trung thực
Với **4 view** (đa số sạch 3/4), bức tranh robust KHÁC V50 (3 view) và tôi ghi đúng như đo được:
- **robust CÂM** ở dải bias vừa (tới b=20px): robust ≡ plain (chưa view nào vượt 20px),
  3D vẫn hỏng theo bias.
- **robust PHỤC HỒI** từ b≈45.0px: khác V50, ở đây **không** khuếch đại — vì còn **3 view sạch**
  làm đa số nên khi loại được view bias, nghiệm về gần oracle. ⇒ Chính V51 **trả lời câu V50 để ngỏ**
  ("chưa quét số-view"): hành vi tai hại của robust ở V50 là hệ quả của **thiếu đa số sạch** (3 view,
  rơi sàn-2-view); thêm view sạch thì robust hết hại **nhưng vẫn câm ở dải vừa**.

**Khe robust để hở = dải bias VỪA** (b∈{10, 20}px): đủ lớn để hỏng 3D (plain tới 2.6cm ở
b=10px) NHƯNG chưa vượt ngưỡng per-khung của robust ⇒ robust bất động. **LOVO đóng đúng khe này**:
ở b=10px kéo dev3d 2.6→**0.65cm** (= oracle). Vì LOVO cộng dồn bằng chứng
per-CAMERA qua cả clip, nó thấy bias hệ thống **dưới mọi ngưỡng per-khung**.

- **Nêu đúng thủ phạm**: LOVO đạt ≥90% từ b≈10.0px, **100%** ở bias lớn.
- **Bám oracle ở bias lớn**: b=80px lệch LOVO−oracle chỉ +0.00cm (robust +0.00cm).
- **GIÁ trung thực**: ở **b=0** (không camera lỗi) LOVO vẫn bỏ 1 view nên dev3d **+0.18cm** so
  plain-4-view. Đánh đổi thật ⇒ LOVO chỉ nên bật KHI chẩn đoán held-out (V49) đã BÁO có view nghi vấn,
  không loại vô điều kiện.

## Luận điểm kiến trúc
Ba vòng khép một vòng lặp hoàn chỉnh ở **tầng dựng**: **chẩn đoán** (V49) → **vì sao lọc cùng-chiều
hở/hại** (V50) → **sửa bằng đúng granularity nguồn** (V51). Mấu chốt lặp lại toàn đề tài: lỗi
HỆ-THỐNG/DAI-DẲNG của MỘT nguồn chỉ trị được bằng **cộng dồn bằng chứng ở đúng granularity nguồn**
(ở đây per-CAMERA, qua held-out), **không** bằng lọc mạnh hơn ở granularity sai (per-khung như robust,
để hở khe bias-vừa dưới ngưỡng). Cùng nguyên lý với tầng đánh giá: gộp theo nhịp (V32) và thước
tuyệt-đối-có-nhãn (V42) thắng chấm nhóm-tương-đối-per-khung (V41). LOVO là hiện thân nguyên lý đó ở
tầng hình học.

## Giới hạn (trung thực)
- LOVO cần **≥3 view ứng viên** (bỏ 1 còn ≥2 để dựng), và lợi thế "hết hại" cần **đa số sạch**. Cấu
  hình **2-máy KHÔNG dùng được** — ở đó phải dựa thước khác (temporal, ràng buộc xương). Đề tài chủ đạo
  2-máy ⇒ LOVO là lá chắn cho cấu hình **≥3 máy** (studio/nhiều điện thoại), không thay phòng thủ 2-máy.
- Mới thử **1 camera bias/lần**. Hai camera cùng bias cùng hướng có thể qua mặt đồng thuận — chưa đo.
- Onset b≈10.0px, khe robust-hở, giá b=0 **riêng cấu hình này** (góc, khoảng cách, khớp). Cơ chế
  (robust câm dưới ngưỡng + cần đa số sạch; LOVO cộng dồn per-camera) tổng quát; con số thì không.
- Vẫn hình học tổng hợp; số trên detector thật chờ Gate-0 (GPU lab).
