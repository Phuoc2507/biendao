# V50 — Dựng bền (robust) vs cổng held-out: hai phòng thủ BỔ TÚC

*Sinh tự động bởi `experiments/phong_thu_bo_tuc.py` — thuần numpy, chạy CPU.*

## Câu hỏi
V49 cố ý dùng `robust=False` để phơi cơ chế. Hội đồng sẽ hỏi: **tam giác hoá BỀN (cổng tái
chiếu 20px trong `fuse_multiview`) đã loại view bias rồi, cổng held-out V49 có dư thừa?**
V50 đo trực tiếp.

## Cơ chế robust (đọc từ `triangulate_robust`)
Mỗi khung/khớp: dựng từ mọi view, tái chiếu; nếu view nào lệch **> 20px** thì (≥3 view) **loại
dần view tệ nhất** rồi dựng lại; đúng 2 view thì trả NaN để nội suy. ⇒ Nó bắt **outlier THÔ**,
nhưng quyết định theo **ngưỡng tái chiếu** nên chỉ loại bias khi bias đủ lớn để **vượt ngưỡng**.

## Kết quả (số đo được)

### I. Bias HỆ THỐNG hằng số — robust chỉ cứu khi bias ĐỦ LỚN
| bias (px) | dev3d plain (cm) | dev3d robust (cm) | reproj_held plain (px) | reproj_held robust (px) | |
|---:|---:|---:|---:|---:|:--|
| 5 | 1.85 | 1.81 | 4.26 | 4.25 | `##..........................` |
| 10 | 3.56 | 3.62 | 7.45 | 7.52 | `###.........................` |
| 20 | 7.09 | 7.12 | 14.23 | 14.14 | `#######.....................` |
| 30 | 10.70 | 10.67 | 21.23 | 21.12 | `##########..................` |
| 45 | 16.03 | 18.16 | 31.75 | 29.78 | `################............` |
| 60 | 21.39 | 24.57 | 42.05 | 37.32 | `#####################.......` |
| 80 | 28.66 | 41.97 | 55.71 | 82.85 | `############################` |

- **Dải bias nhỏ** (b≤~30px, robust GIỮ CẢ 3 view): robust dev3d ≈ plain — sai số tái chiếu ở
  view bias **chưa** vượt 20px nên **không bị loại**, 3D vẫn hỏng. **Đây đúng điểm mù V48**: bias
  dai dẳng vừa phải KHÔNG phải outlier thô, robust bất lực. Cổng **held-out V49** vẫn báo reproj
  cao (4.3px ở b≤10) ⇒ **V49 KHÔNG dư thừa, nó phủ đúng dải robust bỏ sót**.
- **Dải bias lớn** (b≥45px, robust bắt đầu loại view): **dự đoán "robust phục hồi" BỊ SỐ
  LIỆU BÁC.** dev3d robust **TỆ HƠN** plain (b=80px: 28.7→42.0cm).
  Cơ chế (đo bằng `_drop_profile`, tất định): ở b=80px robust loại **view SẠCH
  đối-góc 40/45 khung**, loại view BIAS chỉ **5/45**. Vì bias kéo nghiệm
  compromise về phía nó, view sạch xa nhất (đối-góc) thành kẻ "lệch nhất" → bị loại → còn lại
  view bias + 1 view sạch = **trọng số bias tăng từ 1/3 lên 1/2** ⇒ **khuếch đại hỏng**. ⇒ Robust
  không chỉ **mù** với bias hệ thống mà có thể **HẠI** — càng khẳng định phải dùng chiều dữ liệu
  khác (held-out), không phải lọc mạnh hơn cùng chiều.

### II. Outlier THÔ thoáng qua (20% khung) — địa hạt sở trường của robust
| outlier (px) | dev3d plain (cm) | dev3d robust (cm) | |
|---:|---:|---:|:--|
| 30 | 1.67 | 1.78 | `######......................` |
| 60 | 3.19 | 2.35 | `############................` |
| 90 | 4.55 | 1.99 | `##################..........` |
| 130 | 7.20 | 3.12 | `############################` |

Outlier thô **thoáng qua** (mỗi khung độc lập): robust kéo dev3d xuống **gần sàn** ở MỌI biên
độ — vì mỗi khung loại view lỗi **riêng**, khung sạch không bị ảnh hưởng. Tương phản sắc với
bias hệ thống dải nhỏ (bảng I) mà robust **không** cứu.

## Kết luận: held-out V49 KHÔNG dư thừa với robust — robust còn HẠI ở bias lớn
| Nhiễu ở 1 view dựng | robust? | held-out V49 bắt? | Ai phủ |
|---|:---:|:---:|---|
| Outlier THÔ thoáng qua (mọi biên độ) | **Cứu** (loại theo khung) | (không cần) | robust |
| Bias hệ thống **nhỏ** (giữ cả 3 view) | **Mù** (không loại) | **Có** (reproj cao) | **held-out V49** |
| Bias hệ thống **lớn** (chớm loại view) | **HẠI** (loại nhầm view sạch → khuếch đại) | **Có** (reproj vẫn ≫τ) | **held-out V49** |

**Held-out V49 phủ TOÀN dải bias hệ thống** (reproj cao ở cả nhỏ lẫn lớn, robust-bất-biến); robust
chỉ giỏi outlier-thô-thoáng-qua và **phản tác dụng** với bias lớn. Hai cái **không dư thừa**: khác
địa hạt, và held-out là cái duy nhất phủ đúng điểm mù V48. Sâu hơn, đây là **cùng một lằn ranh cấu
trúc** xuyên đề tài — NGẪU-NHIÊN/THOÁNG-QUA bị trung-bình-hoá/loại-bỏ dễ (V47 iid ở tầng đánh giá,
robust outlier-thô ở tầng dựng), còn HỆ-THỐNG/DAI-DẲNG mới là kẻ khó (V48 điểm mù đánh giá, V50 khe
bias ở tầng dựng, nơi lọc-mạnh-hơn còn **làm tệ đi**) — chỉ chặn được bằng **chiều dữ liệu thêm**
(đa-view held-out), không bằng lọc mạnh hơn trong cùng một chiều. Đó là luận điểm kiến trúc lặp lại.

## Giới hạn (trung thực)
- Ngưỡng 20px + điểm chớm-loại b≈45px **riêng cấu hình này** (góc máy, khoảng cách,
  khớp). Cơ chế (robust theo ngưỡng ⇒ mù bias-nhỏ, loại-nhầm-view-sạch ở bias-lớn) tổng quát cho
  mọi cấu hình mà bias kéo nghiệm compromise lệch khỏi các view sạch.
- Chỉ 3 view dựng (loại 1 còn 2 = giới hạn dưới của robust). Nhiều view dựng hơn có thể đổi hành
  vi loại-nhầm; chưa quét số-view — để ngỏ.
- Vẫn hình học tổng hợp; số trên detector thật 2–3 máy chờ Gate-0 (GPU lab).
