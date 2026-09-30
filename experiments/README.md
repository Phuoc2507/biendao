# Tầng nhận thức — chỉ mục thực nghiệm & checklist Cổng 0

Thư mục này chứa **toàn bộ thực nghiệm tổng hợp (synthetic)** làm nền cho §5.4 của
luận văn: đánh giá xem pipeline mocap 2-view (2 điện thoại) đo được gì, khử nhiễu
tới đâu, và **đo chất lượng thế nào khi không có 3D ground-truth**. Mọi thực nghiệm
chỉ dùng `numpy` thuần (CPU, không GPU/torch/opencv) và tự sinh file `ket-qua-*.md`
từ số đo — nên số liệu trung thực theo cấu trúc.

## Cách chạy (tái lập)

```bash
# 1) Toàn bộ unit test (đáp án biết trước cho từng metric hình học/đánh giá)
.venv/Scripts/python -m pytest -q

# 2) Chạy lại TẤT CẢ thực nghiệm, tái sinh mọi ket-qua-*.md + báo cáo tái lập
.venv/Scripts/python experiments/run_all.py
```

`run_all.py` chạy lần lượt 10 script, xác nhận mỗi script thoát mã 0 **và** ghi mới
đúng file kết quả của nó, rồi ghi `bao-cao-tai-lap.md`. Lần chạy gần nhất: **10/10
tái lập, ~173s** trên CPU.

## Bản đồ thực nghiệm → vai trò Cổng 0

Ba nhóm, theo đúng trình tự lập luận: **(I) hình học đặt máy** → **(II) khử nhiễu**
→ **(III) đo chất lượng không GT**.

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

## Checklist đo Cổng 0 (trên dữ liệu THẬT, không GT)

Khi có video múa 2–3 máy thật, chấm chất lượng mocap **không cần 3D ground-truth**
bằng đúng các thước đo đã kiểm định ở nhóm III + III phụ trợ:

1. **Bố trí ≥3 máy** (để LOCO chạy được; 2 máy chỉ dựng được, không tự đánh giá chéo).
2. **Đồng bộ < nửa khung** giữa các máy (vỗ tay/clap-board; xem ngưỡng ở `do-nhay-sync-calib`).
3. **Sai số tái chiếu LOCO** (`reprojection_error_loco` trong `choreo/eval/metrics.py`):
   báo cáo **mean** (điểm chất lượng) và **std** (cờ QA — std bật cao ⇒ 1 máy/lịch xấu).
4. **Chuẩn hoá theo chiều cao bbox** (px → % thân người) để so được giữa các cảnh quay
   khác khoảng cách/khung hình.
5. **Std độ dài xương theo thời gian** — bất biến sinh trắc, tụt về ~0 khi ràng buộc xương tốt.
6. **Jitter (gia tốc)** và **foot-slip** — chỉ số mượt/trượt chân, độc lập với GT.
7. **Cổng tái chiếu** khi dựng: loại quan sát vượt ngưỡng px trước khi tam giác hoá.

> **Quy đổi px → mm:** thực nghiệm tổng hợp cho hệ số tham khảo
> `MPJPE(mm) ≈ 5.39·reproj_heldout(px) − 14.48`, nhưng hệ số này **phụ thuộc hình học
> cảnh quay** và chỉ dùng để tham chiếu. Muốn chốt hằng số cho dữ liệu thật cần một
> tập có 3D GT (vd. AIST++) để hồi quy lại — xem "Giới hạn" bên dưới.

## Giới hạn của tầng tổng hợp & việc cần dữ liệu thật

Mọi số ở đây là **synthetic**: nhiễu Gauss + outlier thô + lệch sync/calib mô phỏng,
detector 2D lý tưởng hoá. Chúng chứng minh **cơ chế** (vì sao held-out, vì sao LOCO,
vì sao mỗi lớp khử nhiễu cộng dồn được) nhưng **chưa** thay được đo trên video thật.
Việc còn lại (cần GPU + video múa thật, không chạy trên máy hiện tại):

- Nối detector 2D thật (RTMPose/ViTPose/EasyMocap/XRMoCap) vào `fuse_multiview`.
- Lặp lại toàn bộ §5.4 trên AIST++/video múa thật với lỗi detector & confidence thật.
- Chạy hiệu chuẩn confidence trên đầu ra detector thật.
- Dùng AIST++ (có 3D GT) để **chốt** hằng số quy đổi px→mm cho held-out/LOCO.
