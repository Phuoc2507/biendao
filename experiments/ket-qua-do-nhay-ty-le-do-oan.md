# V46 — Độ nhạy `OUTLIER_RATIO` & chống "đổ oan": trần thông tin 50% hiện nguyên hình

**Script:** [`web/experiments/ratio-scapegoat.ts`](../web/experiments/ratio-scapegoat.ts)
**Chạy:** `cd web && npx esbuild experiments/ratio-scapegoat.ts --bundle --platform=node --format=cjs --outfile=rs.cjs && node rs.cjs`

## Câu hỏi

V44 ([độ nhạy tham số](ket-qua-do-nhay-tham-so.md)) đã quét 3/4 hằng số của bộ chấm nhưng **chừa
`OUTLIER_RATIO=1.3`** — vì RATIO chỉ **ràng buộc khi có NHIỀU người cùng lệch**, mà cảnh 1-người-lạc
của V44 không kích hoạt nó. Cổng RATIO: chỉ nêu tên người lệch nhất nếu
`worstV ≥ RATIO · (lệch TB của người còn lại)`. Vì `worst` là **max** nên luôn ≥ `meanOthers`;
`RATIO=1.0` ⇒ nêu ngay khi có bất kỳ chênh (đổ oan tối đa), `RATIO→∞` ⇒ không bao giờ nêu. 1.3 nằm
giữa. Hội đồng sẽ hỏi: **1.3 có biện minh được không, hay chỉ là số chọn cho êm?**

Vòng này đo đúng cảnh RATIO có ý nghĩa: **nhiều vũ công cùng làm SAI GIỐNG HỆT nhau** — có nên (và
có thể) gọi tên MỘT người trong số họ không?

## Thiết kế

- Nhóm N=5. Sai = dời **tư thế TĨNH** cánh tay trái `ε·40cm` (như V44 — τ-search không hấp thụ). Cho
  `k` người (chỉ số 0..k-1) cùng lệch **giống hệt** `M=0.7` (~11.8cm nếu đứng lẻ), N−k người đúng.
  Cùng một sai, cùng hướng, cùng độ ⇒ ca "đổ oan" **gắt nhất**: không có cơ sở nào để chọn ai.
- `phaseAlignAt` (gộp pha bằng **trung vị** tới người khác) tính `formResidual[]`; `classify()` tái
  hiện đúng `formOutlierIndex`, tham số hoá RATIO. Quét RATIO∈{1.0, 1.15, 1.3, 1.5, 2.0}, 24 mốc t.
- Đo mỗi (k, RATIO): `any`=%khung **nêu ai đó**; trong đó `dev`=%nêu trúng **người-có-lỗi**,
  `inno`=%nêu trúng **người-đúng** (= đổ oan).

## Kết quả

### (I) Ba chế độ TÁCH BẠCH theo số người cùng lệch

```
k(lệch) |      1.00          1.15         1.30*          1.50          2.00
        | any dev inno | any dev inno | any dev inno | any dev inno | any dev inno
  k=1   | 100 100   0  | 100 100   0  | 100 100   0  | 100 100   0  | 100 100   0
  k=2   | 100 100   0  | 100 100   0  | 100 100   0  | 100 100   0  |   0   0   0
  k=3   | 100   0 100  | 100   0 100  | 100   0 100  | 100   0 100  |   0   0   0
  k=4   | 100   0 100  | 100   0 100  | 100   0 100  | 100   0 100  | 100   0 100
```

- **k=1 (1 thủ phạm):** mọi RATIO nêu **đúng** người lỗi (`dev=100`). RATIO **không** ăn mòn độ nhạy lỗi đơn.
- **k=2 (thiểu số cùng lỗi):** nêu 1 trong 2 **người-có-lỗi** (`inno=0`) — không vu oan người đúng, chỉ
  "không nêu hết". `RATIO=2.0` mới im. Chấp nhận được: người bị tô sáng **thật sự** sai.
- **k≥3 (ĐA SỐ cùng lỗi):** nêu trúng **NGƯỜI ĐÚNG** (`inno=100`). `RATIO=1.3` **không** cứu được; k=4
  thì **mọi** RATIO đều vu oan.

### (II) Vì sao k≥3 đổi nạn nhân — cấu trúc `formResidual` bị TRUNG VỊ **đảo**

`formResidual` TB mỗi vũ công (cm); `L`=người lỗi, `Đ`=người đúng:

```
  k=1 | L 11.8  Đ 0.0  Đ 0.0  Đ 0.0  Đ 0.0   → worst = phe-lỗi
  k=2 | L 11.8  L 11.8 Đ 5.9  Đ 5.9  Đ 5.9   → worst = phe-lỗi
  k=3 | L  5.9  L 5.9  L 5.9  Đ 11.8 Đ 11.8  → worst = phe-ĐÚNG  (ĐẢO!)
  k=4 | L  0.0  L 0.0  L 0.0  L 0.0  Đ 11.8  → worst = phe-ĐÚNG
```

Naïve tưởng residual ~ độ lệch (phe-lệch luôn cao). **Đo phủ định** điều đó: vì gộp bằng **trung vị
tới người khác**, khi phe-lệch thành **đa số** thì "đồng thuận" ngả theo họ ⇒ **thiểu số đúng** hoá
thành kẻ "lạc". Chuyển pha **đúng tại k=3** (3/5 = 60% > 50%). k=2 và k=3 **đối xứng gương** (5.9↔11.8).

> Một dự đoán giải-tích ngây thơ ("nêu ⟺ `(N−1)/(k−1) ≥ RATIO`") **chỉ đúng** khi residual đơn điệu
> theo độ lệch — **sai từ k=3** do đảo trung vị. Đây chính là lý do phải **ĐO**, không chỉ suy luận.

### (III) Lề an toàn cho lỗi-đơn — đánh đổi của RATIO

d0 sai rõ `M=0.7`; d1,d2 lệch **nhẹ** `αM` (nhiễu-nền của đám); d3,d4 đúng. %khung nêu **đúng d0**:

```
α\RATIO | 1.00 1.15 1.30* 1.50 2.00
  0.0   |  100  100  100  100  100
  0.2   |  100  100  100  100  100
  0.4   |  100  100  100  100  100
  0.6   |  100  100    0    0    0
  0.8   |    0    0    0    0    0
```

`RATIO=1.3` giữ d0 bị nêu tới khi đám nhiễu-nền lên ~0.4·M, rồi **im ở 0.6·M** — **hỏng an toàn**
(thà câm còn hơn vu oan). RATIO cao hơn thu hẹp lề này (1.3 còn bắt ở α=0.4; 1.0 trụ tới 0.6). Đây là
đánh đổi **nhạy lỗi-đơn ↔ chống đổ oan**.

## Kết luận

`OUTLIER_RATIO=1.3` là núm điều khiển ranh giới **im ↔ nêu** khi số người cùng lệch tăng, và nó
**biện minh được — trong đúng phạm vi của nó**:

1. **Giữ nguyên độ nhạy lỗi-đơn** (k=1 mọi RATIO đều bắt) và **hỏng an toàn** khi đám có nhiễu-nền
   (III) — đúng tinh thần "thà câm còn hơn vu oan".
2. Với **thiểu số cùng lỗi** (k=2), nó nêu một người **thật sự sai** — không hoàn hảo (không nêu hết)
   nhưng không vu oan.
3. Với **đa số cùng lỗi** (k≥3), nó nêu trúng **người đúng**. **Không núm nào** trong `sync.ts` sửa
   được: đây **chính là trần thông tin 50%** của V41 ([điểm sụp](ket-qua-diem-sup-do.md)) hiện nguyên
   hình — chấm **nhóm-tương-đối không nhãn** thì khi ≥50% cùng sai, "đồng thuận" sai theo.

⇒ Lối ra **duy nhất** cho ca đa-số-lệch là thước **TUYỆT ĐỐI theo nhãn tham chiếu** (V42,
[tham chiếu tuyệt đối](ket-qua-tham-chieu-tuyet-doi.md)) — dùng ở DAW clip-gán & Gate-0 camera
held-out. RATIO=1.3 là điểm vận hành hợp lý cho giả định demonstrator "**lỗi hiếm, 1 người**"; ca
đa-số-lệch **không thuộc thẩm quyền** của núm này mà thuộc cặp-thước-bù-nhau.

Vòng này khép nốt câu "vì sao các hằng số này?" của V44: hằng số thứ tư (RATIO) cũng có đường đặc
trưng đo được và một ranh giới thẩm quyền rõ ràng — **không phải số chọn bừa**.

> Giới hạn: tổng hợp, sai tĩnh giống hệt, nhóm 5, headless/CPU. Mocap thật có nhiễu detector và lạc
> đa kiểu; **giá trị** ngưỡng có thể dịch, nhưng **cấu trúc** (3 chế độ theo k; đảo trung vị tại 50%;
> đánh đổi nhạy↔đổ-oan) là hệ quả đại số của công thức, không phụ thuộc dữ liệu. Xem Gate-0 (cần GPU lab).
