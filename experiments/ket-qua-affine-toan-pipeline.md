# V37 — Affine trên TOÀN pipeline: kết quả ÂM, không ship mặc định

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), chạy trên mã đã ship `phaseAlignAt`+`formOutlierIndex`.
> Kịch bản: [`web/experiments/affine-validation.ts`](../web/experiments/affine-validation.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/affine-validation.ts --bundle --platform=node --format=cjs --outfile=av.cjs && node av.cjs`

## Vì sao đo & kết luận thẳng

Nguyên mẫu [warp affine](ket-qua-warp-affine-nguyen-mau.md) đo trên CẶP cô lập cho kết quả
rất đẹp (dập residual trôi tempo −56…−85%, giữ lỗi hình dáng). Trước khi ship phải xác nhận
trên TOÀN pipeline (gộp trung vị 5 người + logic gác). Kết quả: **affine KHÔNG đáng ship mặc
định.** Đã trả `DEFAULT_PHASE.maxRate = 0` (affine tắt), giữ mã làm tuỳ chọn.

Cô lập đúng tác dụng nhịp ρ bằng cách chỉ đổi `maxRate` (mọi thứ khác = DEFAULT V36):
CHỈ-DỊCH = rigid-τ thô→tinh 1.0s; AFFINE = thêm ρ∈[0.75,1.25].

## Kết quả

### (1) Trôi tempo (1+g)× — người 0, KHÔNG sai hình dáng

| g (%/s) | FP dịch | FP affine | formSync dịch (%) | formSync affine (%) |
|--------:|:-------:|:---------:|:-----------------:|:-------------------:|
|  0  | 0% | 0% | **100** | 97 |
|  5  | 0% | 0% |  99 | 97 |
| 10  | 0% | 0% |  98 | 97 |
| 15  | 0% | 0% |  97 | 97 |
| 20  | 0% | 0% |  97 | 97 |
| 25  | 0% | 0% |  96 | 97 |
| 30  | 0% | 0% |  **95** | 97 |

### (2) Echo canon & (3) Lỗi thật — không hồi quy

| kiểm | CHỈ-DỊCH | AFFINE |
|------|:--------:|:------:|
| echo τ=0.3/0.6/0.9s: FP | 0% / 0% / 0% | 0% / 0% / 0% |
| lỗi thật (múa B): TP / misID | 100% / 0% | 100% / 0% |

### (4) Chi phí

| cấu hình | ms/lượt phaseAlignAt |
|----------|:--------------------:|
| CHỈ-DỊCH | **0.56** |
| AFFINE   | 4.05 (≈**7.3×**) |

## Đọc kết quả — vì sao ÂM

- **Cờ FP đã 0 nhờ V36, không nhờ affine.** Giới hạn Phần B ([đo trước](ket-qua-gioi-han-rigid-tau.md))
  là FP 28–33% ở g≥15% — nhưng đó đo dưới `maxLag=0.5s` CŨ. V36 nới lên 1.0s: cửa sổ tìm τ
  rộng hơn cho phép một độ trễ HẰNG khớp đủ tốt kể cả khi mov trôi nhịp → residual tụt dưới
  ngưỡng gác. CHỈ-DỊCH-1.0s cho FP 0 ở MỌI g. Affine không thêm gì ở mức cờ.
- **formSync hiển thị: affine hoà tới HƠI TỆ.** Ở g=0 affine 97% < dịch 100% (sàn lượng tử
  hoá lưới ρ thêm nhiễu); chỉ vượt dịch ở g=30% (97 vs 95). Chênh ±2–3 điểm — người dùng
  không phân biệt nổi. Lợi ích residual/cặp của nguyên mẫu bị **trung vị-gộp + nén exp() làm
  phẳng**, không còn ý nghĩa ở đầu ra.
- **Chi phí 7.3×** cho một cải thiện đầu-ra bằng-không. Không đáng.

## Kết luận cho luận văn

Đây là **kết quả âm trung thực có giá trị**: một cải tiến hợp lý trên lý thuyết (nấc warping
affine) và đẹp trên CẶP cô lập lại KHÔNG chuyển thành lợi ích ở TOÀN hệ thống, vì một cải
tiến rẻ hơn trước đó (V36 nới cửa sổ) đã hấp thụ đúng vấn đề mà nó nhắm tới. Quy trình *đo →
sửa → đo lại* ngăn đúng cái bẫy "ship vì nghe hợp lý": affine thêm 7× chi phí đổi lấy đầu ra
hoà/tệ hơn. Quyết định: **giữ mã affine làm tuỳ chọn** (`maxRate>0`) — có thể có ích trên
mocap THẬT khi trôi tempo lớn/phi tuyến hoặc khi gác chặt hơn — nhưng **mặc định tắt**.

Giới hạn còn lại đúng nghĩa (trôi tempo phi tuyến, gia/giảm tốc trong cửa sổ) vẫn cần warping
bậc cao (SRVF/DTW đầy đủ); affine tuyến tính không giải, và ở mức pipeline hiện tại chưa phải
nút thắt. Ghi là hướng mở rộng khi có dữ liệu mocap thật để đo lại trên phân phối lỗi thực.
