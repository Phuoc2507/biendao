# ĐỀ CƯƠNG ĐỒ ÁN TỐT NGHIỆP

**Tên đề tài (TV):** Hệ thống bắt chuyển động múa 3D bằng hai điện thoại và công cụ dàn dựng vũ đạo trên sân khấu ảo

**Tên đề tài (TA):** *A Two-Smartphone 3D Dance Motion Capture System with a Virtual-Stage Choreography Sequencer*

| | |
|---|---|
| **Ngành** | Robot và Trí tuệ nhân tạo |
| **Trường** | Đại học Sư phạm Kỹ thuật TP.HCM (HCMUTE) |
| **Nhóm thực hiện** | [Sinh viên 1] · [Sinh viên 2] (2 thành viên) |
| **GVHD** | [                    ] |
| **Thời gian** | 1 học kỳ (~15 tuần) |
| **Ngày lập** | 2026-09-29 |

---

## 1. Đặt vấn đề và lý do chọn đề tài

Phong trào nhảy cover K-pop, các nhóm nhảy và studio dạy múa ở Việt Nam đang phát triển mạnh, nhưng quy trình truyền dạy và dàn dựng vũ đạo vẫn thủ công: biên đạo quay video 2D bằng điện thoại, người tập xem gương và tự căn đội hình. Chưa có công cụ phổ thông giúp **số hóa động tác thành mô hình 3D** để có thể xem từ mọi góc, nhân bản lên nhiều vũ công ảo, sắp xếp đội hình và xuất ra "bài tập" riêng cho từng người.

Về mặt kỹ thuật, bắt chuyển động 3D (motion capture) trước đây đòi hỏi phòng thu chuyên dụng với hàng chục camera đồng bộ hoặc bộ đồ cảm biến đắt tiền. Các phương pháp một camera (monocular) gần đây tuy tiện nhưng **độ chính xác sụt mạnh với động tác đặc trưng của múa** — xoay người, quay lưng, động tác sàn, nhảy nhanh — do mất thông tin độ sâu và tự che khuất. Nghiên cứu cho thấy dùng **hai góc nhìn** thu hồi được khoảng một nửa khoảng cách sai số giữa một camera và hệ nhiều camera (trên chuẩn Human3.6M: 1 view ≈ 53mm → 2 view ≈ 42mm → 4 view ≈ 31–36mm MPJPE), và đường cong bão hòa nhanh sau hai view [1][7]. Vì vậy **hai điện thoại là điểm cân bằng hợp lý** giữa độ chính xác và tính phổ thông.

Đề tài giải quyết đồng thời một bài toán kỹ thuật đúng chuyên ngành (thị giác đa-view, hiệu chỉnh và hợp nhất cảm biến, động học khung xương) và một nhu cầu ứng dụng có thật (công cụ dàn dựng vũ đạo). Các thành phần cốt lõi ánh xạ trực tiếp vào kiến thức ngành Robot & AI: ước lượng tư thế từ ảnh (thị giác máy tính, học sâu), hiệu chỉnh và tam giác đạc đa camera (hình học đa-view / sensor fusion), tái định hướng khung xương và khóa chân (động học thuận–nghịch, IK), lọc và làm mượt tín hiệu chuyển động (ước lượng trạng thái).

---

## 2. Tổng quan tình hình nghiên cứu

### 2.1. Bắt chuyển động múa đa camera (ngoài nước)
Bắt chuyển động múa bằng nhiều camera **đã tồn tại trong nghiên cứu nhưng còn thưa và dùng thiết bị nặng**:
- **AIST++** [2] — bộ dữ liệu múa đa-view kinh điển, 9 camera studio đồng bộ, dựng tham số SMPL từ 9 góc nhìn (không phải mocap cảm biến). Là chuẩn đối chiếu phổ biến nhất.
- **DanceNet3D** (CVPR-W 2026) [3] — 29 camera RealSense → mô hình 3D Gaussian Splatting phục vụ dạy múa; camera bình dân nhưng số lượng lớn.
- **MAMMA** (2026) [4] — bắt chuyển động múa bằng **4 iPhone** → SMPL-X, sai số ~22mm so với hệ Vicon, có tập đánh giá riêng cho múa. Đây là công trình **sát ý tưởng nhất**, nhưng vẫn dùng 4 máy và đồng bộ phần cứng.
- Các bộ dữ liệu múa 3D khác (FineDance, PopDanceSet, Motion-X) né hệ camera: dùng bộ đồ marker hoặc video một camera trên mạng.

### 2.2. Phương pháp thưa góc nhìn (sparse-view, 2024–2026)
- **U-HMR** [5] nhận tùy ý 1/2/3/4 view, **không cần hiệu chỉnh** (tự hồi quy camera pose). **HeatFormer** [6] tinh chỉnh SMPL bằng transformer, đạt PA-MPJPE 2-view ~27.9mm.
- **Humans-as-calibration-pattern** [8] và **VisualSync** [9] giải đúng bài toán hai điện thoại **không đồng bộ, không hiệu chỉnh**: tự tìm camera pose và độ lệch thời gian dưới-frame từ khung xương người.
- Tinh chỉnh vật lý (**OSDCap** và các phương pháp khôi phục chuyển động khó) [10] khử foot-skate cho động tác múa/thể thao.

### 2.3. Công cụ có thể tái sử dụng
- **EasyMocap** [11] (ZJU3DV) — hợp nhất đa-view ra SMPL-X, có demo "nhảy đường phố 9 điện thoại". **XRMoCap** [12] (Apache-2.0) và **Pose2Sim** [13] (BSD-3, tự đồng bộ bằng vận tốc keypoint) là các lựa chọn mã nguồn mở. **OpenCap** (Stanford) dùng **đúng 2 iPhone** nhưng cho y sinh, không cho múa.

### 2.4. Sản phẩm ứng dụng
Thị trường chia hai nửa: (a) công cụ vẽ đội hình **chỉ xếp avatar/điểm có sẵn**, không bắt từ camera (DanceForms, Stancz, FORMI); (b) hệ bắt chuyển động một camera hoặc studio. **Choreoto** [14] là sản phẩm bắc cầu gần nhất, nhắm nhóm K-pop, có quảng cáo "quay 3D bằng camera" nhưng dường như **chỉ một camera** và là tính năng phụ. **DanceSculpt** [15] (nghiên cứu, IJHCI 2024) dựng 3D dancer từ video **một camera** để dạy múa.

### 2.5. Khoảng trống nghiên cứu (kết luận tổng quan)
Chưa có công trình/sản phẩm nào đáp ứng đồng thời ba điều:
1. **Ghép trọn chuỗi** capture → 3D → dàn dựng nhiều vũ công trên sân khấu → xuất view tập cá nhân. Các mảnh tồn tại rời rạc.
2. **Bản tối giản đúng hai điện thoại cho múa**, đồng bộ bằng âm thanh và tự hiệu chỉnh, không cần đồng bộ phần cứng (MAMMA vẫn cần 4 máy).
3. **Số liệu độ chính xác hai view trên múa thật** (xoay, sàn, nhảy) — các con số hiện có (~42mm) đều đo trên dữ liệu phòng lab chuyển động chậm.

> **Lưu ý định vị:** vì MAMMA và DanceNet3D (2026) đã bắt múa bằng camera bình dân, đề tài **không tuyên bố là "hệ đầu tiên bắt múa bằng nhiều điện thoại"**, mà định vị đóng góp ở **hệ thống, tính khả dụng và đánh giá**.

---

## 3. Mục tiêu đề tài

**Mục tiêu tổng quát:** Xây dựng và đánh giá một hệ thống hoàn chỉnh bắt chuyển động múa 3D bằng đúng hai điện thoại phổ thông và dàn dựng vũ đạo trên sân khấu ảo, phù hợp người dùng không chuyên.

**Mục tiêu cụ thể:**
1. Xây dựng pipeline bắt chuyển động hai camera: đồng bộ bằng âm thanh, hiệu chỉnh ChArUco, ước lượng tư thế 2D, hợp nhất đa-view ra khung xương 3D (SMPL).
2. Xây dựng bước làm sạch chuyển động: làm mượt, khóa chân (foot-lock), tách chuyển động gốc (root motion), tái định hướng về xương chuẩn Mixamo.
3. Xây dựng công cụ sequencer sân khấu 3D trên web: lưới nhịp-8, kéo-thả/nhân bản/đối xứng/lệch nhịp clip lên nhiều vũ công ảo, đường đi trên sàn, xuất view tập (POV/gương).
4. **Đánh giá định lượng** độ chính xác hai view so một view trên múa thật và khảo sát ảnh hưởng của góc đặt máy (thực nghiệm Cổng 0).

---

## 4. Đối tượng và phạm vi nghiên cứu

**Đối tượng:** chuyển động múa của một người thu bằng hai điện thoại; mô hình khung xương 3D; quy trình dàn dựng vũ đạo.

**Trong phạm vi:** xử lý **offline** theo mẻ; **một người/clip**; thân + chân + tay thô; đồng bộ clap < 1 frame; hiệu chỉnh ChArUco; sequencer ≤ 8 vũ công ảo; ít nhất một loại view tập; đánh giá trên ≥ 5 clip múa thật.

**Ngoài phạm vi:** thời gian thực; nhiều người trong một clip; ngón tay/biểu cảm mặt chính xác; app di động gốc; tài khoản/thanh toán/cộng tác thời gian thực; huấn luyện mạng mocap mới (dùng mô hình có sẵn).

---

## 5. Phương pháp và nội dung nghiên cứu

### 5.1. Kiến trúc hệ thống (5 module, adapter mocap thay được)

```
[M1 Capture & Ingest] → [M2 Mocap 2-cam] → [M3 Motion Cleanup] → clip chuẩn hoá
                                                                        ↓
   [M5 Đánh giá] ←──────────── [M4 Sequencer 3D + xuất view tập] ←──────┘
```

- **M1 — Thu & nạp:** tách audio, phát hiện vỗ tay, cắt đoạn, kiểm tra fps/độ phân giải.
- **M2 — Mocap hai camera:** đồng bộ (cross-correlation GCC-PHAT + vận tốc keypoint) → hiệu chỉnh ChArUco (OpenCV) → ước lượng 2D (RTMPose/ViTPose) mỗi góc → hợp nhất ra SMPL (EasyMocap/XRMoCap). Interface cố định `capture(clipA, clipB, calib) → motion3d` để thay adapter.
- **M3 — Làm sạch:** làm mượt, foot-lock (thuật toán Kovar), tách root motion, tái định hướng về Mixamo (Blender headless), xuất glTF/FBX.
- **M4 — Sequencer 3D:** React Three Fiber; lưới nhịp-8 từ `beat_this`; kéo-thả/nhân bản/đối xứng/lệch nhịp; đường đi CatmullRom + tự xoay mặt; cảnh báo va chạm; xuất video POV/gương.
- **M5 — Đánh giá:** tính MPJPE/PA-MPJPE/jitter/foot-slip; so 1-cam vs 2-cam; khảo sát góc đặt máy.

**Định dạng trao đổi giữa module:** clip glTF/FBX xương Mixamo + JSON `{root_trajectory, beat_grid, contacts, meta}` (chốt ngay tuần 1).

### 5.2. Bố trí thu dữ liệu
Hai máy lệch **60–90°**, cùng độ cao ngực, cùng bán kính; quay **60fps**; vỗ tay đầu clip; giơ ChArUco đầu buổi. (Không đặt 180° trước-sau vì làm hỏng bộ phát hiện 2D **và** thoái hoá tam giác hoá — xem định lượng ở §5.4.)

### 5.3. Thực nghiệm kiểm chứng — Cổng 0 (điểm nhấn nghiên cứu)
Vì không có hệ Vicon, đo độ chính xác bằng **hai đường bù nhau**:
- **Đường A (số cứng):** mượn AIST++ làm "GT giả" — chỉ dùng 2 trong 9 view của AIST++ để dựng lại, so với SMPL 9-view của họ → ra MPJPE/PA-MPJPE tuyệt đối; lặp với 1 view và với các cặp góc khác nhau.
- **Đường B (múa thật):** quay **3 điện thoại**, dựng từ **2**, chiếu khớp 3D ngược về **máy thứ 3 giữ lại** để đo reprojection error (proxy gần-GT); cộng jitter, foot-slip, và **chấm mù** bởi 1–2 biên đạo theo thang usability 1–5.

Kết quả chấm **theo từng nhóm động tác** (chính diện, xoay, quay lưng, động tác sàn, nhảy nhanh, footwork) → xác định **phạm vi động tác khả dụng** của MVP, kèm quy tắc ĐI/DỪNG (ví dụ MPJPE < 60mm = đạt; 2-cam phải giảm ≥ 30% so 1-cam).

### 5.4. Thực nghiệm hình học tổng hợp — đã hoàn thành (tiền-Cổng-0)

Trước khi có video múa thật và GPU lab, nhóm đã hiện thực và chạy một **thực nghiệm hình học tái lập được, thuần CPU** (`experiments/synthetic_2view.py`, numpy) để **cô lập và định lượng phần đóng góp của bố trí camera** — tách khỏi sai số của mạng 2D. Quy trình: sinh đoạn múa 3D biết trước (nhún gối + vung tay + xoay thân ±40°, 17 khớp) → chiếu xuống camera ảo pinhole → cộng nhiễu pixel Gaussian (mô phỏng detector 2D) → tam giác hoá DLT trở lại 3D → đo MPJPE. Đây là **giới hạn trên do hình học**. Kết quả chính (nhiễu 2px trên ảnh 1080p, 30 lần Monte-Carlo):

| Hiện tượng đo được | Kết quả | Ý nghĩa cho §5.2 |
|---|---|---|
| MPJPE theo **góc lệch 2 máy** | thấp nhất ~15mm ở **90°**; nổ lên ~47mm ở 15° và ~42mm ở 170° (đường cong chữ U) | Khẳng định vùng đặt máy **60–90°**; tránh baseline nhỏ và 180° |
| MPJPE theo **số camera** | 2→3→4→5 máy: 15.0→12.5→11.1→10.1mm (bão hoà dần) | 2 máy là điểm cân bằng chi phí/độ chính xác |
| MPJPE theo **nhiễu 2D** | ~tuyến tính (0.5px→3.8mm, 8px→61.5mm) | Nút thắt là detector 2D → cần cleanup + detector tốt |
| **Độ phủ khớp** khi có che khuất (thân ~ hình trụ, cần ≥2 máy cùng thấy) | đánh đổi: phủ thích máy gần (96.7% ở 20°) nhưng chính xác kém (27.6mm); ~60–90° dung hoà; **180° tệ kép** (thoái hoá ~240mm); máy thứ 3 mua thêm ĐỘ PHỦ (98.5%/9.7mm) | Cơ chế vật lý thứ hai cho việc lệch góc; vai trò thực của máy thứ 3 là bù che khuất khi xoay |

Các con số này **nhất quán với tài liệu** (1-cam ~64mm → 2-cam ~36mm [1][7]) và trực tiếp củng cố khuyến nghị đặt máy ở §5.2. Chi tiết đầy đủ + biểu đồ: `experiments/ket-qua-2view-tong-hop.md`. Thực nghiệm này sẽ được **lặp lại trên dữ liệu AIST++ và múa thật** ở Cổng 0 (§5.3) để thay nhiễu-pixel-giả bằng sai số detector thật.

**Bản đồ đặt góc máy (sản phẩm phụ, `experiments/ban_do_dat_may.py`).** Từ cùng bộ máy đó, nhóm quét lưới 2D **độc lập** phương vị của từng máy (−90°…+90°, có che khuất) và chấm điểm đồng thời độ phủ + MPJPE, cho ra một *hướng dẫn đặt máy định lượng* thay vì một con số đơn lẻ — thứ sản phẩm 1-camera của đối thủ (Choreoto) không có. Kết quả (lưới 7×7): dải ~90° đối xứng quanh chính diện cho độ chính xác tốt nhất (<12mm) với độ phủ ~90–97%; cặp ~180° thoái hoá (~247mm); cặp kề nhau phủ cao nhưng kém chính xác. Khuyến nghị tự động: **hai máy lệch ~90°, đối xứng quanh mặt trước** (vd −30°/+60°: phủ 90.7%, MPJPE 11.2mm). Chi tiết: `experiments/ket-qua-ban-do-dat-may.md`.

**Độ nhạy với sai số đồng bộ & hiệu chỉnh (`experiments/do_nhay_sync_calib.py`).** Quay bằng 2 điện thoại có hai nguồn lỗi mà camera đơn không gặp — không genlock (lệch thời gian) và hiệu chỉnh không hoàn hảo — nên nhóm đo ngưỡng chịu đựng để đặt tiêu chí nghiệm thu M1/M2:

| Nguồn sai số | Ảnh hưởng đo được | Ngưỡng thiết kế |
|---|---|---|
| **Đồng bộ** (lệch thời gian 2 máy) | nền 11.3mm → nửa khung@30fps (16.7ms) 12.7mm → trọn 1 khung (33ms) 15.9mm (múa thật nhanh hơn ⇒ tệ hơn) | quay **60fps** + căn **vỗ tay**, giữ lệch < nửa khung |
| **Hướng ngắm** (hiệu chỉnh xoay) | rất nhạy: 0.5°→26mm, **1°→48mm** (đòn bẩy góc) | **ChArUco**, sai < ~0.5° |
| **Vị trí máy** (hiệu chỉnh dời) | ~tuyến tính 1:1: 5cm→26.6mm | đo vị trí < ~1–2cm |

Ba ngưỡng này là **đóng góp phương pháp**: chúng biến "đồng bộ + hiệu chỉnh không genlock" (điểm §5.2) thành tiêu chí kiểm được, thứ giải pháp 1-camera không phải đối mặt. Chi tiết: `experiments/ket-qua-do-nhay-sync-calib.md`.

**Bền vững với outlier 2D (`experiments/robust_outliers.py`).** Detector 2D thật thỉnh thoảng cho khớp sai hẳn (đổi trái/phải, bắt nhầm người) — một quan sát sai làm DLT bình phương tối thiểu hỏng cả điểm 3D. Nhóm bổ sung `triangulate_robust` (cổng sai số tái chiếu + loại-dần-view cho ≥3 máy) và bật được qua `fuse_multiview(robust=True)`. Kết quả tiêm outlier: ở 5% quan sát lỗi, robust kéo MPJPE từ ~49mm (DLT thường) về ~21mm (giảm ~56%) cho cả 2 và 3 máy. Một phát hiện **trái trực giác và trung thực**: dưới mô hình outlier độc lập từng quan sát, máy thứ 3 chỉ giúp thêm ít (13.6 vs 15.0mm ở 2%) vì một khớp dễ bị ≥2/3 view sai cùng lúc; máy thứ 3 chỉ kháng outlier mạnh khi lỗi **tương quan theo view** (ngược sáng/che khuất kéo dài). ⇒ `robust=True` là mặc định cho Cổng 0; vai trò máy thứ 3 được định vị lại đúng mức, không thổi phồng. Chi tiết: `experiments/ket-qua-robust-outliers.md`.

**Khử nhiễu bằng ràng buộc độ dài xương (`experiments/rang_buoc_xuong.py`).** Tam giác hoá từng khớp độc lập khiến độ dài xương (vốn phải **cứng**) dao động theo khung — một dấu hiệu nhiễu đo được **không cần ground-truth** qua metric mới `bone_length_std`. Nhóm thêm bước cleanup `enforce_bone_lengths` dùng **chiếu ràng buộc đối xứng (kiểu Position-Based Dynamics)**: ép độ dài về trung vị theo thời gian bằng cách dịch **cả hai** đầu mỗi xương, lặp nhiều vòng → phân tán sai số thay vì dồn. Ablation trung thực cho thấy hai điều **phản trực giác**: (a) cách dựng lại xương kiểu **FK từ root** tuy cho xương cứng tuyệt đối nhưng **làm MPJPE tệ hơn baseline ở mọi mức nhiễu** (dồn sai số dọc chuỗi động học) — nên bị loại; (b) ngay cả PBD cũng có **ngưỡng giao**: ở nhiễu 1px (rất sạch) nó tệ hơn baseline (~+38%), nhưng ở vùng nhiễu thực của detector 2D (≥3px) nó **giảm** MPJPE và lợi ích tăng theo nhiễu (3px: ~+5%, 6px: ~+11%). ⇒ bật bước này khi chạy detector 2D thật ở Cổng 0 (siêu tham số nghiệm thu), tắt trên dữ liệu cực sạch; `bone_length_std` bổ sung vào bộ metric không-cần-GT (cùng jitter, foot-slip). Chi tiết: `experiments/ket-qua-rang-buoc-xuong.md`.

**Tam giác hoá có trọng số tin cậy (`experiments/trong_so_tin_cay.py`).** Detector 2D thật xuất confidence mỗi khớp, thấp đúng lúc toạ độ nhiễu nhất (bị che/mờ/ra rìa). Nhóm thêm trọng số vào `triangulate_dlt(weights=…)` và đường nạp `fuse_multiview(confidences=…)`: view tin cậy thấp bị giảm ảnh hưởng mềm (khác robust loại cứng). Hai phát hiện **có điều kiện, trung thực**: (a) lợi ích chỉ có khi confidence **tương quan** với nhiễu — confidence ngẫu nhiên làm MPJPE **tệ hơn ~22%**; (b) *cách* chuyển confidence sang trọng số quyết định độ lợi: trọng số **tuyến tính** (w=conf) chỉ giảm ~3%, nhưng **nghịch phương sai** (w=1/σ², coi confidence như ước lượng phương sai — tối ưu Gauss–Markov) giảm ~9% (gấp ~3×); bình phương thì tệ hơn. ⇒ phải **hiệu chuẩn confidence→phương sai** trên tập validation rồi lấy trọng số nghịch-phương-sai; đây là điểm đánh giá đo được ở tầng perception. Ba lớp khử nhiễu bổ trợ nhau: **robust (lỗi thô) + weighted nghịch-phương-sai (nhiễu mềm) + ràng buộc xương (nhiễu radial)**. Chi tiết: `experiments/ket-qua-trong-so-tin-cay.md`.

**Hợp nhất ba lớp khử nhiễu trên nhiễu hỗn hợp (`experiments/tong_hop_khu_nhieu.py`).** Ba lớp trên trước đó mỗi lớp đo riêng trên đúng loại lỗi nó nhắm; mocap 2-view thật thì dính **cả ba cùng lúc**. Thực nghiệm cuối trộn lỗi thô (2% quan sát, 60–220px) + nhiễu mềm theo confidence (2–12px) rồi bật **cộng dồn** từng lớp: MPJPE 38.9 → 26.1 (robust) → 24.5 (weighted) → 22.5mm (ràng buộc xương) — giảm **~42%**, độ lệch chuẩn chiều dài xương về **0**; ba lớp **cộng dồn dương, không đánh nhau**. Hai kết quả **không hiển nhiên**: (a) robust và weighted **chia nhau ngân sách nhiễu mềm** — lợi ích cộng thêm của weighting **tăng theo ngưỡng cổng** (~+3% ở 10px lên ~+12% ở 60px) vì ngưỡng cao để lọt nhiều nhiễu mềm hơn cho weighting xử lý, và **có ngưỡng tối ưu cho độ chính xác tổng hợp** (~15–20px: thấp quá cắt nhầm view chỉ nhiễu mềm, cao quá lọt lỗi thô); (b) muốn hai lớp không giẫm chân, `triangulate_robust` phải **tách bạch** — cổng chọn inlier bằng **hình học thuần** (không trọng số) rồi *chỉ phép khớp cuối* mới áp trọng số, nếu không một view sạch bị hạ trọng số sẽ reproject tệ và bị loại nhầm (bắt được bằng unit-test). ⇒ quy tắc thiết kế cụ thể cho Cổng 0: đặt ngưỡng robust **trên** dải nhiễu mềm dự kiến (ước từ confidence) và **dưới** biên lỗi thô. Chi tiết: `experiments/ket-qua-tong-hop-khu-nhieu.md`.

**Hiệu chuẩn confidence → phương sai, không cần 3D GT (`experiments/hieu_chuan_tin_cay.py`, `choreo/mocap/conf_calib.py`).** Trọng số nghịch-phương-sai (§trên) chỉ đúng khi σ là phương sai **thật**; confidence sống của detector là điểm số **đơn điệu nhưng méo**, không tỉ lệ 1/σ. Nhóm hiện thực quy trình hiệu chuẩn: học bản đồ confidence→σ(px) từ **sai số tái chiếu** (`per_view_reproj_residual`) — proxy nhiễu **đo được KHÔNG cần hệ mocap tham chiếu** — với hồi quy đơn điệu PAV cho ổn định. Quét độ méo γ (conf = rel^γ): dùng thẳng confidence sống chỉ lợi mờ nhạt ở γ=1 và **thành net-âm khi méo tăng** (γ=2: 25.2mm > 24.4mm không trọng số), trong khi **hiệu chuẩn bất biến theo độ méo**, giữ 22.0mm và **lấy lại ~85% lợi ích của trọng số oracle** (biết σ thật, 21.6mm) ở mọi mức méo. Đây là mảnh còn thiếu Vòng 10 đã chỉ ra — nay đã đo được. Một tinh chỉnh toán: bội số hàng DLT đúng cho Gauss–Markov là **1/σ** (không 1/σ²) vì DLT nhân hàng rồi bình phương trong SVD. ⇒ ở Cổng 0, hiệu chuẩn detector thật trên vài clip (đo tái chiếu) rồi nạp trọng số đã hiệu chuẩn vào `fuse_multiview` — đây là điểm đánh giá đo được ở tầng perception. Chi tiết: `experiments/ket-qua-hieu-chuan-tin-cay.md`.

**Kiểm định thước đo đánh giá không cần 3D GT (`experiments/danh_gia_khong_gt.py`, `choreo/eval/metrics.py::reprojection_error`).** Cả sáu thực nghiệm trên đều chấm bằng **MPJPE** — cần **3D ground-truth**, chỉ có trên dữ liệu tổng hợp. Trên video múa **thật** ở Cổng 0 sẽ *không có* 3D GT, nên phải có một thước đo GT-free đáng tin để so phương pháp/chọn siêu tham số. Nhóm dùng mẹo **camera held-out** (Đường B): dựng 3D từ các máy còn lại, chiếu lên **một camera giữ lại độc lập** rồi so với 2D quan sát ở đó — đo được **không cần 3D GT**. Thực nghiệm kiểm trên dữ liệu tổng hợp (có cả hai) và cho thấy sai số tái chiếu held-out **bám sát MPJPE thật**: Pearson r≈**0.99**, Spearman ρ≈**0.98** trên {12 điều kiện × 2 phương pháp}. Một điểm **trung thực với số liệu**: nếu chỉ quét một nút nhiễu Gaussian thì mọi thước đo đều tăng đơn điệu → tương quan ~1 là *hiển nhiên*, **không** phân biệt được held-out với tái chiếu *in-sample* (chiếu lại chính máy đã dựng) — cả hai đều r≈0.998. Chỉ khi thêm **outlier thô** (nhiều cơ chế chất lượng) mới lộ vì sao phải held-out: trên các ca có outlier, in-sample tụt còn r≈**0.78** (bị chính quan sát chứa outlier dùng để fit bơm sai lệch, thậm chí **không nhận ra** robust đã kéo MPJPE 64.6→15.1mm vì residual in-sample gần như đứng im 18.7→13.1px), trong khi held-out giữ r≈**0.99** vì chấm bằng camera tham chiếu sạch độc lập. ⇒ đây là **giao thức đánh giá Cổng 0 đã được kiểm định**, và là một **lý do kỹ thuật cụ thể cho cấu hình ≥3 máy** (luôn có camera giữ lại làm giám khảo) mà giải pháp 1-camera không thể có; vẫn nên thêm một mẩu AIST++ (có 3D GT) để chốt hệ số quy đổi px→mm. Chi tiết: `experiments/ket-qua-danh-gia-khong-gt.md`.

**Cross-validation LOCO cho thước đo GT-free (`experiments/danh_gia_loco.py`, `choreo/eval/metrics.py::reprojection_error_loco`).** Thước đo held-out (§trên) còn một điểm yếu: phụ thuộc **chọn máy nào để giữ lại** — trên hiện trường ta không biết máy nào đáng tin. Nhóm bổ sung **leave-one-camera-out**: lần lượt giữ lại từng máy, dựng 3D từ các máy còn lại rồi trung bình sai số tái chiếu (điểm ước lượng) kèm **độ lệch giữa các fold** (tín hiệu bất định) — vẫn GT-free. Ba kết quả **trung thực**: (a) LOCO-mean bám sát MPJPE (r≈**0.997**); (b) *đúng như số liệu bắt phải nói*, khi các máy **đồng đều chất lượng** thì chọn máy giữ lại **gần như không** đổi tương quan (dải r chỉ **0.001**) — held-out đơn của §trên **không mong manh** ở chế độ này, nên lợi ích thật của LOCO **không** phải "sửa tương quan" mà là **giảm phương sai** ước lượng (CV 0.011 vs 0.014–0.021, ~**40%** chặt hơn) → xếp hạng hai phương pháp gần nhau đáng tin hơn; (c) tính phụ-thuộc-chọn-máy chỉ nguy hiểm khi **một máy kém hơn hẳn** — lúc đó held-out đơn nở dải tới **~21px** tuỳ chọn máy (không cách GT-free nào biết tin cái nào), còn **LOCO-std tăng vọt ×43** (0.18→7.7px) làm **cảnh báo QA hiện trường**: quay xong chạy LOCO, std cao bất thường ⇒ có máy lệch/đồng bộ sai/che khuất, quay lại — không cần hệ mocap tham chiếu. ⇒ LOCO là công cụ chấm điểm chuẩn của Cổng 0 và thêm một lý do kỹ thuật cho cấu hình **≥3 máy** (cần còn ≥2 máy dựng mỗi fold). Chi tiết: `experiments/ket-qua-danh-gia-loco.md`.

---

## 6. Kết quả dự kiến và đóng góp

**Sản phẩm:**
1. Pipeline mã nguồn bắt chuyển động hai điện thoại → clip 3D chuẩn hoá.
2. Công cụ sequencer sân khấu 3D trên web, xuất view tập cá nhân.
3. Bộ dữ liệu múa hai-camera tự thu + báo cáo đánh giá định lượng.
4. **Bộ thực nghiệm hình học tái lập được (thuần CPU)** định lượng ảnh hưởng góc đặt máy / số máy / nhiễu 2D / che khuất — làm nền phương pháp cho Cổng 0 (§5.4).

**Đóng góp (novelty), đóng khung hệ thống + khả dụng + đánh giá:**
1. Pipeline **hai điện thoại tối giản** cho người không chuyên (hiệu chỉnh < 2 phút, đồng bộ bằng vỗ tay), không cần đồng bộ phần cứng.
2. **Khảo sát định lượng** độ chính xác mocap hai view trên **múa thật** và theo **góc đặt máy** — số liệu chưa từng có.
3. **Ghép trọn chuỗi** capture → 3D → dàn dựng → xuất view tập, chưa sản phẩm/nghiên cứu nào làm liền mạch.

---

## 7. Kế hoạch thực hiện (15 tuần, 2 nhánh song song)

- **Nhánh A — Perception (lõi ngành):** M1, M2, M3, M5.
- **Nhánh B — Sequencer & hệ thống:** M4 (xây bằng clip AIST++ giả từ tuần 1), hỗ trợ định dạng dữ liệu.

| Tuần | Nhánh A | Nhánh B | Mốc |
|---|---|---|---|
| 1 | Cài EasyMocap/RTMPose (GPU lab), đọc MAMMA/AIST++ | Dựng R3F + clip giả | Chốt định dạng + đề cương |
| 2 | Thu 24 clip 2 điện thoại + clap; ingest | Hiển thị 1 vũ công | Bộ clip test |
| 3 | Hiệu chỉnh ChArUco + reprojection | Lưới nhịp-8 + timeline | Calib có số |
| 4 | Đồng bộ audio + keypoint | Kéo-thả ≤8 vũ công | Sync < 1 frame |
| 5 | Hợp nhất ra SMPL 1 clip đầu-cuối | Nhân bản/đối xứng/lệch nhịp | Clip 3D thô |
| 6 | **Cổng 0**: chấm 1-cam vs 2-cam | Đường đi sàn | **Quyết định ĐI/DỪNG** |
| 7 | Làm mượt + foot-lock + root motion | Va chạm + camera POV | Clip sạch |
| 8 | Tái định hướng Mixamo, xuất glTF | **Gộp clip thật vào sequencer** | Clip thật chạy web |
| 9 | Củng cố pipeline | Xuất video POV/gương | **Bảo vệ giữa kỳ** |
| 10 | Bộ metric múa (M5) | Hoàn thiện UX xuất view | Metric chạy |
| 11 | Thí nghiệm 1-cam/2-cam + góc máy | Đánh bóng sân khấu | Bảng kết quả chính |
| 12 | Infill che khuất (tùy chọn) | Tính năng phụ | — |
| 13 | Viết phương pháp + kết quả | Viết hệ thống + video demo | Nháp luận văn |
| 14 | Rà số liệu, hình bảng | Hoàn thiện demo | Luận văn hoàn chỉnh |
| 15 | Tập bảo vệ | Tập bảo vệ | **Bảo vệ cuối kỳ** |

**Rủi ro chính & dự phòng:** nếu Cổng 0 trượt → thu hẹp vốn động tác về nhóm đạt, hoặc dùng clip AIST++ cho sequencer; nhánh B độc lập với chất lượng mocap nên không đổ vỡ toàn cục. "Khảo sát giới hạn mocap hai-điện-thoại" tự nó vẫn là đóng góp.

---

## 8. Phân công

| Thành viên | Phụ trách | Kiến thức ngành vận dụng |
|---|---|---|
| Sinh viên 1 (Nhánh A) | M1–M3, M5: capture, hợp nhất đa-view, làm sạch, đánh giá | Thị giác máy tính, hình học đa-view, IK/động học, ước lượng trạng thái |
| Sinh viên 2 (Nhánh B) | M4: sequencer web, sân khấu 3D, xuất view; hỗ trợ định dạng | Kỹ thuật phần mềm, đồ họa 3D, xử lý tín hiệu nhịp |
| Chung | Thu dữ liệu, viết luận văn, đánh giá, bảo vệ | |

*Việc cần làm sớm ngoài lập trình:* xác nhận với GVHD rằng đồ án perception + đồ họa thuần phần mềm (không robot vật lý) được chấp nhận.

---

## 9. Tài liệu tham khảo

[1] Two Views Are Better than One (sparse-view 3D pose). https://arxiv.org/html/2311.12421v2
[2] AIST++ Dance Dataset. https://google.github.io/aistplusplus_dataset/
[3] DanceNet3D, CVPR-W 2026. https://openaccess.thecvf.com/content/CVPR2026W/3DMV/
[4] MAMMA — markerless multi-view SMPL-X, 2026. https://mamma.is.tue.mpg.de/ ; https://arxiv.org/pdf/2506.13040
[5] U-HMR — HMR from arbitrary multi-view, 2024. https://arxiv.org/html/2403.12434v1
[6] HeatFormer, 2024/25. https://arxiv.org/html/2412.04456v1
[7] Camera placement for markerless mocap (study). https://pmc.ncbi.nlm.nih.gov/articles/PMC13378133/
[8] Humans as a Calibration Pattern, 2024. https://arxiv.org/abs/2412.19089
[9] VisualSync, NeurIPS 2025. https://stevenlsw.github.io/visualsync/
[10] OSDCap — physics-based motion refinement, 2024. https://arxiv.org/html/2410.07795v2
[11] EasyMocap (ZJU3DV). https://github.com/zju3dv/EasyMocap
[12] XRMoCap (OpenXRLab). https://github.com/openxrlab/xrmocap
[13] Pose2Sim. https://github.com/perfanalytics/pose2sim
[14] Choreoto. https://choreoto.com/
[15] DanceSculpt, IJHCI 2024. https://www.tandfonline.com/doi/full/10.1080/10447318.2024.2360773
[16] beat_this — beat/downbeat tracking (ISMIR 2024). https://github.com/CPJKU/beat_this
[17] Kovar et al. — Footskate cleanup. https://research.cs.wisc.edu/graphics/Temp/kovar/cleanup-submission.pdf
[18] RTMPose. https://github.com/open-mmlab/mmpose ; ViTPose. https://github.com/ViTAE-Transformer/ViTPose
[19] SMPL-X model license (phi thương mại). https://smpl-x.is.tue.mpg.de/modellicense.html
[20] Three.js / React Three Fiber. https://threejs.org/ ; https://docs.pmnd.rs/react-three-fiber

*Chi tiết kỹ thuật đầy đủ: `nghien-cuu-choreo-sequencer.md` (khả thi), `dac-ta-mvp-choreo-2cam.md` (đặc tả MVP), `gate0-thiet-ke-thuc-nghiem.md` (thực nghiệm), `experiments/ket-qua-2view-tong-hop.md` (kết quả hình học tổng hợp, §5.4), `experiments/ket-qua-ban-do-dat-may.md` (bản đồ đặt góc máy, §5.4), `experiments/ket-qua-do-nhay-sync-calib.md` (độ nhạy sync/calib, §5.4), `experiments/ket-qua-robust-outliers.md` (bền vững outlier, §5.4), `experiments/ket-qua-rang-buoc-xuong.md` (ràng buộc độ dài xương, §5.4), `experiments/ket-qua-trong-so-tin-cay.md` (trọng số tin cậy, §5.4), `experiments/ket-qua-tong-hop-khu-nhieu.md` (hợp nhất ba lớp khử nhiễu, §5.4), `experiments/ket-qua-hieu-chuan-tin-cay.md` (hiệu chuẩn confidence→phương sai GT-free, §5.4), `experiments/ket-qua-danh-gia-khong-gt.md` (kiểm định thước đo đánh giá GT-free held-out, §5.4), `experiments/ket-qua-danh-gia-loco.md` (cross-validation LOCO + chẩn đoán QA, §5.4), `teardown-choreoto.md` (phân tích đối thủ).*
