# V36 — Tìm τ THÔ→TINH: đóng dải gãy trễ-hằng mà không tăng chi phí

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), chạy headless trên `web/src/sync.ts` (đã sửa).
> Kịch bản: [`web/experiments/coarse-to-fine.ts`](../web/experiments/coarse-to-fine.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/coarse-to-fine.ts --bundle --platform=node --format=cjs --outfile=c2f.cjs && node c2f.cjs`

## Vì sao đo — và sửa gì

[Thực nghiệm giới hạn](ket-qua-gioi-han-rigid-tau.md) (Phần A) cho bằng chứng: biên tìm
τ cũ `maxLag=0.5s` để lọt **dải gãy trễ-hằng τ∈[0.9,1.05]s** — echo vào chậm ~1 nhịp bị
gọi oan "múa sai" (FP 100%). Nới `maxLag` lên 1.0s đóng được dải đó, nhưng quét **vét cạn**
tăng chi phí gấp đôi (O(nτ) tuyến tính theo biên).

**Sửa (`sync.ts`):** đổi `alignPair` sang tìm **THÔ→TINH** — quét thô cả biên ±maxLag ở
bước `coarseFactor·lagStep` (mặc định ×4) rồi tinh chỉnh quanh cực tiểu thô ở bước
`lagStep`. Đặt `DEFAULT_PHASE.maxLag = 1.0`, `coarseFactor = 4`. `coarseFactor=1` giữ chế
độ vét-cạn (tham chiếu). Bề mặt residual(τ) của chuyển động múa trơn có lòng chảo rộng
~chu kỳ, nên bước thô 0.13s (~15 mẫu/chu kỳ) không nhảy qua lòng chảo chính.

## Phần 1 — Dải gãy có ĐÓNG không?

1 người echo trễ τ HẰNG, N=5, KHÔNG ai sai → mọi lần gọi tên = báo giả (FP mong muốn 0%).

| τ (s) | cũ vét-cạn 0.5s | vét-cạn 1.0s | **THÔ→TINH 1.0s** |
|------:|:---------------:|:------------:|:-----------------:|
| 0.45  |       0%        |     0%       |       **0%**      |
| 0.60  |       0%        |     0%       |       **0%**      |
| 0.75  |       0%        |     0%       |       **0%**      |
| **0.90** |  **100%** ✗  |     0%       |       **0%**      |
| **1.05** |  **100%** ✗  |     0%       |       **0%**      |
| 1.20  |      60% ✗      |     0%       |       **0%**      |
| 1.50  |       0%        |     0%       |       **0%**      |
| 1.70  |       0%        |     0%       |       **0%**      |

**Đọc:** dải gãy 0.9–1.20s ĐÓNG hoàn toàn (100→0%). Thô→tinh cho FP **y hệt** vét-cạn 1.0s
ở mọi τ — làm thô không mất độ chính xác quyết định.

> *Lưu ý trung thực:* FP=0 cả ở τ=1.5/1.7 (vượt maxLag=1.0) là vì clip tổng hợp có chu kỳ
> 2.0s, mà `maxLag=1.0 = chu kỳ/2` → alias của MỌI τ luôn rơi vào ±1.0 (echo trễ 1.5 ≈ sớm
> 0.5). Đây là hệ quả của chu kỳ tổng hợp, KHÔNG phải cam kết tổng quát. Cam kết đúng cho
> luận văn: **canon trễ hằng tới maxLag=1.0s (≈2 phách @120BPM) căn được TRỰC TIẾP**; xa hơn
> chỉ căn được nếu alias lọt biên (phụ thuộc chu kỳ động tác thật).

## Phần 2 — Chi phí (thấp hơn = nhanh hơn)

| cấu hình | phép/hướng-cặp | thời gian (×400 lượt) |
|----------|:--------------:|:---------------------:|
| cũ vét-cạn 0.5s |   31   |   10193 ms |
| vét-cạn 1.0s    |   61   |   19310 ms |
| **THÔ→TINH 1.0s** | **25** | **8036 ms** |

**Đọc:** thô→tinh phủ biên GẤP ĐÔI (±1.0 vs ±0.5) mà **rẻ hơn cả vét-cạn 0.5s cũ** — 25 vs
31 phép/cặp, 8.0s vs 10.2s (−21%). Thời gian thực khớp số phép lý thuyết. Vét-cạn 1.0s
(không thô→tinh) đắt gấp 2.4× → xác nhận thô→tinh là thứ khiến việc nới biên khả thi.

## Phần 3 — Thô→tinh có khớp vét-cạn?

So `formResidual` từng-người, từng-thời-điểm giữa thô→tinh và vét-cạn 1.0s (mm):

- Sai khác **lớn nhất = 13.61 mm**, **trung bình = 0.535 mm**.

**Đọc:** trung bình lệch nửa milimet — gần như trùng. Đỉnh 13.6mm ở vài thời điểm lẻ (thô
chọn lòng chảo cạnh hơi khác) vẫn **dưới xa sàn gác lỗi 50mm** (`OUTLIER_FLOOR`) nên KHÔNG
lật được quyết định nào — Phần 1 & 4 xác nhận cờ ra y hệt. Đây là đánh đổi chấp nhận được
của xấp xỉ thô→tinh.

## Phần 4 — Không hồi quy bắt lỗi THẬT

1 người múa động tác B (sai hình dáng thật), N=5:

| cấu hình | TP (gọi đúng) | misID (gọi nhầm) |
|----------|:-------------:|:----------------:|
| cũ vét-cạn 0.5s   | 100% | 0% |
| vét-cạn 1.0s      | 100% | 0% |
| **THÔ→TINH 1.0s** | **100%** | **0%** |

**Đọc:** nới biên + thô→tinh KHÔNG làm giảm độ nhạy lỗi thật — vẫn bắt đúng 100%, không gọi
nhầm ai.

## Kết luận cho luận văn

Cải tiến `alignPair` thô→tinh + `maxLag` 0.5→1.0s:

1. **Đóng dải gãy trễ-hằng 0.9–1.05s** đã đo ở vòng trước (FP 100%→0%), không hồi quy TP.
2. **Rẻ hơn** cả cấu hình cũ hẹp hơn (−21% thời gian) — nới biên mà vẫn hợp thời-gian-thực
   (app căn pha tiết lưu ~120ms/lượt, càng dư).
3. Sai số xấp xỉ (trung bình 0.5mm) dưới xa ngưỡng quyết định → an toàn.

Đây là ví dụ đúng quy trình *đo → tìm giới hạn → sửa có định hướng → đo lại*: giới hạn phát
hiện ở vòng đo trước trực tiếp đẻ ra thay đổi production, và thay đổi được xác nhận đóng đúng
lỗ hổng đó mà không tác dụng phụ. Giới hạn CÒN LẠI (trôi tempo, [Phần B vòng trước](ket-qua-gioi-han-rigid-tau.md))
vẫn cần warping đàn hồi — hướng mở rộng, không phải lỗ hổng vòng này chạm tới.
