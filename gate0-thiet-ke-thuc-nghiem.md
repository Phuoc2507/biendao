# CỔNG 0 — Thiết kế thực nghiệm kiểm chứng mocap 2 camera cho múa

*Đồ án Choreography Sequencer 2-cam · thực hiện tuần 2–6 · người A (perception) chủ trì, người B hỗ trợ dựng clip giả song song*
*Mục đích: quyết định ĐI/DỪNG trước khi xây sản phẩm. Đây là "chương thực nghiệm" ghi điểm hội đồng, không chỉ là kiểm thử nội bộ.*

---

## 0. Câu hỏi quyết định (viết ra để không lạc)

> **Với 2 điện thoại thường, pipeline mã nguồn mở (EasyMocap/XRMoCap) có dựng được clip 3D đủ tốt để một biên đạo chấp nhận (sau bước cleanup) cho ÍT NHẤT nhóm động tác lõi của múa không?**

Điểm mấu chốt trong cách đặt câu hỏi: **không hỏi "có hoàn hảo không"**, mà hỏi **"nhóm động tác nào đạt, nhóm nào không"** → kết quả Gate 0 sẽ *định nghĩa lại phạm vi động tác của MVP*, không chỉ là một chữ PASS/FAIL.

**3 giả thuyết cần kiểm:**
- **H1 (chính xác):** 2 view chính xác hơn 1 view rõ rệt trên múa (không chỉ trên lab).
- **H2 (theo nhóm động tác):** đạt với chính diện/chéo + xoay vừa; kém với động tác sàn + quay lưng + nhảy nhanh.
- **H3 (góc đặt máy):** góc lệch ~60–90° tốt hơn rõ so với ~30° (baseline hẹp) và ~150° (gần đối đỉnh).

---

## 1. Vấn đề khó nhất: đo độ chính xác khi KHÔNG có Vicon

Không có bộ đồ mocap chuẩn → không có "ground truth" tuyệt đối. Giải bằng **2 đường song song**, bù nhau:

### Đường A — Định lượng có đối chứng, trên AIST++ *(mượn "GT giả")*
AIST++ có sẵn **9 view đồng bộ + SMPL dựng từ cả 9 view**. Cách làm:
1. Lấy vài chục clip AIST++ (đủ thể loại: locking, hip-hop, house...).
2. **Chỉ dùng 2 view** (chọn cặp ~60–90°) chạy qua pipeline của mình → SMPL 2-view.
3. So với **SMPL 9-view của AIST++** coi như GT giả → ra **MPJPE / PA-MPJPE thật bằng mm**.
4. Lặp với **1 view** (mono) để có số so sánh H1.
5. Lặp với các cặp góc khác nhau để kiểm H3.

→ Cho **con số tuyệt đối, khách quan, trích dẫn được** trong luận văn. Đây là xương sống chương kết quả.

### Đường B — Trên clip múa THẬT của mình *(không GT, dùng proxy)*
Vì clip tự quay không có GT, dùng 4 proxy không cần GT:
1. **Reprojection error trên camera thứ 3 giữ lại (held-out):** quay bằng **3 điện thoại**, dựng 3D chỉ từ **2 máy**, chiếu khớp 3D ngược về **máy thứ 3 không dùng để dựng**, đo sai lệch so với 2D detect trên máy 3. **Đây là mẹo chính** — cho thước đo độ chính xác gần như GT mà không cần thiết bị đắt.
2. **Jitter (độ rung):** gia tốc khớp trung bình — rung cao = xấu. So 1-cam vs 2-cam vs sau-cleanup.
3. **Foot-slip:** độ trượt ngang của bàn chân trong các frame lẽ ra đang chạm sàn (mm).
4. **Chấm chuyên gia:** 1–2 biên đạo/dancer chấm mỗi clip theo thang usability (mục §3).

> Đường A cho số cứng; Đường B chứng minh nó đúng trên múa thật + điều kiện điện thoại thật (mờ, rolling shutter, sync lệch).

---

## 2. Bộ dữ liệu test (tự quay)

**Thiết bị:** 3 điện thoại (2 để dựng + 1 held-out), 60fps, 1080p, 3 tripod. Lệch góc **60–90°**, cùng độ cao ngực, cùng bán kính ~3–4m. Vỗ tay 1 cái rõ đầu mỗi clip. Giơ bảng **ChArUco** ~1 phút đầu buổi.

**Số lượng:** 2 dancer × 6 nhóm động tác × 2 lần = **24 clip**, mỗi clip 8–16 nhịp (~10–20s). Đủ để có thống kê theo nhóm mà không quá tải.

**6 nhóm động tác — chọn để ÉP pipeline lộ điểm yếu (đây là thiết kế then chốt):**

| # | Nhóm | Vì sao đưa vào | Kỳ vọng |
|---|---|---|---|
| 1 | Chính diện/chéo, đứng thẳng | Baseline dễ nhất | Đạt tốt |
| 2 | Xoay người 90–180° | Kiểm mất mặt trước với 2 view | Đạt vừa |
| 3 | Xoay 360° / quay lưng hẳn | Điểm yếu 2D detect | Có thể kém |
| 4 | Động tác sàn (nằm, chống tay) | Tự che khuất mạnh | Nhiều khả năng kém |
| 5 | Nhảy / bật nhanh | Mờ chuyển động + depth mơ hồ | Kém về quỹ đạo |
| 6 | Tay chân bắt chéo, footwork nhanh | Nhập nhằng trái/phải | Trung bình |

**Điều kiện quay ghi lại (biến của thí nghiệm góc H3):** buổi phụ quay lại nhóm 1–2 ở **3 cấu hình góc: ~30°, ~75°, ~150°** để so.

---

## 3. Định nghĩa metric & ngưỡng ĐẠT/DỪNG

*Ngưỡng là mục tiêu có căn cứ (2-view trên H36M ~42mm MPJPE; múa khó hơn), chỉnh lại sau buổi pilot đầu.*

| Metric | Cách đo | ĐẠT | CÓ ĐIỀU KIỆN | DỪNG |
|---|---|---|---|---|
| **MPJPE** (Đường A, vs AIST++ 9-view) | mm, trung bình khớp | < 60mm | 60–90mm | > 90mm |
| **PA-MPJPE** (đã căn chỉnh) | mm | < 45mm | 45–70mm | > 70mm |
| **2-cam so 1-cam** (H1) | % giảm MPJPE | giảm ≥ 30% | 15–30% | < 15% |
| **Reprojection LOCO-mean** (Đường B) | px→% chiều cao bbox; bỏ-một-máy luân phiên rồi trung bình (`reprojection_error_loco`) | < 3% | 3–6% | > 6% |
| **LOCO-std** (chẩn đoán QA hiện trường) | px, độ lệch giữa các fold | thấp/ổn định | hơi cao (nghi 1 máy lệch) | tăng vọt → có máy hỏng, quay lại |
| **Bone-length std** (GT-free) | mm, dao động độ dài xương theo thời gian | ~0 sau ràng buộc | còn dao động nhẹ | dao động lớn (calib/sync sai) |
| **Jitter** (gia tốc khớp) | so ngưỡng cảm nhận; so 1-cam | mượt sau cleanup | rung nhẹ còn dùng được | rung không cứu được |
| **Foot-slip** | mm trượt ngang khi chạm sàn | < 2cm | 2–5cm | > 5cm |
| **Chấm chuyên gia** | thang 1–5 usability (xem dưới) | trung vị ≥ 4 | = 3 | ≤ 2 |

> **Đã kiểm định trên synthetic (§5.4, `experiments/`):** reprojection **held-out/LOCO bám sát MPJPE thật** (r≈0.99) nên dùng được làm giám khảo GT-free ở Đường B; **phải held-out**, không dùng in-sample (in-sample bị chính outlier bơm sai, không thấy robust đã sửa). **LOCO-std là cờ QA**: trong thí nghiệm 1-máy-hỏng nó tăng **×43** → quy tắc "std cao bất thường ⇒ quay lại" là có căn cứ. Hệ số quy đổi px→mm còn phụ thuộc hình học, **chốt bằng Đường A (AIST++, có 3D GT)**.

> **Đã kiểm định LẠI trên MÚA THẬT (AIST++, offline, không GPU):** [`experiments/aist_proxy_validation.py`](experiments/aist_proxy_validation.py) bơm nhiễu detector nhiều mức (sạch→rất nặng) trên 20 bài × 4 camera = 120 mẫu, đo tương quan hạng Spearman giữa proxy GT-free và MPJPE thật (vs 3D 9-view): **reproj-LOCO ρ=0.94**, **bone-length-std ρ=0.90**, **jitter ρ=0.84**, LOCO-std ρ=0.74. Xếp hạng chất lượng bằng proxy ĐỒNG THUẬN với xếp hạng bằng GT trên dữ liệu thật ⇒ **hợp thức hoá chấm GT-free của Đường B** (không chỉ synthetic). Đây là **góc kiểm chứng chéo thứ tư** (proxy⟂MPJPE), trực giao với sweep nhiễu (giá detector) và sweep góc (hình học).

> **Yêu cầu ≥3 máy Ở CỔNG 0 (khác sản phẩm 2 máy):** LOCO/held-out cần còn ≥2 máy dựng mỗi fold ⇒ **buổi nghiệm thu quay ≥3 máy** để tự chấm GT-free; sản phẩm cuối vẫn nhắm 2 điện thoại, nhưng đánh giá độ tin cần máy thứ 3 làm giám khảo.

### 3.1 Chẩn đoán & SỬA lỗi lệch HỆ THỐNG — vận hành cung V49–V56 trên detector thật

Held-out/LOCO ở trên mới dùng như **điểm số chất lượng**. Cung synthetic V49–V56 (`experiments/`,
xem `experiments/README.md` Nhóm IV) chứng minh nó còn là **công cụ chẩn đoán & sửa** cho một lớp lỗi
mà cổng robust + LOCO-std đơn thuần **bỏ sót hoặc hiểu nhầm**: **detector/calib lệch HỆ THỐNG một nguồn**
(một khớp bị đặt lệch nhất quán, hoặc một máy sai extrinsic). Ở tầng toạ-độ-3D lỗi này **bất khả phân**
với vũ công múa sai — nên nếu chỉ nhìn 3D sẽ **đổ oan cho vũ công** hoặc **vứt oan clip đi quay lại**.

**Giao thức 3 bước ở Cổng 0 (khi ≥3 máy):**
1. **Cổng chẩn đoán held-out (V49) — đặt TRƯỚC khi kết luận "mocap xấu".** Đo reprojection held-out
   **per-khớp/per-camera** (không gộp 17 khớp — trung bình sẽ pha loãng). Khớp có dev3d cao NHƯNG
   reprojection held-out **thấp** (mọi máy đồng thuận) = vũ công **thật sự** ở vị trí đó (sai động tác
   hoặc tư thế lạ) → **giữ**, không phải lỗi hệ thống. Khớp/máy có reprojection held-out **vọt cao** =
   **detector/calib lệch** → sang bước 2, **đừng** tính vào điểm "mocap kém" của nhóm động tác.
2. **Sửa bằng LOVO (V51) thay vì quay lại.** Khi LOCO-std bật cờ (nghi 1 máy lệch), chạy **loại-từng-view**:
   với mỗi máy, dựng 3D từ các máy còn lại rồi tái chiếu về nó, **gộp sai số per-CAMERA qua cả clip** →
   máy bias bị đồng thuận chấm điểm cao nhất → loại, dựng lại. Synthetic: kéo lỗi về gần oracle (vd.
   bias vừa 2.55→0.65cm) và **nêu đúng thủ phạm ≥90%**. ⇒ nhiều clip "LOCO-std cao" có thể **cứu bằng
   phần mềm**, không phải quay lại — tiết kiệm buổi quay. **Chỉ bật LOVO khi bước 1 đã báo nghi** (LOVO
   có giá ~+0.18cm khi rig vốn sạch).
3. **Phân biệt NGUỒN bằng mốc ChArUco (V53).** Residual tái chiếu của **bảng ChArUco** per-camera thấy
   **sai calib/extrinsic toàn-camera** (bắt được kể cả khi ≥2 máy lệch, nơi LOVO chịu trần đồng-thuận
   `floor((V-1)/2)`) nhưng **mù** lỗi detector 1-khớp (bảng không dời khi cổ tay bị đặt lệch). ⇒ **cặp
   thước bù nhau theo nguồn**: ChArUco-residual cao ⇒ re-calib/kê lại máy; ChArUco sạch mà held-out
   per-khớp cao ⇒ lỗi detector, dùng LOVO. Bias TRỘN: chạy **ChArUco trước → LOVO trên phần dư** (thứ
   tự bất-hoán, V54).

**Thực nghiệm kiểm chứng (bán-tổng-hợp, Đường B, tuần 4) — vì clip thật KHÔNG có nhãn bias:** lấy đầu ra
detector THẬT 3 máy của một clip đã ĐẠT, **tiêm một lượng lệch pixel BIẾT TRƯỚC** vào keypoint của MỘT
máy (quét vài biên độ, vài khớp), rồi kiểm: (a) cổng held-out bước 1 có **gắn cờ** đúng máy/khớp đó
không; (b) LOVO bước 2 có **nêu đúng** máy bị tiêm và **kéo** 3D về gần bản gốc-chưa-tiêm không. Đây là
cách DUY NHẤT xác nhận "cổng bắt ĐÚNG cái" trên detector thật mà không cần Vicon — chuyển phát hiện
synthetic thành phép thử có nhãn trên nhiễu detector THẬT.

> **Giới hạn trung thực (khớp V51–V54):** LOVO cần **≥3 máy + đa số sạch**; cấu hình **ĐÚNG-2-máy của
> sản phẩm KHÔNG tự sửa được lỗi detector 1-khớp** — ở đó chỉ còn ràng buộc thời gian/xương và chấm
> chuyên gia. Vì vậy giao thức này là **lá chắn của buổi nghiệm thu ≥3 máy** (tăng độ tin của số Cổng 0
> và cứu clip), không phải tính năng chạy khi người dùng cuối quay 2 máy. Trị số ngưỡng (τ held-out,
> onset bias) đúng theo **cơ chế** nhưng phải **hiệu chỉnh lại trên detector thật** ở buổi tuần 4.

**Thang usability cho biên đạo (mỗi clip):**
- 5 = dùng ngay, gần như không sửa
- 4 = dùng được sau cleanup nhẹ
- 3 = dùng được nhưng phải sửa tay/nhiều
- 2 = sai lệch lớn, khó cứu
- 1 = không dùng được

**Quy tắc quyết định tổng (per nhóm động tác, KHÔNG gộp chung):**
- Một **nhóm động tác** = **ĐẠT** nếu MPJPE + reprojection + chấm chuyên gia đều ở vùng ĐẠT/CÓ ĐIỀU KIỆN.
- **Gate 0 = ĐI** nếu **≥ nhóm 1, 2 và ≥1 trong 3/6** đạt → đủ vốn động tác để làm sản phẩm có ý nghĩa.
- **Gate 0 = ĐI CÓ ĐIỀU KIỆN** nếu chỉ nhóm 1–2 đạt → thu hẹp phạm vi MVP về "múa hướng khán giả, xoay vừa", ghi rõ giới hạn.
- **Gate 0 = DỪNG/PIVOT** nếu ngay nhóm 1 (chính diện) cũng không đạt → xem §5.

---

## 4. Quy trình thực hiện (khớp tuần 2–6)

| Tuần | Việc | Đường |
|---|---|---|
| 2 | Quay 24 clip **≥3 máy** (2 = sản phẩm; máy thứ 3 làm giám khảo LOCO) + buổi góc máy; ingest; sync clap **< nửa khung** | B (dữ liệu thật) |
| 3 | Chạy Đường A trên AIST++: dựng 1-view / 2-view / các cặp góc; tính MPJPE; **chốt hệ số px→mm** | A (số cứng) |
| 4 | Chạy pipeline trên 24 clip thật; tính **LOCO-mean + LOCO-std** + bone-length-std + jitter + foot-slip; **std cao ⇒ chạy giao thức §3.1** (held-out per-khớp chẩn đoán → LOVO sửa/nêu thủ phạm → ChArUco phân nguồn) **rồi mới quyết quay lại**; kèm phép thử **bias-tiêm bán-tổng-hợp** xác nhận cổng bắt đúng | B |
| 5 | Buổi chấm chuyên gia (mời 1–2 biên đạo/dancer chấm mù, không biết clip nào 1 hay 2 cam) | Cả hai |
| 6 | Tổng hợp bảng kết quả theo nhóm; ra quyết định ĐI/DỪNG + phạm vi động tác chốt | Cả hai |

**Công cụ:** EasyMocap/XRMoCap (fuse), RTMPose/ViTPose (2D), OpenCV (ChArUco + chiếu ngược), numpy/scipy (metric), 1 mono method (WHAM) cho nhánh 1-cam. GPU lab.

**Cấu hình pipeline đã chốt từ §5.4 (bật sẵn khi chạy detector thật):** `fuse_multiview(robust=True)` (cổng tái chiếu + loại-dần-view cho lỗi thô) + **trọng số nghịch-phương-sai đã HIỆU CHUẨN** từ confidence (hiệu chuẩn conf→σ trên vài clip qua sai số tái chiếu, KHÔNG dùng confidence sống) + **ràng buộc độ dài xương (PBD)** khi nhiễu detector ≥~3px. Ngưỡng cổng robust đặt **trên** dải nhiễu mềm dự kiến và **dưới** biên lỗi thô (tối ưu ~15–20px trong thí nghiệm). Chấm GT-free bằng `reprojection_error_loco` (mean + std).

**Ngưỡng đồng bộ (đo được, `do_nhay_sync_calib`):** nền 11.3mm khi đồng bộ hoàn hảo; lệch **nửa khung @30fps** (~16.7ms) đẩy lên 12.7mm, **trọn 1 khung** (~33ms) lên 15.9mm ⇒ **yêu cầu đồng bộ < nửa khung** (clap-board + tinh chỉnh theo keypoint). Múa thật (footwork/vung tay nhanh) nhạy hơn synthetic nên đây là **cận dưới**.

**Tuần 3 — đã dựng sẵn & test, chỉ chờ GPU:** runbook thao tác chi tiết ở [`experiments/gate0-runbook-aist-detector.md`](experiments/gate0-runbook-aist-detector.md) (cài mmpose → tải 40 video → `aist_detector_2view.py detect|compare`). URL/license video AIST đã xác minh với downloader chính thức → không dò lại trong giờ máy thuê. **Tiên lượng offline (KHÔNG cần GPU)** từ [`experiments/aist_noise_sweep.py`](experiments/aist_noise_sweep.py): bơm nhiễu detector mô phỏng vào keypoint curated → baseline sạch **37.3mm**, nhiễu kiểu RTMPose (~4px + lẫn/sót nhẹ) **~42mm**, tức **ΔMPJPE giá-detector-thật kỳ vọng ~ +5mm**; jitter chi phối (8px → +14mm, gần tuyến tính), robust + nội suy hấp thụ gần hết lẫn T/P & sót khớp. Đây là **góc kiểm chứng chéo thứ ba**: synthetic (camera ảo) ↔ AIST curated ↔ AIST + nhiễu detector mô phỏng.

**Lưu ý phương pháp để số liệu tin được:**
- **Chấm mù:** biên đạo không được biết clip nào 1-cam/2-cam → tránh thiên vị (quan trọng cho H1).
- Cùng một khung 2D detector cho cả 1-cam và 2-cam → chênh lệch chỉ do số view.
- Ghi lại reprojection error của ChArUco → chứng minh calib tốt trước khi trách mocap.
- Căn hệ khớp AIST++ ↔ SMPL của mình cho khớp thứ tự joint trước khi tính MPJPE (dễ sai ở đây).

---

## 5. Nếu DỪNG thì làm gì (fallback đã cài sẵn)

Gate 0 trượt **không giết đồ án** — vì nhánh B (sequencer) độc lập với chất lượng mocap:
1. **Thu hẹp vốn động tác:** chỉ nhận nhóm động tác đạt, ghi thành "giới hạn hệ thống" — vẫn là kết quả nghiên cứu hợp lệ.
2. **Dùng clip có sẵn:** nạp AIST++/Mixamo vào sequencer → vẫn demo & đánh giá được M4/M5 đầy đủ; đồ án chuyển trọng tâm sang **sequencer + đánh giá góc máy** (vẫn đúng ngành).
3. **Đổi novelty sang phần đo:** "khảo sát định lượng giới hạn của mocap 2-điện-thoại trên múa" tự nó đã là đóng góp (chưa ai đo) — biến thất bại kỹ thuật thành phát hiện khoa học.

---

## 6. Sản phẩm Gate 0 (để đưa vào luận văn)

- Bảng MPJPE/PA-MPJPE **1-cam vs 2-cam** theo nhóm động tác (Đường A).
- Biểu đồ **MPJPE theo góc đặt máy** (30°/75°/150°) → chứng minh H3. **Đã tiên lượng offline trên AIST thật** ([`experiments/aist_angle_sweep.py`](experiments/aist_angle_sweep.py) → [`.svg`](experiments/ket-qua-aist-angle-sweep.svg)): đường chữ U, đáy **~36mm ở 60–120°**, vống ở 0–30° (55mm) & 120–150° (52mm), **nổ ở 150–180°** (tb 2489 / vị 277mm) — khớp quy luật synthetic *60–120° tốt, 150–180° suy biến* trên MÚA THẬT.
- Biểu đồ **MPJPE theo mức nhiễu detector** (σ_px) kèm điểm "RTMPose ước" → tiên lượng giá detector thật & ngưỡng suy biến của lõi ([`experiments/ket-qua-aist-noise-sweep.md`](experiments/ket-qua-aist-noise-sweep.md)).
- Bảng reprojection held-out + jitter + foot-slip trên clip thật (Đường B).
- Biểu đồ **proxy GT-free vs MPJPE thật** (scatter 3 bảng, Spearman ρ) → chứng minh proxy bám sai số thật trên MÚA THẬT ([`experiments/aist_proxy_validation.py`](experiments/aist_proxy_validation.py) → [`.svg`](experiments/ket-qua-aist-proxy-validation.svg)): LOCO ρ=0.94, bone-std ρ=0.90, jitter ρ=0.84 — nền tảng định lượng cho chấm GT-free của Đường B.
- Kết quả chấm chuyên gia (trung vị usability theo nhóm).
- **1 trang quyết định:** ĐI / CÓ ĐIỀU KIỆN / DỪNG + phạm vi động tác chốt cho MVP.
- Clip video before/after cleanup cho slide bảo vệ.

---

## 7. Cạm bẫy hay gặp

- **Sai thứ tự/tên khớp** khi so với AIST++ → MPJPE vô nghĩa. Kiểm bằng mắt 1 frame trước khi chạy hàng loạt.
- **Calib kém bị đổ oan cho mocap** → luôn báo cáo reprojection error của ChArUco trước.
- **Trôi đồng bộ trên clip dài** → giữ clip ≤ 20s, re-sync theo đoạn.
- **Held-out cam đặt quá gần 1 trong 2 cam dựng** → không phải phép thử độc lập; đặt nó ở góc khác hẳn.
- **Gộp reprojection held-out qua cả 17 khớp rồi mới xét** → pha loãng, mất cờ lỗi-1-khớp (V48/V49); phải đo **per-khớp/per-camera** khi chẩn đoán bias hệ thống (§3.1), mới gộp ở điểm-số-chất-lượng.
- **Đổ oan vũ công / vứt oan clip** → dev3d cao chưa chắc là mocap xấu; chạy cổng held-out §3.1 để tách "detector lệch (sửa được bằng LOVO)" khỏi "múa thật sai" trước khi kết luận.
- **Chấm không mù** → H1 mất giá trị. Bắt buộc giấu nhãn.
- **Quá ít clip/nhóm** → không dám kết luận; giữ đủ 2 dancer × 2 lần/nhóm.
