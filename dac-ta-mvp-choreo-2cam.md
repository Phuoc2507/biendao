# Đặc tả MVP & Lộ trình kỹ thuật — Choreography Sequencer 2 camera

*Đồ án tốt nghiệp · ngành Robot & Trí tuệ nhân tạo, ĐH SPKT TP.HCM · ngày 2026-09-29*
*Đi kèm báo cáo nghiên cứu: `nghien-cuu-choreo-sequencer.md`. Ràng buộc chốt: **đúng 2 điện thoại**, phi thương mại.*

---

## 0. Định vị một câu

> **Hệ thống bắt chuyển động múa bằng ĐÚNG 2 điện thoại (đồng bộ bằng âm thanh + tự hiệu chỉnh) → dựng nhân vật 3D → sequencer sân khấu 3D để dàn dựng nhiều vũ công ảo và xuất view tập luyện cá nhân — kèm đánh giá độ chính xác trên múa thật.**

**Novelty (đóng khung đúng để không đụng MAMMA/DanceNet3D):** đóng góp **hệ thống + khả dụng + đánh giá**, KHÔNG phải mạng nơ-ron mới:
1. Pipeline **2 điện thoại tối giản** cho người không chuyên (calib < 2 phút, sync bằng vỗ tay), không cần genlock phần cứng như MAMMA (4 máy).
2. **Bộ đánh giá mocap riêng cho múa** (xoay người, động tác sàn, quay lưng, nhảy) + nghiên cứu **góc đặt 2 máy** — số liệu hiện chỉ có trên lab chậm (H36M ~42mm), chưa ai đo trên múa thật.
3. **Ghép trọn chuỗi** capture → 3D → xếp sân khấu → xuất POV — chưa sản phẩm/nghiên cứu nào làm liền mạch.

**Ánh xạ sang ngành Robot & AI (để bảo vệ đúng chuyên môn):** multi-view pose = thị giác; calibration + triangulation = **sensor fusion / hình học đa-view**; retarget + foot-lock = **động học / IK**; làm mượt + khử rung = **lọc / state estimation**. Web sequencer là lớp ứng dụng minh hoạ.

---

## 1. Phạm vi MVP (In / Out) — cắt để kịp 1 học kỳ

### ✅ TRONG phạm vi MVP
| Hạng mục | Mức tối thiểu chấp nhận |
|---|---|
| Bắt 3D từ 2 điện thoại | 1 người/clip, thân + chân + tay thô (SMPL body; ngón tay/mặt = tùy chọn) |
| Đồng bộ 2 clip | Vỗ tay đầu clip → tự căn lệch < 1 frame |
| Hiệu chỉnh 2 máy | ChArUco giơ ~1 phút; auto-calib là dự phòng |
| Cleanup clip | Làm mượt + foot-lock + tách root motion |
| Xuất clip | FBX/BVH hoặc glTF, xương Mixamo |
| Sequencer 3D | Timeline nhịp-8, kéo-thả clip lên **≤ 8 vũ công ảo**, clone/mirror/offset |
| Đường đi sàn | Đặt điểm mốc → nội suy CatmullRom, nhân vật tự xoay mặt |
| Xuất view tập | Ít nhất **1 loại**: "gương" (mirror) hoặc "POV theo 1 vũ công" |
| Đánh giá | Bảng số MPJPE/jitter/foot-slip trên **≥ 5 clip múa thật** + so 1-cam vs 2-cam |

### ❌ NGOÀI phạm vi MVP (ghi rõ để không sa đà)
- Real-time / trực tiếp (toàn bộ pipeline chạy **offline**, theo mẻ).
- Nhiều người trong 1 clip (multi-person capture) — chỉ 1 người/lần quay.
- Bắt ngón tay & biểu cảm mặt chính xác.
- App di động gốc (chỉ cần web + quay bằng camera điện thoại thường).
- Tài khoản/đăng nhập/thanh toán, cộng tác nhiều người thời gian thực.
- Tự train mạng mocap mới (dùng model có sẵn).

> **Nguyên tắc cắt:** nghi ngờ món nào → đẩy ra "sau MVP". Thà một chuỗi chạy được đầu-cuối trên 1 bài còn hơn nhiều tính năng dở dang.

---

## 2. Kiến trúc module

5 module, ranh giới rõ, **adapter mocap thay được** (đổi EasyMocap↔XRMoCap↔Pose2Sim không đụng phần còn lại).

```
[M1 Capture & Ingest]  →  [M2 Mocap 2-cam Pipeline]  →  [M3 Motion Cleanup]
   2 clip + audio            (adapter: SMPL/khớp 3D)        (mượt/foot-lock/root)
                                                                  ↓
                                                        [clip chuẩn hoá: glTF/FBX]
                                                                  ↓
[M5 Đánh giá] ←──────────────  [M4 Sequencer 3D + Export view tập]
 (metrics múa)                  (timeline nhịp-8, sân khấu, POV/mirror)
```

- **M1 — Capture & Ingest:** nhận 2 video + tách audio; phát hiện tiếng vỗ tay; cắt đoạn; kiểm tra fps/độ phân giải. *(Python)*
- **M2 — Mocap 2-cam:** sync → calibrate → 2D pose mỗi góc → fuse ra SMPL/khớp 3D. **Interface cố định:** `capture(clipA, clipB, calib) → motion3d`. *(Python, GPU)*
- **M3 — Cleanup:** làm mượt (lọc), foot-lock (Kovar), tách root motion, retarget → xương Mixamo, xuất glTF/FBX. *(Python + Blender headless)*
- **M4 — Sequencer 3D:** web (React Three Fiber). Nạp clip chuẩn hoá, dựng lưới nhịp-8 (beat_this), kéo-thả/clone/mirror/offset, đường đi sàn, cảnh báo va chạm, xuất video POV/mirror. *(TypeScript)*
- **M5 — Đánh giá:** script chấm MPJPE/PA-MPJPE/jitter/foot-slip; so 1-cam vs 2-cam; so góc đặt máy. *(Python + notebook)*

**Định dạng trao đổi giữa module** (chốt sớm, tránh vỡ tích hợp): clip = glTF/FBX xương Mixamo + JSON `{root_trajectory[], beat_grid{bpm,downbeats[]}, contacts[], meta}`.

---

## 3. Pipeline dữ liệu chi tiết (M2, phần lõi kỹ thuật)

```
Quay 60fps, 2 máy lệch 60–90°, cùng độ cao ngực, vỗ tay 1 cái đầu clip
      │
      ├─(sync)  audio cross-correlation (GCC-PHAT) → offset thô
      │         tinh chỉnh bằng tương quan vận tốc keypoint dọc  → offset < 1 frame
      │
      ├─(calib) ChArUco giơ cho cả 2 máy ~1 phút → K, R, t mỗi máy
      │         [dự phòng: auto-calib từ khung xương người]
      │
      ├─(2D)    RTMPose / ViTPose chạy từng góc → 2D keypoints + độ tin cậy
      │
      ├─(fuse)  EasyMocap multi-view → SMPL-X   [đường chính]
      │         hoặc triangulate (có tin cậy) → fit SMPL   [đường dự phòng]
      │
      └─→ motion3d (pose theo frame + vị trí gốc)
```

**3 nguồn lỗi lớn nhất — cũng là nơi ghi điểm nghiên cứu:**
1. **Calibration** (sai số số 1): làm UX giơ ChArUco mượt; đánh giá reprojection error.
2. **Đồng bộ dưới-frame:** dùng vỗ tay + keypoint speed; coi chừng trôi trên clip dài (>30s).
3. **Che khuất cả 2 góc / mờ chuyển động nhanh:** infill bằng motion prior hoặc physics refinement (tùy chọn nâng cao).

---

## 4. Dùng sẵn vs tự xây (theo module)

| Module | Dùng sẵn | Tự xây (giá trị đồ án) |
|---|---|---|
| M1 | ffmpeg (tách audio), librosa (phát hiện vỗ tay) | Orchestration ingest, kiểm tra chất lượng clip |
| M2 | **EasyMocap/XRMoCap** (fuse), **RTMPose/ViTPose** (2D), OpenCV (ChArUco), GCC-PHAT | **Adapter mocap**, sync 2-cam bền, UX calibration |
| M3 | Blender + Rokoko/Auto-Rig Pro (retarget), UnderPressure (nhãn contact) | Foot-lock pass, tách root motion, chuẩn hoá định dạng |
| M4 | **Three.js/R3F**, Mixamo rig, `beat_this` (nhịp), CatmullRomCurve3 | **Sequencer nhịp-8**, clone/mirror/offset, cảnh báo va chạm, **xuất POV/mirror** |
| M5 | numpy/scipy, AIST++ (làm chuẩn đối chiếu) | Bộ metric riêng cho múa, thí nghiệm góc đặt máy |

> Ba mảnh capture (M2) **dùng đồ có sẵn tối đa**; M4 + M5 là phần bạn xây và là đóng góp.

---

## 5. Lộ trình theo tuần (~15 tuần / 1 học kỳ, **2 người, có GPU lab**)

*Chạy **2 nhánh song song**, gộp ở tuần 8–10. GPU lab → bỏ rủi ro provisioning, chạy EasyMocap/RTMPose thoải mái.*

- **Người A — Perception (đúng lõi ngành Robot & AI):** M1, M2, M3, M5 — capture → 3D → cleanup → đánh giá.
- **Người B — Sequencer & hệ thống:** M4 (web R3F), hỗ trợ M3 (retarget/định dạng), dựng khung dữ liệu chung.
- **Chốt chung ngay tuần 1:** định dạng trao đổi clip (glTF/FBX Mixamo + JSON) — để B xây sequencer bằng **clip giả (AIST++/Mixamo)** trong khi A chưa ra clip thật.

| Tuần | Người A (Perception) | Người B (Sequencer) | Cổng / Mốc |
|---|---|---|---|
| **1** | Cài EasyMocap/RTMPose trên GPU lab; đọc MAMMA/AIST++ | Dựng R3F, nạp 1 mannequin Mixamo + clip AIST++ giả | Chốt **định dạng trao đổi** + đề cương |
| **2** | **M1**: quay 5–10 clip múa 2 điện thoại (xoay/sàn/nhanh) + clap; ingest | R3F: hiển thị 1 vũ công chạy animation | Bộ clip test |
| **3** | **Calibration ChArUco** + reprojection error | Lưới nhịp-8 (beat_this) + timeline khung | Calib có số |
| **4** | **Đồng bộ** audio GCC-PHAT + keypoint speed | Kéo-thả clip, dàn ≤8 vũ công theo nhịp | Sync < 1 frame |
| **5** | **M2 fuse**: EasyMocap ra SMPL 1 clip đầu-cuối | clone/mirror/offset canon | Clip 3D thô đầu tiên |
| **6** | ⛳ **CỔNG 0**: chấm 1-cam vs 2-cam | Đường đi sàn (CatmullRom) + xoay mặt | **Bảng số Gate 0 + quyết định** |
| **7** | **M3**: làm mượt + foot-lock + tách root motion | Cảnh báo va chạm + camera POV/mirror | Clip sạch |
| **8** | **M3 retarget** → Mixamo, xuất glTF/FBX | **Gộp**: nạp clip THẬT của A vào sequencer | Clip thật chạy trên web |
| **9** | Củng cố pipeline, bù clip lỗi | Xuất video POV/mirror bản đầu | ⛳ **Bảo vệ giữa kỳ** (demo đầu-cuối) |
| **10** | **M5**: dựng bộ metric múa (MPJPE/jitter/foot-slip) | Hoàn thiện UX xuất view tập | Metric chạy |
| **11** | **M5 thí nghiệm**: 1-cam vs 2-cam, **góc đặt máy** | Đánh bóng sân khấu, mượt hoá | Bảng kết quả chính |
| **12** | Infill che khuất (tùy chọn) / bù thí nghiệm | Tính năng phụ theo thời gian còn lại | — |
| **13** | Viết chương phương pháp + kết quả | Viết chương hệ thống + video demo | Bản nháp luận văn |
| **14** | Rà số liệu, hoàn thiện hình/bảng | Hoàn thiện demo, dựng kịch bản trình chiếu | Luận văn hoàn chỉnh |
| **15** | Tập bảo vệ chung | Tập bảo vệ chung | ⛳ **Bảo vệ cuối kỳ** |

**Đường găng:** nhánh A tuần 2→6 (dữ liệu + Gate 0). Nếu Gate 0 trượt → nhánh B vẫn chạy bằng clip AIST++, kích hoạt fallback §7 cho A ngay.

**Lợi thế 2 người:** vì B xây sequencer bằng clip giả từ tuần 1, hệ thống web đã gần xong khi A ra clip thật (tuần 8) — giảm rủi ro dồn việc cuối kỳ.

---

## 6. Mốc bảo vệ (defense milestones)

- **Đề cương (tuần 1–2):** vấn đề, prior-art (MAMMA/DanceNet3D/Choreoto), novelty 3 điểm, kiến trúc, kế hoạch.
- **Giữa kỳ (tuần 9):** chuỗi capture 2-cam → clip 3D chạy đầu-cuối trên ≥1 bài; có số Gate 0.
- **Cuối kỳ (tuần 15):** hệ thống đầu-cuối (capture → sequencer → xuất view tập) + **chương đánh giá có số liệu** (1-cam vs 2-cam, góc máy) + video demo.

**Câu hỏi hội đồng hay hỏi — chuẩn bị trước:** "Khác MAMMA/Choreoto chỗ nào?" (→ 3 điểm novelty §0). "Sao chỉ 2 máy?" (→ số bão hoà sau 2 view). "Độ chính xác bao nhiêu?" (→ bảng M5). "Phần nào là của em, phần nào dùng sẵn?" (→ bảng §4).

---

## 7. Rủi ro & phương án dự phòng

| Rủi ro | Dấu hiệu | Fallback |
|---|---|---|
| Mocap 2-cam múa vẫn quá rung/sai | Gate 0 (tuần 6) không đạt | Giảm phạm vi động tác (bỏ động tác sàn), hoặc dùng clip AIST++ có sẵn để vẫn xây & đánh giá được M4/M5 |
| Calibration khó cho người thường | Sai số reprojection cao | Chuyển sang auto-calib từ khung xương; hoặc cố định tư thế đặt máy có hướng dẫn |
| Trôi đồng bộ trên clip dài | Lệch dần cuối clip | Cắt clip ngắn (≤30s / đoạn 8-count); re-sync theo đoạn |
| Retarget lệch trục (chân ngược) | Tư thế sai khi nạp web | Chuẩn hoá A-pose/T-pose kỹ; test trên Blender trước |
| Hết thời gian ở M4 | Tuần 13 chưa xong | Cắt POV, chỉ giữ mirror; ≤4 vũ công thay vì 8 |

---

## 8. Bối cảnh đã chốt

- **Thời lượng:** 1 học kỳ (~15 tuần) — lộ trình §5.
- **Nhân lực:** 2 người — nhánh A (perception, đúng lõi ngành) // nhánh B (sequencer web), gộp tuần 8.
- **GPU:** có GPU lab trường → chạy EasyMocap/RTMPose tại chỗ, không cần Colab/thuê.

**Phân vai gợi ý theo ngành:** cả hai đều học Robot & AI, nên chia theo sở thích — nhánh A nặng CV/hình học/động học (đúng "chất" ngành nhất, hợp bạn nào thích thuật toán), nhánh B nặng phần mềm/3D web. Chương đánh giá (M5) nên do A chủ trì vì đó là phần "nghiên cứu" ghi điểm hội đồng.

**Còn 1 việc nên làm sớm (ngoài lộ trình code):** hỏi GVHD xem đồ án perception + đồ hoạ thuần phần mềm (không có robot vật lý) có được chấp nhận không — để yên tâm trước khi chạy.

---

## 9. Hiện trạng nghiên cứu đã có (nguyên mẫu TÁI LẬP headless, TRƯỚC Gate 0)

> Mục này ghi phần **đã làm và đo được** tính đến 2026-10-01, để hội đồng thấy novelty (nhất là
> điểm 2 — **bộ đánh giá**) KHÔNG chỉ là lời hứa mà đã có **bằng chứng tái lập bằng số**. Tất cả
> chạy **thuần CPU, tất định**, trên **dữ liệu tổng hợp có sự-thật-nền** — thay cho dữ liệu THẬT
> (cần GPU lab + video múa) sẽ chạy từ Gate 0 (tuần 6). Cấu trúc thuật toán đã khoá; còn lại là
> thay nguồn dữ liệu.

**Hai tầng đã dựng, mỗi tầng có bộ thực nghiệm + runner tái lập:**

| Tầng | Ở đâu | Đã chứng minh (đo được) | Runner tái lập |
|---|---|---|---|
| **Tri giác / hình học** (numpy) | `choreo/` (geom+synth+mocap/fuse), `experiments/` | Lõi 2-view tổng hợp (góc tốt ~90°, đánh đổi phủ↔chính xác); 7 lớp: robust (lỗi thô) · weighted inv-var (nhiễu mềm) · bone-length PBD (nhiễu radial) · capstone hợp nhất · hiệu chuẩn confidence GT-free · thước đo GT-free reproj held-out · cross-val LOCO + QA. **60 test xanh**. | `python experiments/run_all.py` (~173s); `pytest tests/` (60 passed) |
| **Đánh giá dàn dựng** (web/TS, chấm ngay trên `web/src/sync.ts`) | `web/experiments/` (9 script), doc ở `experiments/ket-qua-*.md` | Xem mạch dưới | `node web/experiments/run-all.mjs` (**9/9 tất định ~177s**) |

**Mạch nghiên cứu tầng đánh giá (đóng góp lõi của M4/M5, đã có bằng chứng):**

1. **Tách "trễ nhịp CỐ Ý" khỏi "sai động tác THẬT"** — khung Phân tích Dữ liệu Hàm (FDA) /
   tách Pha–Biên độ (SRVF), bản đặc biệt rigid-τ. Thực nghiệm headless **chấm chính mã sản phẩm**
   chứng minh: dập báo giả canon **51%→0%**, nâng bắt lỗi **80%→100%**. Đã khảo tới hạn warping
   (coarse-to-fine đóng dải gãy 0.9–1.05s; affine τ×ρ thử rồi TẮT mặc định = **kết quả âm trung
   thực**; bản đồ biên gãy KHÉP cung: rigid-τ+thô→tinh là điểm phức tạp đúng, không leo thang vô cớ).
2. **Trần nhận dạng & cách vượt** — chấm nhóm-tương-đối (không cần nhãn) có **điểm sụp đúng 50%**
   (giới hạn THÔNG TIN, không sửa bằng cài đặt: sai đồng dạng thì sụp, sai đa dạng thì hỏng AN TOÀN
   = im, không vu oan). Chấm **tuyệt đối theo tham chiếu** (cần NHÃN — có ở DAW clip-gán & ở Gate-0
   camera held-out) **phá trần đó**: bắt đủ k người sai ở mọi tỉ lệ, vu oan 0%, vẫn bất biến canon.
   ⇒ **cặp thước BÙ nhau**, chọn theo CÓ/KHÔNG nhãn — không ép một thước gánh cả hai.
3. **Biện minh tham số** (trả lời trước câu hội đồng "vì sao các hằng số này?") — đường đặc trưng
   vận hành cho thấy 4 hằng số của bộ chấm quy về **1 ngưỡng vật lý ~2cm** (SCALE & cổng đồng bộ
   gộp thành 1 bậc tự do) + **các chốt an toàn tuyệt đối** hiếm khi bó — không phải số chọn bừa.

> **Ranh giới trung thực:** mọi số trên là **tổng hợp/headless**. Đóng góp "số liệu trên múa THẬT"
> (novelty điểm 2) vẫn CHỜ Gate 0 — chạy 2D pose (RTMPose/ViTPose) → `fuse_multiview` trên clip
> 2 camera thật, và §5.4-kiểu thí nghiệm trên AIST++ với nhiễu detector thật. Phần đã có là **bộ
> khung + thước đo đã kiểm chứng tái lập**, sẵn sàng đón dữ liệu thật mà không phải sửa thuật toán.
> Chi tiết từng vòng: `experiments/ket-qua-*.md` và `web/experiments/README.md` (chỉ mục 2 cung).
