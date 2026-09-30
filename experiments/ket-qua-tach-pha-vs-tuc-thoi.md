# Tách pha (V35) có thắng đồng bộ tức thời ngây thơ (V34) không?

> **Khác với các thực nghiệm numpy trong thư mục này** (tầng PERCEPTION hình học, chạy
> qua `run_all.py`), đây là thực nghiệm tầng **ĐÁNH GIÁ của web app** — chạy TRỰC TIẾP
> trên mã đã ship `web/src/sync.ts` + `web/src/clip.ts`, KHÔNG giả lập lại thuật toán.
> Kịch bản script: [`web/experiments/phase-sync-validation.ts`](../web/experiments/phase-sync-validation.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/phase-sync-validation.ts --bundle --platform=node --format=cjs --outfile=exp.cjs && node exp.cjs`

## Vì sao đo cái này

Một bảng "đồng bộ nhóm" đọc điểm tại mỗi khung (đồng bộ TỨC THỜI) không phân biệt nổi
**canon/echo cố ý** với **múa sai thật**: cả hai chỉ là "một người ở pha khác" tại
khung treo. Với biên đạo, đây là khác biệt sống còn — la mắng một vũ công vừa thực hiện
đúng phần echo được giao là phản hồi SAI, làm hỏng công cụ tập luyện.

V35 tách theo khung Functional Data Analysis (phân rã pha–biên độ): **PHA** = căn thời
gian (trễ có cấu trúc = canon) tách khỏi **BIÊN ĐỘ** = phần dư hình dáng sau khi căn tối
ưu = lỗi thật. Bản demo dùng trường hợp rigid: độ trễ hằng τ trên cửa sổ quanh playhead.
Câu hỏi thực nghiệm: **tách pha có (a) dập được báo động giả do canon mà (b) vẫn bắt đúng
người múa sai không?**

## Cách đo (sự thật nền đã biết)

- 5 vũ công, clip tổng hợp 8s @30fps, biên độ tay 0.45m (cỡ mocap thật).
- **Động tác A** = vung tay PHẢI; **Động tác B** = vung tay TRÁI. Khác bên nên KHÔNG
  phép dịch thời gian τ nào căn khớp A với B được → phần dư hình dáng của B luôn lớn.
- Hai bộ phát hiện, cùng ngưỡng gác (gate 0.85, sàn 5cm, tỉ lệ 1.3×):
  - **NGÂY THƠ (V34):** `outlierIndex ∘ groupDeviationAt` — chấm tại đúng t treo.
  - **TÁCH PHA (V35):** `formOutlierIndex ∘ phaseAlignAt` — căn trễ tối ưu rồi mới chấm.
- Hai kịch bản:
  - **SẠCH** (canon/echo, KHÔNG lỗi): mọi người múa A; riêng 1 người vào trễ τ giây.
    Không ai sai → **mọi lần gọi tên = BÁO GIẢ (FP)**.
  - **LỖI** (sai thật): mọi người múa A đúng nhịp; riêng 1 người múa B.
    Sự thật: người đó sai → gọi đúng = **TRÚNG (TP)**, gọi người khác = **misID**.
- Quét độ trễ canon τ = 0…0.45s; mỗi mức lấy 40 mốc thời gian treo ∈ [0.6, 7.4]s.

## Kết quả

```
τ(s)  BÁO GIẢ dưới canon (SẠCH, không ai sai) — thấp là tốt
      naive │ phase
0.00    0 │ 0   ·                                        │ ·
0.05    0 │ 0   ·                                        │ ·
0.10    0 │ 0   ·                                        │ ·
0.15   35 │ 0   ██████████████·                          │ ·
0.20   55 │ 0   ██████████████████████·                  │ ·
0.25   65 │ 0   ██████████████████████████·              │ ·
0.30   70 │ 0   ████████████████████████████·            │ ·
0.35   75 │ 0   ██████████████████████████████·          │ ·
0.40   78 │ 0   ███████████████████████████████·         │ ·
0.45   80 │ 0   ████████████████████████████████·        │ ·
```

| τ (s) | FP naive | FP phase | TP naive | TP phase | misID (cả hai) | syncNhóm (naive) | formSync (phase) |
|------:|--------:|--------:|--------:|--------:|:-------------:|---------------:|----------------:|
| 0.00  |   0%    |   0%    |   80%   |  100%   |      0%       |     100%       |     100%        |
| 0.05  |   0%    |   0%    |   80%   |  100%   |      0%       |      96%       |      99%        |
| 0.10  |   0%    |   0%    |   80%   |  100%   |      0%       |      92%       |     100%        |
| 0.15  |  35%    |   0%    |   80%   |  100%   |      0%       |      89%       |      99%        |
| 0.20  |  55%    |   0%    |   80%   |  100%   |      0%       |      85%       |     100%        |
| 0.25  |  65%    |   0%    |   80%   |  100%   |      0%       |      82%       |      99%        |
| 0.30  |  70%    |   0%    |   80%   |  100%   |      0%       |      79%       |     100%        |
| 0.35  |  75%    |   0%    |   80%   |  100%   |      0%       |      77%       |      99%        |
| 0.40  |  78%    |   0%    |   80%   |  100%   |      0%       |      74%       |     100%        |
| 0.45  |  80%    |   0%    |   80%   |  100%   |      0%       |      72%       |      99%        |

**Trung bình các mốc có canon (τ>0):** FP naive **51%** vs phase **0%**; TP naive **80%**
vs phase **100%**; misID 0% cả hai; chỉ số nhóm SẠCH: syncNhóm naive **83%** (tụt dần tới
72%) vs formSync **99%**.

**Đọc kết quả:**

1. **Báo động giả:** khi độ trễ canon vượt ~0.12s, bộ ngây thơ bắt đầu chỉ đích danh người
   echo là "múa sai" — tới τ=0.45s là **80%** số khung báo giả. Tách pha căn được đúng độ
   trễ đó nên phần dư hình dáng ~0 → **0% báo giả ở MỌI mức τ**. Đây là kết quả chính.

2. **Chỉ số nhóm trông "hỏng":** trên cùng nhóm SẠCH, điểm đồng bộ tức thời tụt xuống 72%
   (nhìn như nhóm rã đám) trong khi thực ra chỉ là canon; formSync giữ **99–100%**, nói
   đúng bản chất: "hình dáng vẫn khớp, chỉ lệch thời điểm".

3. **Lợi ích bất ngờ — vẫn bắt lỗi TỐT HƠN:** cả hai đều misID 0%, nhưng bộ ngây thơ chỉ
   TP 80%: nó bị đánh lừa tại đúng các khoảnh khắc tay trái/tay phải tình cờ cùng độ cao
   (cả hai về vị trí nghỉ), nên bỏ sót lỗi. Tách pha chấm trên cả CỬA SỔ mẫu nên không bị
   lừa bởi một khung trùng hợp → **TP 100%**. Tách pha vừa ít báo giả vừa nhạy hơn.

## Kết luận cho luận văn

Trên chính mã đã triển khai, phân rã pha–biên độ (rigid-τ) **áp đảo** chỉ số đồng bộ tức
thời: dưới canon nó cắt báo động giả từ trung bình ~51% (đỉnh 80%) xuống **0%**, đồng thời
NÂNG độ nhạy bắt lỗi thật từ 80% lên **100%**, misID 0%. Nói cách khác, tách "trễ nhịp"
khỏi "sai động tác" không phải đánh đổi — nó cải thiện cả hai trục. Đây là bằng chứng định
lượng cho đóng góp tầng ĐÁNH GIÁ (§5.4): công cụ phản hồi tập luyện phân biệt được echo cố
ý với lỗi hình dáng, điều một bảng đồng bộ theo-khung không làm được.

**Giới hạn đã biết:** demo dùng độ trễ HẰNG τ trong biên ±0.5s; canon có độ trễ biến thiên
theo thời gian, hoặc trải pha vượt cửa sổ căn, cần warping đàn hồi đầy đủ (SRVF/DTW) — đã
ghi là hướng mở rộng. Clip tổng hợp tuần hoàn; mocap thật (Gate 0) sẽ kiểm chứng ngoài đời.
