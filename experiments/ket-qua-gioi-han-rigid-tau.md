# Rigid-τ (trễ hằng) gãy ở đâu? — định biên hợp lệ của demo V35

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), chạy headless trên mã đã ship `web/src/sync.ts`.
> Kịch bản: [`web/experiments/phase-limits.ts`](../web/experiments/phase-limits.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/phase-limits.ts --bundle --platform=node --format=cjs --outfile=lim.cjs && node lim.cjs`

## Vì sao đo cái này

V35 căn pha bằng trường hợp RIGID của warping: MỘT độ trễ HẰNG τ trong biên ±maxLag
(0.5s). Thực nghiệm [tách pha](ket-qua-tach-pha-vs-tuc-thoi.md) đã chứng minh nó thắng
đồng bộ tức thời *trong biên thiết kế*. Ở đây ta ĐO chính xác **hai chỗ nó phải gãy** —
để ghi biên hợp lệ trung thực và lấy bằng chứng cân nhắc cải tiến V36.

## Phần A — Trễ canon HẰNG vượt cửa sổ

1 người echo trễ τ giây (cùng động tác), N=5, không ai sai → mọi lần gọi tên = báo giả.

| τ (s) | FP_phase | formResidual người echo (cm) | lag đo được (ms) |
|------:|--------:|:---------------------------:|:----------------:|
| 0.20  |   0%    |            0.0              |       200        |
| 0.35  |   0%    |            0.6              |       348        |
| 0.45  |   0%    |            0.6              |       452        |
| 0.50  |   0%    |            0.0              |       500        |
| 0.60  |   0%    |            3.4              |      500 ⚠       |
| 0.75  |   0%    |            8.3              |      500 ⚠       |
| **0.90**  | **100%** |        **12.8**         |    **500 ⚠**     |
| **1.05**  | **100%** |        **14.2**         |   **−500 ⚠**     |
| 1.20  |  60%    |            9.9              |      −500 ⚠      |

**Đọc kết quả:**

- **Biên an toàn RỘNG HƠN maxLag:** FP giữ 0% tới tận τ≈0.75s — vượt mốc maxLag 0.5s.
  Lý do: clip tuần hoàn (chu kỳ 2.0s) nên phần trễ vượt cửa sổ được ALIAS về lại, phần dư
  còn nhỏ (3–8cm) chưa đủ vượt sàn/ngưỡng gác. Với nhịp 120 BPM, 0.75s ≈ **1.5 phách** canon.
- **Dải gãy dứt khoát τ∈[0.9, 1.05]s:** FP nhảy lên 100%, phần dư 13–14cm — rigid-τ căn
  không tới, gọi oan người echo là "múa sai". Đây là điểm yếu thật của trường hợp rigid.
- **Dấu hiệu chẩn đoán:** ở mọi mốc gãy, lag đo được BÃO HOÀ đúng biên tìm (±500ms). Khi
  `|lag| = maxLag`, phép căn đã đụng mép cửa sổ → phần dư KHÔNG đáng tin (là tín hiệu để V36
  nới cửa sổ / coarse-to-fine dùng).
- **τ=1.2s alias một phần** (FP tụt 60%, lag lật dấu −500): trễ tiến gần một chu kỳ → echo
  gần như TRÙNG unison. Đây là **nhập nhằng bản chất của MỌI phương pháp** (echo trễ trọn 1
  chu kỳ nhìn y hệt đồng bộ), không phải lỗi riêng rigid-τ.

## Phần B — Trễ BIẾN THIÊN (trôi tempo)

1 người múa A nhưng TEMPO lệch (1+g)× → độ trễ thay đổi TRONG cửa sổ; một τ hằng không
căn nổi. Sự thật nền: người đó KHÔNG sai hình dáng (cùng pose, chỉ tái tham số thời gian)
→ mọi FP = xấp xỉ rigid thất bại (warping đàn hồi sẽ đỡ).

| g (%/s) | FP_phase | formResidual người trôi (cm) | formSync nhóm (%) |
|-------:|--------:|:---------------------------:|:-----------------:|
|   0    |   0%    |            0.0              |        100        |
|   2    |   0%    |            0.4              |         99        |
|   5    |   0%    |            0.6              |         99        |
|  10    |   0%    |            2.2              |         96        |
| **15** | **28%** |        **6.2**              |       **91**      |
| **20** | **33%** |        **6.6**              |       **90**      |
|  30    |  23%    |            5.7              |         91        |

**Đọc kết quả:** trôi nhẹ (g≤10%/s) rigid-τ chịu được (FP 0%, formSync ≥96%) — độ trễ biến
thiên trong cửa sổ còn đủ nhỏ để một τ trung bình căn tạm. Từ g≥15%/s, rigid bắt đầu báo
giả (~30%): nó buộc phải để lại phần dư của "đoạn dốc" trễ mà một hằng số không khử được, và
gọi nhầm timing thành lỗi hình dáng. (FP không tăng đơn điệu vì tuần hoàn + hiệu ứng cửa sổ
tương tác; điểm chính là **ngưỡng ~10–15%/s**, không phải hình dạng đường cong.)

## Kết luận cho luận văn

Định lượng được **túi hợp lệ** của demo rigid-τ:

1. **Canon trễ hằng:** đáng tin tới ~**0.75s (≈1.5 phách @120BPM)** — rộng hơn maxLag nhờ
   tuần hoàn — rồi gãy ở dải 0.9–1.05s. Echo ≥ 1 chu kỳ là nhập nhằng bản chất.
2. **Trôi tempo:** đáng tin tới ~**10%/s**; hơn nữa cần warping đàn hồi (SRVF/DTW) để tách
   đúng "đổi tempo" khỏi "sai hình dáng".

**Hệ quả hành động:** (a) dải gãy trễ-hằng 0.9–1.05s có thể ĐÓNG bằng cách nới cửa sổ tìm τ
(vd maxLag→1.0s) — nên dùng **coarse-to-fine** để không tăng chi phí O(nτ); đây là hướng V36
cụ thể, có bằng chứng. (b) Trôi tempo là giới hạn THẬT của trường hợp rigid, chỉ warping biến
thiên-thời-gian mới khử — ghi là hướng mở rộng. Dấu `|lag|=maxLag` bão hoà là cờ QA sẵn có để
cảnh báo "trễ ngoài cửa sổ" thay vì báo lỗi hình dáng.
