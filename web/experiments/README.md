# Thực nghiệm tầng ĐÁNH GIÁ (web / TypeScript)

Khác thư mục `../../experiments/` (numpy, tầng perception hình học, chạy qua `run_all.py`):
các script ở đây chạy TRỰC TIẾP trên mã đã ship trong `../src/` (`sync.ts`, `clip.ts`) để
kiểm chứng tầng ĐÁNH GIÁ đồng bộ nhóm. Chuỗi phụ thuộc `sync.ts → clip.ts` là THUẦN (không
three/react) nên chạy headless được bằng esbuild + Node — thực nghiệm chấm chính mã sản phẩm,
không phải bản sao.

> Tài liệu kết quả (`ket-qua-*.md`) nằm chung ở `../../experiments/` cùng kết quả numpy, để một
> chỗ duy nhất tra cứu toàn bộ bằng chứng luận văn.

## Chạy

**Một script** (trong thư mục `web/`):

```
npx esbuild experiments/<tên>.ts --bundle --platform=node --format=cjs --outfile=exp.cjs && node exp.cjs
```

(`exp.cjs` là file tạm, xoá sau khi chạy.)

**Tái lập TẤT CẢ** + kiểm tất định (trong `web/`):

```
node experiments/run-all.mjs
```

Runner bundle từng script ra CJS tạm rồi chạy bằng chính Node này (dùng esbuild JS API, né
wrapper `.bin` trên Windows), mỗi script chạy **2 lần** để xác nhận KẾT QUẢ tất định. Hai script
benchmark (`coarse-to-fine`, `affine-validation`) CÓ CHỦ Ý in thời gian tường (ms/lượt) — dao
động hợp lệ, nên runner chuẩn hoá bỏ token `ms` VÀ gộp khoảng trắng ngang TRƯỚC khi so tất định
(số ms thật vẫn hiển thị; gộp space để timing vượt mốc chữ số không gây lệch-đệm padStart giả).
Lần đo gần nhất: **9/9 tái lập sạch, ~177s** (ngang runner numpy ~173s).

## Mạch nghiên cứu tầng đánh giá (V33 → V44)

Hai câu hỏi lớn, mỗi câu khép bằng bằng chứng đo được:

### A. "Trễ nhịp CỐ Ý" khác "sai động tác" thế nào? → khung tách PHA–BIÊN ĐỘ, và warping tới đâu là đủ

| Script | Vòng | Nội dung | Kết quả |
|--------|:----:|----------|---------|
| `phase-sync-validation.ts` | V35 | So bộ NGÂY THƠ (tức thời) vs TÁCH PHA (rigid-τ) trên clip có sự-thật-nền | [tach-pha-vs-tuc-thoi](../../experiments/ket-qua-tach-pha-vs-tuc-thoi.md) — báo giả canon 51%→0%, bắt lỗi 80%→100% |
| `phase-limits.ts` | V36 | Đo GIỚI HẠN rigid-τ (echo τ hằng; trôi tempo) | [gioi-han-rigid-tau](../../experiments/ket-qua-gioi-han-rigid-tau.md) — gãy dải 0.9–1.05s ở maxLag cũ |
| `coarse-to-fine.ts` | V36 | Nới maxLag 0.5→1.0s + quét τ THÔ→TINH | [tho-tinh](../../experiments/ket-qua-tho-tinh.md) — đóng dải gãy (FP 100→0), rẻ hơn ~21% |
| `affine-warp.ts` | V37 | NGUYÊN MẪU warping affine τ×ρ trên cặp cô lập | [warp-affine-nguyen-mau](../../experiments/ket-qua-warp-affine-nguyen-mau.md) — dập residual trôi tempo −56…−85% |
| `affine-validation.ts` | V39 | Affine TOÀN PIPELINE — có đáng ship không? | [affine-toan-pipeline](../../experiments/ket-qua-affine-toan-pipeline.md) — **kết quả ÂM**: TẮT mặc định, giữ tuỳ chọn |
| `failure-frontier.ts` | V40 | Bản đồ BIÊN GÃY — còn chế độ nào metric chỉ-dịch gãy? | [bien-gay-tach-pha](../../experiments/ket-qua-bien-gay-tach-pha.md) — DỪNG leo thang; rigid-τ+thô→tinh là điểm phức tạp đúng |

**Kết cung A:** rigid-τ + coarse-to-fine (V36) là "điểm phức tạp đúng". Affine cài nhưng tắt
(`DEFAULT_PHASE.maxRate=0`); SRVF/DTW để ngỏ CÓ ĐIỀU KIỆN (chỉ khi mocap thật lộ trôi phi tuyến
đơn điệu trong cửa sổ). Ví dụ "dừng đúng lúc" — thêm bậc tự do warping chỉ đáng khi DỮ LIỆU đòi.

### B. Bộ chấm "ai lạc" chịu được bao nhiêu người sai? → trần 50%, và cách phá trần

| Script | Vòng | Nội dung | Kết quả |
|--------|:----:|----------|---------|
| `breakdown-point.ts` | V41 | ĐIỂM SỤP của chấm NHÓM-TƯƠNG-ĐỐI (tham chiếu = trung vị đồng thuận) | [diem-sup-do](../../experiments/ket-qua-diem-sup-do.md) — sụp ĐÚNG 50% (sai đồng dạng), hỏng AN TOÀN (sai đa dạng) |
| `absolute-reference.ts` | V42 | Chấm TUYỆT ĐỐI theo clip tham chiếu — phá trần | [tham-chieu-tuyet-doi](../../experiments/ket-qua-tham-chieu-tuyet-doi.md) — KHÔNG điểm sụp, bắt đủ k người sai ở mọi k, vẫn bất biến canon |
| `gate-sensitivity.ts` | V44 | ĐỘ NHẠY 4 hằng số của metric — đường đặc trưng vận hành | [do-nhay-tham-so](../../experiments/ket-qua-do-nhay-tham-so.md) — SCALE↔GATE gộp 1 núm (ngưỡng ~2cm spread); 0.85 là điểm cân bằng; FLOOR là chốt an toàn |

**Kết cung B — HAI THƯỚC BÙ NHAU (chọn theo việc CÓ hay KHÔNG nhãn tham chiếu):**

1. **Nhóm-tương-đối** (`phaseAlignAt`+`formOutlierIndex`, KHÔNG cần nhãn): đúng cho mocap thật /
   nhóm nhảy tự do không kèm vũ đạo gốc. Hỏng an toàn với lỗi đa dạng (im, không vu oan). Trần
   nhận dạng **50%** — giới hạn THÔNG TIN, không sửa bằng cài đặt.
2. **Tuyệt đối theo tham chiếu** (căn pha từng người vào clip vũ đạo, CẦN nhãn): KHÔNG có điểm sụp,
   bắt đủ người sai ở mọi tỉ lệ, vẫn bất biến canon. Áp dụng ở DAW (mỗi mannequin gắn 1 clip →
   biết chính xác) và ở Gate-0 perception (camera HELD-OUT = tham chiếu tuyệt đối vật lý, xem
   `../../experiments/` V13/V14).

Đừng ép một thước gánh cả hai vai. Khi CÓ nhãn tham chiếu (đúng ca demonstrator & Gate-0), dùng
vế tuyệt đối để vượt trần 50%; khi không, vế nhóm-tương-đối là đúng và trần 50% là hệ quả thông tin.

## Hằng số & cổng (trong `../src/sync.ts`)

- `DEFAULT_PHASE = { halfWindow:0.5, samples:13, maxLag:1.0, lagStep:1/30, coarseFactor:4, maxRate:0, … }`
  (maxRate:0 ⇒ affine TẮT, hành vi chỉ-dịch).
- `formSync = exp(-formSpread / SCALE)`, **SCALE=0.12** (neo vật lý ~12cm lệch khớp TB → ~37%).
- Cổng `formOutlierIndex`: `OUTLIER_SYNC_GATE=0.85`, `OUTLIER_FLOOR=0.05` (5cm), `OUTLIER_RATIO=1.3`.
- **V44 ([do-nhay-tham-so](../../experiments/ket-qua-do-nhay-tham-so.md)):** SCALE & SYNC_GATE **không
  độc lập** — bộ phân loại chỉ phụ thuộc ngưỡng dẫn xuất `formSpread* = SCALE·ln(1/G) ≈ 2cm` (2 hằng
  số = 1 bậc tự do). 0.85 là điểm cân bằng bỏ-sót↔vu-oan; FLOOR=5cm là chốt an toàn tuyệt đối, hiếm
  khi bó trong chế độ thường. Biện minh được điểm vận hành, không phải số chọn bừa.
