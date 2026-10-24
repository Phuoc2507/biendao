---
name: choreo-sequencer-project
description: "Dự án \"3D Choreography Sequencer\" (DAW cho vũ đạo) — kết luận nghiên cứu khả thi & quyết định kiến trúc"
metadata:
  node_type: memory
  type: project
  originSessionId: f7cefbb6-5344-4525-9e17-77dec9f96750
  modified: 2026-10-09T16:21:54.593Z
---

**PIVOT 2026-10-09 (ưu tiên hiện tại):** làm APP trước cho buổi văn nghệ truyền thống của khoa; bài báo gác lại; yêu cầu HUMAN4D (Zenodo 4473009) coi như không được duyệt. App mới là "sân khấu thẻ video": quay từng người một điện thoại, xoá phông offline (RVM ONNX CPU, GPL nên chỉ gọi ngoài), thẻ MP4 xếp chồng hình/mặt nạ, kéo xếp đội hình, thẻ tự trượt khớp nhạc, chạy Chrome laptop. Spec: `docs/superpowers/specs/2026-10-09-video-card-stage-design.md` (commit f0d7356). Người dùng cho phép "đập đi" model cũ: app mới ở `/` (code trong `web/src/stage/`), app 3D cũ giữ nguyên ở `/3d.html`. Người dùng không thích bị hỏi nhiều: tự quyết mặc định hợp lý.
**Why:** có hạn diễn gần, cần công cụ chạy được ngay. **How to apply:** mọi việc mới bám spec này; tải mô hình RVM/pip vẫn phải xin phép.

Dự án tại `D:\bien`: nền tảng số hóa vũ đạo — quay clip từng vai bằng điện thoại → mocap 3D → xếp trên timeline nhịp 8 trên nhiều vũ công ảo (sân khấu 3D) → xuất bài tập POV/mirror riêng từng người. Đối tượng: K-pop cover team, biên đạo. Báo cáo nghiên cứu đầy đủ: `D:\bien\nghien-cuu-choreo-sequencer.md`.

Kết luận nghiên cứu (2026-09-29, tổng hợp 4 luồng web research):
- **MoCap 1-camera cho múa là rủi ro số 1**: tốt cho tư thế đứng thẳng (~35-45mm), CHƯA giải được xoay người/quay lưng/động tác sàn/nhảy (lỗi gấp 2-3x). Bắt buộc bước cleanup, không hứa tự động sạch.
- **Quyết định: MUA mocap (DeepMotion/Move.ai API), không tự xây** giai đoạn đầu — cũng né được vấn đề license. Tự host WHAM (CC BY 4.0) để dành giai đoạn sau.
- **License SMPL/SMPL-X là PHI THƯƠNG MẠI** — nền của mọi model mocap. Cần license Meshcapade nếu tự host, hoặc dùng API thương mại.
- **Đối thủ Choreoto (choreoto.com) chiếm ~70-80%** ý tưởng, nhắm đúng K-pop team. PHẢI teardown xác minh: avatar chuyển động thật hay marker vị trí?
- Beat/downbeat: dùng `beat_this` (MIT). Đồng bộ audio: cross-correlation GCC-PHAT (audio video = nhạc gốc phát lại, dễ). Render 10-20 nhân vật 60fps trên Three.js: thoải mái, phần dễ.
- **Khác biệt cạnh tranh (IP thật)**: vòng lặp "clip captured thật → xếp/mirror/offset trên nhiều vũ công ảo" + xuất bài tập POV. Đừng cạnh tranh mảng vẽ đội hình thuần (đã commoditize).

CẬP NHẬT hướng đi (2026-09-29):
- **Dự án là ĐỒ ÁN TỐT NGHIỆP (phi thương mại)** → vấn đề license SMPL biến mất; được tự host model xịn miễn phí. Lưu ý: chạy trên GPU riêng KHÔNG cho phép thu phí — thương mại là do có thu tiền, không phải máy ở đâu.
- **Chốt dùng 2 CAMERA (2 điện thoại)** để tăng chính xác. Số liệu: 1cam 64.4mm → 2cam 36.4mm MPJPE (giảm 44%), bão hòa sau 2 máy (không cần 3-4). Đặt lệch 60-90°, KHÔNG trước-sau 180° (hỏng 2D detect).
- Công cụ multi-view: **EasyMocap** (ra SMPL-X, license PRL v1.0 cần đăng ký form free), **Pose2Sim** (BSD-3, calib+sync tốt nhưng phải tự thêm fit SMPL), **XRMoCap** (Apache-2.0).
- Pipeline 2-cam: quay 60fps + vỗ tay → sync audio+keypoint → calib ChArUco → 2D pose (ViTPose/RTMPose) → fuse SMPL-X → foot-lock cleanup → retarget.
- Novelty luận văn: đóng góp HỆ THỐNG+KHẢ DỤNG (UX 2-điện-thoại cho người thường, đánh giá riêng cho múa, góc đặt máy), không phải mạng SOTA mới. Công sức: tuần.

CẬP NHẬT (2026-09-29, phiên 2):
- **Người dùng học ngành Robot & Trí tuệ nhân tạo, ĐH SPKT TP.HCM (HCMUTE).** Đề tài HỢP ngành: phần lõi (multi-view pose, calibration/triangulation = sensor fusion, retarget/foot-lock = IK/động học, lọc/làm mượt = state estimation) trùng khớp curriculum. Phần web sequencer là lớp ứng dụng (kỹ thuật phần mềm, ngoài ngành). **KHÔNG làm robot vật lý** (người dùng chốt: khó, gác lại). Cần hỏi GVHD: đồ án perception thuần phần mềm có được chấp nhận không.
- **Prior-art (§1C trong báo cáo)**: multi-camera dance→3D ĐÃ CÓ trong nghiên cứu nhưng dùng rig nhiều máy. Sát nhất: **MAMMA (2026, 4 iPhone → SMPL-X, có eval múa)** và **DanceNet3D (2026, 29 cam → 3DGS)**. → **KHÔNG khai novelty "đầu tiên bắt múa bằng nhiều điện thoại"**. Khoảng trống thật: (1) chưa ai ghép trọn chuỗi capture→3D→xếp sân khấu→xuất POV; (2) chưa ai làm bản ĐÚNG 2 điện thoại cho múa, sync audio+tự calib không genlock; (3) chưa ai đo độ chính xác 2-view trên múa thật.
- **CHỐT: giữ ĐÚNG 2 điện thoại** (không linh hoạt 3-4). Đang viết đặc tả MVP + lộ trình theo tuần: `D:\bien\dac-ta-mvp-choreo-2cam.md`.

Bối cảnh đồ án đã chốt (2026-09-29): **1 học kỳ (~15 tuần), 2 người, có GPU lab trường.** Lộ trình 2 nhánh song song trong `dac-ta-mvp-choreo-2cam.md`: nhánh A = perception (M1-M3+M5, đúng lõi ngành), nhánh B = sequencer web (M4, xây bằng clip AIST++ giả từ tuần 1), gộp tuần 8. Cổng: Gate 0 tuần 6, bảo vệ giữa kỳ tuần 9, cuối kỳ tuần 15.

CẬP NHẬT (2026-09-29, phiên 3 — BẮT ĐẦU CODE): người dùng chốt "tập trung làm, ngừng viết tài liệu". Đã dựng repo Python tại `D:\bien` (git init xong, chưa có remote). Kiến trúc code = 5 module trùng đặc tả:
- `choreo/schema.py`: định dạng trao đổi (MotionClip, BeatGrid, CameraCalib), joint layout 17 khớp Y-up mét. **Đây là hợp đồng nối mọi module — sửa layout phải canh lại MPJPE.**
- `choreo/ingest/sync.py` (M1): GCC-PHAT audio + cross-corr tốc độ keypoint. Quy ước dấu: offset>0 = clip `sig` trễ hơn `ref`.
- `choreo/cleanup/smooth.py` (M3): Savitzky-Golay tự cài (không scipy), detect_foot_contacts, decouple_root_motion.
- `choreo/eval/metrics.py` (M5): mpjpe/pa_mpjpe/jitter/foot_slip/reprojection — trả mm, khớp ngưỡng Gate 0.
- `choreo/mocap/adapter.py` (M2): interface `MocapAdapter.capture(view_a,view_b,calib_a,calib_b,fps)->MotionClip` + `DummyAdapter` (chạy pipeline CPU không cần GPU). EasyMocap/XRMoCap cắm sau trên GPU lab.
- Test: `tests/` 20 unit test thuần numpy, **pass toàn bộ**. Chạy: `.venv/Scripts/python -m pytest -q`. LƯU Ý MÁY NÀY: dùng `python` (KHÔNG có `python3`); venv ở `.venv/Scripts/python.exe`.
- `calib/` là placeholder (cần opencv). Web sequencer M4 (React Three Fiber) CHƯA dựng.

CẬP NHẬT (2026-09-30, phiên 4 — M4 WEB ĐÃ DỰNG & ĐẠT TÍNH NĂNG TRỌNG TÂM): sequencer web ở `D:\bien\web` (Vite + React 18 + React Three Fiber + zustand + three), chạy `npm run dev` (port 5173, dev server thường sẵn). Đã có, chạy end-to-end bằng clip demo tổng hợp:
- Sân khấu 3D + nhiều vũ công (thêm/nhân bản/xoá), chọn clip, đặt vị trí/hướng, lật gương, lệch nhịp, đường đi trên sàn, 3 chế độ camera (Tự do/Bám lưng/Soi gương), lưới nhịp.
- **Trọng tâm luận văn — xuất "góc nhìn tập cá nhân hoá"**: ghi video `.webm` theo góc nhìn hiện tại (nút "Xuất video vũ công này") và **"Xuất cả nhóm"** (mỗi vũ công một clip camera bám riêng). Ghi TẤT ĐỊNH bằng WebCodecs (VideoEncoder VP9) + webm-muxer, bơm khung qua `advance()` của R3F — KHÔNG dùng captureStream/MediaRecorder vì chúng đóng băng khi tab ẩn. Cần `preserveDrawingBuffer:true`. Code: `web/src/record.ts`, `components/CanvasCapture.tsx`.
- **Lưu/khôi phục**: tự lưu localStorage (`persist.ts`, key `choreo.project.v1`) + xuất/nhập dự án ra tệp `.json` để chia sẻ giữa máy/thành viên.
- Kiểm chứng bằng browser pane: export 1 người ~3,2MB/240 khung header WebM hợp lệ; export nhóm ra 3 file riêng; JSON round-trip OK. Git (D:\bien, nhánh master, KHÔNG remote) tới commit `822fba7`.
- CÒN THIẾU ở M4 (polish, chưa làm): thân người đẹp hơn (capsule thay vì cầu), UI mobile.

CẬP NHẬT (2026-09-30, phiên 5 — 5 VÒNG NGHIÊN CỨU+CẢI TIẾN TỰ ĐỘNG, tầng PERCEPTION):
theo lệnh "tiếp tục nghiên cứu và cải tiến, làm nhiều vòng". Trọng tâm chuyển từ web
sang LÕI HÌNH HỌC — thứ mang novelty thật. Đã thêm (đều thuần numpy, chạy CPU, có test):
- **choreo/geom/**: `cameras.py` (camera pinhole look-at theo phương vị/độ cao/khoảng
  cách; project_points; ray_angle_deg=góc giao hội), `triangulate.py` (DLT đa-view),
  `visibility.py` (che khuất ray–cylinder: thân người ~ trụ pelvis→neck).
- **choreo/synth/dancer.py**: sinh múa 3D ground-truth (nhún gối+vung tay+xoay thân ±40°).
- **choreo/mocap/fuse.py** + `TriangulationAdapter` trong adapter.py: bước hợp nhất
  2D→3D THẬT của M2 (tam giác hoá + lấp khoảng trống + savgol + foot contacts). Detector
  2D (GPU) cắm sau; nạp keypoint vào cùng hàm này.
- **experiments/synthetic_2view.py** → `ket-qua-2view-tong-hop.md`: quét góc lệch/số máy/
  nhiễu/che khuất, Monte-Carlo, bảng + ASCII.
- Test: 12 test mới (test_geom.py + test_fuse.py), tổng **32 pass**.
- KẾT QUẢ CHÍNH (bằng chứng hình học cho tuyên bố 2-cam): MPJPE thấp nhất ~15mm ở 90°,
  chữ U (nổ ~47mm ở 15°, ~42mm ở 170°); bão hoà theo số máy (2→3 bước lớn nhất); tuyến
  tính theo nhiễu 2D; ĐÁNH ĐỔI phủ↔chính xác khi che khuất (phủ thích máy gần, chính xác
  thích máy lệch rộng → 60-90° dung hoà; 180° tệ kép; máy thứ 3 mua ĐỘ PHỦ khi xoay).
- Đề cương cập nhật: thêm §5.4 (thực nghiệm hình học đã hoàn thành, tiền-Cổng-0) + sản
  phẩm #4; teardown §8 đánh dấu xong việc "viết lại novelty". Commit tới `1e1dafa` (master).

CẬP NHẬT (2026-09-30, phiên 6 — VÒNG 6→9, mở rộng tầng PERCEPTION + công cụ độ nhạy):
tiếp tục "làm nhiều vòng". Mỗi vòng = 1 thực nghiệm tái lập + 1 cải tiến pipeline có test,
tích hợp §5.4. Mẫu file experiment: import hằng/`_bar` từ `experiments.synthetic_2view` cho
DRY; ghi `ket-qua-*.md` tiếng Việt.
- **Vòng 6 — bản đồ đặt máy** (`experiments/ban_do_dat_may.py` + test_placement_map.py):
  hàm thuần `recommend(pairs, angles, cov_floor)` chọn cặp góc min-MPJPE đạt ngưỡng phủ.
  Kết quả: khuyến nghị −30°/+60° (phủ 90.7%, 11.2mm); đường chéo ~90° tốt nhất, 180° thoái hoá.
- **Vòng 7 — độ nhạy sync/calib** (`do_nhay_sync_calib.py`) + `perturb_calib` (geom/cameras.py,
  nhiễu xoay/tịnh tiến camera qua Rodrigues). Ngưỡng thiết kế: sync <½ khung (60fps+vỗ tay),
  xoay calib <0.5° (ChArUco), vị trí <1-2cm. 1° xoay → ~48mm; đòn bẩy góc lớn ở 4.5m.
- **Vòng 8 — bền vững outlier** (`robust_outliers.py`) + `triangulate_robust` (cổng tái chiếu +
  loại-dần-view ≥3 máy) + `fuse_multiview(robust=True)`. Robust giảm MPJPE 45-62%; PHÁT HIỆN
  TRUNG THỰC: máy thứ 3 chỉ giúp ÍT dưới outlier iid (khớp dễ bị ≥2/3 view sai), chỉ mạnh khi
  lỗi tương quan theo view. `robust=True` mặc định cho Cổng 0.
- **Vòng 9 — ràng buộc độ dài xương** (`rang_buoc_xuong.py`) + `enforce_bone_lengths`
  (cleanup/smooth.py, chiếu ràng buộc đối xứng kiểu **PBD**, KHÔNG phải FK) + metric
  `bone_length_std` (không cần GT). Ablation trung thực: FK dựng từ root làm MPJPE TỆ hơn ở
  mọi mức (dồn sai số); PBD có NGƯỠNG GIAO — hại ở 1px, lợi từ ≥3px (vùng nhiễu detector thật),
  tăng theo nhiễu (3px +5%, 6px +11%). Bật khi chạy detector thật, tắt trên dữ liệu cực sạch.
- **Vòng 10 — trọng số tin cậy** (`trong_so_tin_cay.py`) + `triangulate_dlt(weights=…)` +
  `fuse_multiview(confidences=…)`: view tin cậy thấp giảm ảnh hưởng MỀM (khác robust loại cứng).
  Trung thực: (a) confidence ngẫu nhiên làm MPJPE TỆ ~22%; (b) CÁCH đặt trọng số quan trọng —
  nghịch phương sai w=1/σ² (~-9%) tốt gấp ~3× tuyến tính w=conf (~-3%); bình phương tệ hơn.
  Phải hiệu chuẩn confidence→phương sai. Commit `8aa8891`.
- **Vòng 11 — hợp nhất 3 lớp + capstone** (`tong_hop_khu_nhieu.py`). `triangulate_robust` nhận
  weights, TÁCH BẠCH: cổng chọn inlier bằng hình học thuần (KHÔNG trọng số), chỉ phép khớp CUỐI
  mới áp trọng số → tránh trọng-số-thấp loại nhầm view sạch / bảo vệ nhầm outlier-tho-conf-thap.
  Capstone trộn cả 3 loại lỗi: MPJPE 38.9→22.5mm (-42%), std xương→0, ba lớp cộng dồn DƯƠNG.
  PHÁT HIỆN: robust & weighted chia nhau "ngân sách nhiễu mềm" (lợi weighting tăng theo ngưỡng
  cổng); CÓ ngưỡng tối ưu ~15-20px (dưới=cắt nhầm nhiễu mềm, trên=lọt lỗi thô). Quy tắc Cổng 0:
  ngưỡng robust TRÊN dải nhiễu mềm & DƯỚI biên lỗi thô. Commit `6cd4afe`.
- **Vòng 12 — hiệu chuẩn confidence→phương sai GT-free** (`hieu_chuan_tin_cay.py`) +
  `choreo/mocap/conf_calib.py`. Đóng nốt việc mở của V10. `per_view_reproj_residual` = sai số
  tái chiếu mỗi quan sát (proxy nhiễu, KHÔNG cần 3D GT). `calibrate_confidence` = bin phân vị +
  hồi quy đơn điệu PAV → bản đồ conf→σ(px). `ConfCalibration.weight_of` trả bội số hàng DLT =
  **1/σ** (Gauss–Markov đúng là 1/σ chứ KHÔNG 1/σ², vì DLT nhân hàng rồi bình phương trong SVD —
  tinh chỉnh so với V10). Kết quả (conf=rel^γ méo): confidence sống thành NET-ÂM khi méo tăng
  (γ=2: 25.2>24.4mm); hiệu chuẩn BẤT BIẾN theo méo, giữ 22.0mm, lấy lại ~85% lợi ích oracle (21.6).
  Commit `ee194d2`.
- **Vòng 13 — kiểm định thước đo đánh giá GT-free** (`danh_gia_khong_gt.py`), dùng
  `choreo/eval/metrics.py::reprojection_error` (tái chiếu camera HELD-OUT, Đường B). Đóng lỗ hổng
  lớn nhất: 6 lớp trên đều đo bằng MPJPE (cần 3D GT), video thật ở Cổng 0 không có GT. Monte-Carlo
  12 điều kiện (2 Gaussian × 3 tỉ lệ outlier × 2 pp) × 25 lần; dựng từ 3/4 máy, giữ lại 1 máy độc
  lập làm giám khảo. Kết quả: held-out bám sát MPJPE **r=0.988, ρ=0.977**. Phát hiện trung thực:
  sweep 1 nút nhiễu đơn điệu cho r~1 HIỂN NHIÊN → KHÔNG phân biệt held-out vs in-sample (cả hai
  ~0.998); PHẢI thêm outlier thô (nhiều cơ chế) mới lộ — in-sample tụt còn **r=0.776** (bị chính
  quan sát chứa outlier bơm sai, không nhận ra robust đã kéo MPJPE 64.6→15.1mm), held-out giữ
  **r=0.990**. ⇒ lý do kỹ thuật để phải held-out + cấu hình ≥3 máy. Thêm test giá trị-đã-biết cho
  `reprojection_error`. Commit `6d36ab2`.
- **Vòng 14 — cross-validation LOCO cho thước đo GT-free** (`danh_gia_loco.py`) +
  `choreo/eval/metrics.py::reprojection_error_loco(kp, P, reconstruct)→(mean,std)` (callback
  reconstruct để tách lớp, không phụ thuộc mocap). Đào SÂU thước đo V13, KHÔNG thêm lớp khử nhiễu.
  Held-out đơn phụ thuộc "chọn máy nào giữ lại"; LOCO giữ lại từng máy rồi trung bình. Kết quả
  TRUNG THỰC: (A) r(MPJPE,LOCO)=0.997; (B) ở chế độ máy ĐỒNG ĐỀU, chọn máy giữ lại gần như KHÔNG
  đổi tương quan (dải r=0.001) → held-out đơn KHÔNG mong manh, nên lợi ích LOCO là GIẢM PHƯƠNG SAI
  (CV 0.011 vs 0.014–0.021, ~40%), không phải "sửa tương quan"; (C) choice-dependence chỉ nguy hiểm
  khi 1 máy kém hẳn (held-out đơn nở dải ~21px), LOCO-std ×43 (0.18→7.7px) làm cảnh báo QA hiện
  trường. Commit `1355bf0`.
- **Vòng 15 — HỢP NHẤT & tái lập** (KHÔNG thêm experiment/mã mới, đúng chủ trương chiều-sâu):
  `experiments/run_all.py` chạy lại cả 10 script, xác nhận mỗi script tái sinh đúng `ket-qua-*.md`
  + thoát mã 0, ghi `bao-cao-tai-lap.md` (đo được: **10/10 tái lập, ~173s CPU**; các ket-qua ra
  BYTE Y HỆT khi chạy lại → xác nhận thực nghiệm TẤT ĐỊNH). `experiments/README.md` = chỉ mục hợp
  nhất 9 experiment theo 3 nhóm (hình học / khử nhiễu / đo GT-free) + **checklist đo Cổng 0** dùng
  thẳng trên video thật (≥3 máy, sync<nửa khung, chấm bằng reprojection_error_loco mean+std,
  chuẩn hoá bbox, bone_length_std/jitter/foot-slip). de-cuong §5.4 thêm đoạn hợp nhất. Commit `8c0acca`.
- **Vòng 16 — đồng bộ thiết kế Cổng 0 với phát hiện đã kiểm định** (doc-only, `gate0-thiet-ke-thuc-nghiem.md`
  viết TRƯỚC các vòng 8–15 nên lệch). §3: reproj held-out→LOCO-mean, thêm hàng LOCO-std (QA) +
  bone-length-std, ghi chú "đã kiểm định r≈0.99, LOCO-std ×43", nêu **yêu cầu ≥3 máy ở Cổng 0** (khác
  sản phẩm 2 máy). §4: thêm cấu hình pipeline đã chốt (robust + trọng số hiệu chuẩn + ràng buộc xương),
  ngưỡng sync <nửa khung, bước chấm LOCO; cập nhật bảng tuần. Commit `6773b14`.
- Test tổng: **60 pass** (master, HEAD `6773b14`).
- **Vòng 17 — POLISH APP/UI (mobile responsive)**: user chọn hướng "polish app/UI (M4)" khi tầng
  synthetic đã đóng. App web ở `web/` (Vite+React+@react-three/fiber+three+zustand+webm-muxer):
  8 component, store, export video .webm, sample clips ở web/public/clips/. Layout CŨ lưới cố định
  300px+1fr KHÔNG có @media → mobile panel chiếm hết, viewport ép mỏng, timeline mất. Sửa: panelOpen
  trong store + nút ☰/drawer trượt (App.tsx) + nút × (Panel.tsx) + @media 820px một cột & 460px track
  cả hàng (styles.css). Desktop giữ NGUYÊN (đối chiếu ảnh). Build tsc sạch. Commit `d38fae3`.
  Chạy app: `preview_start name=web` (launch.json, port 5173). Bài học lặp lại: LUÔN đo rồi mới kết luận,
  sửa narrative cho khớp số (đã tự sửa NHIỀU lần: vai trò máy thứ 3; FK vs PBD; tuyến tính vs
  nghịch-phương-sai; V11 bỏ claim sai "weighting đổi dấu"; V12 tinh chỉnh bội số hàng 1/σ;
  V13 bác bỏ claim "held-out tương quan tốt hơn in-sample" ở regime 1-nút-nhiễu, phải đổi thiết
  kế sang nhiều-cơ-chế mới có luận điểm thật; V14 bác bỏ claim "held-out phụ thuộc chọn máy" ở
  chế độ đồng đều — số bắt đổi luận điểm sang giảm-phương-sai + chẩn đoán).
- **Vòng 18 — POLISH: đầu + mũi chỉ hướng cho Mannequin** (`web/src/components/Mannequin.tsx`):
  vũ công trước là que mảnh không có đầu rõ, khó đọc video tập & khó phân biệt trước/sau cho bài
  tập soi gương/POV. Thêm: (1) khối cầu "đầu" lớn (sphere r=0.085) ở khớp head (index 9), bám vị
  trí mỗi khung qua headRef group; (2) "mũi" nón trắng lệch +Z cục bộ, `meshBasicMaterial` (không
  chịu sáng → luôn trắng rõ dù trong bóng) làm tín hiệu hướng mặt. Mũi là con của group đầu nên tự
  xoay theo hướng; lật gương (flip scale.x) không đổi trục +Z nên hướng vẫn đúng. Pose quay mặt về
  +Z cục bộ (xác nhận qua CameraRig follow đặt máy sau lưng theo (sin yaw,cos yaw)); FrontMarker
  vàng ở z=3.2 (Stage.tsx, hiện khi bật mốc SK) là vạch mặt tiền khán giả, nhất quán +Z. Build tsc
  sạch, kiểm bằng browser (đầu rõ, mũi nổi). Commit `46b471b`.
- **Vòng 19-22 — POLISH UI/UX sequencer (M4, mỗi vòng 1 mục, build sạch, kiểm browser):**
  V19 Timeline dễ đọc 8-count: số ô nhịp trên phách mạnh + vạch playhead phát sáng (Timeline.tsx,
  styles.css `.barnum`/`.playhead`/`.scrub z-index`). V20 nhãn tên nổi trên đầu khi >1 vũ công —
  dùng drei `<Html>` (DOM overlay, KHÔNG lọt video xuất webm), x=0 nên không lật khi gương
  (Mannequin.tsx prop `showLabel`, App.tsx `showLabel={dancers.length>1}`). V21 phím tắt kiểu DAW:
  Space phát/dừng, ←/→ tua 1 phách (bỏ qua khi con trỏ trong input); title nút play + hint Panel
  (App.tsx useEffect keydown). V22 bấm thẳng thân vũ công trong cảnh 3D để chọn (không cần danh sách
  trái) — khối bắt sự kiện trong suốt box 0.8×2×0.6 opacity 0 bọc thân, stopPropagation, bỏ qua khi
  editingPath (bấm sàn thêm mốc vẫn chạy), kéo/xoay camera không kích hoạt (Mannequin.tsx). Commit
  tới `1155041` (master). LƯU Ý: dev server chạy `preview_start name=web` (port 5173); localStorage
  hiện có 2 vũ công (từ nhân bản lúc test).
- **Vòng 23-24 — POLISH UI/UX (tiếp):** V23 bộ chọn TỐC ĐỘ phát 0.25×/0.5×/1× trên timeline để
  tập chậm từng động tác — `speed` trong store nhân vào PlaybackClock; xuất video KHÔNG đổi (record.ts
  tự bơm khung theo thời gian thật). Commit `2cb71fb`. V24 nút "⤾ Đặt lại góc" nổi góc trên-phải
  viewport, chỉ hiện ở chế độ Tự do (orbit), trả camera về HOME [3.5,2.4,5] nhắm [0,1,0] (App.tsx +
  `.view-reset` styles.css). BÀI HỌC KỸ THUẬT: `OrbitControls.enableDamping` để lại QUÁN TÍNH
  (sphericalDelta) sau khi kéo → đặt HOME xong bị TRÔI về [2.76,6.62,-0.21] (đo được). Trường quán
  tính là biến closure PRIVATE của three-stdlib (không có trong instance, không zero trực tiếp được).
  Cách sửa tất định: tắt damping → `update()` (khi damping tắt, update tự đặt quán tính=0 ở cuối) →
  ghim HOME → `update()` lần nữa → bật lại damping. Đo kiểm: sau reset pos=[3.500,2.400,5.000], giữ
  nguyên sau 1s. Kiểm chứng browser bằng test có kiểm soát (pause+ghim time=2.0, đọc pos qua ref phơi
  ra window tạm rồi gỡ). Commit `0626eb7` (master).
- **Vòng 25 — POLISH: phân biệt trái/phải trên hình nộm bằng sắc độ** (Mannequin.tsx): khớp/xương
  bên PHẢI (tên bắt đầu "r_") tô đậm hơn (màu gốc × 0.6) qua `instanceColor`; trái/giữa giữ màu nhận
  diện của từng vũ công. Vật liệu instancedMesh để TRẮNG (#ffffff) để instanceColor mang trọn màu —
  nếu vật liệu cũng tô màu sẽ nhân đôi, sai tông (màu lưu ở không gian LINEAR). Tô một lần trong
  `useLayoutEffect` (màu tĩnh, không đổi mỗi khung), deps [dancer.color, rightJoint, rightBone, J, E].
  Giúp người học đọc bên nào đang cử động khi tập soi gương/POV. Commit `9dccb73` (master).
  ĐÁNH GIÁ SAU 9+ VÒNG POLISH (V17-25): các polish còn lại đều là (a) tính năng cần user chốt phạm vi
  hoặc (b) việc perception chờ GPU + dữ liệu thật. Đã HỎI user "tiếp theo là gì" thay vì chế thêm
  vòng polish lấp chỗ.
- **Vòng 26 — TÍNH NĂNG (không phải polish): mỗi vũ công phát CHUỖI clip nối tiếp** (user chốt phạm vi
  qua AskUserQuestion). Đổi mô hình DAW thực thụ: thay `Dancer.clipName: string` (1 clip lặp) →
  `Dancer.sequence: string[]` (chuỗi clip có thứ tự, phát nối tiếp rồi lặp CẢ CHUỖI, mỗi clip chỉ phát
  1 lần ở thời lượng gốc). Tương thích ngược qua `normalizeDancer` tại 1 choke-point `loadProject`
  (dùng chung cho localStorage + nhập tệp). `samplePoseSequence` (clip.ts) chia thời gian theo tổng
  chuỗi, tìm đoạn, gọi `samplePose` với local∈[0,dur) (không wrap nội bộ). Thời lượng sân khấu =
  MAX tổng-chuỗi trên các vũ công (chuỗi ngắn tự lặp trong timeline chung), tính lại mỗi mutation.
  Mannequin đổi prop `clip` → `clips` (map) + `fallback`, lấy layout 17-khớp từ clip đầu chuỗi.
  Panel: trình soạn chuỗi (thêm/xoá/đổi thứ tự bằng nút ↑↓×, giữ tối thiểu 1) + tag "×N clip".
  Timeline: vạch nhịp dựng thẳng từ bpm+duration (chuỗi dài hơn 1 clip) + dải phân đoạn `.segstrip`.
  Kiểm browser end-to-end: thêm/xoá clip, duration co giãn 8→24→16s, dải phân đoạn, playback chạy
  suốt chuỗi. BÀI HỌC HMR: lưu file từng bước làm Vite HMR để lại module cũ trong console (lỗi
  `useEffect is not defined` / `reading 'wave'` với timestamp `?t=` cũ) → viewport đen là STALE HMR,
  reload sạch là hết; build tsc đã sạch từ trước. Commit `a758595` (master).
- **Vòng 27 — TÍNH NĂNG: đội hình mẫu (formation presets)** (tự chọn theo vai biên đạo, không hỏi
  user). Nhu cầu thật khi thử app như biên đạo K-pop: các vũ công chồng lên nhau + múa giống hệt,
  thiếu hình khối nhóm. Thêm `web/src/formation.ts` (hàm thuần, không phụ thuộc store/DOM) tính vị
  trí `[x,z]` THEO THỨ TỰ vũ công cho 6 hình: hàng ngang, chữ V, vòng cung, cột so le, lưới, vòng
  tròn; tâm ở gốc, kẹp ±5m; quy ước khán giả +Z (z lớn = trước sân khấu). `store.applyFormation()`
  gán vị trí tĩnh, `rotationY=0` (quay mặt khán giả), `waypoints=[]` (xoá đường đi). Panel: hàng nút
  "Đội hình" (mờ khi <2 vũ công). KIỂM CHỨNG BẰNG SỐ (không có test infra web, nên đọc readout so
  công thức): chữ V 5 người → người cuối `Vị trí X=2.00`; vòng tròn 5 người → `X=-0.95` — khớp tuyệt
  đối `formationPositions`. Build tsc sạch. Commit `196455b` (master). ĐÃ GHI NHẬN CHO VÒNG SAU (đề
  xuất user, chưa làm): đội hình theo THỜI GIAN (formation keyframes — chuyển đội hình theo count,
  tính năng biên đạo sâu hơn); sửa "lưới nhịp nói dối" (grid vẽ theo BPM sân khấu 120 nhưng clip có
  BPM khác: point=112, bounce=128); vòng tròn R kẹp min 1m nên đông người hơi chật (chấp nhận được).
- **Vòng 28 — TÍNH NĂNG: đội hình theo count (formation keyframes theo thời gian)** (user chọn qua
  AskUserQuestion — hướng "sâu", đụng data-model/sampling/timeline). Tổng quát hoá preset V27 thành
  keyframe trên trục thời gian: biên đạo đặt "count này = đội hình gì", nhóm TỰ TRƯỢT giữa các đội
  hình. `formation.ts` thêm `FormationCue {id,count,shape}` + `formationXZ(cues,i,n,tSec,beatSec)` lấy
  mẫu vị trí `[x,z]` nội suy **smoothstep** giữa 2 mốc kề (giả định cues sắp tăng theo count — store giữ
  bất biến này). Thiết kế là TỔNG QUÁT HOÁ NGHIÊM: 0 mốc = giữ nguyên hành vi cũ (tương thích ngược
  dự án đã lưu thiếu `formations`), 1 mốc = đội hình tĩnh cả bài, ≥2 mốc = trượt. Store: `formations[]`
  + `addFormation`(ghim vào count hiện tại = `floor(time/beat)+1`, ghi đè nếu trùng count, giữ sắp
  tăng)/`removeFormation`/`clearFormations`/`setFormations` (thay `applyFormation` của V27). Mannequin
  nhận `index`/`count`, ưu tiên vị trí đội hình (GHI ĐÈ cả vị trí tĩnh lẫn waypoints) khi có mốc. Panel:
  hàng nút thêm mốc + danh sách mốc (`ô {bar·count}` + tên hình + nút ×) + "Xoá tất cả" + hint đổi theo
  số mốc; khoá slider X/Z nhãn "(theo đội hình)" (posLocked = hasPath||hasFormation). Timeline: cờ mốc
  amber (vạch dọc `.fcue-mark` + nhãn `.fcue-tag`). persist+App: lưu/nạp/xuất/nhập `formations`, thêm
  vào autosave subscribe (`prevF`). KIỂM CHỨNG BROWSER: 1 mốc Hàng ngang count 1·1 → 5 vũ công thẳng
  hàng đối diện khán giả; thêm Vòng tròn count 3·1 → tại t=4s (giữa hai mốc, smoothstep(0.5)=0.5) nhóm
  ở HÌNH TRUNG GIAN rõ (không phải hàng thẳng cũng không phải vòng tròn) → xác nhận nội suy; 2 cờ amber
  trên timeline; slider X/Z khoá đúng. Build tsc sạch. Commit `785d4f7` (master). CÒN GHI NHẬN (chưa
  làm): sửa "lưới nhịp nói dối" (grid theo BPM 120 nhưng clip khác BPM) vẫn treo; xoay hướng mặt theo
  đội hình (hiện formationXZ giữ `rotationY` tĩnh, chưa cho mặt quay theo tâm/hướng di chuyển).
- **Vòng 29 — TÍNH NĂNG: hướng mặt theo đội hình (facing per formation)** (user chọn qua AskUserQuestion,
  đóng nốt việc ghi nhận cuối V28). Mỗi `FormationCue` thêm `facing: "audience"|"center"|"out"`. `formation.ts`:
  `facingYaw(facing,x,z)` suy yaw từ vị trí CỦA CHÍNH MỐC ĐÓ (audience→0; center→atan2(-x,-z) nhìn vào gốc;
  out→atan2(x,z) nhìn ra xa) — khớp quy ước local +Z→(sin yaw,cos yaw); `lerpAngle` nội suy góc theo đường
  NGẮN NHẤT (bọc ±π, tránh quay vòng dài); `formationXZ`→`formationPose` trả `{x,z,yaw}` (vị trí smoothstep,
  hướng lerpAngle cùng hệ số f). Store: mốc mới mặc định `"audience"`, `setFormationFacing(id,facing)`,
  `setFormations` chuẩn hoá cue thiếu facing (tương thích ngược mọi project cũ). Mannequin: dùng
  `formationPose`, đặt `g.rotation.y = fpose.yaw` mỗi khung. Panel: ô chọn hướng mỗi hàng mốc + khoá slider
  "Hướng mặt" khi bám đội hình. KIỂM CHỨNG BROWSER: đọc DOM `<select>` xác nhận store round-trip đúng
  (set "center"→hiển thị "Vào tâm"); tại mốc vòng tròn 3·1 center = cả đội quay VÀO tâm, out = quay ra ngoài,
  audience = ra khán giả; tua tới điểm giữa (t=4s, f=0.5) thấy các vũ công đang xoay DỞ ở góc khác nhau
  (nội suy, không giật); mốc cũ mở lên mặc định "Ra khán giả". Build tsc sạch. Commit `21ba2f9` (master).
  CÒN GHI NHẬN (chưa làm): "lưới nhịp nói dối" (grid BPM 120 vs clip khác BPM) vẫn treo; per-dancer offset
  từ đội hình; hướng mặt theo HƯỚNG DI CHUYỂN (face-along-morph) chưa làm (mới có 3 chế độ tĩnh theo tâm).
- **Vòng 30 — TÍNH NĂNG: chuyển đội hình kiểu "làn sóng"/canon** (user chọn qua AskUserQuestion; hướng
  "dance-native" nối thẳng V28+V29). Người đầu (index 0) rời chỗ TRƯỚC, người cuối rời SAU → sóng lan dọc
  nhóm (đặc trưng K-pop). KỸ THUẬT GỌN, TÁI DÙNG NGUYÊN `formationPose`: mỗi vũ công lấy mẫu đội hình tại
  thời gian ĐÃ DỊCH `time - delay_i`, `delay_i = wave·beatSec·(index/(n-1))` — dẫn đầu delay=0, cuối trễ
  tối đa = wave (đơn vị COUNT). `formation.ts` thêm hàm thuần `waveDelay(wave,i,n,beatSec)` (0 hoặc n<=1→0).
  Store: `formationWave` (mặc định 0 = đồng thời như cũ) + `setFormationWave`. Mannequin: truyền
  `time - delay`. Panel: thanh trượt "Làn sóng (canon)" 0–2 count bước 0.25, CHỈ hiện khi ≥2 mốc; nhãn
  "tắt"/"x.xx count". persist+App: lưu/nạp/xuất/nhập `formationWave` + autosave (`prevW`), thiếu trường→0
  (tương thích ngược). KIỂM CHỨNG BROWSER (morph hàng ngang 1·1→vòng tròn 3·1, dài 8s): tại t=4s, sóng=0
  cả nhóm cùng tiến độ morph (cụm đối xứng), sóng=2 nhóm giãn theo index (tiến độ 0.5→0.32). BẰNG CHỨNG
  CHẶT: vũ công index 0 Ở VỊ TRÍ Y HỆT giữa sóng=0 và sóng=2 (delay=0 đúng), chỉ người sau lệch pha. Hiệu
  ứng ở test này hơi nhẹ vì morph dài 16 count; co giãn mạnh hơn với morph ngắn. Build tsc sạch. Commit
  `50f89c1` (master). GHI NHẬN (chưa làm): hướng sóng ngược (tail-first) / sóng theo VỊ TRÍ KHÔNG GIAN
  (trái→phải) thay vì theo index; per-cue wave; vẫn còn "lưới nhịp nói dối" + face-along-morph treo từ V29.
- **Vòng 31 — làn sóng theo THỨ TỰ KHÔNG GIAN** (user chọn qua AskUserQuestion, nối thẳng V30). V30 sóng chỉ
  cuốn theo SỐ HIỆU vũ công; V31 cho cuốn theo hình học — cách biên đạo thật nghĩ. Thêm `WaveOrder =
  index|ltr|rtl|center|edge`. formation.ts: THAY `waveDelay(wave,i,n,beatSec)` cũ bằng bộ mới: `waveKey`
  (khoá sắp xếp: x cho ltr/rtl, bán kính² x²+z² cho center/edge, i cho index) + `waveRank(order,positions,i)`
  = (số người khoá NHỎ hơn)/(n-1), đếm O(n) không sort, cặp đối xứng hoà khoá → CÙNG hạng (rời cùng lúc,
  đúng thẩm mỹ); `waveRefShape(cues,tSec,beatSec)` = đội hình ĐÍCH của cú morph đang diễn (sóng cuốn theo thứ
  tự người ta TỚI chỗ mới); `waveDelayAt(cues,wave,order,i,n,tSec,beatSec)` = điểm vào DUY NHẤT cho Mannequin.
  index cho i/(n-1) y hệt V30 → tương thích ngược. Store `formationWaveOrder` (mặc định "index") +
  setter. Mannequin gọi waveDelayAt. Panel: `<select>` thứ tự sóng (hiện khi wave>0), style `.fmwave-order`
  (dùng --panel2/--line, KHÔNG có --border/--panel — nhớ biến CSS đúng tên). persist/App: lưu/nạp/xuất/nhập +
  autosave (`prevWO`), thiếu→"index". KIỂM CHỨNG MẠNH: import module THẬT qua Vite dev (`await
  import('/src/formation.ts')`) gọi thẳng waveRank — ltr trên circle n=5 cho [0.5,1,0.75,0.25,0] (x nhỏ nhất
  mở, x lớn nhất khép), line_center [.75,.25,0,.25,.75] (tâm mở), line_edge [0,.5,1,.5,0] (hai đầu mở) — khớp
  tính tay. LƯU Ý: center/edge SUY BIẾN trên vòng tròn (mọi người cách tâm bằng nhau → chỉ nhiễu float), là
  bản chất hình học không phải lỗi; muốn radial có nghĩa cần đội hình đích khác circle. Đổi dropdown
  ltr↔index tại cùng t=4s làm cảnh sắp xếp lại rõ (đầu-cuối thông). Build tsc sạch. Commit `cfbce57` (master).
  GHI NHẬN (chưa làm): sóng theo per-cue (mỗi cú morph một thứ tự), vẫn treo "lưới nhịp nói dối" +
  face-along-morph (V29).
- **Vòng 32 — sửa "LƯỚI NHỊP NÓI DỐI"** (user chọn qua AskUserQuestion; chủ ý KÉO VỀ tầng ĐỌC/ĐÁNH GIÁ sau
  chuỗi V28–V31 toàn tầng demo). LỖI: Timeline vẽ vạch nhịp ĐỀU theo một BPM sân khấu duy nhất (120) qua
  `for(t=0;t<=dur;t+=60/bpm)`, dù mỗi clip mang beatGrid RIÊNG (wave/step=120, bounce=128 phách 0.469s,
  point=112 phách 0.536s; đều fps30/240frame/8.0s). → vạch lệch nhịp thật, 8-count SAI cho clip ≠120. ĐO
  TRƯỚC: đọc thẳng 4 clip JSON xác nhận beatGrid.beatTimes/downbeatTimes khác nhau. SỬA: clip.ts thêm
  `BeatMark{t,down}` + `sequenceBeatMarks(clips,seq,duration,fallbackBpm)` nối beatTimes RIÊNG từng đoạn (dời
  theo mốc bắt đầu đoạn, bỏ phách ≥ cuối đoạn để không đè phách 0 đoạn kế, lặp cả lượt phủ hết duration; down
  = có trong downbeatTimes, so khớp |db-bt|<1e-3) + `sequenceBpmAt(...)` = BPM clip dưới playhead. Timeline.tsx:
  `marks` từ sequenceBeatMarks của vũ công ĐANG CHỌN (nhất quán với segstrip), lùi về lưới đều BPM sân khấu chỉ
  khi chưa chọn/clip thiếu beatGrid; số ô nhịp `barLabels` đánh theo downbeat THẬT tuần tự; readout bar·count
  (`curBar/curBeat` đếm theo chính mảng marks → nhất quán vạch vẽ) + `curBpm` (làm tròn sequenceBpmAt) thay 120
  cứng. GIỮ NGUYÊN cờ mốc đội hình dùng `beatPeriod=60/bpm` sân khấu (đồng hồ dàn dựng RIÊNG, nhất quán
  formationPose — KHÔNG phải phần "nói dối"). KIỂM CHỨNG: (1) số học qua module thật — sequenceBeatMarks(point+
  bounce) cho 33 vạch, downbeat [0,4.286,8,11.75,15.5], BPM 112→128 đúng ranh giới 8s; (2) app THẬT (chuỗi
  wave+point) 31 vạch (16+15), 4 downbeat, barnum 1–4, readout 120 BPM ở đoạn wave → 112 BPM khi tua vào point
  (t=10s "3·4"), t=2.27s "1·5" — khớp tính tay. LƯU Ý KỸ THUẬT: `await import('/src/store.ts')` trong công cụ
  JS của pane trả về INSTANCE store TÁCH RỜI (nClips=0) — KHÔNG chạm store thật của app; muốn chỉnh state thật
  phải qua UI, còn kiểm pure-function thì dựng input trực tiếp (loadLibrary+gọi hàm) mới đúng. Build tsc sạch.
  Commit `9139606` (master). GHI NHẬN (chưa làm, cần user chốt): sóng per-cue; face-along-morph (V29); "chỉ số
  chất-lượng-đồng-bộ" (đánh giá, user CHƯA chọn); mocap 2-cam THẬT (Gate 0, cần GPU lab + video múa thật).
- **Vòng 33 — CHỈ SỐ ĐỒNG BỘ NHÓM (tầng ĐÁNH GIÁ)** (user chọn qua AskUserQuestion; tiếp tục KÉO VỀ tầng
  đánh giá sau V32). Thêm `web/src/sync.ts` (hàm thuần, không phụ thuộc store/DOM). Đo ĐỒNG BỘ TỨC THỜI
  (instantaneous unison): tại mỗi thời điểm treo t, mỗi vũ công lấy mẫu tư thế THÂN NGƯỜI đúng như Mannequin
  render — `samplePoseSequence(clips, seq, t − timeOffset)` (fallback `samplePose`), tư thế trong KHÔNG-GIAN-CLIP
  (Y-up, sàn Y=0) nên đã BỎ vị trí/hướng/đội hình (áp ở scene) và GƯƠNG (scale.x=−1 ở scene, KHÔNG trong mảng
  pose). `groupSyncAt` = tính tư thế TRUNG BÌNH nhóm theo từng toạ độ khớp → độ TẢN spread = trung bình trên
  các vũ công của RMS lệch khớp tới trung bình (mét) → điểm `exp(−spread/SCALE)`, **SCALE=0.12** (neo vật lý
  ~12cm lệch khớp trung bình → ~37%). Hệ quả thiết kế QUAN TRỌNG: hai người cùng clip/offset dù một người soi
  gương vẫn cho pose Y HỆT → unison đối xứng = đồng bộ 1.0 (đúng thẩm mỹ); delay sóng/canon chỉ dịch ĐỘI HÌNH
  không dịch THÂN nên KHÔNG ảnh hưởng chỉ số — chỉ `timeOffset` (lệch pha có chủ đích) mới làm thân lệch.
  `groupSyncSeries(...,n)` lấy n mẫu đều (dải nhiệt); `meanSync` = trung bình. Trả `null` nếu <2 vũ công (chỉ số
  vô nghĩa). Timeline.tsx: `syncColor(s)` (0 đỏ→0.5 hổ phách→1 lục), dải nhiệt `.syncstrip` (linear-gradient theo
  syncSeries, bọc useMemo 80 mẫu — chỉ tính lại khi vũ công/clip/duration đổi), số % tức thời tại playhead trong
  readout (`.sync`+`.syncdot`) kèm trung bình cả chuỗi ở title. styles.css: `.syncstrip`/`.sync`/`.syncdot`
  (dùng biến sẵn có, KHÔNG --border/--panel). TRUNG THỰC (ghi trong comment sync.ts): clip TỔNG HỢP biên độ nhỏ &
  tuần hoàn dưới-giây nên lệch PHA (timeOffset) ít tác động ở đây; chỉ số CHỦ YẾU phân biệt CHỌN CLIP khác nhau —
  trên mocap THẬT biên độ lớn hơn thì lệch pha hạ điểm mạnh hơn (bản chất không đổi). KIỂM CHỨNG: (1) số học qua
  module thật — cùng clip → spread 0 → 100%; khác clip (chỉ tay/nhún) spread ~0.06–0.13m → ~36–60%; hiệu chỉnh
  SCALE 0.22→0.12 sau khi ĐO spread thực. (2) app THẬT (nhóm 5 người, mỗi người chuỗi khác nhau): t=0–6 →100% lục
  (unison đoạn đầu), t=8–14 →~53–57% hổ phách (nhóm tách clip), trung bình 77%; dải nhiệt lục→hổ phách, readout
  đổi màu+%. Build tsc sạch. Commit `e36da55` (master). GHI NHẬN (chưa làm, cần user chốt): sóng per-cue;
  face-along-morph (V29); mocap 2-cam THẬT (Gate 0, cần GPU lab + video múa thật).
- **Vòng 34 — GIỚI HẠN của chỉ số tức thời (đo, chưa sửa)**: V33 KHÔNG phân biệt được canon/echo
  CỐ Ý với múa sai thật — cả hai chỉ là "một người ở pha khác" tại khung treo. Đo xác nhận: không
  ngưỡng ratio nào tách sạch (canon4 max 2.11 chồng odd3 2.0). `outlierIndex`+`groupDeviationAt` gác
  bằng (a) sync<0.85 (b) 1 người lệch trội ≥1.3× → unison & canon ĐỀU không nêu ai, chỉ 1 người phá
  nhịp mới nổi. Nhưng canon dạng 1-người-echo (1 người dịch τ, còn lại unison) vẫn bị nêu oan. Commit `48ba34f`.
- **Vòng 35 — ĐỒNG BỘ NHẬN BIẾT PHA (phase-aware), tách "TRỄ NHỊP" khỏi "SAI ĐỘNG TÁC"** (tầng đánh
  giá, 3 phần):
  - **Lõi** (`sync.ts`, commit `b7e3869`): khung Functional Data Analysis — phân rã PHA–BIÊN ĐỘ (curve
    registration; Fisher-Rao/SRVF elastic). PHA = warping γ(t) = trễ có cấu trúc (canon); BIÊN ĐỘ = phần
    dư HÌNH DÁNG sau căn tối ưu = lỗi thật. Demo dùng trường hợp RIGID: trễ hằng τ. Mỗi CẶP vũ công trên
    cửa sổ quanh playhead, quét τ tối thiểu hoá lệch tư thế → `residual(τ*)`=lỗi FORM (bất biến trễ→canon
    cho ~0), `τ*`=lead/lag. Gộp per-dancer bằng TRUNG VỊ trên các cặp. `phaseAlignAt(clips,layout,dancers,t)`
    →`PhaseAlign{formResidual[],lag[],formSpread,formSync,worst}`; `formOutlierIndex(pa)` (cùng gate 0.85/5cm/
    1.3×). `DEFAULT_PHASE={halfWindow:0.5,samples:13,maxLag:0.5,lagStep:1/30}`. formSync=exp(-formSpread/0.12).
  - **Giao diện** (`SyncBreakdown.tsx`/`SyncHighlighter.tsx`/`syncHighlight.ts`, commit `b0bd073`): bảng 2
    dòng/vũ công — thanh "sai động tác" (cm)+cờ ⚠ đồng bộ vòng đỏ 3D; chip "trễ nhịp" (ms±·phách, hổ
    phách=chậm/lam=sớm). SyncHighlighter chạy 1 useFrame tiết lưu ~8Hz ghi singleton `syncHighlight`
    (worstId=formOutlier cho vòng đỏ; phase/dancerIds cho bảng). worstId GIỜ là người SAI ĐỘNG TÁC (đã bỏ
    trễ) → canon KHÔNG làm sáng vòng oan. LƯU Ý R3F: `<Canvas>` không có prop frameloop → "always" khi HIỆN;
    khi pane ẨN rAF bị bóp → useFrame dừng → singleton đứng yên (chỉ là artifact môi trường test, user thật
    thấy cập nhật live). Kiểm bằng gọi thẳng `phaseAlignAt` trên store THẬT (qua `await import('/src/store.ts')`
    trả store thật đang chạy — KHÁC V32, vì cùng URL = cùng singleton khi app đã nạp module đó).
  - **Thực nghiệm kiểm chứng** (commit `aa0bfdd`): chuỗi `sync.ts→clip.ts` THUẦN (không three/react) → chạy
    HEADLESS bằng esbuild+node. Script tái lập `web/experiments/phase-sync-validation.ts` (+`web/experiments/
    README.md`), kết quả `experiments/ket-qua-tach-pha-vs-tuc-thoi.md`. So NGÂY THƠ (outlierIndex∘
    groupDeviationAt) vs TÁCH PHA (formOutlierIndex∘phaseAlignAt) trên clip tổng hợp sự-thật-nền (A=vung tay
    phải, B=vung tay trái=lỗi; N=5; 40 mốc t). SẠCH=1 người echo trễ τ (không sai)→FP; LỖI=1 người múa B→TP.
    KẾT QUẢ: dưới canon (τ 0→0.45s), FP naive leo 0→80% (TB τ>0: 51%), phase=**0% mọi τ**; TP naive 80% (bị
    lừa ở khoảnh khắc 2 tay trùng độ cao), phase=**100%** (cửa sổ mẫu không bị lừa); misID 0% cả hai; chỉ số
    nhóm SẠCH: syncNaive tụt 72%, formSync giữ 99%. ⇒ tách pha ÁP ĐẢO: ít báo giả + nhạy hơn, không đánh đổi.
    GIỚI HẠN đã ghi: rigid-τ chỉ trong ±0.5s; canon trễ biến thiên/vượt cửa sổ cần warping đàn hồi (SRVF/DTW).
    Đã gửi user 1 figure SVG (FP naive vs phase) qua SendUserFile.
  - **§5.4**: tầng đánh giá web giờ có bằng chứng định lượng (chạy trên mã ship, tái lập headless), song song
    các experiment numpy tầng perception. Ý tưởng vòng sau (chưa làm): đo ĐỊNH LƯỢNG chỗ rigid-τ gãy (trễ biến
    thiên, τ>maxLag) rồi cân nhắc V36 warping đàn hồi nhẹ; coarse-to-fine τ cho tốc độ; heatmap form-vs-unison.
- **Vòng 36 — ĐO GIỚI HẠN rigid-τ + V36 coarse-to-fine τ** (tầng đánh giá). Thực nghiệm biên
  `web/experiments/phase-limits.ts` → `experiments/ket-qua-gioi-han-rigid-tau.md` (commit `b3378eb`):
  Phần A (echo τ hằng) an toàn tới τ≈0.75s, GÃY dải 0.9–1.05s (FP 100%, lag bão hoà ±500ms ở maxLag
  cũ 0.5s); Phần B (trôi tempo g) chịu tới ~10%/s, FP 28–33% ở g≥15%. SỬA V36 (`coarse-to-fine.ts`
  → `ket-qua-tho-tinh.md`, commit `685a377`): nới `maxLag` 0.5→1.0s + thêm `coarseFactor:4` (quét τ
  THÔ→TINH). Đóng dải gãy 0.9–1.05s (FP 100→0) mà RẺ HƠN vét cạn cũ (~25 vs 31 phép/cặp, −21%), không
  hồi quy. DEFAULT_PHASE V36: `{halfWindow:0.5,samples:13,maxLag:1.0,lagStep:1/30,coarseFactor:4}`.
- **Vòng 37–39 — WARPING AFFINE τ×ρ: cài + đo + TẮT mặc định (kết quả ÂM trung thực)** (tầng đánh giá).
  Nấc tiếp trên thang FDA: map thời gian AFFINE `m(w)=t*+ρ(w−t*)+τ` (thêm NHỊP ρ ngoài DỊCH τ; trôi
  tempo (1+g)× có nghiệm ρ*=1/(1+g)). NGUYÊN MẪU trên CẶP cô lập (`affine-warp.ts` →
  `ket-qua-warp-affine-nguyen-mau.md`, commit `62933b3`) rất đẹp: dập residual trôi tempo −56…−85%,
  GIỮ lỗi hình dáng (−2…−6%) → tách timing khỏi form, verdict "đáng ship". Đã cài production: `alignPair`
  thành tìm 2D τ×ρ thô→tinh, thêm `maxRate/rateStep/rateCoarseFactor` vào PhaseCfg (maxRate=0 ⇒ hành vi
  chỉ-dịch y hệt). NHƯNG XÁC NHẬN TOÀN PIPELINE (`affine-validation.ts` → `ket-qua-affine-toan-pipeline.md`,
  commit `a3ef4a2`) lật kết luận: (a) cờ FP trôi tempo đã 0 nhờ V36 nới maxLag, KHÔNG nhờ affine; (b)
  formSync HIỂN THỊ (thứ app show) affine hoà tới hơi TỆ (g=0: 97 vs 100, sàn lưới ρ), chỉ vượt ở g=30%
  (97 vs 95); (c) chi phí 7.3× (0.56→4.05 ms/lượt). ⇒ affine KHÔNG đáng ship — lợi ích residual/cặp của
  nguyên mẫu bị trung-vị-gộp + nén exp() làm phẳng ở đầu ra. Trả `DEFAULT_PHASE.maxRate=0` (affine TẮT
  mặc định), GIỮ mã làm TUỲ CHỌN (`maxRate>0`) cho mocap THẬT (trôi lớn/phi tuyến) hoặc gác chặt hơn.
  BÀI HỌC: đây là kết quả âm CÓ GIÁ TRỊ — quy trình đo→sửa→đo-lại chặn bẫy "ship vì nghe hợp lý", và một
  cải tiến rẻ hơn (V36 nới cửa sổ) đã hấp thụ đúng vấn đề affine nhắm tới. Trôi tempo PHI TUYẾN thật sự
  vẫn cần warping bậc cao (SRVF/DTW đầy đủ) — hướng mở, chưa phải nút thắt ở mức pipeline hiện tại.
- **Vòng 40 — BẢN ĐỒ BIÊN GÃY → DỪNG leo thang warping (có bằng chứng)** (tầng đánh giá; commit `415ba0b`).
  Trước khi xây SRVF/DTW (đắt), đo xem sau V36 còn chế độ nào metric chỉ-dịch thật sự gãy ở mức pipeline
  không (`failure-frontier.ts` → `ket-qua-bien-gay-tach-pha.md`), 3 phần: (A) trôi tempo PHI TUYẾN trong
  cửa sổ φ(t)=t+A·sin(2πt/2) — FP=0 tới A=0.3 (nhịp min gần đơ), chỉ gãy từ A=0.4 = ĐÚNG điểm nhịp tức thời
  φ′=1−Aπ ĐẢO DẤU (ngoài vùng vật lý), và AFFINE ở đó còn TỆ hơn (FP 30–43% > 20–38%) → chỉ SRVF tới nhưng
  regime phi vật lý; (B) lỗi KÉP (canon τ + múa B đồng thời) — TP giữ 100% mọi τ ⇒ metric gỡ timing mà vẫn
  bắt lỗi form, không lẫn (đóng lỗ hổng nguyên mẫu affine tự ghi); (C) canon τ vượt maxLag tới 1.6s — FP=0
  nhờ clip tuần hoàn + gộp trung vị, không cần nới. ⇒ rigid-τ+coarse-to-fine (V36) là ĐIỂM PHỨC TẠP ĐÚNG;
  SRVF/DTW để ngỏ CÓ ĐIỀU KIỆN (chỉ khi mocap thật lộ trôi phi tuyến ĐƠN ĐIỆU trong cửa sổ). Cung warping
  (rigid→affine→elastic) KHÉP bằng bằng chứng: ví dụ "dừng đúng lúc".
- **Vòng 41 — ĐIỂM SỤP ĐỔ: trần nhận dạng 50% của chấm NHÓM-TƯƠNG-ĐỐI** (tầng đánh giá; commit `b063061`).
  `formOutlierIndex` nêu 1 người tệ nhất, tham chiếu = TRUNG VỊ residual từng-cặp (ước lượng robust). Đo
  breakdown point (`breakdown-point.ts` → `ket-qua-diem-sup-do.md`), N=7, k người sai, 2 kịch bản. (U) sai
  ĐỒNG DẠNG (k người cùng 1 động tác sai): hit 100% tới k=3 (k/N=.43), VU OAN 100% từ k=4 (k/N=.57) — sụp
  ĐÚNG 50% (lý thuyết trung vị: swamping/masking); formSync ĐỐI XỨNG 84/70/41/41/70/84 (đính chính dự đoán
  "đơn điệu" — nó đo ĐỘ TÁCH 2 cụm {k,N−k}, KHÔNG biết nửa nào đúng). (D) sai ĐA DẠNG (mỗi người khác kiểu):
  KHÔNG bao giờ vu oan, chỉ IM (miss) quá 50%; formSync tụt đơn điệu ~28 → hỏng AN TOÀN. KẾT LUẬN: trần 50%
  là GIỚI HẠN THÔNG TIN của mọi đánh giá nhóm-tương-đối (không sửa bằng cài đặt); metric ĐÚNG cho ca thực tế
  (thiểu số lạc = K-pop); thiết kế HAI TẦNG (formSync liên tục + cờ rời rạc) hợp lý, ranh giới = 50%. Phá trần
  cần THAM CHIẾU TUYỆT ĐỐI (khớp Gate-0 camera held-out; DAW biết clip gán → chấm tuyệt đối được).
- **Vòng 42 — CHẤM TUYỆT ĐỐI theo tham chiếu: PHÁ trần 50% (capstone tầng đánh giá)** (commit `fc592db`).
  Đo lối thoát V41 chỉ ra thay vì chỉ phát biểu. Căn PHA mỗi vũ công vào clip THAM CHIẾU (vũ đạo dự định; quét
  τ khử canon y hệt bộ nhóm) → residual RMS tối thiểu = lỗi HÌNH DÁNG riêng từng người; không đồng thuận →
  KHÔNG swamping/masking → KHÔNG điểm sụp. `absolute-reference.ts` → `ket-qua-tham-chieu-tuyet-doi.md`, N=7,
  CÙNG dữ liệu bộ nhóm sụp ở V41: (1) abs bắt ĐỦ k người sai ở MỌI k (1/1..6/6), vu oan 0% — đúng chỗ k=4..6
  bộ nhóm vu oan 100%; (2) BẤT BIẾN PHA: trễ canon τ tới 0.8s → residual 0.00cm (residual=min theo τ). GIÁ:
  cần NHÃN — có ở DAW (clip gán) & Gate-0 (camera held-out), KHÔNG có ở mocap nhóm tự do → đúng địa hạt bộ
  nhóm-tương-đối. KHÉP tầng đánh giá bằng cặp thước BÙ nhau, mỗi vế có ranh giới ĐO ĐƯỢC: biết trần ở đâu (V41)
  và khi nào vượt được (V42). Thông điệp: chọn thước theo CÓ/KHÔNG nhãn tham chiếu, đừng ép một thước gánh cả hai.
- **Vòng 43 — HỢP NHẤT + TÁI LẬP tầng đánh giá web** (soi gương V15 của tầng perception; commit `0c8271c`).
  Tầng đánh giá web đã tích 8 script (V35–V42) mà CHƯA có runner thống nhất. Thêm `web/experiments/run-all.mjs`:
  bundle từng script qua esbuild JS API (né wrapper `.bin` Windows) rồi chạy bằng Node, MỖI script 2 lần xác
  nhận KẾT QUẢ tất định. PHÁT HIỆN & xử đúng (dương-tính-giả của phép so byte): 2 script benchmark (coarse-to-fine,
  affine-validation) CỐ Ý in thời gian tường ms/lượt → dao động hợp lệ → normalize bỏ token `ms` TRƯỚC khi so
  (số ms thật vẫn hiển thị). Đo: **8/8 tái lập sạch, ~177s** (ngang runner numpy ~173s). Viết lại
  `web/experiments/README.md` từ chỉ-1-script → chỉ mục đầy đủ: 2 cung (A warping: rigid-τ là điểm phức tạp đúng;
  B robustness: trần 50% + phá trần tham chiếu tuyệt đối), bảng 8 script→8 doc `ket-qua-*.md`, hướng dẫn CHỌN
  THƯỚC theo có/không nhãn, liệt kê hằng số/cổng sync.ts. ⇒ tầng đánh giá web coi như ĐÓNG ở mức tổng hợp (đủ
  bằng chứng tái lập + chỉ mục); việc còn lại là chạy trên dữ liệu THẬT (Gate 0, GPU). LƯU Ý: `ket-qua-*.md` của
  cả web lẫn numpy đều ở `D:\bien\experiments\`; script web ở `D:\bien\web\experiments\`, chạy headless bằng
  esbuild+node hoặc `node experiments/run-all.mjs` (trong web/).
- **Vòng 44 — ĐỘ NHẠY THAM SỐ metric đánh giá + vá lỗi tất định ngắt quãng runner** (commit `e551419`).
  Trả lời câu hỏi hội đồng "vì sao 4 hằng số SCALE=0.12/SYNC_GATE=0.85/FLOOR=0.05/RATIO=1.3?".
  `web/experiments/gate-sensitivity.ts`: 1 người/nhóm 5 lệch TƯ THẾ TĨNH cánh tay ε·40cm (sai tĩnh chứ
  KHÔNG lệch thời gian — τ-search không hấp thụ được nên residual = sai hình thật); residual tuyến tính
  0→16.8cm theo ε. Tính pa MỘT LẦN mỗi (ε,t) rồi áp mọi cấu hình cổng (classify tái hiện đúng
  formOutlierIndex, tính lại formSync=exp(-formSpread/SCALE) vì formResidual/formSpread độc lập SCALE).
  BA phát hiện: (I) SCALE & SYNC_GATE KHÔNG độc lập — phân loại chỉ phụ thuộc ngưỡng dẫn xuất
  formSpread*=SCALE·ln(1/G)≈2cm; 3 cặp (SCALE,G) cùng ngưỡng cho đường TRÙNG KHÍT (chuyển ε 0.5→0.7) ⇒
  2 hằng số = 1 bậc tự do, bớt 1 số phải biện minh. (II) SYNC_GATE=0.85 là điểm cân bằng đo được: câm
  với lệch ≤8.4cm (biến thể), nêu sai tư thế ≥~12cm; 0.75 bỏ sót cả sai 16.8cm, 0.95 nêu từ ~5cm (vu oan).
  (III) FLOOR=5cm là CHỐT an toàn tuyệt đối — với 1 người lạc/nhóm 5, cổng SYNC bó TRƯỚC; FLOOR 2/5/8cm
  cùng đường, chỉ 12cm mới dời. ⇒ 4 số quy về 1 ngưỡng vật lý ~2cm spread + 1 chốt 5cm, KHÔNG tuỳ tiện.
  Doc: `experiments/ket-qua-do-nhay-tham-so.md`. VÁ RUNNER: coarse-to-fine.ts thỉnh thoảng báo phi-tất-định
  GIẢ — gốc là ms in padStart(5) cố định, khi timing vượt mốc chữ số (9972→10xxx) đệm canh lề đổi 1 space
  mà regex "ms" không nuốt → normalize lệch. Sửa: gộp khoảng trắng ngang sau khi bỏ token ms (unit-test:
  ca bệnh lý bằng nhau & vẫn bắt khác biệt kết quả thật). Runner giờ **9/9 tất định ~177s**. Cũng gitignore
  `.claude/scheduled_tasks.lock`. RATIO=1.3 KHÔNG quét ở đây (cần kịch bản đa-người-lạc) — khảo riêng ở V46.
- **Vòng 45 — TÍCH HỢP TÀI LIỆU** (commit `afa98c1`). Đặc tả MVP trước chỉ mô tả KẾ HOẠCH, không phản ánh
  kết quả đã đo. Thêm §9 "Hiện trạng nghiên cứu đã có (nguyên mẫu TÁI LẬP headless, TRƯỚC Gate 0)" vào
  `dac-ta-mvp-choreo-2cam.md`: bảng 2 tầng (perception numpy 60 test + run_all.py ~173s; đánh giá web/TS
  9/9 tất định ~177s), mạch 3 điểm, ranh giới trung thực (tổng hợp/headless, số múa THẬT chờ Gate 0). MỌI
  khẳng định đối chiếu thực tế TRƯỚC khi viết (đường dẫn tồn tại, pytest 60 passed) — sửa số test 32→60.
- **Vòng 46 — ĐỘ NHẠY OUTLIER_RATIO=1.3 (hằng số thứ 4 V44 chừa)** (commit `ad3d2ba`).
  `web/experiments/ratio-scapegoat.ts`: k người/nhóm 5 cùng SAI GIỐNG HỆT (dời tĩnh M=0.7≈11.8cm), quét
  RATIO∈{1.0,1.15,1.3,1.5,2.0}, đo any/dev/inno. BA CHẾ ĐỘ tách bạch: k=1 mọi RATIO nêu ĐÚNG thủ phạm
  (không ăn mòn độ nhạy lỗi-đơn); k=2 (thiểu số lỗi) nêu 1 người THẬT-SỰ-sai (inno=0), RATIO=2 mới im;
  k≥3 (ĐA SỐ lỗi) gộp TRUNG VỊ ĐẢO thứ hạng residual ĐÚNG TẠI 50% (k=2: lỗi11.8/đúng5.9; k=3 GƯƠNG:
  lỗi5.9/đúng11.8) ⇒ nêu trúng NGƯỜI ĐÚNG (inno=100), KHÔNG núm sync.ts nào sửa = TRẦN THÔNG TIN V41
  hiện nguyên hình → lối ra DUY NHẤT là thước tuyệt đối V42. Lề lỗi-đơn (III): d0 sai rõ + đám nhiễu-nền
  αM, RATIO=1.3 giữ d0 tới α~0.4 rồi IM ở 0.6 (hỏng AN TOÀN). ĐO PHỦ ĐỊNH dự đoán giải-tích ngây thơ của
  chính mình (naïve "nêu ⟺ (N-1)/(k-1)≥RATIO" SAI từ k≥3 do đảo trung vị — lý do phải ĐO không chỉ suy).
  ⇒ 1.3 biện minh được cho giả định demonstrator "lỗi hiếm, 1 người"; đa-số-lệch thuộc cặp-thước-bù-nhau.
  Runner 10/10 tất định ~182s. Doc `ket-qua-do-nhay-ty-le-do-oan.md`, chốt chéo V44/V41/V42.
- **Vòng 47 — BỀN VỚI NHIỄU detector (bước cầu đầu tiên về Gate-0, headless)** (commit `62c9077`).
  `web/experiments/noise-robustness.ts`: mọi vòng trước chạy trên toạ độ SẠCH TUYỆT ĐỐI; Gate-0 dùng
  mocap thật có sai số định vị khớp 1–3cm. Tiêm nhiễu Gauss iid N(0,σ) vào MỌI toạ độ khớp/khung
  (mulberry32+Box–Muller, hạt giống ĐỘC LẬP từng vũ công ⇒ iid giữa người, tất định để runner chạy-2-lần
  khớp), quét σ∈{0,0.5,1,2,3,5,8,12,20}cm trên chính formOutlierIndex sản phẩm (hằng số 0.12/0.85/0.05/1.3).
  BỐN phép đo: (I) dương-tính-giả (nhóm ĐÚNG+nhiễu)=0 ở MỌI σ tới 20cm, kể cả khi formSpread vọt ~39cm
  (cổng SYNC mở toang) vẫn KHÔNG nêu ai. (II) bắt lỗi thật 12cm: TP=100 tới σ=5cm (nhiễu≈0.4×lỗi, thừa
  biên so detector thật) rồi SỤP về 0 ở σ≥8cm NHƯNG FP vẫn 0 — metric đi CÂM (hỏng AN TOÀN), KHÔNG chuyển
  sang đổ oan. (III) formSpread≈2σ tuyến tính ⇒ cổng SYNC (1.95cm) mở ngay từ σ≈1cm, nhưng mở SYNC một
  mình VÔ HẠI (chỉ báo "nhóm lệch", chưa quy trách nhiệm). (IV) CƠ CHẾ: worst/meanOthers PHẲNG LÌ 1.02
  qua mọi σ (worstV tăng tuyến tính nhưng TỈ SỐ bất biến) vì nhiễu iid trung bình hoá qua 17 khớp×13 mẫu
  ⇒ 5 người dồn sát nhau trong ~2% ⇒ 1.02≪1.3. KẾT: RATIO=1.3 CÓ VAI TRÒ THỨ HAI — lá chắn nhiễu iid
  (V46: chống đổ-oan-đa-số; V47: chống đổ-oan-do-nhiễu, cùng cơ chế "đòi nổi trội TƯƠNG ĐỐI"); cặp cổng
  SYNC(nhạy nhiễu, báo "nhóm lệch")+RATIO(miễn nhiễu iid, quyết "quy về 1 người?") bù nhau ⇒ ở dải
  detector thật 1–3cm metric VỪA nhạy VỪA an toàn = de-risk Gate-0. GIỚI HẠN trung thực: iid là chặn
  TRÊN (lạc quan); nhiễu thật có tương quan thời gian (không tự triệt khi trung bình) + lệch hệ thống
  theo góc nhìn (sai CÓ CẤU TRÚC giống lỗi thật) + rơi khớp ⇒ V47 chỉ chứng minh bền với thành phần
  NGẪU NHIÊN, thành phần CÓ CẤU TRÚC để ngỏ đo ở Gate-0. Runner 11/11 tất định ~182s. Doc `ket-qua-ben-nhieu.md`.
- **Vòng 48 — NHIỄU CÓ CẤU TRÚC: điểm mù duy nhất + bản đồ phòng thủ xuyên tầng** (commit `0a33153`).
  `web/experiments/structured-noise.ts`: đo THẲNG 3 thành phần cấu trúc V47 để ngỏ (thay vì suy đoán),
  trên chính formOutlierIndex, tất định (AR(1) gieo hạt mulberry32; bias/đợt không PRNG). (A) TƯƠNG QUAN
  THỜI GIAN AR(1) chuẩn hoá phương sai biên (x_t=ρx_{t-1}+√(1-ρ²)w ⇒ cô lập tác động tương quan): nhóm
  đúng σ=3cm, quét ρ→0.99 → FP=0, worst/mean chỉ 1.02→1.08≪1.3 (worstV phình ~6→7cm nhưng TỈ SỐ gần
  bất biến) ⇒ RATIO bền cả với nhiễu tương quan vì điều quyết định là ĐỘC-LẬP-GIỮA-NGƯỜI, KHÔNG phải
  iid-theo-thời-gian (5 người cùng phình ⇒ không ai trội). (B) ĐIỂM MÙ THẬT: D0 MÚA ĐÚNG nhưng bị
  detector lệch hệ thống β cm tay trái (nhóm còn lại đúng+sạch) → nêu oan: 0% tới β=20, VỌT 100% từ
  β=26cm thô (≈12cm residual, khớp đường đặc trưng V44). Tương phản SẮC với V47 (nhiễu ngẫu nhiên KHÔNG
  bao giờ nêu ai): nhiễu CÓ CẤU TRÚC dai dẳng 1-người THÌ vu oan, và BẤT KHẢ PHÂN với múa-sai ở tầng
  toạ-độ-3D (cùng formResidual) ⇒ KHÔNG núm sync.ts nào sửa = giới hạn THÔNG TIN. (C) MẤT-BÁM ĐỢT: D0
  dịch tay trái 30cm (trên ngưỡng) trong D khung liên tiếp → D≤13 (≈1 cửa sổ):0%, D=30:8%, D=240 cả
  clip:100% = ĐÚNG BẰNG (B) ở β=30 (KIỂM CHÉO khớp) ⇒ occlusion THOÁNG an toàn (cửa sổ 13 mẫu pha
  loãng)↔mất-bám DAI DẲNG hoá thành (B). LUẬN ĐIỂM KIẾN TRÚC: CÙNG phép trung bình 17-khớp×13-mẫu vừa
  là LÁ CHẮN nhiễu (V47 iid / A tương quan / C-ngắn thoáng đều giữ độc-lập-giữa-người) vừa là GÓT CHÂN
  với lỗi hệ thống 1-người (B / C-dài, tín hiệu thật dai dẳng). Điểm mù DUY NHẤT này nằm ĐÚNG CHỖ 3 tầng
  đã-có khép lại: (1) perception đa-view reproj held-out V13 — bias 1-view lộ ra khi chiếu chéo sang
  view kia vì KHÔNG nhất-quán-vật-lý (⇒ 2-cam không chỉ dựng 3D mà còn KIỂM nhiễu hệ thống); (2) đánh
  giá tuyệt-đối V42 khi có nhãn tham chiếu; (3) trình bày gộp lưới nhịp V32 chống nhấp nháy. Biến "điểm
  mù" mơ hồ thành MỘT Ô xác định trên bản đồ + chỉ đúng 3 tầng khép. GIỚI HẠN trung thực: chưa CHẠY V13
  trên chính ca bias (bước Gate-0, cần pipeline 2-view thật) — mới chỉ RA lối tách bằng lập luận nhất-
  quán-vật-lý; ngưỡng ~26cm riêng cấu hình này, cơ chế bất-khả-phân thì tổng quát. Runner 12/12 tất định
  ~167s. Doc `ket-qua-nhieu-cau-truc.md` (bảng 5-loại-nhiễu × giữ-độc-lập-giữa-người → kết quả).
- **Vòng 49 — TẦNG ĐA-VIEW CHẠY THẬT để khép điểm mù V48 (perception, numpy/CPU)** (commit `f1e2a2d`).
  `experiments/phan_biet_lech_he_thong.py`: V48 mới CHỈ RA bằng lập luận rằng tái chiếu held-out (V13)
  tách "detector lệch hệ thống 1 khớp" khỏi "múa sai thật"; V49 CHẠY để định lượng. Cấu hình y hệt
  danh_gia_khong_gt (4 máy −60/−20/20/60, dựng 3 máy 0/2/3, GIỮ −20° làm giám khảo sạch, bias đặt view
  −60°), khảo sát MỘT khớp (l_wrist), sàn Gauss 2px, 16 hạt/mức, đo tái chiếu PER-KHỚP (không pha loãng
  17 khớp — chính bài học V48). Hai họ: THẬT dời khớp trong 3D THẬT (mọi camera thấy nhất quán) vs BIAS
  lệch b px MỘT view dựng (3D thật=gốc, vũ công múa ĐÚNG). KẾT QUẢ ĐO: THẬT dời tới 20cm mà reproj
  held-out PHẲNG ~2.8px (= sàn nhiễu) vì mọi máy đồng thuận; BIAS reproj VỌT 4.3→55.6px theo b. Ở CÙNG
  dev3d (thứ tầng đánh giá NHÌN THẤY — với nó THẬT≡BIAS), tỉ số reproj BIAS/THẬT = 2.3× (3cm) →8.7×
  (12cm). Cổng tin cậy: τ=trần-THẬT 2.80px ⇒ 100% (6/6) ca BIAS có dev3d≥2cm (đủ để tầng đánh giá nêu)
  vượt τ ⇒ bị chặn đúng. ⇒ Đặt cổng reproj held-out TRƯỚC phán quyết đánh giá: giữ mọi sai-động-tác
  thật (reproj thấp), GỠ OAN người bị detector lệch (reproj cao). Điểm mù V48 khép bằng SỐ ĐO, không
  lập luận. Nối danh_gia_khong_gt: lý do kỹ thuật thứ 2 cho ≥3 máy = luôn có camera GIỮ LẠI độc lập
  sạch làm giám khảo — thứ 1-camera (Choreoto) KHÔNG có ⇒ mắt xích khép vòng điểm-mù-đánh-giá↔giải-pháp-
  perception. GIỚI HẠN: một khớp/một hướng/bias tĩnh (đúng lát cắt V48); vẫn hình học tổng hợp — bước
  Gate-0 còn lại = chạy cổng trên detector THẬT (RTMPose/ViTPose) 2–3 máy (cần GPU lab). Đã cắm vào
  runner perception `experiments/run_all.py`. Doc `ket-qua-phan-biet-lech.md`.
- **Vòng 50 — ROBUST vs HELD-OUT: bổ túc KHÔNG dư thừa; robust còn HẠI ở bias lớn** (commit `26c118b`).
  `experiments/phong_thu_bo_tuc.py`: trả lời câu hội đồng CHẮC hỏi sau V49 — "tam giác hoá BỀN
  (robust, cổng tái chiếu 20px trong fuse_multiview) đã loại view bias rồi, cổng held-out V49 có DƯ
  THỪA?". Cùng cấu hình V49, quét bias hệ thống + outlier thô thoáng qua, dựng robust=False vs True.
  DỰ ĐOÁN bị SỐ LIỆU BÁC (phần giá trị nhất): (1) bias NHỎ b≤30px robust GIỮ CẢ 3 view (chưa vượt
  ngưỡng 20px) → dev3d robust≈plain → robust MÙ = đúng điểm mù V48; (2) bias LỚN — dự đoán "robust
  loại view bias → phục hồi" SAI HẲN: robust loại NHẦM view SẠCH đối-góc → dev3d robust TỆ HƠN plain
  (b=80px: 28.7→42.0cm). Chẩn đoán `_drop_profile` (tất định, tự sinh số) CHỨNG MINH cơ chế: ở b=80px
  robust loại view SẠCH +60° ở 40/45 khung, loại view BIAS −60° chỉ 5/45 — vì bias kéo nghiệm
  compromise về phía nó nên view sạch đối-góc thành "lệch nhất" bị loại, còn lại bias+1sạch = trọng số
  bias 1/3→1/2 = KHUẾCH ĐẠI. ⇒ robust không chỉ MÙ mà có thể HẠI với bias hệ thống. Đối chiếu: outlier
  THÔ thoáng qua (20% khung) robust dập tốt mọi biên độ (g=130px dev3d 7.2→3.1cm) = địa hạt sở trường.
  KẾT LUẬN: held-out V49 phủ TOÀN dải bias hệ thống (reproj ≫τ, robust-bất-biến), robust chỉ giỏi
  outlier-thô + phản tác dụng bias lớn ⇒ KHÔNG dư thừa. LẶP LẠI lằn ranh cấu trúc xuyên đề tài:
  NGẪU-NHIÊN/THOÁNG bị trung-bình-hoá/loại dễ (V47 iid, robust outlier-thô) vs HỆ-THỐNG/DAI-DẲNG là kẻ
  khó (V48 điểm mù, V50 khe bias nơi lọc-mạnh-hơn còn LÀM TỆ ĐI) → chỉ chặn bằng CHIỀU DỮ LIỆU THÊM
  (đa-view held-out), không bằng lọc mạnh hơn cùng chiều. GIỚI HẠN: ngưỡng 20px + điểm chớm-loại b≈45px
  riêng cấu hình; chỉ 3 view dựng (chưa quét số-view); hình học tổng hợp. Runner perception 12/12. Doc
  `ket-qua-phong-thu-bo-tuc.md`.
- **Vòng 51 — SỬA hỏng 3D bằng LOVO (loại-từng-view chẩn đoán held-out): đóng đúng KHE robust để hở** (commit `63ea01b`).
  `experiments/sua_bang_held_out.py`: KHÉP VÒNG tầng dựng V49(chẩn đoán)→V50(vì sao lọc-cùng-chiều
  hở/hại)→V51(sửa bằng đúng granularity nguồn). Biến tín hiệu held-out V49 thành BỘ CHỌN VIEW
  loại-từng-view (leave-one-view-out) ở granularity CAMERA: với mỗi view v, dựng 3D từ CÁC VIEW CÒN
  LẠI (v không tham gia), tái chiếu về v, GỘP sai số trung bình theo CẢ clip. Camera bias khi bị bỏ ra
  bị chấm bởi đồng thuận các view sạch → điểm CAO nhất → loại → dựng lại. Bốn phương pháp trên sweep
  bias hệ thống (4 view ứng viên, bias view −60°, khớp l_wrist): plain/robust/LOVO/oracle(loại-đúng-view-
  biết-trước=chặn trên). SỐ ĐO: LOVO nêu ĐÚNG thủ phạm ≥90% từ b≈10px & 100% bias lớn, dev3d về =oracle
  (b=10px 2.55→0.65cm; b=20px 4.97→0.63; b=80px 20.17→0.62; LOVO−oracle≤0.00). GIÁ trung thực: b=0
  (không camera lỗi) LOVO vẫn bỏ 1 view → +0.18cm so plain-4-view ⇒ chỉ bật KHI V49 đã BÁO view nghi vấn.
  CHỖ KHÁC DỰ ĐOÁN (ghi đúng như đo, không sửa số cho khớp giả thuyết): với 4 view (đa số sạch 3/4)
  robust KHÔNG khuếch đại như V50 (3 view) mà PHỤC HỒI từ b≈45px → V51 chính là TRẢ LỜI câu V50 để ngỏ
  "chưa quét số-view": hành vi HẠI của robust ở V50 là hệ quả THIẾU ĐA SỐ SẠCH (rơi sàn-2-view); thêm
  view sạch thì robust hết hại NHƯNG vẫn CÂM ở dải bias-vừa b≈10–20px (đủ hỏng 3D ~5cm mà chưa vượt
  ngưỡng per-khung 20px) = KHE robust để hở, LOVO đóng đúng nó (b=20px 4.97→0.63=oracle) vì cộng dồn
  per-CAMERA qua cả clip thấy bias hệ thống DƯỚI mọi ngưỡng per-khung. LUẬN ĐIỂM KIẾN TRÚC: lỗi
  HỆ-THỐNG/DAI-DẲNG của MỘT nguồn chỉ trị được bằng cộng dồn bằng chứng ở ĐÚNG granularity nguồn
  (per-CAMERA qua held-out), KHÔNG bằng lọc mạnh hơn ở granularity sai (per-khung như robust để hở khe
  bias-vừa) — cùng nguyên lý gộp-nhịp V32 & tuyệt-đối-có-nhãn V42 thắng chấm nhóm-tương-đối-per-khung V41
  ở tầng đánh giá; LOVO là hiện thân nguyên lý đó ở tầng hình học. GIỚI HẠN: cần ≥3 view ứng viên + đa số
  sạch ⇒ cấu hình 2-máy KHÔNG dùng được (LOVO là lá chắn cho ≥3 máy studio/nhiều-điện-thoại, không thay
  phòng thủ 2-máy); mới thử 1 camera bias/lần (2 camera cùng bias có thể qua mặt đồng thuận — chưa đo);
  onset+khe+giá riêng cấu hình, cơ chế tổng quát; hình học tổng hợp, Gate-0 chờ GPU. Runner perception
  13/13 tất định ~232s, doc tái sinh byte-giống qua 2 lần chạy. Doc `ket-qua-sua-bang-held-out.md`.
- **Vòng 52 — TRẦN của chọn-view-đồng-thuận (LOVO) khi NHIỀU camera cùng lệch = floor((V-1)/2)** (commit `a37a3b0`).
  `experiments/tran_dong_thuan.py`: ĐO trực tiếp điều V51 để ngỏ ("2 camera cùng bias có thể qua mặt
  đồng thuận"). Ép giả định "đa số view sạch" tới GÃY: 4 camera, quét k∈{0..3} camera bias 60px, hai
  chế độ hướng (SAME=cùng hướng / DIFF=khác hướng), HAI cách chấm. Đây là CÙNG MOTIF V41 (chấm
  nhóm-tương-đối sụp ở ~đa-số) tái hiện ở tầng HÌNH HỌC — và là lần đầu đo được ở tầng dựng.
  PHÁT HIỆN 2 TẦNG (ghi đúng như đo, KHÔNG sửa số cho khớp giả thuyết): **Tầng 1 — LOVO ngây-thơ
  (dựng "others" bằng phép thường) có confound NHIỄM-BẨN, phụ thuộc HƯỚNG**: camera bias làm bẩn
  phép dựng dùng để chấm các view SẠCH → một view sạch "xuôi dòng bẩn" có điểm held-out CAO HƠN cả
  camera bias thật → argmax loại NHẦM. Nên LOVO-ngây-thơ trị được SAME nhưng THẤT BẠI ngay k=1 ở DIFF
  (loại-đúng 100%→0%, dev3d 0.64→51.46cm vs oracle 0.61). Chẩn đoán trực tiếp: DIFF k=1 điểm 4-view
  {view0-bias:59.72, view3-sạch:59.92} → argmax = view3 SẠCH (sai). Đây KHÔNG phải trần thật mà là lỗ
  hổng cách chấm. **Tầng 2 — LOVO BỀN (dựng "others" kiểu drop-worst >20px) khử confound → TRẦN THẬT
  độc-lập-hướng**: một camera bias LẺ trong tập "others" tự bị loại TRƯỚC KHI làm bẩn. Kết quả: trị
  k=1 CẢ HAI hướng (SAME/DIFF loại-đúng 100%, dev3d về oracle 0.64/0.61cm), GÃY ở k=2 cả hai hướng
  (loại-đúng 0%, dev3d ~30–39cm vs oracle ~0.8cm). TRẦN = floor((V-1)/2)=1 cho V=4. CƠ CHẾ: chấm 1
  view thì "others" có V-1=3 view; drop-worst chỉ trị được THIỂU SỐ bias (≤1) trong 3 đó → k=1 mọi
  bộ-others chứa ≤1 bias (khử sạch), k=2 khi chấm view sạch thì others={2 bias,1 sạch} drop-worst bỏ
  1 còn 1 bias → vẫn bẩn → loại nhầm. k=3 = giới hạn CẤU TRÚC (1 view sạch, bỏ 1 còn 2 có thể toàn
  bias, oracle cũng bất lực dev3d=NaN) = trần THÔNG TIN không phải trần thuật toán. BÀI HỌC cách-chấm:
  chọn đúng cơ chế đồng thuận KHÔNG dời được trần nguyên lý (vẫn floor((V-1)/2)) nhưng khiến trần đó
  ĐÚNG-ĐẮN & đoán-trước-được thay vì phập phù theo hướng bias. LUẬN ĐIỂM song song V42: đồng-thuận-
  nội-bộ (LOVO/robust) là công cụ GT-free MẠNH nhưng có TRẦN nguyên lý ~đa-số; phá trần cần THAM CHIẾU
  NGOÀI đồng thuận (calib/khớp biết trước, hoặc Gate-0 ground-truth) — y như tầng đánh giá: nhóm-tương-
  đối V41 trần ~đa-số, tuyệt-đối-có-nhãn V42 phá trần. Biết đúng trần + biết lối thoát = kết luận trung
  thực cung V49–V52. τ hiệu chỉnh THEO số-view (quét MỌI tập con mỗi cỡ, vì hình học từng tập con khác
  → sàn khác) riêng cho mỗi cách chấm; tất định (doc byte-giống 2 lần chạy). Runner perception 14/14
  tất định ~211s. GIỚI HẠN: bias cố định 60px chưa quét k×biên-độ; camera-nào-bias (BIAS_ORDER cố định)
  là confound chưa quét; vẫn hình học tổng hợp, Gate-0 chờ GPU. Doc `ket-qua-tran-dong-thuan.md`.
- **V53 — MỐC TUYỆT ĐỐI PHÁ trần V52 CHỈ cho bias nó THẤY = hai thước bù nhau theo NGUỒN lỗi**
  (`experiments/moc_tuyet_doi.py` → `ket-qua-moc-tuyet-doi.md`, commit c4e166e): V52 KHẲNG ĐỊNH "phá
  trần đồng-thuận floor((V-1)/2) cần tham chiếu NGOÀI đồng thuận"; V53 ĐO khẳng định đó bằng mốc calib
  (4 góc bảng 3D BIẾT trước, residual per-camera = |quan-sát − chiếu(3D-biết qua calib)|, KHÔNG đồng
  thuận KHÔNG giả-định-đa-số; cổng dẫn từ số: trần-sạch ×1.5 = 7.08px). PHÁT HIỆN sắc hơn "tuyệt đối
  thắng tương đối": mốc CHỈ thấy nguồn lỗi tác động lên điểm-mốc. (A) Bias TOÀN-CAMERA (sai
  calib/extrinsic, MỌI khớp+mốc dời qua cùng camera-model sai): mốc THẤY (residual vọt) → loại BẤT KỂ
  bao nhiêu camera bias → PHÁ trần: mốc k≤2 (k=1 dev0.64=oracle, k=2 dev0.87=oracle NƠI LOVO gãy
  30.5cm) vs LOVO k≤1; trần mốc = giới hạn CẤU TRÚC (k=3 chỉ 1 view sạch, oracle cũng NaN) KHÔNG phải
  trần đồng-thuận = geometric-twin V42. (B) Bias 1-KHỚP (detector định vị sai riêng cổ tay: che khuất,
  lẫn trái-phải, CHỈ l_wrist dời, góc bảng KHÔNG dời): mốc MÙ (tham chiếu điểm KHÁC) → mốc k≤0 (k=1
  loại-đúng 0%, dev 15cm không cứu), chỉ LOVO đồng-thuận bắt được k≤1 đúng trần V52. KẾT LUẬN BÙ-NHAU
  (KHÔNG phải "tuyệt đối luôn thắng"): tham chiếu ngoài phá trần CHỈ cho nguồn mà tham chiếu đó THẤY;
  calib-anchor thấy sai-calib mù sai-detector, đồng-thuận thấy cả hai nhưng trần đa-số → CHỌN đúng
  thước cho đúng nguồn. Không thước nào vượt giới hạn CẤU TRÚC (≥2 view sạch). Motif LẶP xuyên đề tài:
  robust↔held-out (V50), nhóm-tương-đối↔tuyệt-đối-nhãn (V41/V42), giờ calib-anchor↔đồng-thuận-LOVO
  (V53) — mỗi cặp bù nhau theo nguồn. HỆ QUẢ pipeline 2-máy: sai-calib dùng bảng-mốc (bắt cả khi 2 máy
  lệch, miễn ≥2 máy đúng dựng); sai-detector-1-khớp mốc vô dụng, cần ≥3 máy+đa-số-sạch LOVO hoặc nhãn
  Gate-0 (cấu hình ĐÚNG-2-máy KHÔNG tự chữa nguồn này — ghi nhận trung thực). GIỚI HẠN: 2 loại bias đo
  RIÊNG chưa trộn; mốc giả định bảng visible+3D-biết (đúng pha calib ChArUco); bias 60px cố định. Tất
  định (doc byte-giống 2 lần chạy). Runner perception 15/15 tất định ~252s.
- **V54 — BIAS TRỘN hai nguồn: giao thức 2-tầng (anchor→LOVO) COMPOSE CÓ ĐIỀU KIỆN + THỨ TỰ BẤT-HOÁN**
  (`experiments/bias_tron.py` → `ket-qua-bias-tron.md`, commit 34ff1cf): đóng mục V53 để ngỏ ("trộn
  calib+detector, dùng CẢ hai thước là hướng hợp lý"). ĐO phối hợp mốc→LOVO → PHÁT HIỆN sắc hơn lời
  hứa: giao thức 2-tầng có ENVELOPE rõ, NGOÀI envelope ghép NGÂY THƠ còn HẠI. 3 kết cục: (1) TRÙNG 1
  view (cùng camera cả 2 kiểu bias) = tầm thường "1 camera xấu", mọi thước 100% dev0.58=oracle; (2)
  DISJOINT rig NHỎ (V=4 cam{0}+joint{1}, sub sau-anchor=3<4): TRỘN dev 39.9 KHÔNG cứu, TỆ HƠN cả mốc-đơn
  19.4 — vì anchor gỡ view whole-cam làm rig CO xuống DƯỚI biên-bền LOVO (LOVO-bền cần ≥3 "others"
  drop-worst ⇒ ≥4 view working-set), confound V52 TRỞ LẠI → OVERTURNS V53 "hướng hợp lý" thành CÓ ĐIỀU
  KIỆN; (3) DISJOINT rig ĐỦ (V=5 sub=4, V=6 sub=5): TRỘN 100% dev=oracle ngay khi chạm envelope. Ô VÀNG
  V=6 cam{0,1}+joint{2}: LOVO-đơn 0% (2 whole-cam NHẤN CHÌM trần đồng-thuận) nhưng anchor gỡ CẢ HAI
  whole-cam KHÔNG cần đa-số (V53) → còn 4 view → LOVO bắt joint → TRỘN 100% dev0.67=oracle ⇒ chứng minh
  ANCHOR TRƯỚC (vô-hạn-trần trên nguồn của nó) rồi LOVO SAU (có-trần nhưng giờ chạy đúng chế-độ-hợp-lệ);
  đổi thứ tự (LOVO trước) hỏng vì whole-cam còn đó thổi phồng mọi reproj = THỨ TỰ BẤT-HOÁN. Chi tiết
  trung thực: mốc-đơn dev GIẢM khi V tăng (19.4→15.4→12.8) do joint-bias dư bị PHA LOÃNG trong tam giác
  hoá nhưng KHÔNG BAO GIỜ sửa (vẫn ~13cm ≫ oracle) = mốc mù joint dù nhiều view. ENVELOPE phát biểu gọn:
  `V−k_cam≥4` (LOVO còn biên sau anchor) VÀ `V−k_cam−k_joint≥2` (còn ≥2 view sạch tam-giác-hoá cuối) VÀ
  `k_joint≤floor((V−k_cam−1)/2)` (trần V52 trên rig ĐÃ dọn); envelope là điều kiện cho chế-độ DISJOINT
  (ca TRÙNG không cần LOVO nên nằm-ngoài-envelope vẫn chạy). HỆ QUẢ 2-điện-thoại: V=2 envelope KHÔNG
  THOẢ cho ca trộn ngay khi có bất kỳ bias cần gỡ ⇒ cấu hình 2-máy KHÔNG tự chữa ca TRỘN, cần ≥5–6 máy
  hoặc nhãn Gate-0 (khớp giới hạn V51–V53). Ý nghĩa thiết kế rig: anchor mua khả-năng-gỡ-whole-cam-vô-
  hạn-đa-số NHƯNG mỗi view gỡ làm HAO biên LOVO → phải chừa đủ view tầng sau. HỢP NHẤT cung V49–V54
  thành MỘT giao thức có envelope tường minh (held-out chẩn V49 → robust↔held-out bổ túc V50 → LOVO sửa
  bias-vừa V51 → trần đồng-thuận V52 → mốc phá-trần-camera-mù-khớp V53 → ghép xử-lý-trộn-có-envelope
  V54). Motif xuyên suốt: lỗi hệ-thống một-nguồn trị bằng bằng-chứng ĐÚNG granularity nguồn, và GHÉP
  thước phải tôn trọng chế-độ-hợp-lệ từng thước. GIỚI HẠN: hình học tổng hợp, bias 60px cố định hướng
  SAME, view-nào-bias cố định; k_joint=1 mỗi ô; envelope suy-từ-cơ-chế + xác-nhận-quét-số-view chưa
  chứng minh giải tích đầy đủ. Tất định (doc byte-giống 2 lần chạy). Runner perception 16/16 ~295s.
- **V55 — KIỂM ĐỊNH envelope V54 như LUẬT DỰ ĐOÁN (Monte-Carlo, GỒM confound view-nào-bias)**
  (`experiments/kiem_dinh_envelope.py` → `ket-qua-kiem-dinh-envelope.md`, commit f45c437): đóng giới-hạn
  chính V52–V54 để ngỏ (confound "view NÀO bias" chưa quét; envelope chỉ xác-nhận trên 6 kịch-bản tay-chọn).
  Quét 76 cấu hình (V,k_cam,k_joint) V∈4..7 × tối đa 4 gán-view × 5 trial. PHÁT HIỆN envelope V54 KHÔNG
  chính xác — chỉ đúng BẬC-MỘT 62/76=81.6% (OVERTURNS tính-chắc ngầm của công thức đếm). 3 lớp lệch đều
  CÓ LÝ DO: (A) envelope QUÁ NGẶT ở k_joint=0 (8 cấu hình): LOVO không có việc, chỉ cần V−k_cam≥2 chứ
  không cần ≥4; (B) CONFOUND hình-học lượng-hoá LẦN ĐẦU (14 cấu hình split: 3 ở k_joint=1, 11 ở
  k_joint≥2): cùng (V,k_cam,k_joint) nhưng gán-view khác → kết cục khác vì rig CÒN-LẠI sau anchor phân bố
  góc tốt/xấu quyết định held-out LOVO ⇒ envelope CHỈ-ĐẾM không thể chính xác vì thiếu chiều hình-học;
  (C) trần k_joint floor((V-1)/2) của V52 là NGOẠI-SUY lạc quan (V52 chỉ ĐO ở V=4): FRONTIER k_joint≥2
  (20 cấu hình) chỉ 1 all-pass/8 all-fail/11 split ⇒ trần THỰC của LOVO-bền-drop-một là k_joint≤1, phần
  trên phụ-thuộc-hình-học (vì "others" robust chỉ drop MỘT view tệ nhất, ≥2 joint-bias trong "others"
  còn sót làm bẩn). Luật đếm TINH CHỈNH (k_joint=0→V−k_cam≥2; =1→V−k_cam≥4; ≥2→FRONTIER) khớp SẠCH vùng
  đếm-đoán-được 56/56 — CẢNH BÁO TRUNG THỰC: 100% là MÔ TẢ (post-hoc fit từ chính các lệch), KHÔNG phải
  dự-đoán chéo-kiểm; giá trị THẬT là chứng minh phần COUNT bỏ-sót TÁCH BẠCH đúng vào vùng phụ-thuộc-hình-
  học, không lẫn nhiễu ⇒ trần NGUYÊN LÝ của mọi envelope chỉ-đếm, muốn vượt phải thêm chiều phân-bố-góc
  rig-còn-lại. Ý nghĩa hội đồng: câu trả lời trung thực cho "công thức envelope có chắc không" = chắc BẬC
  MỘT + ta BIẾT CHÍNH XÁC nó hở ở đâu (confound) & vì sao. Motif lặp: ngẫu-nhiên trung-bình-hoá dễ, lỗi
  hệ-thống/cấu-trúc (ở đây: hình-học rig) là kẻ khó — cùng lằn ranh V41/V42 (đánh giá), V47/V48 (nhiễu),
  V50/V51 (bias). GIỚI HẠN: hình học tổng hợp, bias 60px hướng SAME, confound lấy-mẫu chưa vét-cạn. Tất
  định (doc byte-giống 2 lần). Runner perception 17/17 ~401s (V55 nặng nhất 139s).
- **V56 — PHẦN DƯ FRONTIER (V55) có phân-tách bằng HÌNH-HỌC rig không? = KHỬ CONFOUND ĐẾM (Simpson)**
  (`experiments/hinh_hoc_frontier.py` → `ket-qua-hinh-hoc-frontier.md`, commit 89ae8dd): trả lời lối-ra
  V55 gợi ("muốn vượt phải thêm chiều hình-học"). Quét 392 mẫu-assignment trên FRONTIER (k_joint≥2,
  V=4..7), 13 ô-count split. PHÁT HIỆN CHÍNH = nghịch lý Simpson (bài học phương pháp): scalar "độ trải
  góc view sạch" POOLED AUC 0.818 (trông rất đoán-được) nhưng CONDITIONAL (trong-ô-count cố định) 0.227
  — ĐẢO NGƯỢC dưới 0.5; tín hiệu pooled HOÀN TOÀN do tương-quan với nclean=V−kc−kj (tự là ĐẾM). nclean
  pooled AUC 0.929 nhưng HẰNG-SỐ trong ô ⇒ 0 sức phân-tách trong-ô = bằng chứng nó là đếm thuần không
  phải hình-học. Đòn-bẩy view-bias weakest-link (min|góc| các view joint-bias, NỐI cơ chế held-out V49:
  view bias RÌA đòn-bẩy lớn lộ mạnh ở held-out dễ bắt, view bias GẦN TÂM lộ yếu dễ sót): ĐÚNG HƯỚNG
  conditional 0.64 (có ô đạt 1.0) & cơ chế nhất-quán V49 NHƯNG quá yếu/biến-động (dải 0.20–1.0) làm
  ngưỡng thực dụng. KẾT LUẬN CỦNG CỐ (không mâu thuẫn) V55: không scalar đơn nào sống-sót điều-kiện-hoá
  ⇒ phần dư FRONTIER là phụ-thuộc-hình-học ĐA-YẾU-TỐ, KHÔNG rút gọn về 1-số-rig; lối ra thực dụng =
  CHẠY bộ ước-lượng thật (combo) chứ không đoán bằng công thức, HOẶC thêm view/nhãn để RỜI FRONTIER
  (đúng khuyến nghị thiết-kế-rig V54: chừa đủ view sạch nằm-ngoài-FRONTIER ngay từ đầu). TRÁNH mô hình
  đa-biến trên 13 ô (overfit, không làm). Motif: lại là ngẫu-nhiên/pooled dễ đánh lừa vs cấu-trúc thật
  cần điều-kiện-hoá đúng — họ hàng V41/V42, V47/V48, V50/V51, V55. GIỚI HẠN: tổng hợp, bias 60px SAME,
  per-ô ít mẫu (AUC-trong-ô nhiễu nhưng headline 0.82→0.23 quá lớn để là nhiễu), scalar 1-chiều. Tất
  định (doc byte-giống 2 lần). Runner perception 18/18 ~604s (V55 149s + V56 152s là 2 long-pole; suite
  đã chạm ~10 phút — TRÁNH thêm experiment nặng nữa, arc bias/trần V49–V56 coi như ĐÓNG ở tầng tổng hợp).
- **V57 — HỢP NHẤT TÀI LIỆU cung tri-giác V49–V56 (không phải experiment mới)** (commit abda762):
  giống V45 nối V1–V44 vào đặc tả, giờ nối V49–V56 vào 2 tài liệu hội đồng đọc, ĐÃ đối chiếu từng số với
  ket-qua-*.md trước khi viết. (1) `experiments/README.md` CŨ bị stale nặng ("10 script/~173s", chỉ có
  nhóm I/II/III, KHÔNG có V13/V14 lẫn V49–V56) → sửa 18/18 ~604s; thêm Nhóm IV narrate V49–V56 (bảng 8
  dòng + motif kiến trúc); checklist Cổng 0 mở rộng: cổng held-out V49 ĐẶT TRƯỚC phán quyết đánh giá để
  GỠ OAN, LOVO V51 CÓ ĐIỀU KIỆN (chỉ bật khi V49 báo, giá +0.18cm), mốc tuyệt-đối V53 khi có ChArUco,
  cảnh báo cổng-tái-chiếu robust MÙ bias nhỏ & HẠI bias lớn (V50) phải cặp held-out; giới hạn mới (ngưỡng
  đúng CƠ CHẾ, trị số riêng cấu hình; bias thật đa dạng hơn). (2) `dac-ta-mvp-choreo-2cam.md §9`: sửa dòng
  bảng tri-giác (18/18 ~604s, "cộng cung V49–V56"), thêm "Mạch nghiên cứu tầng tri-giác" 3 điểm (chẩn
  đoán held-out/robust bổ túc → sửa LOVO + trần đồng-thuận/mốc bù nhau → hợp nhất envelope + ranh giới
  đoán-được Simpson) SONG SONG mạch đánh giá đã có; nối ranh-giới-trung-thực tới README mới + việc Gate-0
  còn lại. XÁC NHẬN `pytest -q` = 60 passed 0.66s (đối chiếu trước khi tái-khẳng "60 test xanh" trong
  thesis doc). LF→CRLF warning vô hại như thường. Đây là capstone TÀI LIỆU đóng arc — chuyển trọng tâm từ
  "làm thêm vòng synthetic" (đã bão hoà) sang "tài liệu hoá cho hội đồng". CÒN LẠI đúng như cũ: mocap 2-cam
  THẬT ở Gate 0 (GPU lab) — không làm được trên máy này.
- **V58 — VẬN HÀNH cung V49–V56 vào THIẾT KẾ CỔNG 0 (tài liệu, tiếp V57)** (commit 34621d7):
  phát hiện `gate0-thiet-ke-thuc-nghiem.md` mới dùng held-out/LOCO như ĐIỂM SỐ (Đường B) + LOCO-std như
  cờ "quay lại", CHƯA vận hành đóng góp lõi V49–V56 (chẩn đoán & SỬA bias hệ thống) → khoảng trống thật
  giữa "chứng minh synthetic" và "kế hoạch dữ liệu thật". Thêm §3.1 giao thức 3 bước khi ≥3 máy: (1) cổng
  held-out PER-KHỚP/PER-CAMERA (V49) đặt TRƯỚC kết luận "mocap xấu" → tách detector-lệch khỏi múa-thật-sai
  = GỠ OAN vũ công + tránh VỨT OAN clip; (2) LOVO (V51) SỬA bằng phần mềm + nêu thủ phạm ≥90% thay vì quay
  lại (chỉ bật khi B1 báo nghi, giá +0.18cm); (3) mốc ChArUco (V53) phân NGUỒN (thấy sai-calib toàn-camera,
  mù lỗi-detector-1-khớp) → cặp bù nhau, TRỘN chạy ChArUco trước→LOVO (V54 bất-hoán). THÊM phép thử BÁN-
  TỔNG-HỢP (tiêm bias pixel BIẾT TRƯỚC vào 1 máy detector THẬT, quét biên độ/khớp, kiểm cổng gắn cờ đúng
  + LOVO nêu đúng + kéo về gốc-chưa-tiêm) = cách DUY NHẤT xác nhận "cổng bắt đúng cái" trên detector thật
  không cần Vicon (chuyển phát hiện synthetic thành phép thử có-nhãn trên nhiễu THẬT). Cập nhật timeline
  tuần 4 + 2 cạm bẫy (pha loãng 17-khớp làm mất cờ lỗi-1-khớp; đổ oan vũ công/vứt oan clip). GIỚI HẠN ghi
  rõ: LOVO cần ≥3 máy+đa số sạch, cấu hình 2-máy SẢN PHẨM không tự sửa lỗi-detector-1-khớp → giao thức là
  lá chắn buổi nghiệm thu ≥3 máy (tăng độ tin số Cổng 0 + cứu clip), ngưỡng phải hiệu chỉnh lại trên
  detector thật. Bộ tài liệu Gate-0 giờ nhất quán với cung V49–V56. Tiếp tục CÒN LẠI: mocap THẬT Gate 0.
- **V59 — CẬP NHẬT ĐỀ CƯƠNG DATN theo cung V49–V56 (tài liệu, khép bộ 3 doc hội đồng)** (commit a96f9f8):
  `de-cuong-do-an-tot-nghiep.md` là doc TỔNG hội đồng đọc, nhưng V57 mới sửa README+dac-ta §9, V58 sửa
  Gate-0 — ĐỀ CƯƠNG BỊ BỎ SÓT, §5.4 vẫn ghi "Chín thực nghiệm / cả 10 script / 10/10 ~173s" + chỉ 3 nhóm
  (I/II/III), TOÀN BỘ cung V49–V56 (nhóm IV) vắng mặt. Đã vá 3 chỗ (grep xác nhận sạch marker cũ): (1) §5.4
  thêm đoạn "Tách & sửa lỗi lệch HỆ THỐNG đa-view (V49–V56)" tóm 3 mạch chẩn-đoán/sửa/hợp-nhất + motif
  "lỗi hệ-thống 1-nguồn chỉ trị bằng chiều dữ liệu THÊM hoặc đúng granularity, không bằng lọc mạnh hơn" +
  sửa bộ chạy "18 thực nghiệm / 4 nhóm / 18/18 ~604s" + checklist Cổng 0 nêu cổng held-out chạy TRƯỚC kết
  luận mocap-xấu; (2) §6 thêm novelty #4 (giao thức đánh giá & tự-sửa GT-free tận dụng ≥3 máy: held-out +
  LOVO + mốc ChArUco = chiều dữ liệu dư 1-cam không có); (3) chỉ mục tài liệu thêm 8 file ket-qua V49–V56
  (đã glob xác nhận tên file có thật trước khi viết). Bộ 3 doc hội đồng (đề cương + dac-ta + Gate-0) giờ
  ĐỒNG BỘ với cung perception V1–V56. **V59b — audit nhất quán số liệu xuyên doc** (commit f55f323):
  grep mọi claim runner/test/timing; dac-ta/de-cuong/README perception khớp nhau (18 script·18/18·~604s·60
  test·4 nhóm); tìm thấy `web/experiments/README.md` còn ghi "12/12 ngang runner numpy ~173s" — số ~173s
  thật ra là của CHÍNH web runner, và "ngang numpy" nay sai (numpy 18 script ~604s). CHẠY LẠI
  `node experiments/run-all.mjs` xác nhận web runner **12/12 tất định, 177.9s** (nặng nhất: coarse-to-fine
  ~80s + affine-validation ~82s) → sửa thành số đã đo + trỏ rõ web runner (12 script, đánh giá) và numpy
  runner (18 script, tri giác) là HAI bộ riêng. Feasibility doc `nghien-cuu-choreo-sequencer.md` grep sạch
  marker cũ + đúng mức prior-art/khả thi → KHÔNG sửa (thêm arc V49–V56 vào đó = filler, đã tránh).
  HEAD f55f323. Bộ 3 doc hội đồng + web README ĐỒNG BỘ. CÒN LẠI: mocap THẬT Gate 0 (GPU lab).
- **V60 — GUARD BẤT BIẾN tầng đánh giá: khoá cam kết lõi V33/V35 bằng assert** (commit 0fecea3):
  Trên "tiếp đi", đổi trọng tâm từ vòng synthetic (đã bão hoà) sang CỨNG HOÁ sản phẩm thật (web
  demonstrator). ĐÃ verify end-to-end: tsc/vite build xanh, 60 pytest, app chạy 5 mannequin + đội
  hình + canon + camera + export 0 lỗi console, và V35 tách pha HIỆN ĐÚNG LIVE trong SyncBreakdown
  ("Đồng bộ động tác 100% · đã bỏ trễ nhịp" khi canon ±2 phách, mọi người 0cm). AUDIT ROBUST sync.ts
  (475 dòng) + 4 consumer (SyncHighlighter L19/L32, Timeline L108/L121/L236/L241, SyncBreakdown L25
  có cả gác `ids.length!==formResidual.length` chống race ghi lệch tick ~8Hz, heatmap) → KHÔNG lỗi
  tiềm ẩn: mọi lối suy biến đã gác (n<2→null, chuỗi rỗng→dự phòng layout clip, median([])→0). KHE
  THẬT tìm ra: runner web `run-all.mjs` chỉ kiểm TẤT ĐỊNH (2 lần byte y hệt) chứ KHÔNG assert đúng-sai
  → một sửa đổi làm hỏng V35 mà vẫn tất định sẽ qua mặt runner, novelty âm thầm thoái. Các experiment
  chỉ IN số + emit JSON, không assert. **invariants.ts** (cùng idiom esbuild+node, 0 dep mới, node:assert):
  chạy TRỰC TIẾP src/sync.ts đã ship, chốt 14 bất biến — (1) gác suy biến; (2a) unison sync≈1 & không
  nêu ai (formSync 1.0000); (2b) canon FP_phase=0/40 vs FP_naive=28/40 (điểm hơn thua V35); (2c) sai
  động tác thật TP_phase=40/40 gọi đúng thủ phạm, misID=0/40. Số ĐO-TRƯỚC rồi chốt; FP_phase/misID chốt
  CHÍNH XÁC (claim sắc), TP≥90% chừa biên chống refactor lành. Teeth đã chứng (assert ném → exit≠0 →
  runner "NÉM LỖI" → exit 1). Wire đầu run-all.mjs → vỡ cam kết = runner ĐỎ ngay trước 2 benchmark dài.
  XÁC NHẬN: 13/13 tái lập ~184s, tsc -b exit 0, pytest 60. HEAD 0fecea3. Bài học: regression guard
  phải assert INVARIANT (đúng-sai), determinism-check một mình không bảo vệ được novelty. CÒN LẠI: mocap
  THẬT Gate 0 (GPU lab).
- **V61 — NÂNG CẤP THẨM MỸ NGƯỜI MÔ PHỎNG (demonstrator, hướng A+B)** (commit c9b95a5):
  User: "người mô phỏng chưa đẹp, đề xuất hướng cải tiến" → chọn **A+B+C** (cả avatar da-thịt, chấp
  nhận đánh đổi). Làm A+B trước thành 1 đợt chạy-được, C (avatar skinned) để V62. **A — sân khấu**
  (Stage.tsx+App.tsx): bỏ 3 đèn phẳng → bộ studio hemisphere+key-đổ-bóng(shadow 2048)+fill+rim;
  `<Environment>` dựng từ `<Lightformer>` (KHÔNG tải HDRI, offline) cấp specular; `<ContactShadows>`
  bóng mềm chung thay đĩa đen bẹt; tone mapping ACESFilmic+exposure 1.05 (áp CẢ vào video xuất vì
  preserveDrawingBuffer dùng chung); fog chiều sâu. **B — ma-nơ-canh nghệ thuật** (Mannequin.tsx):
  xương TRỤ rời → CAPSULE bán kính theo bộ phận (đùi/thân dày, cẳng tay mảnh), độ dài bake từ tư thế
  nghỉ (frame 0) rồi CO GIÃN Y theo tỉ lệ ≈1 mỗi khung → bán kính không méo mà luôn bám khớp; khớp
  cầu to/nhỏ theo vai trò; THÊM khối thân (capsule chậu→cổ), bàn chân (hộp chỉ +Z), bàn tay (bầu dục
  nối dài cẳng tay) → hết cụt ở cổ tay/cổ chân. GIỮ NGUYÊN: tô đậm chi phải, gương scale.x=-1,
  đường đi/đội hình/làn sóng, vòng chọn/cảnh báo, nhãn, khối bấm-chọn. Vật liệu meshStandard
  roughness0.42/metalness0.08 bắt phản xạ Environment. Xác minh: tsc -b exit 0, vite build 638 modules
  sạch, xem trực tiếp localhost:5173 (5 mannequin + đội hình vòng tròn + canon) KHÔNG lỗi console, khối
  người liền mạch rõ hơn hẳn ball-and-stick. Lõi đánh giá sync.ts KHÔNG đụng (thuần visual demonstrator).
  TIẾP: V62 hướng C = avatar GLTF/VRM skinned retarget 17 khớp (rủi ro asset/nhị-phân repo, cân nhắc
  khi tới). Novelty luận văn VẪN ở tầng perception/đánh giá, mannequin chỉ là demonstrator.
- **V62 — VŨ CÔNG DA-THỊT: THREE.SkinnedMesh THỦ TỤC (hướng C, bề mặt liền)** (commit 0e68bb0):
  Hoàn tất mức C user chọn. QUYẾT ĐỊNH ASSET: KHÔNG tải GLTF/VRM ngoài (vi phạm offline-robust +
  không nhét nhị phân repo + license + luật xin phép tải file) → dựng SkinnedMesh THUẦN CODE
  (`SkinnedMannequin.tsx` mới). Cơ chế: (1) bake vỏ (capsule mỗi xương theo boneRadius + khối thân
  chậu→cổ) ở tư thế NGHỈ thành 1 BufferGeometry; (2) auto-skin mỗi đỉnh → 2 xương GẦN NHẤT theo
  khoảng-cách-điểm–đoạn, trọng số nghịch đảo → ở khớp hai đoạn gặp nhau trọng số HOÀ → bề mặt uốn
  MƯỢT (hết đường nối capsule rời của B); (3) màu trái/phải + màu vũ công nướng vào vertex color,
  1 vật liệu skinned (DoubleSide an toàn khi gương scale âm). ĐIỂM KỸ THUẬT ĐÚNG = tránh lỗi tương
  tác bindMatrix × group-transform của skinning (nếu để mesh dưới group đang chuyển động, công thức
  skin TRÔI): giữ SkinnedMesh ĐỨNG YÊN ở gốc toạ độ, mỗi khung tính ma trận nhóm G (vị trí/hướng/
  gương từ CÙNG logic đội-hình>đường>tĩnh của Mannequin) rồi NƯỚNG G vào từng xương (bone.matrix =
  G · segmentHienTai, decompose vào pos/quat/scale; boneInverse bắt ở rest). Đầu/mũi/nhãn/vòng chọn/
  cảnh báo/khối-bấm giữ trong group chuyển động như cũ, dùng chung G nên khớp thân skinned. Toggle
  store `mannequinStyle` "khoi"|"da" (mặc định "da") + nút Panel + App render theo cờ → A+B (V61) VẪN
  là dự phòng an toàn, user so sánh được. Xác minh: tsc -b exit 0, vite build 639 module sạch, không
  lỗi console, nút đổi kiểu quay vòng sạch (da↔khoi↔da), 5 vũ công qua đội-hình/canon hình skinned
  mượt hơn HẲN capsule rời (elbow/knee uốn liền, thân có khối) → giữ "da" mặc định CÓ CĂN CỨ. Lõi
  perception/đánh giá KHÔNG đụng. KHÉP đợt cải tiến hình ảnh demonstrator A+B+C user yêu cầu; novelty
  luận văn vẫn ở tầng perception/đánh giá, mannequin chỉ demonstrator → tránh thêm vòng visual thừa.
- **Trạng thái perception layer (7 lớp/công cụ, mỗi cái có experiment + test):**
  robust (lỗi thô) · weighted invvar (nhiễu mềm) · bone-length PBD (nhiễu radial) · capstone
  hợp nhất 3 lớp · hiệu chuẩn confidence GT-free · kiểm định thước đo đánh giá GT-free (reproj
  held-out, V13) · **cross-validation LOCO + chẩn đoán QA (V14)**. Tất cả thuần CPU/numpy, tái lập được. Đây là phần "novelty tầng tri
  giác/đánh giá" của luận văn — CHỜ Cổng 0 (GPU + video múa thật). LƯU Ý arc perception coi như
  đã ĐẦY ĐỦ ở tầng tổng hợp: có đủ lớp khử nhiễu + thước đo đánh giá đã-kiểm-định; việc còn lại
  chủ yếu là chạy trên dữ liệu THẬT (cần GPU), không phải thêm lớp tổng hợp mới. V15 đã HỢP NHẤT
xong (runner tái lập + README chỉ mục + checklist Cổng 0) → tầng synthetic coi như ĐÓNG; vòng tới
nếu chưa có dữ liệu thật thì chỉ còn polish/UI hoặc chờ user, TRÁNH thêm lớp synthetic thừa.

Bước tiếp theo chưa làm (CẦN GPU lab + video múa thật, không làm được trên máy này):
(a) CỔNG 0 = mocap 2-cam thật; (b) chạy 2D pose (RTMPose/ViTPose) rồi nạp keypoint vào
`fuse_multiview` (đường đã sẵn); (c) lặp thực nghiệm §5.4 trên AIST++ thay nhiễu-giả bằng
sai số detector thật; (d) polish M4 (mobile responsive V17, đầu/mũi V18, timeline/nhãn/phím
tắt/bấm-chọn V19-22, tốc-độ-phát V23, đặt-lại-góc V24 ĐÃ xong; polish còn lại tuỳ chọn). Người dùng nên
hỏi GVHD: đồ án perception thuần phần mềm (không robot vật lý) có được duyệt không.

---
V63 (2026-10-01) MESH NGƯỜI GLTF (demonstrator, HEAD e078a54): user chấm V62 skinned-thủ-tục chỉ "cũng tạm" → user OVERRIDE ràng "không asset ngoài" cho RIÊNG asset CC0 này ("ý là tôi nói bạn đi tải á"). Tải Quaternius "Animated Human" (CC0, rig Mixamo-chuẩn 41 xương, ~0.7MB) vào web/public/models/animated_human.glb từ Poly Pizza (static.poly.pizza) — KHÔNG lấy được 2 nhân vật user chọn (nữ tóc vàng áo navy; nam áo xanh quần đỏ-mận giày đỏ) vì Google Drive CHẶN tải ẩn danh (quota exceeded) trên folder công khai Quaternius; gdown + Drive API OAuth đều bất khả trong phiên non-interactive. Đã dựng TRỌN pipeline để swap 2 nhân vật đúng sau này chỉ = đổi đường dẫn (+ ráp FBX Body/Feet/Head/Legs→glb). Component `GltfDancer.tsx`: SkeletonUtils.clone mỗi vũ công; chuẩn-hoá hướng rig→hệ ta, co giãn hông→gót ~0.9m, dời Hips gốc; RETARGET vị-trí→góc-xoay: mỗi xương aim (twist tối thiểu fromUnitVectors) tới khớp con, Hips theo basis thân (up=chậu→cổ, trái=hôngT→P, trước=trái×up); điểm ĐÚNG = tính góc LOCAL trong hệ vũ công BỎ QUA biến đổi nhóm G (local bất biến G) → group ngoài áp G (đội hình>đường>hướng) khi render, skinning không trôi; gương=phản chiếu pose đổi dấu x KHÔNG scale âm (tránh phá quaternion chuỗi). Màu "quần áo" nướng COLOR_0 theo xương trội mỗi đỉnh: áo=màu vũ công (giữ định danh), quần/giày tối, đầu/tay da. store "nguoi" mặc định; Panel nút quay vòng 3 chế độ nguoi→da→khoi; App nhánh trong <Suspense> (useGLTF treo). .gitignore ngoại lệ web/public/models/*.glb. Xác minh: tsc+vite xanh 640 module, 5 vũ công render mesh-người đẹp hơn HẲN capsule, retarget + đội hình Vòng-tròn (yaw/vị-trí) đúng, màu riêng từng người, toggle 3 chế độ OK, 0 lỗi console (lần đầu gặp "Context Lost" do HMR churn → tab mới sạch là hết). GIỚI HẠN TRUNG THỰC đã nêu: mocap chỉ VỊ TRÍ 17 khớp; rig cử động GÓC XOAY + có cột sống/ngón ta không có dữ liệu → độ trung thực động tác vẫn CHẶN bởi 17 khớp (twist chi không xác định từ vị trí), mesh đẹp nhưng động tác có thể cứng. CHỜ user giao 2 file glTF đúng qua kênh đọc được (hoặc export 1 glb gộp từ pack) để thay chính xác.

V65 (2026-10-01) GIẢM CỨNG ĐỘNG TÁC vũ công NGƯỜI — twist chi + chạm sàn + tay thả lỏng (HEAD f3cf36d, chỉ `GltfDancer.tsx`, KHÔNG đụng sync.ts/lõi perception): user chấm V64 mesh-người "cũng tạm" rồi "cải thiện để động tác không bị cứng được ko" → AskUserQuestion, user CHỌN "Bộ khuyến nghị (twist + chạm sàn + tay thả lỏng)". Ba heuristic ĐỘNG HỌC suy từ 17 khớp vị trí sẵn có — KHÔNG bịa dữ liệu, trung thực vẫn CHẶN bởi 17 khớp. (1) **TWIST chi** (vai-trên+đùi): "nhắm tối thiểu" fromUnitVectors bỏ mất xoay-quanh-trục-xương → cẳng tay/ống chân xoắn tuỳ tiện; nay dựng MẶT PHẲNG chi từ 3 khớp (gốc a, giữa b, cháu c) pháp tuyến n=(b-a)×(c-b) cố định hướng khuỷu/gối, R=(hệ chi live basisFromXZ(seg,n))·(hệ chi nghỉ)⁻¹ áp lên Qbind; chi gần thẳng (n suy biến) TỰ lùi về nhắm tối thiểu (dấu tự-nhất-quán vì khớp luôn gập cùng chiều giải phẫu). Thêm khớp cháu c vào AIM: UpperArm.L/R→l_wrist/r_wrist, UpperLeg.L/R→l_ankle/r_ankle; drive "twist" cần CẢ xương-cháu trong rig (để biết local→world) lẫn khớp-cháu trong 17 khớp, thiếu thì rơi về "aim". (2) **CHẠM SÀN bàn chân**: Foot.L/R trước là "none" (duỗi theo cẳng chân → mũi chĩa kỳ cục); nay drive "foot" giữ đế phẳng theo +Y, mũi chiếu theo hướng-TRƯỚC thân (basisFromZY(fwd,+Y)), tham chiếu nghỉ = hướng gót→mũi (PT−Foot bind). (3) **TAY THẢ LỎNG**: bake gập TĨNH vào `bindLocalQ` xương ngón lúc dựng (quanh local X), regex tên-đã-sanitize `/^(Index|Middle|Ring|Pinky)[1-4][LR]$/`=0.28rad, `/^Thumb[1-3][LR]$/`=0.12rad — ngón không có dữ liệu nên là tư thế tĩnh không phải động tác, thay bàn tay xoè phẳng như mái chèo. Khung THÂN (up/left/fwd) nay tính 1 LẦN/khung dùng chung Hips + trục-trước bàn chân (trước Hips tự tính lại). Gương vẫn sx=-1 phản-chiếu-pose, mọi toán xương bất biến G. Xác minh: npm run build xanh 640 module 0 lỗi TS; reload localhost:5173 → 5 mesh-người, bàn tay mềm/khép, bàn chân phẳng sàn, cánh tay gập có lý, KHÔNG xương lật/gãy, console 0 lỗi (soi qua đội-hình Vòng-tròn + canon). GIỚI HẠN như V63/V64: mesh đẹp + bớt cứng nhưng độ trung thực động tác vẫn bị chặn bởi 17 khớp vị trí (thiếu cột sống/ngón/toe + twist chi chỉ khôi phục gần đúng từ mặt phẳng 3-khớp). BÀI HỌC: twist chi phục hồi được từ MẶT PHẲNG 3 khớp (không cần cảm biến xoay) — pháp tuyến cố định hướng gập; đây là trần của position-only retarget.

V64 (2026-10-01) HAI NHÂN VẬT QUATERNIUS ĐÚNG + SỬA LỖI SANITIZE TÊN XƯƠNG (HEAD chờ commit): user ĐÃ giao 2 nhân vật qua .zip (Ultimate Modular Women + Men, Quaternius CC0) — nữ = `Suit.gltf`→`web/public/models/woman.gltf`, nam = `Casual_2.gltf`→`man.gltf` (mỗi file ~3MB, buffer base64 NHÚNG, tự chứa, không .bin/.png rời). .gitignore KHÔNG chặn *.gltf nên theo dõi bình thường; thêm rule `*.zip` để không commit archive nguồn. Rig Quaternius "Ultimate Modular" KHÁC Mixamo: Hips/Abdomen/Torso/Chest/Neck/Head, Shoulder/UpperArm/LowerArm/Wrist .L/.R, UpperLeg/LowerLeg/Foot/PT .L/.R; skin 62 joint; **BẪY: Foot.*/PT.* là con của Root (không trong chuỗi UpperLeg→LowerLeg)** → lúc dựng `attach()` Foot vào LowerLeg, PT vào Foot (giữ world → bind/boneInverses nguyên). Viết lại `GltfDancer.tsx` cho tên Quaternius + GIỮ NGUYÊN vật liệu gốc (bỏ nướng COLOR_0 của V63). **LỖI GỐC làm KHÔNG render gì (built=null): THREE.GLTFLoader đặt `object.name = PropertyBinding.sanitizeNodeName(tên)` — LOẠI ký tự dành riêng `[ ] . : /` và đổi khoảng trắng→`_`, lưu tên gốc ở userData.name.** Nên trong scene SỐNG "UpperArm.L"→"UpperArmL", "Foot.L"→"FootL"... Triệu chứng chẩn đoán chính xác: anchor Hips/Head (không dấu chấm) TÌM THẤY, UpperArm.L/UpperLeg.L (có chấm) TRƯỢT → la/ra=false → return null cả 5 → sân khấu trống (build xanh, 0 lỗi console, network 200 OK → bế tắc tới khi log `meshes`/anchors). SỬA: helper `san(n)=n.replace(/\s/g,"_").replace(/[[\].:/]/g,"")` (đúng quy tắc THREE, idempotent với tên đã-sanitize); `byName` vốn keyed theo o.name đã-sanitize, nên chỉ bọc `san()` ở MỌI tra cứu dotted: reparent bàn chân, anchors, footNames, AIM (precompute `AIM_SAN` keyed sanitize, `AIM_SAN[b.name]` + `byName[san(spec.child)]`). Màu áo nam: glTF Casual_2 xuất ra áo XÁM-NÂU (LightBrown #969083), KHÔNG xanh lá như ảnh Unity Preview user chọn — các phần khác KHỚP preview (giày đỏ ✓, quần maroon ✓, tóc nâu ✓); user CHỐT giữ nguyên màu glTF gốc (không tint). Xoá placeholder `animated_human.glb` (V63) không còn tham chiếu. Xác minh: tsc+vite xanh 640 module; reload → 5 mesh-người render, nữ (idx chẵn) tóc vàng áo tối, nam (idx lẻ) áo xám giày đỏ quần maroon; đứng thẳng trên sàn, tay dang theo pose, đội hình Vòng-tròn + canon chạy. Lõi perception/đánh giá + sync.ts KHÔNG đụng. BÀI HỌC: khi import glTF qua three, LUÔN nhớ tên node bị sanitize (mất dấu chấm) — tra theo userData.name hoặc sanitize tên tra cứu. GIỚI HẠN động tác (17 khớp vị trí) như V63 không đổi.

---
AIST++ — KIỂM CHỨNG LÕI TRÊN DỮ LIỆU MÚA THẬT (2026-10-01, commit 79f8688, master): thực
nghiệm ĐẦU TIÊN trên dữ liệu THẬT (V1–V64 đều tổng hợp). Mở vì user hỏi "có video múa quay
nhiều góc online không" → AIST++/AIST Dance DB (vũ công thật, 9 camera đồng bộ đã hiệu chỉnh).
QUAN TRỌNG: KHÔNG tải/ingest video — chỉ dùng annotation SỐ có sẵn (keypoints2d/3d + calib);
user đã được làm rõ điểm này và đồng ý ("A"). Annotation nằm trên **GitHub Releases** (github.com/
google/aistplusplus_dataset/releases/download/v1.0/), KHÔNG Google-Drive-gated: keypoints2d.zip
1.26GB, keypoints3d.zip 836MB, cameras.zip 27KB — mỗi zip GỘP ~1.4k bài.
- **Loader `choreo/datasets/aist.py`** (thuần stdlib urllib+zipfile + numpy, KHÔNG thêm phụ thuộc;
  nằm NGOÀI pipeline lõi, chỉ cho experiment): đọc zip từ xa qua **HTTP Range** (`_HTTPRangeFile`
  seekable → zipfile chỉ kéo central-directory + đúng 1 member ~0.4–1MB/bài thay vì 2GB), cache đĩa
  `data/aist_sample/` (đã .gitignore → KHÔNG lọt repo). `AistData`: stems/keypoints2d/keypoints3d/
  calibs_for/setting_of. 2D shape (V=9,T,17,3)=[x,y,conf]; 3D (T,17,3) hệ world AIST; cameras =
  JSON per-setting (9 cam: K matrix/rotation=rvec Rodrigues/translation/distortions/size) + mapping.txt
  (stem→setting). `rodrigues(rvec)` = rvec OpenCV→R; `calib_from_aist`→CameraCalib.
- **ĐƠN VỊ & KHỚP (quan trọng, dễ sai):** AIST dùng **COCO-17** (schema ta là H36M-17) → khi ĐO
  tam giác hoá, giữ COCO-17 CẢ HAI VẾ, KHÔNG remap (tránh lẫn lỗi remap). 3D AIST ≈ **cm** (đùi≈38,
  cẳng≈37 đơn vị → 1 đv≈1.04cm); báo cáo ×10→mm. KHÔNG dùng metrics.mpjpe trực tiếp (nó ×1000 giả
  định mét) — tính MPJPE tay ở đơn vị gốc rồi ×UNIT_MM. fuse_multiview tam giác hoá CÙNG world frame
  với P camera (không đổi toạ độ) → so trực tiếp với 3D tham chiếu AIST được.
- **Experiment `experiments/aist_2view.py`** + `ket-qua-aist-2view.md`: Bảng1 tổng quát hoá (20 bài/
  10 thể loại, cặp cam ~75°): **MPJPE tb 37.3mm** (trung vị 34.2, min 20.8 Lock/House, max 80.4 LA
  HipHop) — 2-view bám sát tái dựng 9-view. Bảng2 độ nhạy góc giao hội (quét đủ 36 cặp): tốt nhất
  **~60–120°** (90–120° = 27.4mm), nổ ở **150–180° (1126mm)** do hai tia gần thẳng hàng → suy biến độ
  sâu + lật cheirality; PA-MPJPE ổn định hơn hẳn MPJPE toàn cục → sai số ở ĐẶT ĐỘ SÂU toàn cục, không
  méo dáng. **KHỚP dự đoán synthetic_2view.py → bằng chứng chéo mô phỏng↔thật.** Hệ quả "2 điện thoại"
  đặt lệch ~70–110°.
- **GIỚI HẠN TRUNG THỰC (đã ghi trong doc):** dùng keypoint 2D CÓ SẴN của AIST (không tự detect pixel
  → chỉ kiểm khối hợp nhất 2D→3D, KHÔNG phải detector); 3D "tham chiếu" là tái dựng 9-view của AIST,
  KHÔNG phải GT cảm biến độc lập → MPJPE ở đây là **CẬN DƯỚI** của sai số tuyệt đối thật. Để có số
  tuyệt đối thật vẫn cần Gate 0 (detector thật + GT độc lập).
- **Test `tests/test_aist.py`**: 7 test phần toán thuần (Rodrigues orthogonal/det=1/zero→I/90°-z/
  tương đương `choreo.geom.cameras._rodrigues`, calib_from_aist P (3,4) + R hợp lệ, COCO index). KHÔNG
  chạm mạng. **Toàn suite 67 xanh** (60+7). Lõi perception/đánh giá + sync.ts KHÔNG đụng.
- BÀI HỌC tra cứu lại: (1) fancy-index chọn view phải `kp[list(views)]` KHÔNG `kp[(a,b)]` (tuple index
  trục đầu). (2) output Việt/ký tự lạ trên console Windows cần `PYTHONIOENCODING=utf-8`. (3) chạy qua
  `.venv/Scripts/python` (có editable install) hoặc `PYTHONPATH=D:\bien`.

## GATE 0 — SCAFFOLD DETECTOR THẬT TRÊN VIDEO (2026-10-02, commit 83625e0)
Mục tiêu Gate 0: thay keypoint CURATED của AIST bằng DETECTOR CỦA TA (RTMPose) chạy trên PIXEL thô
→ số end-to-end THẬT; HIỆU vs baseline 37mm = "giá của detector thật". Đã dựng TRỌN phần KHÔNG cần
GPU (test được ngay), chỉ chừa bước detect cho máy GPU thuê:
- `choreo/datasets/aist_video.py`: ánh xạ tên/URL video gốc theo camera (`video_name` thay `_cAll_`→
  `_c0{view+1}_`, view 0→c01..8→c09 KHỚP thứ tự `calibs_for`), `video_url`, `download_video` (KHÔNG
  tự chạy phiên này — cần đồng ý license AIST Dance DB + người dùng cho phép tải; VIDEO_BASE
  `aistdancedb.ongaaccel.jp/v1.0.0/video` + quality `10M` CẦN XÁC MINH lại trang chính thức).
- `choreo/datasets/detect2d.py`: wrapper `Rtmpose2D` bọc `MMPoseInferencer('human')` (RTMDet+RTMPose,
  COCO-17). Import mmpose CÓ BẢO VỆ (module nạp được khi THIẾU mmpose → test phần thuần). Thuần:
  `select_instance` (nhiều người→chọn tổng-conf cao nhất; khung rỗng→(17,3) NaN), `pack_frames`.
  RTMPose xuất COCO-17 TRÙNG trục khớp AIST + pixel 1920×1080 = calib → KHÔNG remap, KHÔNG chuẩn hoá.
- `experiments/aist_detector_2view.py`: TÁCH `detect` (GPU; RTMPose trên 2 cam của cặp đã chọn theo
  góc ~75°, ghi `data/aist_sample/detect2d/<tên-video>.npz`, có CHECKPOINT bỏ qua npz đã có → uptime
  thấp chỉ cần chạy lại) KHỎI `compare` (CPU; đọc npz → fuse_multiview → MPJPE detector-ta vs 3D 9-view,
  cột baseline = keypoint-curated cùng cặp/robust, ΔMPJPE = giá detector thật, + 2D RMSE px). Hằng số
  nhân từ aist_2view (UNIT_MM=10, STRIDE=3, PER_GENRE=2, TARGET_ANGLE=75). Hàm thuần: `align_time`
  (cắt min T), `stack_views` (→xy (V,T,17,2)+conf (V,T,17)), `px_rmse` (bỏ NaN), `mpjpe`,
  `detect_npz_path` (tên npz = `video_name` để khớp video trên đĩa).
- `tests/test_aist_detector.py`: 14 test phần thuần (video_name map/lỗi, video_url, select_instance/
  pack_frames, align_time/stack_views/px_rmse/mpjpe/detect_npz_path). **Toàn suite 81 xanh** (67+14).
- CÒN LẠI để ra số thật: (1) đồng ý license + tải ~ vài chục video AIST (cần người dùng cho phép);
  (2) thuê GPU (RTX A2000 6GB đủ — RTMPose/RTMDet vừa 6GB; Ampere→wheel chuẩn) cài mmpose, chạy
  `detect`; (3) chạy `compare` ở máy nào cũng được. Quy tắc lọc GPU thuê: VRAM≥8GB (6GB vẫn đủ cho
  riêng việc này) + CUDA 12.x + uptime≥90% + RAM≥16GB. Cách tiết kiệm: dựng hết code offline (xong),
  thuê GPU ~1–2h chỉ để tải+chạy inference (npz có checkpoint), rồi compare trên CPU.
- URL/LICENSE VIDEO ĐÃ XÁC MINH (2026-10-02, đọc downloader.py + loader.py chính thức google/
  aistplusplus_api): SOURCE_URL `https://aistdancedb.ongaaccel.jp/v1.0.0/video/10M/` + `<seq>.mp4`;
  tên video = `seq.replace('cAll','c0X')` (KHỚP `video_name` của ta); Terms of Use
  `https://aistdancedb.ongaaccel.jp/terms_of_use/` (downloader hỏi Y/N trước khi tải); danh sách
  per-camera ở `storage.googleapis.com/aist_plusplus_public/20121228/video_list.txt`. aist_video.py
  đã bỏ cờ "CẦN XÁC MINH", thêm hằng TERMS_OF_USE.
- RIGOR TODO (chưa làm, KHÔNG chặn): AIST khuyến nghị loại `ignore_list.txt` (chuỗi tái dựng 3D kém,
  nằm ở gốc annotation). select_sequences hiện KHÔNG lọc → ảnh hưởng baseline TUYỆT ĐỐI, nhưng sweep
  là so TƯƠNG ĐỐI cùng tập bài nên Δ vẫn vững. Nếu cần số tuyệt đối sạch thì thêm lọc (đọc file local
  từ bộ splits người dùng tải).

## TIÊN LƯỢNG GATE 0 — nhiễu detector mô phỏng (2026-10-02, commit c58c298)
Trả lời "detector thật đẩy MPJPE lên bao nhiêu?" TRƯỚC khi thuê GPU: bơm nhiễu kiểu RTMPose vào
keypoint CURATED của AIST (gần-sạch) rồi đo suy giảm qua đúng lõi fuse. `choreo/mocap/noise2d.py`
= mô hình nhiễu THUẦN (jitter Gaussian tỉ lệ nghịch conf: sigma_eff=σ·(2−conf); lẫn T/P theo cặp
l_*/r_* COCO; sót khớp→NaN+conf0), tất định theo rng, 7 test (`tests/test_noise2d.py`).
`experiments/aist_noise_sweep.py` quét 7 mức trên 20 bài (cặp ~75°), dùng chung select_sequences/
plan_pairs/mpjpe với aist_detector_2view. KẾT QUẢ THẬT (cache sẵn, `ket-qua-aist-noise-sweep.md`):
baseline sạch **37.3mm** (khớp aist_2view) → jitter2px 38.4 → 4px 41.4 → 8px 51.3; "RTMPose ước"
(4px+lẫn1%+sót2%) = **42.2mm ⇒ tiên lượng giá detector thật ~ +4.8mm**. Jitter CHI PHỐI (gần tuyến
tính, 8px=+14mm); lẫn T/P & sót khớp bị robust+nội suy hấp thụ gần hết (+0.1–0.9mm). Suy biến thoả
đáng, không vực thẳm. Đây là BẰNG CHỨNG CHÉO THỨ 3: synthetic (camera ảo) ↔ AIST curated ↔ AIST+
nhiễu mô phỏng — ba góc cùng kết luận điều kiện ổn định 2-view. Toàn suite **88 pytest xanh** (81+7).

## GATE 0 — RUNBOOK GPU + 2 BIỂU ĐỒ + TIÊN LƯỢNG GÓC H3 (2026-10-02, commit e0b1616, 4d3a1a4, 72d9b59)
Dọn sẵn cho buổi GPU + thêm góc kiểm chứng chéo thứ TƯ (góc đặt máy):
- `experiments/gate0-runbook-aist-detector.md`: quy trình thao tác buổi GPU thuê (đồng ý license → tải
  40 video [20 bài×2cam, Cách B dùng download_video chỉ tải cần] → `mim install mmpose/mmdet/mmcv` →
  `aist_detector_2view.py detect` [checkpoint] → `compare` trên CPU). Neo số kỳ vọng + **cờ báo động**
  (MPJPE≫55–60mm hay 2D RMSE≫10px ⇒ nghi lỗi quy ước khớp/alignment, KHÔNG phải "detector kém").
  Ước **~1h GPU, ~3–4k đ** (A2000/3060). Nối từ gate0-thiet-ke §4-tuần3 + §6.
- `experiments/plot_noise_sweep.py` → `ket-qua-aist-noise-sweep.svg`: biểu đồ σ_px→MPJPE (SVG THUẦN,
  không matplotlib — repo không có; đọc THẲNG số từ .md nên luôn khớp). Hình luận văn 1 (nhiễu).
- `experiments/aist_angle_sweep.py` → `ket-qua-aist-angle-sweep.{md,svg}`: **TIÊN LƯỢNG H3 offline trên
  MÚA THẬT** — duyệt TOÀN BỘ 36 cặp trong 9 camera AIST cho 20 bài, cô lập biến GÓC (keypoint curated
  sạch), gom MPJPE theo khoảng 30°. KẾT QUẢ: đường **chữ U** — 0–30°:55.5mm, 60–90°:**35.7 (đáy)**,
  90–120°:35.9, 120–150°:52.1, **150–180°: NỔ (tb 2489 / vị 277mm)**. KHỚP quy luật synthetic
  (60–120° tốt, 150–180° suy biến) trên dữ liệu THẬT ⇒ đây là góc kiểm chứng chéo cho điều kiện ổn
  định tam giác hoá, tiên lượng §6 "biểu đồ MPJPE theo góc" TRƯỚC khi quay/GPU. SVG chặn trần Y=70 +
  chú thích off-scale cho bin nổ. Test helper thuần `bin_index` (`tests/test_angle_sweep.py`, 3 test).
  Hai sweep TRỰC GIAO: nhiễu (cố định ~75°, biến detector) ⟂ góc (cố định keypoint sạch, biến hình học);
  detector thật = dịch cả đường chữ U lên ~+5mm.
- **Toàn suite 91 pytest xanh** (88+3). RIGOR TODO ignore_list.txt vẫn mở (không chặn; sweep so tương đối).

## KIỂM CHỨNG PROXY GT-FREE TRÊN MÚA THẬT (2026-10-02, commit 451703c)
`experiments/aist_proxy_validation.py` → `ket-qua-aist-proxy-validation.{md,svg}`: trả lời câu hỏi
XƯƠNG SỐNG của Đường B — proxy GT-free có đáng tin không? Cách: cố định tập con 4 camera (0,2,4,6),
BƠM nhiễu detector 6 mức (sạch→rất nặng, dùng `perturb_keypoints2d`) trên 20 bài AIST = **120 mẫu**;
mỗi mẫu dựng 3D bằng DLT KHÔNG trọng số/không mượt (để proxy & MPJPE nhất quán, cô lập nhiễu→lỗi),
đo MPJPE THẬT (vs 3D 9-view, "thế giới" không căn gốc) CÙNG 3 proxy, rồi **tương quan hạng Spearman**:
**reproj-LOCO ρ=0.94 · bone-length-std ρ=0.90 · jitter ρ=0.84 · LOCO-std ρ=0.74**. Mọi cột tăng đơn
điệu cùng MPJPE (LOCO 15.7→201px khi MPJPE 36→143mm). ⇒ Xếp hạng chất lượng bằng proxy ĐỒNG THUẬN
với GT trên dữ liệu THẬT ⇒ **hợp thức hoá chấm GT-free** (trước chỉ có synthetic r≈0.99). Đây là **góc
kiểm chứng chéo THỨ TƯ** (proxy⟂MPJPE), trực giao sweep nhiễu (giá detector) & sweep góc (hình học).
CHI TIẾT KỸ THUẬT: dùng LOCO NaN-vững NỘI BỘ (`loco_nan`/`reproj_err_px` nanmean) thay
`metrics.reprojection_error_loco` thư viện — thư viện dùng `.mean()` nên MỘT khớp drop→NaN cả fold,
làm proxy biến mất ở nhiễu nặng; bản nanmean cho proxy phủ TRỌN dải (trung thực hơn: clip thật có khớp
che vẫn phải ra số). bone_length_std dùng 12 xương CỨNG COCO-17 tự định nghĩa (BỎ mặt — SKELETON_EDGES
của schema là H36M-16, KHÁC COCO-17 nên KHÔNG dùng được cho keypoint AIST). MPJPE tuyệt đối ở đây CAO
hơn 2 sweep kia vì DLT thô — kết luận chỉ về TƯƠNG QUAN. `tests/test_proxy_validation.py` 6 test thuần
(rankdata trùng, spearman đơn điệu/nghịch/bỏ-NaN/thiếu-cặp, chỉ số xương COCO hợp lệ). Doc gate0 §5.4
(blockquote "kiểm định LẠI trên MÚA THẬT") + §6 (gạch đầu dòng biểu đồ proxy) đã nối. **97 pytest xanh** (91+6).

## KẾ HOẠCH CHẠY GATE 0 ĐÃ CHỐT HẠ TẦNG (2026-10-03, commit 6392dbd)
Hai "cửa" của buổi detector-thật-trên-video đã giải quyết về mặt kế hoạch:
- **Cửa 1 (GPU) = CHỐT dùng gói $300 GCP** (không Colab). GPU chọn **L4 Spot** (24GB, g2-standard-4).
  Ràng buộc GCP: gói dùng-thử cho quota GPU=0 → phải NÂNG lên trả-phí (credit $300 còn nguyên, thẻ chỉ
  trừ khi vượt) + XIN quota `NVIDIA_L4≥1` ở vùng định dùng (duyệt vài phút–vài giờ). Tổng phí buổi
  ~$0.30–0.70 (<1% gói).
- **Cửa 2 (license video AIST) = KHÔNG có hàng đợi duyệt.** Trang download phơi permalink video TRỰC
  TIẾP ("URL redistributable"), downloader chính thức kéo thẳng không token → đồng ý Terms of Use
  (tự phục vụ, vài phút) là tải được NGAY. Rào duy nhất: NGƯỜI DÙNG phải tự bấm đồng ý (mình không
  làm hộ cam kết pháp lý). (Suy luận từ cơ chế permalink, chưa đích thân nộp form.)
- Runbook GCP cụ thể: `experiments/gate0-runbook-gcp.md` (lệnh gcloud tạo/ xoá máy, scp code, tải 40
  video thẳng trên VM, detect GPU → kéo npz về compare ở nhà). Companion của gate0-runbook-aist-detector.md.
- CÒN LẠI (3 việc chỉ người dùng làm): đồng ý Terms AIST, nâng GCP + xin quota, bấm tạo/chạy/xoá máy.
  Mình KHÔNG thao tác console GCP / tải video / nhận license hộ.

## GATE 0 END-TO-END TRÊN MÚA THẬT — ĐÃ CHẠY XONG (2026-10-06, commit cdff258)
Buổi detector-thật-trên-video đã hoàn tất, ra SỐ end-to-end đầu tiên. Người dùng tự đồng ý Terms AIST,
nâng GCP, tạo VM L4 Spot `aist-gate0` (us-central1-a, g2-standard-4); mình soạn lệnh + diễn giải.
- **KẾT QUẢ (`experiments/ket-qua-aist-detector-2view.md`, 20 bài):** MPJPE detector-ta **35.5mm**
  (trung vị 33.1), baseline keypoint curated 37.3mm ⇒ **ΔMPJPE ≈ −1.9mm** = GIÁ DETECTOR THẬT ≈ 0 (thậm
  chí hơi âm). 2D RMSE 13.1px NHƯNG không lan sang 3D (tam giác hoá 2-view robust + trọng số tin cậy hấp
  thụ). Tốt hơn tiên lượng offline bi quan (nhiễu Gaussian i.i.d. đoán ~42mm, +5mm). Dưới xa cờ báo động
  (≫55–60mm). Bài `gLH` (c02-c08) cao 64–79mm ở CẢ hai cột (Δ nhỏ) ⇒ lỗi cặp-cam/tham-chiếu, KHÔNG phải
  detector. metrics: MPJPE vs 3D 9-view AIST, COCO-17, UNIT_MM=10, STRIDE=3.
- **CHI PHÍ:** VM chạy ~10.9h (~$7.71 ước); gói $300 GCP còn ~73% (₫5.73M), billing bills bằng ₫. VM đã
  XOÁ (`gcloud compute instances delete`) + không còn đĩa thừa → billing DỪNG hẳn.
- **BÀI HỌC VẬN HÀNH (đã ghi vào `gate0-runbook-gcp.md` §3/§4/§6):** (1) SSH trực tiếp (`gcloud compute
  scp/ssh`, `cloud-shell scp/ssh`) bị firewall mạng NHÀ chặn → TREO vô hạn; đường vòng chỉ-HTTPS chạy ngon:
  nén tar → bucket GCS → `gcloud storage cp` hai đầu (kiểm md5 khớp) → xoá bucket. (2) Pin mmpose chạy
  THẬT trên L4: torch==2.1.2 torchvision==0.16.2 cu121, numpy==1.26.4 (<2), opencv-python-headless==4.10.0.84
  (né libGL headless), mmcv==2.1.0 mmdet==3.2.0 mmpose==1.3.2. (3) BẪY: `DEFAULT_CACHE` trong
  `choreo/datasets/aist.py` hard-code đường Windows `D:\bien\...` → trên Linux là tên file literal → loader
  ra 0 frame IM LẶNG; trên VM truyền tay thư mục POSIX (`~/aistcache`), về nhà DEFAULT_CACHE Windows lại đúng.
- **GIỚI HẠN CÒN LẠI (không đóng trong buổi này):** 3D "tham chiếu" vẫn là tái dựng 9-view của AIST, CHƯA
  phải GT cảm biến độc lập; `ignore_list.txt` chưa lọc. Đường B (clip TỰ QUAY 2-cam + camera held-out làm
  giám khảo) mới khép hẳn — cần mocap thật, chưa làm.

## HƯỚNG VÁ TRẦN GT: HUMAN4D (Vicon THẬT) — ĐÃ GỬI XIN QUYỀN, ĐANG CHỜ DUYỆT (2026-10-06)
Người dùng KHÔNG tự quay được nữa (hết lớp tập) → chọn HUMAN4D làm bước vá đúng câu phản biện "GT của AIST
cũng do camera dựng". HUMAN4D (Chatzitofis 2020, IEEE Access) = 4 camera RealSense D415 ở 4 GÓC phòng 4×4m
+ 24 Vicon MXT40S 120Hz → GT 3D ĐỘC LẬP thật; đồng bộ bằng clapperboard (giống phương pháp vỗ-tay của ta).
Quan trọng: HUMAN4D chỉ NÂNG TRẦN GT, KHÔNG phải kịch bản sản phẩm 2-điện-thoại (vẫn là rig lab hiệu chuẩn);
chỉ Đường B mới chạm cái đó. Luận văn ĐÃ đủ vững trên AIST — HUMAN4D là đánh bóng, không phải chốt chặn.
- **ĐÃ CÂN NHẮC & LOẠI pivot 1-camera:** người dùng từng nghĩ chỉ dùng 1 cam chính diện. Đã giải thích & họ
  chốt GIỮ 2 cam. Lý do: 1 cam = mất trục z (chính diện là góc TỆ NHẤT cho chiều sâu, không phải vấn đề che
  khuất); hình học thuần numpy cần ≥2 view, 1 cam ra 0 chiều sâu; monocular (MiDaS/Depth Anything/MotionBERT/
  RTMPose3D) là ĐOÁN có học chứ không ĐO, mất tỉ lệ + lật trước-sau, và biến đóng góp thành "tích hợp model
  người khác" = chính là Choreoto. Nếu sau muốn: dựng nhánh RTMPose3D 1-cam làm ĐỐI CHỨNG đo "1 vs 2 cam mất
  bao nhiêu mm" trên AIST (chạy CPU, không tốn GPU) — là 1 kết quả luận văn, nhưng người dùng tạm GÁC.
- **FORMAT ĐÃ ĐỌC VERBATIM** từ repo chính thức `tofis/human4d_dataset` (kéo tarball master về scratchpad):
  intrinsics ở `device_repository.json` → `['Color Intrinsics'][0]['1280x720']` = K 3×3 cho ảnh màu 1280×720;
  extrinsics mỗi cam 1 file text (loadtxt: 3 hàng đầu R, hàng 4 t → pose 4×4); GT 3D ở `Dump/gposes3d/<f>.npy`
  = 33 khớp, đơn vị mm (hoặc file `.joints`+`.clap`, clap_id cắt khung đồng bộ); ảnh ở `color/`, tên
  `groupframe_cam_color_frameid.ext`; `S<n>_activities.txt` ánh xạ thư mục-timestamp → tên bài. CẦN ánh xạ
  HUMAN4D-33 ↔ COCO-17 (trùng vai/khuỷu/cổtay/hông/gối/cổchân là đủ MPJPE chi). Chỉ cần tải color+gposes3d+
  device_repository.json+extrinsics cho 1-2 bài MỘT NGƯỜI (gợi ý jumping_jack, basketball_dribbling) — KHÔNG
  cần depth/volumetric (đó mới là phần 6.2TB/record). Cặp cam KỀ nhau ≈ 90° (đáy chữ U), tránh cặp đối ≈180°.
- **TRẠNG THÁI XIN QUYỀN:** Zenodo record **4473009 = HUMAN4D Subject #1** đang "Restricted". Người dùng
  (tài khoản Zenodo `Phuoc2507`, login GitHub) ĐÃ: điền Google Form (tên/affiliation HCMUTE/website/tick
  CC BY 4.0) + gửi Request access trên Zenodo (message luận văn, tick chia sẻ tên+email). Status = **Submitted**,
  receiver = tofis3d. MỖI record = 1 subject (1 diễn viên diễn hết 19 bài) → chỉ cần record NÀY là đủ, không
  xin cả 4. Duyệt thủ công, có thể vài ngày–vài tuần, KHÔNG chắc 100%. CHỜ email duyệt → lúc đó Files mở để tải.
- **KHI CÓ DATA, mình làm:** viết `choreo/datasets/human4d.py` (phản chiếu importer gốc) + `human4d_detector_2view.py`
  (mẫu detect-GPU/compare-CPU như AIST); compare đối chiếu Vicon GT THẬT nên MPJPE tuyệt đối, không cần proxy
  held-out (vẫn báo proxy kiểm chéo). Thêm 1 buổi L4 Spot dùng lại pin stack đã biết chạy RTMPose trên ảnh màu.

---
APP SÂN KHẤU THẺ VIDEO cho văn nghệ khoa (2026-10-10, bài báo TẠM DỪNG). User đổi hướng: quay TỪNG người bằng điện thoại → xoá phông → mỗi người thành "thẻ" phẳng trên sân khấu ảo, kéo thẻ xếp đội hình, app tự trượt theo nhạc; chạy Chrome laptop. User trao quyền tự quyết hoàn toàn ("hỏi nhiều quá bạn tự quyết định đi", "đập đi cũng được"). Commit: f0d7356 đặc tả, 7d25fcd công cụ Python `choreo/videocard` (align/crop/ffio/matting RVM ONNX/cli; ra `.card.mp4` xếp chồng màu trên mặt nạ dưới + `.card.json` offsetSec), c3d24c6 app (`web/index.html`→`src/stage/`; app 3D cũ dời sang `3d.html`, KHÔNG sửa file app cũ), 8beb411, ede607d, 40a1eed (hướng dẫn `docs/huong-dan-san-khau-the-video.md` + thả cả thư mục), 430636b (màn hẹp/container query). 28 test node xanh.
- Mô hình: đội hình = khối GIỮ trên dòng thời gian, khoảng giữa = chuyển smoothstep; video time = music time − offsetSec; <audio> là đồng hồ chủ; khán giả +Z; cánh gà WING 1.5m. "+ Đội hình" nhét vào khoảng trống trước, chỉ dời khối sau khi quá chật (vì khối đã gắn nhạc) + thông báo kèm Hoàn tác.
- BÀI HỌC: tải <video> thẳng lên WebGL (VideoTexture) ra khung TRỐNG trong môi trường này dù drawImage chạy → chép khung qua canvas 2D rồi THREE.Texture(canvas).
- BÀI HỌC kiểm thử: pane trình duyệt bị ẩn thì rAF/ResizeObserver không chạy (canvas r3f kẹt 300x150); dùng resize_window + screenshot của tool computer thì chạy; Vite watcher Windows hay sót sửa liên tiếp → chạm file. Handle DEV `window.__stage = {st, clock, media}`.
- 2026-10-11: deps đã cài, mô hình RVM ĐÃ TẢI vào `models/` (gitignored); chạy thử end-to-end trên video tổng hợp OK (~9s/3s clip CPU); sửa --help nổ cp1252 (commit 971a144). CÒN: công cụ CHƯA chạy trên video người thật; thả thư mục chưa thử bằng thao tác kéo thật.
- 2026-10-12: chạy THẬT trên video iPhone `D:\bien\IMG_5116.mov` (42s, HEVC 10-bit HLG 1920x1080, máy cầm tay lia theo, nhiều bạn đứng xem) → thẻ `the/IMG_5116.card.mp4` (872x540/nửa). RVM ~6 khung/s CPU (~4 phút/42s). Mặt nạ vũ công rất sạch. VẤN ĐỀ: RVM giữ MỌI người → thêm `choreo/videocard/person.py` MainPersonFilter (commit 0b6a90c, cờ `--all-people` tắt): tách mảng trên lưới /4, chọn 1 mảng theo cost = L1 histogram màu trang phục + 0.5·(1−trùng seed) + phạt cỡ; CHỈ học mẫu khi không to vọt (>1.25×) và lệch màu <0.5 — bài học: học theo mảng gộp lúc vũ công lướt qua nhóm người xem làm trôi mẫu → bám nhầm người xem 8s. Còn dính người xem ~29–31s và ~39s (chồng nhau trong ảnh, không tách được bằng mặt nạ). Ý tưởng chưa làm: cắt bám theo người từng khung (vũ công đang trôi trong khung thẻ cố định vì máy lia).
- 2026-10-12 (tiếp): nút **Nhân bản** vũ công (commit 5aba657): `cloneDancer` (model.ts) + `duplicateDancer` (actions.ts), bản sao chung mediaId/offset, tên "X 2, X 3"; clock.syncVideos chỉ cho 1 vũ công lái mỗi <video> chung (ưu tiên không ẩn). Đã test trong pane: 6 bản sao IMG_5116 × 6 đội hình (ngang/V/tròn/hai hàng/chéo/so le, giữ 4s chuyển 2s) chạy OK. 29 test node xanh. User yêu cầu "đẩy mạnh agent, cải tiến hoàn chỉnh" trước khi reset → đợt cải tiến song song (xem commit sau 5aba657).
- 2026-10-12 (đợt 2, ĐÃ XONG, master 1dfc995): gộp W1–W5 + tự chia đội hình + nhân bản vào master, 176 npm test xanh, tsc sạch (chạy được với `node --max-old-space-size=2500 node_modules/typescript/bin/tsc -p .`). W1 phím/ô số NumField/hoàn tác gộp/toast ≤3; W2 nạp bền (intake.ts tổng kết, bỏ tệp rác, trùng tệp), Khớp tất cả, guard.ts 1 thẻ tự lưu, players chung theo mediaId@offset, followMusic; W3 trình chiếu (framing.ts, đếm 5·6·7·8 countin.ts, Tôi là ai, checks.ts cảnh báo va/quá nhanh, gương/sáng); W4 export/ (zip tự viết, Ctrl S ghi đè tệp, in tờ A4, xuất video); W5 bố cục co giãn/điện thoại/ô đỏ Không lưu được. Quyết định khi gộp: lỗi lưu chỉ App.tsx báo (writeNow ghi saveError); watchMusic của W4 thành rỗng (followMusic lo). Thẻ video: cắt bám người từng khung commit 188fb19 (--fixed-crop = cũ) NHƯNG thẻ the/IMG_5116 CHƯA tạo lại (máy hết RAM do job project khác) → chạy `python -m choreo.videocard --out the IMG_5116.mov` khi rảnh. Đã thử trình duyệt: nạp thả tệp + thông báo tổng kết OK; phát/3D CHƯA kiểm được vì khung trình duyệt không vẽ (rAF=0). web/public/_the/ còn giữ để thử lại. Worktree/nhánh agent đã dọn (sót thư mục rỗng .claude/worktrees/agent-ac10c67…/web/.vite bị khoá).
- 2026-10-17: thẻ IMG_5116 cắt bám người ĐÃ tạo lại (458x540/nửa thay vì 872, vũ công nằm giữa); nạp vào app thay đúng vũ công cũ, phát + nhìn 3D khán giả ĐÃ kiểm (rAF chạy khi pane hiện + screenshot). Lúc kiểm lộ LỖI bộ lọc: 28.3s dính nhóm người xem, mảng dính co về 1.2× bị HỌC làm mẫu → khi tách (30.1s) vũ công lùi xa nhỏ <0.5× mẫu bị phạt cỡ → thẻ giữ nhầm người xem tới 32s. Sửa commit e04225a: trễ unmerge_ratio 1.1 (đã dính phải co dưới mới coi là tách), lúc dính chỉ giữ phần quanh chỗ vũ công cũ nới grow=2 ô/khung, max_merged 90. Thử grow 0.5/1.0 cắt cụt vũ công → giữ 2.0. Công cụ thử: dump mặt nạ RVM ra .npy rồi replay bộ lọc (vài phút, khỏi chạy lại RVM 7 phút). CÒN: lúc chạm nhau thật (29–30s, 39s, 40.5–41.5s anh áo trắng) người xem sát vũ công vẫn lọt; 28.5/38.5s còn mẩu áo trắng bị cắt. Thẻ mới (bộ lọc e04225a, 448x540) đã chép vào the/ và web/public/_the/, kiểm trong app: 31 s hiện đúng vũ công, phát chạy. Đã thử "chỉ giữ mảng lớn nhất sau khi cắt": làm mất chân vũ công ở 29 s, BỎ.
- 2026-10-17 (tiếp): commit 91f7646 + gộp 6616b4a + doc 74a796f, 197 test. (a) Sơ đồ "Từ sân khấu" (phím O, ui.planFromStage, nhớ trong layout). Góc 3D "Sau lưng" (BACK_DIR) : thẻ billboard lật texture khi camera sau thẻ (uniform flipX) = như soi gương; nhìn THẬT từ sau lưng cần pose 3D, chưa làm. (b) Canon THEO ĐOẠN: VDancer.canon=[{start,end,lag}], canonTime() giữ khung đầu đoạn lúc chờ rồi trễ lag, hết đoạn khớp lại; khoá player = mediaId@ms~a:b:lag (canonSig); thứ tự ltr/rtl/center/front/list (canonRanks, cùng chỗ trong 0.3 m cùng lượt). VDancer.flip + "Đối xứng hai bên" (lật người bên phải nhóm) = tổ hợp 3 người từ 1 video. (c) Chế độ "Học động tác" (ui/Learn.tsx + learn.ts, subagent làm): video riêng ngoài đồng hồ dự án, gương M, 0.25–1×, A-B, đếm 5678, bám theo tôi (khung vẽ tay, nội suy). Đã kiểm với IMG_5116.mov THẬT (HEVC 1920x1080 phát được trên Chrome này). Bẫy: import('/src/stage/x.ts') trong console có thể ra module KHÁC instance của app sau HMR, đừng dùng để điều khiển app; dùng window.__stage.st() hoặc bấm nút. Vite chặn 403 tệp ngoài web/ : chép tạm vào web/public/_the/ (đã exclude) để fetch.
- 2026-10-19 (user đi ngủ, "làm liên tục, đừng hỏi"): commit 0a9c461→8ddd74b, 209 test. fixes.ts sửa nhanh cảnh báo (Đổi chỗ cho gần = Hungarian quanh 1 đội hình; Đổi vai từ đây = carry đổi vai cho mọi đội hình sau khi đổi riêng làm đoạn ra xấu; Nới khoảng chuyển, không nới nếu thêm va; Sửa tất cả, test ngẫu nhiên 300 bài). Bố cục: tlHeight + topExtra (chỉ tính nút đè bề ngang sân) trong layout.ts; Trình chiếu điện thoại dựng đứng/nằm ngang (useNarrow, safe theo --ctl-h); nhãn Khoá sửa tự nhấc. 20 người: Sửa tất cả 113→7 cảnh báo trong 11 ms. BAN-GIAO.md đã cập nhật. Bẫy: HMR giữ state cũ khi đổi shape state (over.els undefined) → reload trang.
- 2026-10-19 (tiếp, vẫn tự làm khi user ngủ): commit ebfdbf1→e6cb23f, 219 test. hintWarn(before, what, always, offerFix) trong actions.ts: thao tác xếp chỗ sinh thêm cảnh báo → toast kèm nút "Sửa tất cả" (toast có action). Ctrl C/V chép dán chỗ đứng (keys.ts textSelected để không cướp Ctrl C chữ). Formation.note (setFormationNote; hiện Present .rh-head, in, video sơ đồ, ✎ ở timeline + danh sách). swapSelected (X), rotateSelected (R/Shift R, model rotateGroup + fitGroup), scaleSelected Giãn/Thu (scaleGroup, mép sân pad 0.3, minGap 0.5). Thanh chọn nổi (SelectionHud trong stage/App.tsx) thêm Đổi chỗ + Xoay, điện thoại chỉ icon. BẪY: Vite đôi khi cache bản RỖNG của tệp vừa sửa (lỗi "does not provide an export") → touch lại tệp + navigate; thử nghiệm trong pane bị autosave nên phải trả dữ liệu về trước khi reload.
- 2026-10-19 (tối): 2 agent song song trong worktree → "Hình của tôi" (7e04370, Project.myShapes) + cảnh báo bị che kind "blocked" soft (ef44de4, nút Đứng so le), 233 test, bàn giao tới commit sau đó. BẪY WORKTREE: agent cần `mklink /J web\node_modules D:\bien\web\node_modules`; TRƯỚC khi `git worktree remove --force` PHẢI `cmd /c rmdir <wt>\web\node_modules` (gỡ junction) kẻo xoá xuyên vào node_modules thật. RAM máy ~16GB đã 89% → tối đa ~2 agent, agent KHÔNG chạy tsc. User đã tạo ổ E: (SSD 238GB trống) 2026-10-19, chưa dùng.

- 2026-10-19 phần chót: Xuất ảnh PNG/zip đội hình (export/imageSheet.ts) + rà lỗi 5 chỗ (batch undo setPositionsNow...), commit 3fce810, 245 test. Ảnh phải XEM BẰNG MẮT: agent đoán ngắt dòng CW=0.55 quá hẹp, đo thật ~0.47.
- 2026-10-19 đợt 3-4: chia sẻ/chép ảnh, chặn phím khi hộp thoại (modalOpen), ảnh vị trí từng người (personSheet.ts), normalizeProject chặt + fuzz.test.ts; 267 test, commit sau a7cc6ef.
- 2026-10-19 học đối thủ (docs/doi-thu-va-khoang-trong.md, 14 app, top gap: PWA 1 link, link từng vũ công, ghi chú từng người, đạo cụ/mốc sàn, đường cong, mốc đoạn nhạc, nhóm màu): đã làm Formation.notes + Project.marks (marks.ts), 288 test, tới b7fecef. BẪY: worktree cũ còn junction node_modules bị dọn → xoá theo 67 gói; cứu bằng npm install --offline; LUÔN rmdir junction trước khi xoá worktree, kiểm .claude/worktrees có thư mục mồ côi.
- 2026-10-19 (tiếp): nhóm lưu sẵn + viền màu (d120ee8), đạo cụ/mốc sàn đứng yên (70ec8d9), đặt đạo cụ theo kích thước (5a1959d), bàn giao 702b3b6; 306 test. Đang chạy 3 agent worktree: đường cong 2.6, thư viện đội hình 2.10, xuất một đoạn/nhanh 2.8.
- 2026-10-19 lượt ba: xuất một đoạn + sơ đồ dựng nhanh WebCodecs (50e64da), thư viện đội hình (94e3155), đường đi cong Formation.via (5072992); 328 test, đã kiểm trong trình duyệt.
- 2026-10-19 lượt bốn: phương án song song (8d5199e), gỡ nghi đường cong/thư viện (79a1ffd), hướng mặt phím Q (88b95fc); 359 test, đã kiểm trong trình duyệt.
- 2026-10-19 lượt năm: người dự bị/thay vai + Shift X đổi vai cả bài (b7d5d96), PWA cục bộ sw viết tay chỉ PROD + gỡ 4 chỗ nghi (ca59dfb); 383 test. Đạo cụ di chuyển đang làm (agent).
- 2026-10-19 lượt năm (tiếp): đạo cụ di chuyển theo đội hình Formation.propPos + propsAt(fs,props,t) (793f298); 395 test, đã kiểm kéo bục + trượt giữa khoảng chuyển trong trình duyệt.
- 2026-10-24: NGƯỜI 3D TỪ VIDEO ("nghĩa 1" người dùng chọn): choreo/pose3d (npz SMPL24 cam → .motion.json 17 khớp, 22dcfa7, gvhmr_dump.py CHƯA chạy máy thật) + app thả .motion.json gắn theo tên → ui/StageAvatar.tsx Quaternius, nút "Người 3D" (ac7b6a4) + doc docs/huong-dan-nguoi-3d-may-rtx.md (71b135f); 399 test web, 139 pytest, đã kiểm trong trình duyệt bằng motion tổng hợp. Người dùng CHƯA cho phép tải GVHMR/SMPL (SMPL phi thương mại, người dùng tự đăng ký). Máy văn nghệ RTX 5060 8GB cần torch cu128. Còn: zip chưa mang motion; video cả đội → tự đội hình.
- 2026-10-24: repo GitHub CÔNG KHAI https://github.com/Phuoc2507/biendao (người dùng chọn công khai), branch master đã push, commit xong thì git push. Hướng dẫn máy hỗ trợ: docs/cai-may-ho-tro.md (Claude Code + Remote Control trên máy RTX 5060).
