# V55 — Kiểm định envelope V54 như một LUẬT DỰ ĐOÁN (Monte-Carlo, gồm confound)

*Sinh tự động bởi `experiments/kiem_dinh_envelope.py` — thuần numpy, chạy CPU.*

## Vì sao round này
V54 đề xuất envelope đếm-được và xác nhận trên 6 kịch bản tay-chọn. TRƯỚC KHI đưa nó vào luận văn như
một khẳng định, phải STRESS-TEST trên toàn không gian cấu hình — gồm cái V52–V54 đều GHI là chưa quét:
**confound "view NÀO bị bias"**. V55 quét 76 cấu hình `(V,k_cam,k_joint)` với V∈[4, 5, 6, 7], mỗi cấu
hình tối đa 4 cách gán-view ngẫu nhiên (hạt giống cố định), 5 trial/gán. Kết quả: envelope
đếm-được KHÔNG chính xác — và các chỗ lệch đều CÓ LÝ DO, chỉ ra hình-học-view là yếu tố bậc hai thật.

## Kết quả (số đo được)

### (1) Envelope V54 dự đoán đúng 62/76 = **81.6%** cấu hình
Không phải luật chính xác. Hai chiều lệch:
- **Lớp A — envelope QUÁ NGẶT (8 cấu hình, đều k_joint=0):** chỉ có bias whole-camera, LOVO
  KHÔNG có việc; anchor-đơn gỡ hết, chỉ cần `V−k_cam≥2` để tam giác hoá. Điều kiện `V−k_cam≥4` của V54
  thừa ở đây → envelope đoán FAIL nhưng THỰC TẾ success. Ví dụ: (V4,kc1,kj0)→['T', 'T', 'T', 'T']; (V4,kc2,kj0)→['T', 'T', 'T', 'T']; (V5,kc2,kj0)→['T', 'T', 'T', 'T']; (V5,kc3,kj0)→['T', 'T', 'T', 'T']; (V6,kc3,kj0)→['T', 'T', 'T', 'T']; (V6,kc4,kj0)→['T', 'T', 'T', 'T'].
- **Lớp B/C — envelope LỎNG (6 cấu hình trong-envelope mà FAIL):** (V5,kc0,kj2)→['F', 'T', 'T', 'T']; (V6,kc0,kj2)→['T', 'T', 'F', 'F']; (V6,kc1,kj2)→['T', 'T', 'F', 'F']; (V7,kc0,kj3)→['F', 'F', 'T', 'F']; (V7,kc1,kj2)→['T', 'F', 'T', 'T']; (V7,kc2,kj2)→['F', 'T', 'T', 'F']. Hai
  nguyên nhân tách bạch dưới đây.

### (2) Confound: hình-học-view quyết định — 14 cấu hình "split" (các gán bất đồng)
Cùng `(V,k_cam,k_joint)` nhưng gán-view khác nhau ⇒ kết cục khác nhau: 3 cấu hình ở
k_joint=1, 11 ở k_joint≥2. Lý do: sau khi anchor gỡ k_cam view whole-cam, rig CÒN LẠI
phân bố góc TỐT hay XẤU tuỳ view nào bị gỡ; held-out của LOVO nhạy với phân bố đó. Đây là giới hạn
V52–V54 GHI mà CHƯA lượng hoá — giờ đo được: **envelope ĐẾM-ĐƯỢC không thể chính xác vì thiếu chiều
hình học.** Ví dụ split: (V4,kc0,kj2)→['F', 'T', 'F', 'F']; (V4,kc1,kj1)→['F', 'F', 'F', 'T']; (V5,kc0,kj2)→['F', 'T', 'T', 'T']; (V5,kc1,kj2)→['F', 'T', 'F', 'F']; (V5,kc2,kj1)→['T', 'T', 'F', 'F']; (V6,kc0,kj2)→['T', 'T', 'F', 'F'].

### (3) Trần k_joint của V52 là NGOẠI SUY lạc quan
V52 ĐO trần joint-bias floor((V-1)/2)=1 **chỉ ở V=4**; công thức tổng quát `floor((V−k_cam−1)/2)` ngầm
hứa trần TĂNG theo số view. V55 bác: vùng `k_joint≥2` (FRONTIER) có 20 cấu hình → chỉ
1 all-pass, 8 all-fail, 11 split. k_joint≥2 KHÔNG
lên PASS ổn định dù rig lớn, vì "others" robust chỉ drop MỘT view tệ nhất → còn ≥1 view joint-bias trong
"others" làm bẩn điểm chấm. ⇒ trần joint-bias THỰC của LOVO-bền (drop-một) là **k_joint≤1**, phần trên
là phụ-thuộc-hình-học, không phải trần đếm-được như floor((V-1)/2) ngoại suy.

### (4) Luật đếm-được TINH CHỈNH + phần dư chính là confound
Luật tinh chỉnh từ 3 lớp lệch:
```
V − k_cam − k_joint < 2   → FAIL   (không đủ view sạch tam giác hoá)
k_joint = 0               → PASS   (anchor-đơn đủ; KHÔNG cần V−k_cam≥4)
k_joint = 1               → PASS nếu V−k_cam≥4, ngược lại FAIL
k_joint ≥ 2               → FRONTIER (phụ-thuộc-hình-học, đếm KHÔNG đoán chắc)
```
Trên vùng đếm-đoán-được (PASS/FAIL, bỏ FRONTIER): khớp **56/56 =
100.0%**.

**Cảnh báo trung thực (KHÔNG overclaim):** con số 100% này là MÔ TẢ, không phải dự đoán chéo-kiểm.
Luật tinh chỉnh được RÚT RA TỪ CHÍNH các chỗ lệch ở trên, nên đương nhiên nó khớp trên cùng bộ đó
(post-hoc fit). Giá trị của nó KHÔNG phải "độ chính xác 100%" mà là: nó chỉ ra vùng đếm-đoán-được và
vùng phụ-thuộc-hình-học **tách bạch sạch** — mọi cấu hình mà COUNT đoán sai đều rơi đúng vào FRONTIER
(k_joint≥2) hoặc 3 cấu hình confound-split ở k_joint=1. Nói cách khác: phần COUNT
KHÔNG đoán được chính là phần mà hình-học-view quyết định — không phải nhiễu, không phải chỗ tuỳ tiện.
Đây là trần NGUYÊN LÝ của mọi envelope CHỈ-ĐẾM; muốn vượt phải thêm chiều hình-học (phân bố góc của rig
còn lại sau khi anchor gỡ) vào tiêu chí, không thể bằng đếm k thuần.

## Kết luận (trung thực, sửa cả V52 lẫn V54)
- Envelope V54 là chỉ dẫn BẬC MỘT tốt nhưng KHÔNG chính xác (81.6%). Luật đếm
  tinh chỉnh (post-hoc) khớp sạch trên vùng đếm-đoán-được, chứng tỏ phần COUNT bỏ sót TÁCH BẠCH đúng
  vào vùng phụ-thuộc-hình-học — không lẫn vào nhiễu.
- Trần joint-bias của LOVO-bền-drop-một là **k_joint≤1**, KHÔNG phải floor((V-1)/2) (V52 đo đúng ở V=4
  nhưng công thức ngoại suy sai ở rig lớn) — muốn nâng trần phải cho "others" drop-worst LẶP tới sạch
  (hướng để ngỏ, có giá: mất dữ liệu).
- Confound hình-học là yếu tố bậc HAI THẬT, lần đầu lượng hoá (14/76 cấu hình split).
  Mọi envelope chỉ-đếm đều có trần nguyên lý ở đây. Đây là câu trả lời trung thực cho hội đồng khi hỏi
  "công thức envelope có chắc không": chắc ở bậc một, và ta BIẾT chính xác nó hở ở đâu (confound) & vì sao.

## Giới hạn
- Hình học tổng hợp, bias 60px cố định hướng SAME; 5 trial/gán, 4 gán/cấu hình
  (confound lấy mẫu, chưa vét cạn mọi tổ hợp view). Ngưỡng success |dev−oracle|≤1cm & loại-đúng-tập.
- "PASS/FAIL" gộp theo all-gán-pass; cấu hình split tính vào phần confound. Số thật chờ Gate-0 (GPU lab).
