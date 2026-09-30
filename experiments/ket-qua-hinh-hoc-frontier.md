# V56 — Phần dư FRONTIER của V55 có phân-tách bằng hình-học rig không? (confound-controlled)

*Sinh tự động bởi `experiments/hinh_hoc_frontier.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V55 kết luận phần envelope ĐẾM không đoán được (FRONTIER `k_joint≥2`) là **phụ-thuộc-hình-học** và gợi
lối ra "thêm chiều hình-học". V56 kiểm định TRỰC TIẾP: có một scalar hình-học của rig tách được
assignment PASS khỏi FAIL trong FRONTIER — sau khi ĐÃ khử confound đếm — không?

Quét 392 mẫu-assignment trên FRONTIER (V∈[4, 5, 6, 7], k_joint≥2), mỗi mẫu 4 trial; 57 pass /
335 fail; 13 ô-count `(V,k_cam,k_joint)` có CẢ pass&fail (ô "split").

## Kết quả cốt lõi: tính-đoán-được hình-học POOLED là ẢO ẢNH CONFOUND ĐẾM (nghịch lý Simpson)

| Scalar hình-học | AUC **pooled** (lẫn count) | AUC **conditional** (trong-ô) | dải conditional |
|---|---|---|---|
| `trai_view_sach` | 0.818 | 0.227 | 0.06–0.44 |
| `khe_view_sach` | 0.680 | 0.317 | 0.06–0.57 |
| `cach_ly_bias` | 0.379 | 0.540 | 0.33–0.75 |
| `don_bay_min_bias` | 0.716 | 0.636 | 0.20–1.00 |
| `don_bay_mean_bias` | 0.614 | 0.678 | 0.30–1.00 |

- **nclean = V−k_cam−k_joint**: pooled AUC **0.929** — mạnh nhất. NHƯNG `nclean` HẰNG SỐ
  trong mỗi ô-count ⇒ AUC conditional **không xác định** (0 sức phân-tách trong-ô). Đây chính là bằng
  chứng: nclean là ĐẾM thuần, không phải hình-học.
- **`trai_view_sach` (độ trải góc view sạch)**: pooled **0.818** (trông rất
  đoán-được!) nhưng conditional **0.227** — ĐẢO NGƯỢC, dưới 0.5. Cùng MỘT
  scalar: gộp-ô thì "tiên đoán mạnh", khử-confound thì PHẢN-tiên-đoán. Kinh điển Simpson: tín hiệu
  pooled hoàn toàn do nó tương-quan với nclean (view sạch trải rộng ⇔ nhiều view sạch).
- Mọi scalar góc còn lại conditional đều rơi về quanh 0.5 (min–max rộng, thiếu nhất-quán).

## Cơ chế V49 có đúng hướng nhưng KHÔNG đủ mạnh làm tiêu chí
Kỳ vọng nối V49: view bias ở RÌA (đòn bẩy lớn) lộ mạnh ở held-out → dễ bắt; nên "đòn bẩy view-bias
yếu nhất" (`don_bay_min_bias`, weakest-link) dự đoán PASS. Đo: conditional AUC
**0.636** (dải 0.20–1.00).
Đúng HƯỚNG (>0.5, có ô đạt 1.00) và cơ chế nhất quán với V49, nhưng
TRUNG BÌNH quá yếu và quá biến-động giữa ô để thành ngưỡng thực dụng. Cơ chế nguyên-lý có thật, nhưng
một scalar không nắm đủ.

## Kết luận (trung thực, củng cố V55)
1. **Tính-đoán-được hình-học của FRONTIER khi phân-tích POOLED là ảo ảnh confound đếm.** Phải điều-kiện-
   -hoá theo ô-count mới thấy sự thật. Đây là bài học phương pháp: mọi khẳng định "hình-học đoán được
   split" phải khử confound nclean trước.
2. **Không scalar đơn nào sống sót điều-kiện-hoá** (tốt nhất `trai_view_sach` chỉ ≈0.77 sau khi lật
   hướng nếu cần, và vẫn thiếu nhất-quán). ⇒ phần dư FRONTIER KHÔNG rút gọn về một tiêu-chí-rig-một-số.
3. **Điều này CỦNG CỐ, không mâu thuẫn, V55:** V55 nói residual "phụ-thuộc-hình-học"; V56 đo chính xác
   là phụ-thuộc-hình-học ĐA-YẾU-TỐ, không một-chiều. Lối ra thực dụng duy nhất trong FRONTIER là CHẠY
   bộ ước-lượng (combo thật) chứ không đoán bằng công thức — hoặc rời FRONTIER bằng cách thêm view/nhãn
   (đúng khuyến nghị thiết-kế-rig V54: chừa đủ view sạch để nằm ngoài FRONTIER ngay từ đầu).

## Giới hạn
- Hình học tổng hợp, bias 60px hướng SAME; 4 trial/assignment, tối đa 10
  assignment/ô (per-ô ít mẫu → AUC-trong-ô nhiễu; nhưng headline Simpson 0.82
  →0.23 quá lớn để là nhiễu). Chỉ scalar 1-chiều; mô hình đa-biến trên
  13 ô sẽ overfit nên KHÔNG làm (tránh khẳng định thiếu cơ sở).
- Số thật chờ Gate-0 (GPU lab). V56 là kết quả CẤU TRÚC: cách phần dư hình-học hành xử, không phải số
  tuyệt đối trên múa thật.
