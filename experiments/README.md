# Tầng nhận thức — chỉ mục thực nghiệm & checklist Cổng 0

Thư mục này chứa **toàn bộ thực nghiệm tổng hợp (synthetic)** làm nền cho §5.4 của
luận văn: đánh giá xem pipeline mocap đa-view (2–3 điện thoại) đo được gì, khử nhiễu
tới đâu, **đo chất lượng thế nào khi không có 3D ground-truth**, và — cung mới nhất —
**tách/sửa lỗi lệch HỆ THỐNG của detector/calib** mà các thước thông thường bỏ sót.
Mọi thực nghiệm chỉ dùng `numpy` thuần (CPU, không GPU/torch/opencv) và tự sinh file
`ket-qua-*.md` từ số đo — nên số liệu trung thực theo cấu trúc.

## Cách chạy (tái lập)

```bash
# 1) Toàn bộ unit test (đáp án biết trước cho từng metric hình học/đánh giá)
.venv/Scripts/python -m pytest -q

# 2) Chạy lại TẤT CẢ thực nghiệm, tái sinh mọi ket-qua-*.md + báo cáo tái lập
.venv/Scripts/python experiments/run_all.py
```

`run_all.py` chạy lần lượt **18 script**, xác nhận mỗi script thoát mã 0 **và** ghi mới
đúng file kết quả của nó, rồi ghi `bao-cao-tai-lap.md`. Lần chạy gần nhất: **18/18
tái lập, ~604s** trên CPU (hai script nặng nhất là kiểm-định Monte-Carlo V55 ~149s và
quét hình-học FRONTIER V56 ~152s). Thứ tự chạy = trình tự lập luận trong §5.4.

## Bản đồ thực nghiệm → vai trò Cổng 0

Bốn nhóm, theo đúng trình tự lập luận: **(I) hình học đặt máy** → **(II) khử nhiễu**
→ **(III) đo chất lượng không GT** → **(IV) tách & sửa lỗi lệch hệ thống đa-view**.

### I. Hình học đặt máy — "đặt 2 máy ở đâu, sai được tới đâu"

| Script | File kết quả | Kết luận chính (đo được) |
|:--|:--|:--|
| `synthetic_2view.py` | `ket-qua-2view-tong-hop.md` | Sai số tam giác hoá theo góc lệch / số máy / mức nhiễu / che khuất. Góc lệch quá nhỏ (đường đáy ngắn) → sai số chiều sâu bùng nổ. |
| `ban_do_dat_may.py` | `ket-qua-ban-do-dat-may.md` | Bản đồ 2D cặp góc phương vị (máy A, máy B) → **vùng đặt an toàn** cho người dùng nghiệp dư. |
| `do_nhay_sync_calib.py` | `ket-qua-do-nhay-sync-calib.md` | Nền 11.3mm (đồng bộ hoàn hảo). Lệch **nửa khung @30fps** (16.7ms) → 12.7mm; **trọn 1 khung** (33ms) → 15.9mm. **Ngưỡng: đồng bộ phải < ~nửa khung.** |

### II. Khử nhiễu — "mỗi lớp đánh một trục lỗi khác nhau"

| Script | File kết quả | Kết luận chính (đo được) |
|:--|:--|:--|
| `robust_outliers.py` | `ket-qua-robust-outliers.md` | Tam giác hoá **bền** hạ lỗi thô: ~27mm→15mm (−45%); ở 10% outlier 85mm→32mm (−62%). |
| `rang_buoc_xuong.py` | `ket-qua-rang-buoc-xuong.md` | Ràng buộc **độ dài xương** (PBD) ép cứng xương, giữ đối xứng mà vẫn bám quan sát (std xương → 0). |
| `trong_so_tin_cay.py` | `ket-qua-trong-so-tin-cay.md` | Trọng số **nghịch-phương-sai** theo confidence khử nhiễu mềm — **chỉ có ích khi** confidence dự báo đúng lỗi (ρ cao); ρ=0 (confidence ngẫu nhiên) → **tệ hơn** DLT thường. |
| `hieu_chuan_tin_cay.py` | `ket-qua-hieu-chuan-tin-cay.md` | Hiệu chuẩn confidence→σ²: điều kiện định lượng để trọng số thực sự giảm sai số (đóng việc mở của Vòng 10). |
| `tong_hop_khu_nhieu.py` | `ket-qua-tong-hop-khu-nhieu.md` | **Capstone**: cộng dồn 3 lớp trên nhiễu hỗn hợp: 38.89mm → **22.46mm (−42%)**, std xương 38.66→0.00mm. Cộng dồn được vì mỗi lớp đánh một trục lỗi. |

### III. Đo chất lượng không ground-truth — "chấm điểm mocap trên video múa thật"

| Script | File kết quả | Kết luận chính (đo được) |
|:--|:--|:--|
| `danh_gia_khong_gt.py` | `ket-qua-danh-gia-khong-gt.md` | Sai số tái chiếu camera **held-out** bám sát MPJPE thật (r≈0.99). **Phải held-out**, không dùng in-sample: in-sample bị chính quan sát nhiễu "làm nhiễm", không phát hiện được robust đã sửa. |
| `danh_gia_loco.py` | `ket-qua-danh-gia-loco.md` | **LOCO** (bỏ-một-máy luân phiên) cho ước lượng ổn định hơn (CV 0.011 vs held-out đơn 0.014–0.021, chặt ~40%); **LOCO-std ×43** khi có 1 máy hỏng → chẩn đoán QA không cần GT. Cần **≥3 máy**. |

### IV. Tách & sửa lỗi lệch HỆ THỐNG đa-view — "gỡ oan cho vũ công khi detector/calib lệch"

Cung V49–V56 khép **điểm mù duy nhất** của tầng đánh giá (nêu ở V48): lỗi detector
**lệch hệ thống một nguồn** (một khớp hoặc một camera lệch nhất quán) ở tầng toạ-độ-3D
**bất khả phân** với vũ công múa sai — cùng độ lệch 3D, không núm đánh giá nào tách được.
Lời giải không nằm ở lọc mạnh hơn cùng một chiều, mà ở **chiều dữ liệu thêm** (camera
giám khảo held-out) và **cộng dồn bằng chứng ở đúng granularity nguồn**.

| Script | File kết quả | Kết luận chính (đo được) |
|:--|:--|:--|
| `phan_biet_lech_he_thong.py` | `ket-qua-phan-biet-lech.md` | **V49**: tái chiếu camera **held-out** tách "detector lệch" khỏi "múa sai". Dời 3D THẬT 20cm → reproj held-out vẫn ~2.7px (mọi máy đồng thuận); BIAS 1-view cùng độ lệch 3D → reproj vọt (tỉ số BIAS/THẬT **2.3×** ở 3cm → **8.7×** ở 12cm). Cổng τ=2.80px bắt **100% (6/6)** ca bias đủ nêu. Cần **≥3 máy** (giám khảo sạch) — 1-cam không có chiều này. |
| `phong_thu_bo_tuc.py` | `ket-qua-phong-thu-bo-tuc.md` | **V50**: robust vs held-out **bổ túc, không dư thừa**. Robust **mù** bias nhỏ (b≤30px chưa vượt ngưỡng 20px, giữ cả 3 view), **HẠI** ở bias lớn (b=80px 28.7→42.0cm — loại nhầm view sạch đối-góc 40/45 khung), chỉ **giỏi** outlier thô thoáng qua (b=130px 7.2→3.1cm). Held-out V49 phủ **toàn** dải bias hệ thống. |
| `sua_bang_held_out.py` | `ket-qua-sua-bang-held-out.md` | **V51**: **SỬA** bằng loại-từng-view (**LOVO**) cộng dồn per-CAMERA qua cả clip — đóng đúng khe bias-vừa robust để hở. 4 view đa số sạch: b=10px 2.55→**0.65cm** (=oracle), b=80px 20.17→**0.62cm**; nêu đúng thủ phạm ≥90% từ b≈10px, 100% bias lớn. **Giá** b=0 +0.18cm ⇒ chỉ bật khi V49 đã báo nghi. Cần **≥3 view + đa số sạch**; 2-máy KHÔNG dùng được. |
| `tran_dong_thuan.py` | `ket-qua-tran-dong-thuan.md` | **V52**: **TRẦN** chọn-view-đồng-thuận = `floor((V-1)/2)` (=1 cho V=4). LOVO-ngây-thơ **phụ thuộc hướng** (DIFF k=1 thất bại: dev 51.46 vs oracle 0.61cm); LOVO-**bền** khử confound → trần độc-lập-hướng (k≤1 cả SAME/DIFF), **gãy ở k=2** (dev ~30–39cm vs ~0.85cm). Phá trần cần **tham chiếu ngoài đồng thuận**. |
| `moc_tuyet_doi.py` | `ket-qua-moc-tuyet-doi.md` | **V53**: **mốc tuyệt-đối** (bảng calib) phá trần V52 **CHỈ** cho bias **toàn-camera** (k≤2, k=2 dev 0.87=oracle nơi LOVO gãy 30.54cm), **MÙ** bias **1-khớp** (k≤0; k=1 dev 15.02cm). Hai thước **bù nhau theo nguồn**: anchor thấy sai-calib, đồng-thuận thấy sai-detector. 2-máy KHÔNG tự chữa bias-detector-1-khớp. |
| `bias_tron.py` | `ket-qua-bias-tron.md` | **V54**: bias **TRỘN** hai nguồn → giao thức **2-tầng** (anchor TRƯỚC → LOVO trên phần dư) compose **CÓ ĐIỀU KIỆN**: envelope `V−k_cam≥4` VÀ `V−k_cam−k_joint≥2`. Thứ tự **bất-hoán** (ô V6 cam{0,1}+joint{2}: LOVO-đơn 0% dev 30.55 → TRỘN 100% dev 0.67); ngoài envelope ghép ngây thơ còn **HẠI** (V4 sub=3: TRỘN dev 39.93). Hệ quả: **2-máy KHÔNG thoả envelope**. |
| `kiem_dinh_envelope.py` | `ket-qua-kiem-dinh-envelope.md` | **V55**: kiểm định Monte-Carlo envelope V54 (76 cấu hình, **gồm** confound "view nào bias"). Envelope chỉ đúng **bậc một 62/76=81.6%**; ba lớp lệch có lý do (quá ngặt ở k_joint=0; confound-split 14 cấu hình; trần joint-bias THỰC là **k_joint≤1**, không phải `floor((V-1)/2)` ngoại suy). Luật tinh chỉnh khớp 56/56 vùng đếm-đoán-được (mô tả post-hoc, **không** chéo-kiểm — ghi rõ để không overclaim). |
| `hinh_hoc_frontier.py` | `ket-qua-hinh-hoc-frontier.md` | **V56**: phần dư FRONTIER (k_joint≥2) có tách được bằng **một** scalar hình-học rig không? — **Không.** Tính-đoán-được pooled là **ảo ảnh confound đếm** (Simpson: `trai_view_sach` pooled 0.818 → conditional **0.227**; `nclean` pooled 0.929 nhưng hằng trong-ô). Không scalar đơn nào sống sót điều-kiện-hoá ⇒ FRONTIER là hình-học **đa-yếu-tố**, chỉ giải bằng chạy estimator thật hoặc **rời** FRONTIER (thêm view/nhãn). Củng cố V55. |

**Motif kiến trúc lặp lại** (điểm nhấn cho hội đồng): lỗi NGẪU-NHIÊN/THOÁNG-QUA bị
trung-bình-hoá/loại-bỏ dễ (nhiễu iid, outlier thô); lỗi HỆ-THỐNG/DAI-DẲNG một-nguồn
mới là kẻ khó — và ở đó **lọc mạnh hơn cùng chiều còn phản tác dụng** (V50). Chỉ chặn
được bằng **chiều dữ liệu thêm** (held-out V49) hoặc **cộng dồn bằng chứng ở đúng
granularity nguồn** (LOVO per-camera V51, mốc tuyệt-đối V53). Đây cũng là cùng lằn ranh
ở tầng đánh giá: gộp-nhịp V32 & thước tuyệt-đối-có-nhãn V42 thắng chấm nhóm-tương-đối V41.

## Checklist đo Cổng 0 (trên dữ liệu THẬT, không GT)

Khi có video múa 2–3 máy thật, chấm chất lượng mocap **không cần 3D ground-truth**
bằng đúng các thước đo đã kiểm định ở nhóm III + IV:

1. **Bố trí ≥3 máy** (để LOCO/held-out/LOVO chạy được; 2 máy chỉ dựng được, không tự
   đánh giá chéo và KHÔNG tự chữa được bias-detector-1-khớp — xem giới hạn V51–V54).
2. **Đồng bộ < nửa khung** giữa các máy (vỗ tay/clap-board; xem ngưỡng ở `do-nhay-sync-calib`).
3. **Sai số tái chiếu LOCO** (`reprojection_error_loco` trong `choreo/eval/metrics.py`):
   báo cáo **mean** (điểm chất lượng) và **std** (cờ QA — std bật cao ⇒ 1 máy/lịch xấu).
4. **Cổng held-out (V49)** ĐẶT TRƯỚC phán quyết đánh giá: khớp có reproj held-out vượt
   τ (trần họ THẬT) là **detector/calib lệch**, không phải vũ công sai → **gỡ oan**, đừng
   tính vào điểm "múa sai".
5. **Khi cờ QA bật** (có view nghi vấn): chạy **LOVO** (`sua_bang_held_out`) loại-từng-view
   để **sửa** 3D và **nêu tên** camera thủ phạm — chỉ bật có điều kiện (V49 đã báo), vì
   LOVO có giá +0.18cm khi rig vốn sạch. Cần ≥3 view + đa số sạch.
6. **Nếu có bảng calib (ChArUco)**: dùng **mốc tuyệt-đối** (V53) bắt sai-calib/extrinsic
   kể cả khi ≥2 máy lệch — bù cho LOVO (chịu trần đồng-thuận `floor((V-1)/2)`). Bias TRỘN
   thì chạy **anchor TRƯỚC → LOVO** và tôn trọng envelope `V−k_cam≥4` (V54).
7. **Chuẩn hoá theo chiều cao bbox** (px → % thân người) để so được giữa các cảnh quay
   khác khoảng cách/khung hình.
8. **Std độ dài xương theo thời gian** — bất biến sinh trắc, tụt về ~0 khi ràng buộc xương tốt.
9. **Jitter (gia tốc)** và **foot-slip** — chỉ số mượt/trượt chân, độc lập với GT.
10. **Cổng tái chiếu** khi dựng: loại quan sát vượt ngưỡng px trước khi tam giác hoá
    (bắt outlier THÔ; lưu ý V50: cổng này **mù** bias hệ thống nhỏ và **hại** bias lớn →
    phải cặp với cổng held-out bước 4).

> **Quy đổi px → mm:** thực nghiệm tổng hợp cho hệ số tham khảo
> `MPJPE(mm) ≈ 5.39·reproj_heldout(px) − 14.48`, nhưng hệ số này **phụ thuộc hình học
> cảnh quay** và chỉ dùng để tham chiếu. Muốn chốt hằng số cho dữ liệu thật cần một
> tập có 3D GT (vd. AIST++) để hồi quy lại — xem "Giới hạn" bên dưới.

## Giới hạn của tầng tổng hợp & việc cần dữ liệu thật

Mọi số ở đây là **synthetic**: nhiễu Gauss + outlier thô + lệch sync/calib + bias detector
mô phỏng, detector 2D lý tưởng hoá. Chúng chứng minh **cơ chế** (vì sao held-out, vì sao
LOCO/LOVO, vì sao mỗi lớp khử nhiễu cộng dồn được, vì sao envelope hở đúng ở vùng
phụ-thuộc-hình-học) nhưng **chưa** thay được đo trên video thật. Các con số ngưỡng cụ thể
(τ=2.80px, onset b≈10px, envelope, trần k_joint≤1) đúng theo **cơ chế** nhưng trị số
**riêng cấu hình** đang mô phỏng. Việc còn lại (cần GPU + video múa thật, không chạy trên
máy hiện tại):

- Nối detector 2D thật (RTMPose/ViTPose/EasyMocap/XRMoCap) vào `fuse_multiview`.
- Lặp lại toàn bộ §5.4 trên AIST++/video múa thật với lỗi detector & confidence thật,
  gồm chạy **cổng held-out V49 + LOVO V51** trên đầu ra detector thật 2–3 máy.
- Chạy hiệu chuẩn confidence trên đầu ra detector thật.
- Dùng AIST++ (có 3D GT) để **chốt** hằng số quy đổi px→mm cho held-out/LOCO.
- Bias thật đa dạng hơn synthetic (xoay/co giãn theo độ sâu, phụ thuộc tư thế, nhiều khớp
  cùng lỗi, hai camera cùng bias) — cung V49–V56 đo lát cắt một-nguồn, để ngỏ tương tác.
