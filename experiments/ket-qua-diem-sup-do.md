# V41 — Điểm SỤP ĐỔ của bộ phát hiện outlier nhóm: trần nhận dạng 50%

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), chạy trên mã đã ship `phaseAlignAt`+`formOutlierIndex`.
> Kịch bản: [`web/experiments/breakdown-point.ts`](../web/experiments/breakdown-point.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/breakdown-point.ts --bundle --platform=node --format=cjs --outfile=bp.cjs && node bp.cjs`

## Vì sao đo & kết luận thẳng

`formOutlierIndex` nêu DUY NHẤT người tệ nhất, tham chiếu là TRUNG VỊ residual từng-cặp —
một ước lượng robust. Câu hỏi robust kinh điển: chịu được BAO NHIÊU người sai ĐỒNG THỜI
trước khi tham chiếu đồng thuận hỏng? Đo trên N=7, k người sai, hai kịch bản đối lập.

**Kết luận:** bộ dò có **điểm sụp đúng 50%** khi lỗi ĐỒNG DẠNG (lý thuyết trung vị), quá đó
là vấn đề **KHÔNG THỂ NHẬN DẠNG** về bản chất (không tham chiếu ngoài thì không biết nửa nào
đúng). Nhưng chế độ hỏng AN TOÀN: lỗi ĐA DẠNG → im (không vu oan); và `formSync` liên tục
vẫn báo "kém đồng bộ". Metric ĐÚNG cho regime thực tế (thiểu số lạc — đúng ca dùng K-pop);
trần 50% là GIỚI HẠN NGUYÊN LÝ của mọi đánh giá nhóm-tương-đối, không phải lỗi cài đặt.

## Kết quả

### (U) Sai ĐỒNG DẠNG — k người CÙNG một động tác sai (N=7)

| k | k/N | hit | **nhầm (vu oan)** | im | formSync |
|--:|:---:|:---:|:-----------------:|:--:|:--------:|
| 0 | .00 |  0% |  0% | 100% | 100 |
| 1 | .14 | 100% | 0% | 0% | 84 |
| 2 | .29 | 100% | 0% | 0% | 70 |
| 3 | .43 | 100% | 0% | 0% | 41 |
| 4 | .57 | 0% | **100%** | 0% | 41 |
| 5 | .71 | 0% | **100%** | 0% | 70 |
| 6 | .86 | 0% | **100%** | 0% | 84 |

### (D) Sai ĐA DẠNG — mỗi người sai một kiểu khác nhau (N=7)

| k | k/N | hit | nhầm | **im (mask)** | formSync |
|--:|:---:|:---:|:----:|:-------------:|:--------:|
| 0 | .00 |  0% | 0% | 100% | 100 |
| 1 | .14 | 100% | 0% | 0% | 84 |
| 2 | .29 | 100% | 0% | 0% | 70 |
| 3 | .43 | 100% | 0% | 0% | 41 |
| 4 | .57 | 0% | 0% | **100%** | 28 |
| 5 | .71 | 0% | 0% | **100%** | 29 |
| 6 | .86 | 0% | 0% | **100%** | 28 |

## Đọc kết quả

- **Điểm sụp ĐÚNG 50% (đồng dạng).** hit=100% tới k=3 (k/N=.43), vu oan=100% từ k=4
  (k/N=.57). Khi người sai thành ĐA SỐ đồng dạng, họ dựng "đa số giả": trung vị residual
  của người ĐÚNG bị kéo cao (swamping) → bộ dò chỉ NHẦM vào người đúng, người sai bị che
  (masking). Đây là điểm sụp lý thuyết của trung vị, tái hiện SẠCH.
- **formSync ĐỐI XỨNG, KHÔNG đơn điệu (đồng dạng) — đính chính dự đoán ban đầu.** 84/70/41
  rồi 41/70/84: formSync đo ĐỘ TÁCH 2 cụm kích thước {k, N−k}, chỉ phụ thuộc cặp không thứ
  tự → k=4 giống hệt k=3. ⇒ **formSync KHÔNG tự phân biệt "nửa nào là đúng"** — nó là thước
  BẤT ĐỒNG, không phải thước "ai sai". (Dự đoán "giảm đơn điệu" trước khi đo là SAI ở ca này.)
- **Lỗi ĐA DẠNG hỏng AN TOÀN.** Quá 50%, bộ dò IM (miss) chứ KHÔNG vu oan: không ai trội
  hẳn nên cổng tỉ lệ 1.3× chặn. formSync tụt đơn điệu về ~28 và Ở LẠI thấp → báo đúng "cả
  nhóm loạn". Chế độ hỏng này vô hại (bỏ sót, không buộc tội nhầm).
- **Vì sao KHÔNG có "vá thiểu số" cứu được (đã lập luận, không cài thừa).** Ở k=4 đồng dạng,
  chính 3 người ĐÚNG mới là bên có residual cao → mọi bộ lọc "chỉ nêu khi outlier là thiểu
  số" vẫn sẽ nêu nhầm 3 người đúng. Quá 50%, không có tham chiếu NGOÀI thì bài toán **không
  nhận dạng được** — không ước lượng nào phân biệt nổi. Đây là trần nguyên lý, không sửa bằng
  cài đặt.

## Kết luận cho luận văn

Đóng góp: xác định **trần nhận dạng 50%** của đánh giá đồng bộ NHÓM-TƯƠNG-ĐỐI (V33/V35) bằng
thực nghiệm, khớp lý thuyết breakdown của trung vị. Ý nghĩa thiết kế:
1. Metric nhóm-tương-đối ĐÚNG cho ca dùng thực tế (một/vài người lạc — thiểu số), là đúng
   ngữ cảnh K-pop cover. Hỏng an toàn với lỗi đa dạng (im), chỉ vu oan ở ca hiếm "đa số cùng
   sai một kiểu" — vốn đã mơ hồ về ngữ nghĩa ("ai bảo nửa kia đúng?").
2. `formSync` là thước BẤT ĐỒNG đối xứng, nên tầng rời rạc (cờ "ai lạc") chỉ NÊN hiển thị khi
   nhóm còn phần lớn đồng thuận; sai hàng loạt nên báo "nhóm không đồng nhất", đừng chỉ mặt một
   người. Thiết kế HAI TẦNG (liên tục + rời rạc) là hợp lý, ranh giới dùng chính là 50%.
3. Muốn phá trần 50% phải có THAM CHIẾU TUYỆT ĐỐI, không phải đồng thuận. Điều này KHỚP tầng
   perception: Gate-0 chấm bằng camera HELD-OUT (V13/V14) chính là nguyên tắc đó. Và trong bản
   demonstrator, DAW vốn BIẾT vũ đạo dự định (mỗi vũ công gắn 1 clip) → có thể chấm TUYỆT ĐỐI
   (so mỗi người với clip được gán) KHÔNG có điểm sụp — bổ sung cho metric nhóm-tương-đối vốn
   dành cho kịch bản mocap THẬT không có nhãn từng người. Hai lối đo bù nhau, không thay nhau.
