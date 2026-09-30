# V37 (nguyên mẫu) — Warping AFFINE tách trôi tempo khỏi sai hình dáng?

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), nguyên mẫu — đo TRƯỚC khi quyết định ship.
> Kịch bản: [`web/experiments/affine-warp.ts`](../web/experiments/affine-warp.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/affine-warp.ts --bundle --platform=node --format=cjs --outfile=aff.cjs && node aff.cjs`

## Vì sao đo

[Giới hạn Phần B](ket-qua-gioi-han-rigid-tau.md) cho thấy rigid-τ (chỉ DỊCH) báo giả từ
trôi tempo ≥15%/s: một độ trễ HẰNG không căn nổi độ trễ BIẾN THIÊN trong cửa sổ. Nấc tiếp
theo trên thang warping FDA: map thời gian **AFFINE** `m(w)=t*+ρ(w−t*)+τ` — thêm bậc tự do
NHỊP ρ ngoài DỊCH τ. Trôi tempo (1+g)× có nghiệm chính xác ρ*=1/(1+g) nên kỳ vọng residual→0.

**Rủi ro phải kiểm chứng trước khi ship:** over-warping — bậc tự do nhịp có thể "giải thích
mất" một động tác SAI, kéo residual lỗi thật xuống → giấu lỗi, hạ độ nhạy. Tiêu chí ship:
affine phải hạ residual TRÔI TEMPO mà GIỮ residual LỖI HÌNH DÁNG.

## Kết quả

Residual cực tiểu của cặp (ref A tempo-1 vs mover), cm, trung bình 5 playhead. CHỈ-DỊCH =
rigid-τ đang ship; AFFINE = thêm ρ∈[0.7,1.4].

| kịch bản mover | CHỈ-DỊCH | AFFINE | Δ |
|----------------|:--------:|:------:|:--:|
| echo trễ 0.30s (canon)      |  0.00 |  0.00 | — |
| trôi tempo g=10%            |  1.04 |  0.46 | **−56%** |
| trôi tempo g=15%            |  1.52 |  0.45 | **−70%** |
| trôi tempo g=20%            |  2.05 |  0.42 | **−80%** |
| trôi tempo g=30%            |  3.02 |  0.46 | **−85%** |
| LỖI hình dáng (múa chi B)   | 15.16 | 14.29 | −6% |
| LỖI biên độ (A×0.4)         |  6.57 |  6.43 | −2% |
| LỖI biên độ (A×0.7)         |  3.28 |  3.13 | −5% |

## Đọc kết quả

- **Affine DẬP trôi tempo:** mọi mức g, residual affine sụt về sàn ~0.45cm (−56…−85%) và
  **PHẲNG theo g** — đúng như lý thuyết ρ*=1/(1+g). Đây là phần rigid-τ để lọt.
- **Affine GIỮ lỗi thật:** cả ba loại lỗi (thay chi, sai biên độ nặng/nhẹ) chỉ bị gọt 2–6%
  — warp thời gian về bản chất không sửa được sai KHÔNG-GIAN (khác khớp, sai biên độ).
- **Phép thử over-warping quyết định:** trôi tempo g=20% (2.05cm) và lỗi biên độ nhẹ A×0.7
  (3.28cm) GẦN nhau dưới chỉ-dịch. Dưới affine: tempo → 0.42cm (dập), biên độ → 3.13cm (giữ).
  ⇒ affine **PHÂN BIỆT** timing với form, KHÔNG hạ đều mọi thứ. Không có dấu hiệu over-warp.

Tỉ lệ tách (residual lỗi-thật / residual trôi-tempo) cải thiện rõ: chỉ-dịch ~5× (15.2/3.0),
affine ~31× (14.3/0.46).

## Kết luận & quyết định

**Verdict: ĐÁNG SHIP.** Affine warp đóng đúng giới hạn Phần B (trôi tempo) mà không hi sinh
độ nhạy lỗi thật, trên cả ba loại lỗi kiểm chứng. Bước sản xuất tiếp theo (V37): mở rộng
`alignPair` sang tìm 2 chiều τ×ρ **thô→tinh** (giữ chi phí), tái kiểm trên toàn bộ gộp-cặp
5 người + không hồi quy echo/lỗi-thật + chi phí.

*Giới hạn trung thực của nguyên mẫu:* lỗi hình dáng ở đây là thay-chi và sai-biên-độ (sai
KHÔNG-GIAN thuần). Lỗi vừa-lệch-thời-gian-vừa-lệch-hình-dáng (ví dụ vào sai nhịp RỒI múa sai)
chưa tách riêng ở nguyên mẫu này; sàn residual affine ~0.45cm là lượng tử hoá lưới (bước ρ
0.02, τ 0.05), không phải 0 tuyệt đối. Warp affine vẫn là XẤP XỈ tuyến tính của γ(t) — trôi
tempo PHI TUYẾN (gia/giảm tốc trong cửa sổ) cần warping bậc cao hơn (SRVF/DTW đầy đủ).
