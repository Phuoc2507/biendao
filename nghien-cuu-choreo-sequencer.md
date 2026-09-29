# Nghiên cứu khả thi: 3D Choreography Sequencer (DAW cho vũ đạo)

*Tổng hợp từ 4 luồng nghiên cứu độc lập, mỗi luồng ~4–5 vòng tìm kiếm web, ưu tiên nguồn 2024–2026. Ngày: 2026-09-29.*

---

## 0. Tóm tắt điều hành (đọc cái này trước)

**Ý tưởng khả thi về mặt kỹ thuật, và có khoảng trống thị trường thật — nhưng không phải đất trống.** Ba kết luận lớn:

1. **Phần "sequencer + sân khấu 3D + đội hình" là chuyện đã giải quyết được.** Render 10–20 nhân vật 60fps, vẽ đường đi, mirror/offset clip, cảnh báo va chạm — công nghệ chín muồi, rủi ro thấp. Đây KHÔNG phải chỗ để lo.

2. **Điểm sống-chết là MoCap 1 camera cho MÚA.** Với động tác đứng thẳng, hướng mặt vào camera → tốt (~35–45mm, gần chuyên nghiệp). Nhưng đúng đặc trưng của múa — **xoay người/quay lưng, động tác sàn, nhảy, tay chân bắt chéo** — thì **chưa giải được**, lỗi gấp 2–3 lần và cần bước dọn dẹp (cleanup). **Không được hứa "tự động ra clip sạch hoàn toàn".**

3. **Hai cạm bẫy ít ai để ý:**
   - **License SMPL/SMPL-X là PHI THƯƠNG MẠI** — nền của gần như mọi model mocap. Bán sản phẩm phải mua license từ Meshcapade, HOẶC dùng API thương mại (Move.ai/DeepMotion) đã có sẵn bản quyền.
   - **Đối thủ Choreoto đã chiếm ~70–80% lãnh thổ xung quanh** và nhắm đúng nhóm K-pop cover team. Phải teardown họ trước khi định vị.

**Khuyến nghị chiến lược:** Không tự xây engine mocap giai đoạn đầu. **Dùng API thương mại (Move.ai/DeepMotion) làm lớp mocap**, dồn toàn lực vào cái thực sự khác biệt: **vòng lặp "quay clip từng vai → clip 3D → xếp/nhân bản/mirror trên timeline nhịp → xuất bài tập POV riêng cho từng vũ công"**. Đây là thứ chưa ai làm trọn vẹn.

---

## 1. Các vấn đề nghiên cứu cốt lõi & giải pháp

### VĐ1 — MoCap 3D từ 1 video điện thoại cho vũ đạo *(rủi ro cao nhất)*

**Vấn đề:** Biến 1 video điện thoại quay người múa → clip 3D (joint rotations) sạch, tái sử dụng được.

**Hiện trạng (2024–2026):**
- Model **video, world-grounded** là hướng đúng (không dùng model từng-ảnh vì rung): **WHAM** (CVPR 2024), **GVHMR** (SIGGRAPH Asia 2024), **TRAM** (ECCV 2024), **PromptHMR-Vid** (2025), **DanceHMR** (2026, đúng chủ đề múa nhất).
- Độ chính xác: **~35–45mm PA-MPJPE** cho vũ đạo đứng thẳng, hướng camera — tốt. Nhưng benchmark Fit3D (2025): động tác khó (cúi ngược, tự che khuất) lỗi **118–155mm vs ~67mm** cho tư thế thường → gấp đôi trở lên.
- **Foot skating & quỹ đạo di chuyển:** WHAM/GVHMR/DanceHMR đều dự đoán foot-contact để khóa chân, nhưng chưa hoàn hảo với động tác chân nhanh/nhảy. Camera tĩnh + 1 mắt → **độ sâu (depth) mơ hồ** → khoảng cách di chuyển và độ dài sải chân là output kém tin cậy nhất.

**Giải pháp:**
- **Đường nhanh, ít rủi ro (khuyến nghị giai đoạn đầu):** dùng API thương mại.
  - **Move.ai** — chính xác nhất cho động tác phức tạp/múa (~$0.012/giây), nhưng 1-camera là điểm yếu, họ khuyên nhiều camera.
  - **DeepMotion Animate 3D** — rẻ, pipeline đầy đủ: xuất **FBX/BVH/GLB + Foot Locking + Motion Smoothing + auto-retarget**. Đây là đúng thứ mình cần.
  - Cả hai **đã có bản quyền thương mại** → né được vấn đề license SMPL.
- **Đường tự host (IP riêng, giai đoạn sau):** **WHAM** (license code CC BY 4.0 — dễ chịu nhất, gần real-time) + tự thêm bước làm mượt/khóa chân. Tránh GVHMR (license cấm cả thương mại lẫn chỉnh sửa).
- **Bắt buộc:** một bước **cleanup có người trong vòng lặp** (human-in-the-loop) hoặc tinh chỉnh bằng physics. Một số clip sẽ không dùng được — chấp nhận điều đó.

*Nguồn: WHAM https://arxiv.org/html/2312.07531v2 · GVHMR https://github.com/zju3dv/GVHMR · DanceHMR https://arxiv.org/html/2605.18102 · Fit3D benchmark https://pmc.ncbi.nlm.nih.gov/articles/PMC13413046/ · DeepMotion https://www.deepmotion.com/animate-3d · Move.ai reviews https://www.rokoko.com/insights/the-future-of-motion-capture*

### VĐ2 — License SMPL *(có thể chặn cả dự án)*

**Vấn đề:** SMPL/SMPL-X body model (Max Planck) là **phi thương mại**, độc lập với license code. WHAM code là CC BY 4.0 nhưng nếu sản phẩm xuất ra **SMPL params** để bán thì vẫn cần license.

**Giải pháp:** (chọn 1)
- Mua **commercial sub-license từ Meshcapade** (smpl@max-planck-innovation.de); hoặc
- **Dùng API thương mại** (Move.ai/DeepMotion/Meshcapade) — họ xuất **FBX/BVH xương thường** (không phải SMPL params), đã mang sẵn quyền. → **cách sạch nhất giai đoạn đầu.**

*Nguồn: SMPL-X license https://smpl-x.is.tue.mpg.de/modellicense.html*

### VĐ3 — Đồng bộ audio & lưới nhịp 8 *(dễ hơn tưởng)*

**Phát hiện quan trọng:** audio trong video quay **chính là bản nhạc gốc phát trong phòng** (chỉ thêm vang + ồn), KHÔNG phải bản cover khác. → bài toán chỉ là "tìm offset của cùng một tín hiệu bị nhiễu" → **dễ và rất bền**.

**Giải pháp:**
- **Beat/downbeat:** dùng **`beat_this`** (Beat This!, ISMIR 2024) — license **MIT cả code lẫn model** (thương mại thoải mái), downbeat F1 ~78% (hơn madmom ~65%). Chạy **1 lần/bài trên server**, cache lưới nhịp. Tránh madmom (license non-commercial + ngừng bảo trì).
- **Đồng bộ:** **cross-correlation GCC-PHAT** trên onset envelope (librosa + scipy, <1 giây) để tìm offset. Không cần DTW. Thêm **fingerprint kiểu Shazam (dejavu)** để xác minh đúng bài + chống ồn.
- **Client-side:** `essentia.js` (WASM) chỉ dùng cho UI real-time (nhấp nháy theo beat), không dùng làm lưới nhịp chính thức.
- Lưu lưới nhịp: `{bpm, first_downbeat_offset, beat_times[], downbeat_times[]}`, có nút override thủ công cho bài không phải 4/4.

*Nguồn: beat_this https://github.com/CPJKU/beat_this · sync FMP https://www.audiolabs-erlangen.de/resources/MIR/FMP/C3/C3_MusicSynchronization.html · dejavu https://github.com/worldveil/dejavu · essentia.js https://mtg.github.io/essentia.js/*

### VĐ4 — Render 3D web + retarget + tách root motion + foot-lock *(phần lớn có sẵn)*

**Render:** **10–20 nhân vật có xương chạy 60fps là thoải mái** (desktop) và khả thi (mobile tầm trung). Ngưỡng đau của Three.js là ~200+ nhân vật. Dùng `SkinnedMesh` + `AnimationMixer` chuẩn — **không cần** VAT/instancing ở quy mô này (và VAT sẽ làm mất khả năng IK chỉnh tư thế). Giới hạn thật trên mobile là **fill-rate** (bóng đổ, hậu kỳ), không phải skinning: giữ rig ≤40 xương, dùng blob shadow, tắt postFX nặng.

**Chuẩn xương:** **Mixamo (`mixamorig`)** — hub tương thích chung (Mixamo, Ready Player Me, VRM, Unreal, Unity đều map về đây). Chọn 1 mannequin low-poly Mixamo làm chuẩn.

**Đường đi trên sàn:** có sẵn hết — `THREE.CatmullRomCurve3` + `getTangentAt()` + `computeFrenetFrames()` để tự xoay mặt theo tiếp tuyến.

**2 phần khó, nằm ở pipeline OFFLINE (không phải trong browser):**
- **Retarget SMPL→Mixamo** — dễ sai trục/tư thế nghỉ (T-pose vs A-pose) → chân ngược, tay ra sau. Làm offline bằng **Blender + Rokoko (free) / Auto-Rig Pro**. `SkeletonUtils.retargetClip` của Three.js chỉ dùng khi hai rig cùng tên xương, KHÔNG dùng làm cầu nối SMPL.
- **Foot-lock cleanup** — phải là bước xử lý clip riêng (thuật toán Kovar: phát hiện frame chân chạm sàn → ghim IK → giải two-bone IK → blend), không phải nút bật/tắt. Có thể dùng **UnderPressure** (ML) để lấy nhãn contact.

**Tách root motion:** thuật toán game-engine chuẩn — lấy vận tốc trung bình của hông, trừ khỏi track vị trí → clip "tại chỗ" + lưu quỹ đạo riêng. Làm offline.

**IK tương tác trong browser:** two-bone IK tự viết (~40 dòng) cho tay/chân + `threeIK`/`three-ik` cho chuỗi dài. Lưu ý: không có thư viện IK web nào "production-grade" như Unity/Unreal — chấp nhận vá víu.

*Nguồn: threejs perf https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196 · Kovar footskate https://research.cs.wisc.edu/graphics/Temp/kovar/cleanup-submission.pdf · UnderPressure https://arxiv.org/abs/2208.04598 · bedlam2 retarget https://github.com/PerceivingSystems/bedlam2_retargeting*

### VĐ5 — Đối thủ *(không phải đất trống)*

**Choreoto (choreoto.com) chiếm ~70–80% ý tưởng** và nhắm đúng K-pop cover team: sân khấu 3D + đếm nhịp + đường đi + "camera motion capture" + phòng riêng từng vũ công + xuất MP4 mirror/original.

**Điểm cần xác minh bằng tay (quan trọng nhất):** "vũ công" của Choreoto là **avatar toàn thân chuyển động thật** hay chỉ là **marker vị trí + video overlay**? Nếu là marker → **đó chính là khe hở của bạn**. Motion capture của họ không có tài liệu công khai.

Các đối thủ khác: **DanceForms 2** (đúng nghĩa "DAW cho vũ đạo" nhưng từ thập niên 90, dùng thư viện clip, không mocap điện thoại), **Choreographic/Stancz/Coryo/FORMI** (chỉ dot/marker đội hình, có cái đã 130k+ user → thị trường có trả tiền). **MVNT** (startup K-pop, gọi được $200k seed, hướng music→dance generation + bản quyền) — validate rằng "AI + K-pop dance + 3D" gọi được vốn.

**Khoảng trống thật (chưa ai làm trọn):** cho biên đạo **quay clip từng vai thật → clip 3D toàn thân → xếp/nhân bản/mirror/lệch nhịp CHÍNH những clip đó trên nhiều vũ công ảo**, + **xuất bài tập POV** ("nhìn từ vị trí của bạn") cho từng người. Đừng cạnh tranh ở mảng vẽ đội hình thuần (đã bị commoditize, nhiều app free).

*Nguồn: Choreoto https://choreoto.com/for/k-pop-teams/ · DanceForms https://charactermotion.com/products/danceforms/ · MVNT https://www.newsanyway.com/2026/08/28/mvnt-ai-dance-startup-targets-up-to-10m-as-k-pop-choreographer-turns-ip-problem-into-platform · workflow K-pop https://udansa.com/en/dance-guide/k-pop/kpop-cover-crews/kpop-group-training-guide*

---

## 1B. CẬP NHẬT: Hướng 2 camera (2 điện thoại) — quyết định chốt

*Bổ sung sau vòng nghiên cứu riêng về multi-view. Đây là hướng đã chọn cho đồ án (phi thương mại).*

**2 máy là điểm tối ưu, có số liệu:** 1 cam = 64.4mm → 2 cam = **36.4mm MPJPE (giảm ~44%)**. Đường cong **bão hòa sau 2 máy** (2→7 chỉ thêm ~5mm) → **không cần 3–4 máy.**

**Đặt góc (dễ sai):** pipeline triangulation nên đặt **2 máy lệch ~60–90°, cả hai thấy người ở góc chính diện-đến-chéo**, cùng độ cao (tầm ngực), cùng khoảng cách. **KHÔNG đặt trước-sau 180°** — góc quay lưng làm hỏng bộ phát hiện 2D → triangulation ăn rác.

**2 máy vẫn KHÔNG giải được:** che khuất đồng thời cả 2 góc; mờ chuyển động nhanh (rolling shutter); trượt chân/trôi vị trí (vẫn cần foot-lock cleanup).

**Công cụ (license đã rõ):**
- **EasyMocap** (ZJU3DV) — xuất SMPL-X trực tiếp (body+tay+mặt). ⚠️ License đổi sang **PRL v1.0** (2026): cá nhân free, dự án "tổ chức" phải **điền form đăng ký** (miễn phí) — đồ án trường nên đăng ký cho chắc. Nhanh nhất ra SMPL-X.
- **Pose2Sim** — **BSD-3** (sạch), có calibration + sync tốt nhất, nhưng ra keypoint/OpenSim → phải **tự thêm bước fit SMPL**.
- **XRMoCap** — **Apache-2.0** (sạch nhất), xuất SMPL-X.

**3 bài toán mới + lời giải:**
1. **Calibration:** bảng **ChArUco** (giơ cho cả 2 máy cùng thấy ~1 phút) mặc định; auto-calib từ khung xương người (Pose2Sim) làm dự phòng. *Nguồn lỗi số 1 + chỗ novelty.*
2. **Đồng bộ:** **audio cross-correlation** (đã có, dưới-1-frame) + tinh chỉnh bằng vận tốc keypoint. **Quay 60fps.** Coi chừng trôi đồng bộ trên clip dài.
3. **Đặt máy:** 60–90° như trên.

**Pipeline 2-cam → SMPL đề xuất:** Quay 60fps ~60–90° + vỗ tay đầu clip → sync (audio + keypoint-speed) → calibrate ChArUco → 2D pose (RTMPose/ViTPose) mỗi góc → fuse (EasyMocap multi-view SMPL-X *hoặc* triangulate rồi fit SMPL) → cleanup (smoothing + foot-lock) → export FBX/BVH → retarget.

**Novelty luận văn (khẳng định có):** đóng khung là đóng góp **hệ thống + khả dụng** (không phải mạng SOTA mới). Hướng: (1) UX 2-điện-thoại cho người không chuyên; (2) đánh giá mocap riêng cho múa (xoay/sàn/quay lưng/nhảy) + nghiên cứu góc đặt máy; (3) infill che khuất bằng motion prior. **Công sức: tuần, không phải ngày** — tốn ở calibration UX, sync bền, ghép SMPL export/retarget, dựng tập test múa.

*Nguồn: Two Views Are Better than One https://arxiv.org/html/2311.12421v2 · placement study https://pmc.ncbi.nlm.nih.gov/articles/PMC13378133/ · EasyMocap https://github.com/zju3dv/EasyMocap · Pose2Sim https://github.com/perfanalytics/pose2sim · XRMoCap https://github.com/openxrlab/xrmocap · HumanCalib https://github.com/flodelaplace/HumanCalib*

---

## 1C. ĐÃ CÓ AI QUAY MÚA ĐA CAMERA → 3D CHƯA? (khảo sát prior-art, 4 luồng)

*Câu hỏi trực tiếp: đã có dự án nào dùng nhiều camera quay múa để ra mô hình chuyển động 3D chưa. Kết luận: **CÓ trong nghiên cứu, nhưng còn hở đúng chỗ đồ án định làm.***

### Nhóm 1 — Quay múa đa camera → 3D (đúng chủ đề, nhưng rig pro nhiều máy, chỉ để nghiên cứu)

| Dự án | Số camera | Loại | Ra gì | Năm | Ghi chú |
|---|---|---|---|---|---|
| **AIST++** | 9 | studio pro, đồng bộ | SMPL + khớp 3D (1408 seq) | 2021 | Bộ dữ liệu múa đa-view kinh điển; tái dựng từ 9 view (không phải mocap) |
| **DanceNet3D** | 29 | RealSense (bình dân) | 3D Gaussian Splatting, 35k frame | 2026 | Mới nhất, "phục vụ dạy múa" — nhưng 29 máy |
| **MAMMA** | **4 iPhone** | điện thoại | SMPL-X, sai số ~22mm vs Vicon | 2026 | ⭐ **Sát đồ án nhất** — điện thoại + có tập đánh giá riêng cho múa; gợi ý clap-sync |
| **MADS** | 3 | pro, đồng bộ | skeleton 3D (mocap GT) | 2017 | Có hip-hop/jazz; benchmark markerless đa-view sớm |
| **CMU Panoptic** | 480+ | dome khổng lồ | khớp 3D | 2016 | Có nhảy nhưng không chuyên múa |
| **HuMMan** | 10 RGB-D | studio | SMPL + point cloud | 2022 | Tổng quát, template cho pipeline |

### Nhóm 2 — Công cụ có sẵn để dùng (không phải làm lại)
- **EasyMocap** — có demo *"nhảy đường phố, 9 điện thoại"* → xuất SMPL-X. Mã nguồn mở.
- **OpenCap** (Stanford) — **đúng 2 iPhone**, nhưng cho y sinh/OpenSim, không phải múa.
- **Pose2Sim** — BSD-3, tự đồng bộ điện thoại bằng tương quan vận tốc keypoint, tối thiểu 2 máy (khuyên ~6).
- **Move.ai** (thương mại) — 2–6 điện thoại, xuất FBX/BVH/USD → **đối thủ/benchmark**, không xây lên được.
- **Rokoko Vision** — chế độ **2 camera** (dual-cam), xuất FBX/BVH.

### Nhóm 3 — Phương pháp sparse-view 2 camera (nền kỹ thuật, 2024–2026)
- **U-HMR** (2024): nhận tùy ý 1/2/3/4 view, **không cần calibration** (tự hồi quy camera pose). H36M: 1-view 52.9 → 2-view 42.5 → 4-view 36.3mm MPJPE.
- **HeatFormer** (2024/25): neural optimizer view-agnostic; 2-view PA-MPJPE 27.9mm.
- **Humans-as-calibration-pattern** (2024) & **VisualSync** (NeurIPS 2025): giải đúng bài **2 điện thoại không đồng bộ + không hiệu chỉnh** — tự tìm camera pose + offset thời gian dưới-frame từ khung xương người.
- **OSDCap / Physical Motion Restoration** (2024): tinh chỉnh physics, khử foot-skate cho động tác khó (múa/thể thao).
- Xu hướng chung: **2 view lấy lại ~nửa khoảng cách** giữa 1-view (~53mm) và 4-view (~31–36mm).

### Nhóm 4 — Sản phẩm end-to-end cho múa
- Hầu hết **chỉ xếp avatar/marker có sẵn**, KHÔNG bắt từ camera: DanceForms, Stancz, FORMI, Choreographic.
- **Choreoto** (đối thủ sát nhất) — quảng cáo "quay 3D bằng camera" nhưng **chỉ 1 camera**, tính năng phụ.
- **DanceSculpt** (nghiên cứu Hàn Quốc, IJHCI 2024) — dựng 3D dancer từ video **đơn camera** để dạy múa; rất sát ý tưởng nhưng đơn camera.

### 🎯 Kết luận cho định vị đồ án
1. **Hai bài 2026 (MAMMA 4-iPhone, DanceNet3D 29-cam) đã gần chạm ý tưởng "bắt múa bằng camera bình dân".** → **KHÔNG khai novelty là "người đầu tiên bắt múa bằng nhiều điện thoại"** — MAMMA vừa làm với 4 máy.
2. **Khoảng trống thật còn 3 chỗ:**
   - **Chưa ai ghép trọn chuỗi** capture đa-cam → 3D → **xếp/nhân bản/mirror/đường đi trên sân khấu → xuất view tập cá nhân (POV/gương)**. Các mảnh tồn tại rời rạc.
   - **Chưa ai làm bản tối giản ĐÚNG 2 điện thoại cho múa**, đồng bộ audio + tự hiệu chỉnh, không genlock (MAMMA vẫn 4 máy + genlock).
   - **Chưa ai đo** độ chính xác 2-view trên **múa thật** (nhanh/che khuất/xoay) — số 2-view (~42mm) đều đo trên lab chậm (H36M).
3. **Novelty đóng khung = hệ thống + khả dụng + đánh giá**, không phải mạng SOTA mới. Ba mảnh capture dùng đồ có sẵn; sequencer + đánh giá múa thật là phần tự xây.

*Nguồn: AIST++ https://google.github.io/aistplusplus_dataset/ · DanceNet3D https://openaccess.thecvf.com/content/CVPR2026W/3DMV/ · MAMMA https://mamma.is.tue.mpg.de/ , https://arxiv.org/pdf/2506.13040 · MADS http://visal.cs.cityu.edu.hk/downloads/mads-data-download/ · U-HMR https://arxiv.org/html/2403.12434v1 · HeatFormer https://arxiv.org/html/2412.04456v1 · Humans-as-calibration https://arxiv.org/abs/2412.19089 · VisualSync https://stevenlsw.github.io/visualsync/ · OpenCap https://www.opencap.ai/ · Rokoko Vision https://www.rokoko.com/products/vision · DanceSculpt https://www.tandfonline.com/doi/full/10.1080/10447318.2024.2360773 · Choreoto https://choreoto.com/*

---

## 2. Bảng "DÙNG SẴN vs TỰ XÂY" (phần bạn yêu cầu)

### ✅ Dùng sẵn — đừng mất công làm lại

| Hạng mục | Dùng gì | License | Ghi chú |
|---|---|---|---|
| MoCap từ video (giai đoạn đầu) | **DeepMotion** hoặc **Move.ai** API | Thương mại OK | Xuất FBX + foot-lock + retarget sẵn |
| MoCap tự host (giai đoạn sau) | **WHAM** | CC BY 4.0 (code) | Cần license SMPL riêng nếu xuất SMPL params |
| Beat/downbeat | **`beat_this`** | MIT | Chạy 1 lần/bài, cache |
| Đồng bộ audio | **librosa + scipy** (GCC-PHAT) + **dejavu** | ISC / MIT | <1 giây |
| Beat UI real-time | **essentia.js** | AGPL/thương mại* | Chỉ cho hiển thị |
| Render 3D | **Three.js / R3F** (`SkinnedMesh`+`AnimationMixer`) | MIT | Đủ cho 10–20 nhân vật |
| Mannequin + xương chuẩn | **Mixamo** rig (`mixamorig`) | Free | 1 mesh chuẩn |
| Đường đi sàn | `CatmullRomCurve3` + Frenet frames | MIT | Có sẵn trong Three.js |
| Retarget offline | **Blender + Rokoko / Auto-Rig Pro** | Free / mua | |
| Nhãn foot-contact | **UnderPressure** | Nghiên cứu | Tùy chọn |
| IK web | **threeIK / three-ik** + two-bone tự viết | MIT | |

*Kiểm tra kỹ license essentia.js cho mục đích thương mại.*

### 🔨 Tự xây — đây là giá trị & IP của bạn

| Hạng mục | Vì sao phải tự làm |
|---|---|
| **Multi-track sequencer nhịp 8** (kéo-thả clip, clone/mirror/offset canon) | Lõi sản phẩm, không có sẵn |
| **Vòng lặp "clip captured → xếp trên nhiều vũ công ảo"** | Chính là khác biệt cạnh tranh — chưa ai làm |
| **Bộ dựng lưới nhịp 8** (beat_this timestamps → bar → 8-count) | Glue, không phải thuật toán |
| **Orchestration đồng bộ** (fingerprint → offset → remap timeline) | Glue |
| **Tách root motion** (clip tại chỗ + quỹ đạo) | Thuật toán chuẩn, tự code cho glTF |
| **Foot-lock cleanup pass** | Thuật toán chuẩn (Kovar), tự code |
| **Mirror động tác** (đảo trục + hoán track trái/phải) | Fiddly nhưng đơn giản |
| **Cảnh báo va chạm giữa các thân thật** | Coryo chỉ làm cho marker |
| **Xuất bài tập POV / Mirror / Focus theo từng vũ công** | Khe hở thị trường lớn nhất |
| **Lớp R3F + IK tương tác chồng lên clip đang chạy** | Cần mô hình layering rõ ràng |

---

## 3. Rủi ro & Cổng quyết định (Go/No-Go Gates)

Đừng xây cả DAW rồi mới phát hiện mocap không dùng được. Làm theo cổng:

- **CỔNG 0 (vài ngày, KHÔNG code):** Quay 5–10 video múa K-pop thật bằng điện thoại (có cả đoạn xoay/quay lưng/động tác nhanh) → chạy qua **DeepMotion + Move.ai** → tự chấm: clip có đủ sạch để một biên đạo chấp nhận không? **Đây là van xả rủi ro quan trọng nhất.**
  - Nếu ĐẠT → tiến hành xây sản phẩm quanh API.
  - Nếu KHÔNG → pivot: bỏ mocap tự động, dùng thư viện động tác / nhập clip có sẵn, vẫn giữ được sequencer đội hình (giá trị vẫn cao).
- **CỔNG 1 (song song):** Teardown **Choreoto** — avatar của họ là chuyển động thật hay marker? Định vị dựa trên câu trả lời.
- **CỔNG 2:** Chốt license — dùng API thương mại (sạch) hay mua license SMPL.

**Rủi ro lớn nhất, xếp hạng:** (1) chất lượng mocap 1-camera cho múa nhanh; (2) Choreoto đã chiếm chỗ; (3) license SMPL; (4) fill-rate mobile.

---

## 4. Kiến trúc đề xuất (điều chỉnh so với bản gốc)

Kiến trúc bạn viết ban đầu **đúng và chuyên nghiệp**. Ba điều chỉnh dựa trên nghiên cứu:

1. **Lớp AI Motion Worker → thay bằng adapter gọi API thương mại** ở giai đoạn đầu (DeepMotion/Move.ai), thiết kế interface để sau này thay bằng WHAM tự host mà không đổi phần còn lại.
2. **Thêm một stage bắt buộc: "Motion Cleanup Pipeline"** (offline) = tách root motion + foot-lock + làm mượt + retarget về Mixamo, trước khi clip vào thư viện. Đây là nơi quyết định chất lượng.
3. **Audio: beat_this chạy server 1 lần/bài + cache**; offset đồng bộ tính nhẹ (client hoặc endpoint nhỏ). Bỏ librosa client-side cho lưới nhịp chính thức.

---

## 5. Kế hoạch tiếp theo (vòng nghiên cứu/validate kế)

1. **[Ưu tiên 1] Thực nghiệm CỔNG 0** — tôi có thể lập bộ tiêu chí chấm điểm clip mocap (jitter, foot-slip, đúng khi xoay, độ dài di chuyển) và quy trình test cụ thể trên DeepMotion/Move.ai.
2. **[Ưu tiên 2] Teardown Choreoto** — tôi có thể dùng browser mở choreoto.com, phân tích tính năng thực tế, xác định marker-vs-avatar, và lập bảng định vị.
3. **Đặc tả MVP** — bóc tách phạm vi tối thiểu (làm gì trước, cắt gì) để ra bản chạy sớm nhất, tập trung vào vòng lặp khác biệt.
4. **Chi phí vận hành** — mô hình hóa chi phí GPU/API theo số clip & người dùng (Move.ai ~$0.012/giây có thể đội lên nhanh).

---

*Toàn bộ khẳng định quan trọng đều có nguồn kèm theo trong từng mục. Đây là nghiên cứu thứ cấp — CỔNG 0 (thực nghiệm mocap trên video thật) là bước kiểm chứng sơ cấp chưa làm.*
