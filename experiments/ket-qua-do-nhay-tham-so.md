# V44 — Độ nhạy tham số & đường đặc trưng vận hành của metric đánh giá

**Script:** [`web/experiments/gate-sensitivity.ts`](../web/experiments/gate-sensitivity.ts)
**Chạy:** `cd web && npx esbuild experiments/gate-sensitivity.ts --bundle --platform=node --format=cjs --outfile=gs.cjs && node gs.cjs`

## Câu hỏi

Metric đánh giá "ai lạc động tác" (`formOutlierIndex` trong `web/src/sync.ts`) có **4 hằng số định sẵn**:
`SCALE=0.12`, `OUTLIER_SYNC_GATE=0.85`, `OUTLIER_FLOOR=0.05` (5cm), `OUTLIER_RATIO=1.3`.
Hội đồng sẽ hỏi thẳng: *"vì sao lại các con số này? có phải chọn bừa cho vừa số liệu?"*.
Vòng này **đo đường đặc trưng vận hành**: dời từng cổng, xem **ngưỡng phát hiện** (tính bằng độ lớn
sai tư thế vật lý) dịch ra sao, để biện minh điểm vận hành đã chọn — hoặc phát hiện nó tuỳ tiện.

## Thiết kế

- Nhóm N=5, tất cả nhảy clip nền A (vung tay phải). **Một người (số 0)** lệch **tư thế TĨNH** cánh
  tay trái một khoảng cố định `ε·40cm` suốt clip. Chọn sai **tĩnh** (không phải lệch thời gian) vì
  đó mới là "sai động tác" thật — τ-search của khung tách-pha **không** hấp thụ được (nó chỉ bù trễ
  nhịp), nên `formResidual` phản ánh đúng sai hình. ε∈{0,…,1.0}, quét 24 mốc thời gian.
- `phaseAlignAt` tính **một lần** mỗi (ε, t) → lấy `formSpread`, `formResidual[]`; rồi áp **mọi cấu
  hình cổng** lên cùng kết quả đó (rẻ). `formSync` tính lại `exp(-formSpread/SCALE)` cho SCALE bất kỳ
  vì `formResidual`/`formSpread` độc lập với SCALE. `classify()` tái hiện **đúng** logic 3 cổng của
  `formOutlierIndex`.
- **Neo vật lý** (bảng 0): ε → `formResidual` TB của người lạc, để mọi ngưỡng đọc được bằng cm.

| ε | 0.0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.7 | 1.0 |
|---|----|----|----|----|----|----|----|----|
| residual (cm) | 0.0 | 1.7 | 3.4 | 5.0 | 6.7 | 8.4 | 11.8 | 16.8 |

## Kết quả

### (I) SCALE và SYNC_GATE **không** độc lập — thực chất là MỘT núm

Cổng `exp(-formSpread/SCALE) ≥ G` ⟺ `formSpread ≤ SCALE·ln(1/G)`. Bộ phân loại chỉ phụ thuộc
**ngưỡng dẫn xuất** `formSpread* = SCALE·ln(1/G)`. Ba cặp (SCALE, G) **khác nhau** nhưng cùng
`formSpread*≈2.0cm` cho **đường phát hiện trùng khít** (và không tầm thường — cùng chuyển ở ε 0.5→0.7):

```
SCALE=0.12 G=0.846 (formSpread*=2.01cm):   0   0   0   0   0   0 100 100
SCALE=0.08 G=0.779 (formSpread*=2.00cm):   0   0   0   0   0   0 100 100
SCALE=0.20 G=0.905 (formSpread*=2.00cm):   0   0   0   0   0   0 100 100
ε:                                         0.0 0.1 0.2 0.3 0.4 0.5 0.7 1.0
```

⇒ **Bớt được 1 hằng số phải biện minh.** Không cần bào chữa riêng cho SCALE=0.12 và G=0.85; chỉ
cần bào chữa **một** đại lượng: ngưỡng spread ~2cm giữa các thành viên là "còn coi như đồng bộ".

### (II) Quét SYNC_GATE — ngưỡng phát hiện dịch đơn điệu, mặc định nằm giữa

```
GATE |  0.0 0.1 0.2 0.3 0.4 0.5 0.7 1.0   (ε)
0.75  |    0   0   0   0   0   0   0   0    câm cả với sai 16.8cm — BỎ SÓT
0.80  |    0   0   0   0   0   0   0 100
0.85 *|    0   0   0   0   0   0 100 100    ← mặc định
0.90  |    0   0   0   0 100 100 100 100
0.95  |    0   0   0 100 100 100 100 100    nêu từ ~5cm — dễ BÁO NHẦM biến thể
```

Mặc định **0.85** câm với ε≤0.5 (residual ≤8.4cm = lệch vừa/biến thể cá nhân), **nêu** từ ε≥0.7
(~12cm = sai tư thế thấy rõ). Cổng thấp hơn (0.75) bỏ sót cả sai lớn; cổng cao hơn (0.95) bắt đầu
nêu từ ~5cm, dễ vu oan dao động bình thường. **0.85 là điểm cân bằng, không tuỳ tiện.**

### (III) Quét FLOOR — với 1 người lạc/nhóm 5, cổng SYNC bó TRƯỚC; FLOOR là chốt an toàn

```
FLOOR|  0.0 0.1 0.2 0.3 0.4 0.5 0.7 1.0   (ε)
   2  |    0   0   0   0   0   0 100 100
   5 *|    0   0   0   0   0   0 100 100    ← mặc định (trùng 2cm & 8cm)
   8  |    0   0   0   0   0   0 100 100
  12  |    0   0   0   0   0   0   0 100    chỉ FLOOR rất cao mới dời ngưỡng
```

FLOOR 2/5/8cm cho **cùng** đường — ở nhóm 5 người với 1 kẻ lạc, cổng SYNC (spread ~2cm) chạm ngưỡng
**trước** cổng FLOOR tuyệt đối. Chỉ khi nâng FLOOR tới 12cm nó mới dời (chặn ε=0.7 vì worst≈11.8<12cm).
⇒ **FLOOR=5cm là chốt chặn an toàn tuyệt đối** — đảm bảo sai <5cm **không bao giờ** bị nêu dù cổng
SYNC có bị nới, chứ không phải ràng buộc chính trong chế độ vận hành thường.

## Kết luận

Bốn hằng số "định sẵn" **không** tuỳ tiện và **không** phải 4 bậc tự do độc lập:

1. **SCALE & SYNC_GATE gộp thành 1**: chỉ ngưỡng `formSpread* = SCALE·ln(1/G) ≈ 2cm` có ý nghĩa
   phân loại. Đây là con số DUY NHẤT của cặp này cần biện minh ("lệch spread ~2cm giữa vũ công là
   ngưỡng còn đồng bộ").
2. **SYNC_GATE=0.85** là điểm cân bằng đo được giữa bỏ sót (cổng thấp) và vu oan (cổng cao); nêu sai
   tư thế ≥~12cm, bỏ qua lệch ≤~8cm.
3. **FLOOR=5cm** là chốt chặn an toàn tuyệt đối, hiếm khi là ràng buộc bó trong chế độ thường —
   nó bảo đảm sàn "không bao giờ nêu lỗi nhỏ hơn 5cm".
4. **RATIO=1.3** (không quét ở đây vì cần kịch bản đa-người-lạc) đã được khảo ở V41
   ([điểm sụp](ket-qua-diem-sup-do.md)): là ngưỡng "nổi trội hơn số đông" để tách 1 kẻ lạc khỏi nền.

Khi hội đồng hỏi "vì sao các số này", câu trả lời có bằng chứng: **chúng quy về MỘT ngưỡng vật lý
~2cm spread + MỘT chốt an toàn 5cm**, và điểm vận hành mặc định rơi đúng khoảng "bỏ qua lệch vừa,
bắt sai tư thế thấy rõ" trên đường đặc trưng đo được — không phải khớp bừa cho một bộ số liệu.

> Giới hạn: kịch bản tổng hợp (1 người lạc, sai tĩnh, nhóm 5). Trên mocap thật sẽ có nhiễu detector
> và nhiều kiểu lạc; đường đặc trưng có thể dịch, nhưng **cấu trúc** (SCALE↔GATE gộp 1, FLOOR là chốt)
> là tính chất đại số của công thức, không phụ thuộc dữ liệu. Xem Gate-0 mocap thật (cần GPU lab).
