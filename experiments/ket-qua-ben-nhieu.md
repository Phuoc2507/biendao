# V47 — Bền với nhiễu detector: cổng RATIO là lá chắn nhiễu iid

**Script:** [`web/experiments/noise-robustness.ts`](../web/experiments/noise-robustness.ts)
**Chạy:** `cd web && npx esbuild experiments/noise-robustness.ts --bundle --platform=node --format=cjs --outfile=nr.cjs && node nr.cjs`

## Câu hỏi

Mọi vòng trước (V35–V46) chạy trên toạ độ khớp **sạch tuyệt đối** (tổng hợp, không nhiễu). Nhưng
Gate-0 dùng mocap THẬT: 2D pose (RTMPose/ViTPose) có sai số định vị khớp cỡ **1–3cm**, còn tam giác
hoá 2-view khuếch đại thêm. Hội đồng sẽ hỏi thẳng: *"metric đánh giá của bạn có sụp khi gặp nhiễu
detector không? Nhiễu có tạo **nạn nhân giả** — nêu oan người vốn nhảy đúng — không?"*

Vòng này **tiêm nhiễu Gauss iid** `N(0, σ)` vào **mọi toạ độ khớp, mọi khung** rồi đo bộ phân loại
`formOutlierIndex` (chính mã sản phẩm trong `web/src/sync.ts`, hằng số production 0.12/0.85/0.05/1.3)
phản ứng ra sao khi σ quét từ 0 tới 20cm — bao trùm và vượt xa dải detector thật.

## Thiết kế

- Nhóm N=5, nền clip A (vung tay phải), FPS=30, 240 khung, chu kỳ 2.0s.
- Nhiễu **tất định**: PRNG `mulberry32` + Box–Muller, **mỗi vũ công một hạt giống độc lập**
  (`seedBase+d`) ⇒ nhiễu 5 người KHÔNG tương quan (đúng nghĩa iid giữa người). Clip tham chiếu bố
  cục dùng hạt giống riêng, sạch. Nhờ hạt giống cố định, runner chạy 2 lần cho **cùng** kết quả.
- Bốn phép đo, mỗi phép quét σ ∈ {0, 0.5, 1, 2, 3, 5, 8, 12, 20} cm:
  - **(I) Dương-tính-giả:** cả 5 người nhảy ĐÚNG (ε=0), chỉ có nhiễu. `FP%` = % khung nêu **bất kỳ
    ai**. Muốn = 0 (không ai sai ⇒ không được nêu ai).
  - **(II) Bắt lỗi dưới nhiễu:** d0 lệch tĩnh tay trái ~12cm (ε=0.7) + nhiễu. `TP%` = nêu ĐÚNG d0;
    `FP%` = nêu NHẦM người khác.
  - **(III)** formSpread TB (cm) khi cả nhóm đúng — neo σ vào ngưỡng mở cổng SYNC (`SCALE·ln(1/0.85)
    ≈ 1.95cm`).
  - **(IV)** khi cả nhóm đúng: tỉ số `worst/meanOthers` TB (cổng RATIO cắt ở 1.3) và `worstV` (cm) —
    soi trực tiếp lá chắn nào đang chặn vu oan.

## Kết quả (số đo được)

### (I) Dương-tính-giả = 0 ở MỌI mức nhiễu

```
σ(cm) |   0.0  0.5  1.0  2.0  3.0  5.0  8.0 12.0 20.0
FP%   |     0    0    0    0    0    0    0    0    0
```

Nhiễu iid **không bao giờ** gây vu oan — kể cả ở σ=20cm (gấp ~7× detector thật), khi formSpread đã
vọt lên ~39cm và cổng SYNC mở toang. Không một khung nào nêu người vô tội.

### (II) Bắt lỗi thật: nhạy tới σ=5cm, rồi đi CÂM (hỏng an toàn) — không bao giờ đổ oan

```
σ(cm) |   0.0  0.5  1.0  2.0  3.0  5.0  8.0 12.0 20.0
TP%   |   100  100  100  100  100  100    0    0    0
FP%   |     0    0    0    0    0    0    0    0    0
```

Lỗi 12cm bị bắt **100%** tới σ=5cm (nhiễu ≈0.4× biên lỗi — thừa biên so với detector thật 1–3cm).
Từ σ≥8cm nhiễu át lỗi, TP sụp về 0 — **nhưng FP vẫn 0**: metric mất độ nhạy bằng cách **im lặng**,
tuyệt đối không chuyển sang nêu nhầm người khác. Đây là kiểu suy giảm lý tưởng: *thà bỏ sót còn hơn
vu oan.*

### (III) formSpread ≈ 2σ (tuyến tính) — cổng SYNC mở rất sớm nhưng vô hại một mình

```
σ(cm)     |    0.0   0.5   1.0   2.0   3.0   5.0   8.0  12.0  20.0
spread cm |   0.00  1.00  2.00  3.99  5.95  9.84 15.67 23.46 38.95
```

Cổng SYNC (1.95cm) mở ngay từ σ≈1cm. Nhưng (I) chứng minh: **mở cổng SYNC một mình KHÔNG phải vu
oan** — nó chỉ tuyên bố "nhóm đang lệch nhau", chưa quy trách nhiệm cho ai. Việc quy trách nhiệm là
của cổng RATIO ở (IV).

### (IV) Cơ chế: worst/mean PHẲNG LÌ ở 1.02 — RATIO có biên khổng lồ trước nhiễu iid

```
σ(cm)      |    0.0   0.5   1.0   2.0   3.0   5.0   8.0  12.0  20.0
worst/mean |      –  1.02  1.02  1.02  1.02  1.02  1.02  1.02  1.02
worstV cm  |    0.0   1.0   2.0   4.0   6.0  10.0  15.9  23.8  39.4
```

`worstV` (residual người lệch nhất) tăng tuyến tính theo σ, nhưng **tỉ số** worst/mean đứng yên
~**1.02** — xa dưới ngưỡng RATIO=1.3. Lý do: nhiễu iid, sau khi trung bình hoá qua **17 khớp × cửa
sổ 13 mẫu** (≈221 mẫu độc lập), co lại rất mạnh ⇒ residual 5 người dồn sát nhau trong ~2%. Không ai
nổi lên đủ để vượt 1.3. Vì tỉ số **bất biến theo tỉ lệ**, nó không đổi dù nhiễu lớn đến đâu.

## Kết luận

1. **RATIO=1.3 có VAI TRÒ THỨ HAI: lá chắn nhiễu iid.** V46 cho thấy RATIO chống "đổ oan đa số"; V47
   cho thấy nó còn chặn "đổ oan do nhiễu". Cơ chế giống nhau — RATIO đòi một người phải nổi trội
   **tương đối** so với đồng đội; nhiễu iid được trung bình hoá không tạo được độ nổi trội đó.
2. **Cặp cổng SYNC + RATIO bù nhau cả trước nhiễu.** SYNC (formSpread) nhạy với nhiễu (mở sớm, ≈2σ)
   nhưng chỉ báo "nhóm lệch"; RATIO (tỉ số residual) miễn nhiễm với nhiễu iid và mới là cổng quyết
   định "có quy về một người không". Tách hai vai trò này giải thích vì sao metric vừa **nhạy** vừa
   **an toàn**.
3. **Ở dải detector thật (1–3cm): TP=100, FP=0.** Đây là bằng chứng định lượng rằng metric đánh giá
   **không sụp** khi bước từ toạ độ tổng hợp sạch sang dữ liệu có nhiễu cỡ mocap thật — de-risk cho
   Gate-0 trước khi có GPU lab.

## Giới hạn (trung thực)

Nhiễu Gauss **iid** là mô hình **LẠC QUAN** (chặn trên độ bền), không phải worst-case. Nhiễu detector
thật:
- **Tương quan thời gian** (jitter pose bám khung liền kề) ⇒ không tự triệt khi trung bình hoá cửa sổ
  → có thể đẩy worst/mean lên, ăn vào biên RATIO.
- **Lệch hệ thống theo góc nhìn** (một camera nhìn xiên khớp bị che) ⇒ sai *có cấu trúc*, giống "sai
  động tác" thật → có thể tạo dương-tính-giả mà iid không bộc lộ.
- **Rơi khớp / occlusion** ⇒ residual nhảy vọt cục bộ, không Gauss.

Vì thế con số "an toàn tới σ=5cm" là **chặn trên**; Gate-0 (mocap 2-cam thật, GPU lab) phải đo lại
với nhiễu thật, nơi tương quan thời gian và lệch hệ thống có thể phá biên RATIO. V47 chứng minh
metric bền với thành phần nhiễu **ngẫu nhiên**; thành phần nhiễu **có cấu trúc** còn để ngỏ, đo ở
Gate-0.
