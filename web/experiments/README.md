# Thực nghiệm tầng ĐÁNH GIÁ (web / TypeScript)

Khác thư mục `../../experiments/` (numpy, tầng perception hình học, chạy qua `run_all.py`):
các script ở đây chạy TRỰC TIẾP trên mã đã ship trong `../src/` để kiểm chứng tầng đánh
giá đồng bộ. Chuỗi phụ thuộc `sync.ts → clip.ts` là thuần (không three/react) nên chạy
headless được bằng esbuild + Node.

## Chạy

Trong thư mục `web/`:

```
npx esbuild experiments/phase-sync-validation.ts --bundle --platform=node --format=cjs --outfile=exp.cjs && node exp.cjs
```

(`exp.cjs` là file tạm, có thể xoá sau khi chạy.)

## Các script

- **`phase-sync-validation.ts`** — So bộ phát hiện "người múa sai" NGÂY THƠ (V34,
  `outlierIndex ∘ groupDeviationAt`) với TÁCH PHA (V35, `formOutlierIndex ∘ phaseAlignAt`)
  trên clip tổng hợp có sự thật nền đã biết. Kết luận: dưới canon, tách pha cắt báo động
  giả từ ~51% (đỉnh 80%) xuống 0% VÀ nâng độ nhạy bắt lỗi thật 80%→100%. Kết quả đầy đủ:
  [`../../experiments/ket-qua-tach-pha-vs-tuc-thoi.md`](../../experiments/ket-qua-tach-pha-vs-tuc-thoi.md).
