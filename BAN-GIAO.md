# Bàn giao: Sân khấu thẻ video (cập nhật 2026-10-24)

Đọc file này trước khi làm tiếp. Viết cho người (hoặc phiên Claude) mới chưa biết gì về dự án.

## 1. Đang làm gì

App web cho **văn nghệ truyền thống khoa**: quay từng người múa bằng một máy, công cụ Python xoá phông thành "thẻ video", app xếp các thẻ lên sân khấu theo đội hình, khớp nhạc, cho trượt giữa các đội hình, trình chiếu để tập.

* Bài báo nghiên cứu (perception đa camera, AIST++, Gate 0) **đang gác lại**, ưu tiên app.
* Thiết kế gốc: `docs/superpowers/specs/2026-10-09-video-card-stage-design.md`
* Hướng dẫn người dùng (luôn cập nhật khi thêm tính năng): `docs/huong-dan-san-khau-the-video.md`
* Nghiên cứu app đối thủ và rà soát UI/UX: `docs/nghien-cuu-doi-thu.md`, `docs/ra-soat-uiux.md`

## 2. Cách người dùng muốn làm việc (quan trọng)

* Trả lời **tiếng Việt**, văn xuôi **không dùng gạch ngang**.
* **Ghét bị hỏi nhiều**: tự quyết theo mặc định hợp lý, làm mạnh tay, xong thì báo. Sửa kiểu dữ liệu hay đập đi làm lại đều được nếu đúng hướng.
* Làm xong phải **tự kiểm trong app** (trình duyệt), có ảnh chụp làm bằng chứng, không nhờ người dùng kiểm.
* Git: thư mục gốc `D:\bien`, nhánh **master**, commit thẳng. Lời commit tiếng Việt, cuối có dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; dùng `git commit -F <tệp>` cho lời nhiều dòng.
* **Không đụng** `web/src/sync.ts`, `web/src/App.tsx`, `web/src/main.tsx` (app 3D cũ ở `web/3d.html`).
* Người dùng là sinh viên năm nhất Robot và AI, nhắm học lên thạc sĩ, tiến sĩ: phần nghiên cứu ưu tiên chiều sâu hơn chiều rộng.
* Không tự tải mô hình ML hay tệp mới khi chưa được đồng ý; không tạo/xoá máy ảo đám mây khi chưa được đồng ý.

## 3. Chạy và kiểm

```bash
cd web && npm install
```

* Chạy app: `npm run dev` trong `web/` rồi mở http://localhost:5173/ (cấu hình sẵn ở `.claude/launch.json`, tên `web`). `index.html` vào app sân khấu `src/stage/main.tsx`.
* Test: `npm test` trong `web/` (node:test, hiện **399 test xanh**; pytest ở gốc 139 test).
* Kiểm kiểu (máy ít RAM, phải nâng heap): `node --max-old-space-size=2500 node_modules/typescript/bin/tsc -p .` trong `web/`.
* Tệp được test import trực tiếp phải import có đuôi `.ts` (ví dụ `from "./timing.ts"`), `model.ts` chỉ được `import type` từ `timing.ts`.
* Trong trình duyệt có tay cầm DEV `window.__stage.st()` để đọc và gọi store (`setUI`, `commit`, `project`…).
* **Bẫy:** `await import('/src/stage/x.ts')` trong console sau khi HMR có thể ra **bản module khác** với app, gọi hàm từ đó không tác động lên app. Dùng `window.__stage.st()` hoặc bấm nút thật.
* **Bẫy:** Vite chặn (403) tệp ngoài `web/`. Muốn fetch video thử thì chép tạm vào `web/public/_the/` (đã loại khỏi git qua `.git/info/exclude`).
* Khung trình duyệt nhỏ hoặc bị che có thể làm WebGL "Context Lost" hay chụp màn hình quá giờ; đặt lại cỡ cửa sổ rồi thử lại.

Tạo thẻ video (Python, `choreo/videocard`):

```bash
python -m choreo.videocard --music nhac.mp3 --out the lan.mp4 mai.mp4 hoa.mp4
```

Video mẫu thật: `D:\bien\IMG_5116.mov` (iPhone, HEVC 1920x1080, 41,9 s, không commit). Thẻ đã tạo: `the/IMG_5116.card.mp4` và `web/public/_the/IMG_5116.card.mp4`.

## 4. Kiến trúc nhanh (`web/src/stage`)

| Tệp | Vai trò |
|---|---|
| `model.ts` | Kiểu dữ liệu `Project`, `VDancer`, `Formation`; hình học đội hình, nhân bản, `canonRanks`, `rightSide` |
| `timing.ts` | Thời gian, phách, `videoTarget`, canon theo đoạn (`canonTime`, `putCanon`, `canonSig`) |
| `store.ts` | Zustand: `project` (có hoàn tác) và `ui` |
| `actions.ts` | Mọi thao tác người dùng (commit + thông báo kèm Hoàn tác) |
| `clock.ts` | Đồng hồ duy nhất, nhạc là gốc, video bám theo; người canon đứng chờ thì dừng video |
| `media.ts`, `players.ts` | Blob video theo mediaId; element video theo khoá `mediaId@ms~a:b:lag` (bản sao cùng lệch dùng chung) |
| `intake.ts` | `normalizeProject`: làm sạch dữ liệu nạp vào (tệp, bộ nhớ) |
| `storage.ts`, `db.ts`, `layout.ts` | Tự lưu IndexedDB, nhớ bố cục |
| `ui/PlanView.tsx` | Sơ đồ nhìn từ trên (phím O lật "từ sân khấu") |
| `ui/AudienceView.tsx` | Khung 3D r3f: thẻ billboard, góc Khán giả / Chéo / Trên cao / Sau lưng |
| `ui/SidePanel.tsx` | Cột trái: vũ công, đội hình, khung "N người đang chọn: tổ hợp" (canon, đối xứng) |
| `ui/Timeline.tsx` | Dòng thời gian, khối đội hình, vạch canon |
| `ui/Present.tsx`, `rehearse.ts` | Trình chiếu để tập (Tôi là ai, đếm 5678, gương) |
| `ui/Learn.tsx`, `learn.ts` | Chế độ Học động tác (video riêng ngoài đồng hồ dự án) |
| `export/` | Gói zip, Ctrl S ghi tệp `.choreo.json`, in tờ đội hình, xuất video webm |

Quy ước sân: khán giả ở phía **+Z**, x dương là bên **phải khán giả**.

## 5. Đã xong gần nhất

Đợt 2026-10-24, **người 3D từ video** (commit 22dcfa7, ac7b6a4):
* Python `choreo/pose3d`: `.npz` 24 khớp SMPL hệ camera (từ GVHMR, script `gvhmr_dump.py` chạy trong môi trường GVHMR, **chưa chạy máy thật**) → `<ten>.motion.json` (format `choreo-motion` v1: fps, numFrames, jointNames 17 khớp, frames[T][17][3] mét hệ sân, giờ tính từ đầu video gốc). Lệnh `python -m choreo.pose3d a.npz --out the`. Test `tests/test_pose3d.py`.
* App: thả `.motion.json` thì `motionTargets` (intake.ts) gắn vào vũ công trùng tên hoặc trùng tên video thẻ (cả bản nhân bản), lưu kho media, `VDancer.motionId`; GC giữ id này (`mediaIdsOf`, `variants.mediaIds`). `ui/StageAvatar.tsx` vẽ nhân vật Quaternius (rig dùng chung `src/rig/quaterniusRig.ts`, cả app cũ `GltfDancer`), giờ động tác = `canonTime(t).t - offsetSec`, xoay theo `facingAt`, lật gương = phản chiếu pose. Thẻ còn làm vùng bấm kéo vô hình. Nút **Người 3D** (`ui.avatars`) trong khung 3D. Nạp lười trong `Card`.
* Hướng dẫn máy RTX 5060: `docs/huong-dan-nguoi-3d-may-rtx.md` (torch cu128, SMPL người dùng tự đăng ký, phi thương mại).
* Chưa làm: gói .zip xuất ra chưa mang tệp động tác; video cả đội → tự ra đội hình.


Đợt 2026-10-19, lượt năm (agent worktree):

* **Chạy không cần mạng (PWA)**: `public/manifest.webmanifest` (tên tiếng Việt), icon tự vẽ `public/icon.svg` và bản PNG cho iPhone; service worker viết tay `public/sw.js`, luật cất thuần trong `public/sw-policy.js` (test ở `src/stage/pwa.test.ts`). Lúc build, plugin `stage-sw` trong `vite.config.ts` điền mã bản dựng và danh sách cất sẵn vào `dist/sw.js`. Tệp `assets/` cất trước dùng mãi, trang HTML mạng trước rồi mới tới bản cất (chờ 3,5 s), không cất video, nhạc, yêu cầu Range, blob:. Chỉ đăng ký khi `import.meta.env.PROD` (`src/stage/pwa.ts`); bản mới cài xong thì chờ, app báo "Có bản mới" kèm nút Tải lại (tin `SKIP_WAITING`). Hướng dẫn cài lên điện thoại ở mục 3 của hướng dẫn. Lưu ý: service worker cần https hoặc localhost, nên LAN `http://192.168...` phải dùng `adb reverse`, cờ Chrome hoặc https.
* **Gỡ chỗ nghi lượt bốn:** Mở phương án giữ tệp Ctrl S đang ghi (`applyProject(p, { keepSaveTarget: true })`); hai thẻ cùng mở không ghi đè danh sách phương án (mỗi lần ghi giữ khoá `navigator.locks` "choreo-stage-variants" rồi đọc lại bản mới nhất, BroadcastChannel báo thẻ kia đọc lại); `snapPos` bước 0, âm, NaN giữ nguyên chỗ; Esc ngăn kéo điện thoại không đóng ngăn kéo khi đang có menu, hộp thoại, Hướng dẫn, Trình chiếu, Học động tác, hay khi Esc đang huỷ ô gõ chữ (`drawerEscCloses` trong `ui/keys.ts`).

Đợt 2026-10-19, học từ đối thủ, lượt bốn (merge 8d5199e, 79a1ffd, 88b95fc; 3 agent song song):

* **Phương án song song** (Tệp ▸ Phương án…, `variants.ts`, `variantsDb.ts`, `ui/VariantsDialog.tsx`): lưu bản chụp có tên trong IndexedDB (khoá `variants`), dùng chung video; Mở tự cất bản đang làm thành "Trước khi đổi"; So sánh liệt kê đội hình, người dời, đổi chỗ, đường cong, hướng mặt, ghi chú. Còn nghi: Mở phương án làm Ctrl S hỏi lại chỗ lưu; hai thẻ cùng mở có thể ghi đè danh sách.
* **Hướng mặt từng người** (`Formation.facing`, `facing.ts`): phím **Q** quay 45 độ (Shift Q ngược; F đã là Trình chiếu), lưới 8 hướng trong khung vũ công, nút Quay mặt trên thanh chọn. Tam giác ở mép chấm trên sơ đồ, ảnh, video sơ đồ, bản in (chữ LƯNG); dòng nhắc Tôi là ai có "quay lưng"... Lật gương đổi dấu, Xoay R cộng 90. Đổi chỗ X và reassignFix (Đổi chỗ cho gần) nay cho hướng mặt đi theo CHỖ ĐỨNG (hướng mặt là một phần của hình), ghi chú riêng vẫn theo người.
* **Người dự bị, thay vai** (`cast.ts`): VDancer là MỘT VAI; `name`, `color` là người ĐANG ĐÓNG nên mọi chỗ hiện tên tự đúng; `lead` cất người chính để đổi lại, `subs` là người dự bị (tối đa 8). Dự án cũ không có hai trường này: người chính đang đóng. `Project.castNote` false thì bỏ chữ "(thay A)". Nhân bản không chép subs/lead. diffProjects báo thay vai là kind "cast". **Đổi vai cả bài** (Shift X, `swapRolesAll`): đổi pos, via, facing, notes trên mọi đội hình; video, canon, lật, nhóm theo người.
* **Phương án song song** (Tệp ▸ Phương án…, `variants.ts`, `variantsDb.ts`, `ui/VariantsDialog.tsx`): lưu bản chụp có tên trong IndexedDB (khoá `variants`), dùng chung video; Mở tự cất bản đang làm thành "Trước khi đổi"; So sánh liệt kê đội hình, người dời, đổi chỗ, đường cong, hướng mặt, ghi chú. (Hai chỗ nghi cũ đã gỡ ở lượt năm.)
* **Hướng mặt từng người** (`Formation.facing`, `facing.ts`): phím **Q** quay 45 độ (Shift Q ngược; F đã là Trình chiếu), lưới 8 hướng trong khung vũ công, nút Quay mặt trên thanh chọn. Tam giác ở mép chấm trên sơ đồ, ảnh, video sơ đồ, bản in (chữ LƯNG); dòng nhắc Tôi là ai có "quay lưng"... Lật gương đổi dấu, Xoay R cộng 90. Đổi chỗ X giữ hướng mặt theo người.
* **Gỡ chỗ nghi lượt ba:** Ctrl C/V chép cả đường cong; Xoay, Giãn/Thu dời điểm uốn theo nửa phép biến đổi (đầu kia đứng yên nên quay trọn sẽ thắt vòng), Đổi chỗ X bỏ đường cong của hai người; núm uốn đẩy ra khỏi chấm khi đi ngắn; ô số người của Thư viện theo vạch phát; video sơ đồ có mũi tên mờ đường sắp đi.

Đợt 2026-10-19, học từ đối thủ, lượt ba (merge 50e64da, 94e3155, 5072992; 3 agent song song):

* **Xuất video một đoạn** (`export/videoRange.ts`): Cả bài, Vùng lặp, Đội hình tại vạch phát, Mốc đoạn nhạc, hoặc gõ Từ / tới. Sơ đồ dựng nhanh bằng WebCodecs (`export/fastPlan.ts`, đóng gói bằng `webm-muxer` có sẵn), thiếu bộ mã thì lùi về ghi thời gian thật. Đã thử: đoạn 8 giây 720p có tiếng dựng trong 1,5 giây, phát được.
* **Thư viện đội hình theo số người** (`library.ts`, `ui/LibrarySection.tsx`, thẻ Đội hình): 3 tới 16 người, sinh bằng hàm, không ai bị che, áp như Hình của tôi, lưu được vào Hình của tôi. Còn nghi: ô số người không tự đổi khi chỉ tua; 15, 16 người thiếu chữ V, W, vòng cung trên sân 10×6.
* **Đường đi cong** (`Formation.via`, Bézier bậc hai, `pathAt` trong `model.ts`): kéo núm giữa mũi tên của người đang chọn lúc đang giữ đội hình, bấm đúp để đi thẳng lại. Va nhau, tốc độ, đi xuyên đạo cụ tính theo đường cong; lật gương lật cả via; vẽ cong ở ảnh, ảnh từng người, bản in. Còn nghi: Ctrl C/V không chép đường cong; Xoay, Giãn, Đổi chỗ chỉ dời via theo dây cung; video sơ đồ không vẽ mũi tên; núm đè lên chấm khi người đi rất ngắn.

Đợt 2026-10-19, học từ đối thủ, lượt hai (commit d120ee8 tới 5a1959d; 2 agent song song):

* **Nhóm lưu sẵn** (`Project.groups`, `groups.ts`): chip nhóm trong cột trái, bấm chip chọn cả nhóm, Alt 1 tới 9 chọn nhanh; viền màu theo nhóm trên sơ đồ, ảnh và bản in (`Project.groupRings`, tắt được, nằm trong hoàn tác).
* **Đạo cụ và mốc sàn đứng yên** (`Project.props`, `props.ts`, `ui/PropTools.tsx`): Micro, Bục, Ghế, Mốc sàn đánh số; vẽ trên sơ đồ, 3D, ảnh, bản in; cảnh báo nhẹ đứng trong hoặc đi xuyên đạo cụ (`checks.ts`). Món mới đặt theo kích thước, không đè món cũ.
* **Đạo cụ dời theo đội hình** (`Formation.propPos`, chỗ riêng {x, z, rot?} theo id đạo cụ; không có thì chỗ gốc trong `Project.props`): `propsAt` trong `props.ts` trượt smoothstep như người (trước đội hình đầu như đầu, sau cuối như cuối), mọi nơi vẽ dùng nó (sơ đồ, 3D, `planFrame` cho ảnh và video, bản in theo `propsIn`). Kéo lúc vạch phát trong một khối thì chỉ dời ở khối đó (`dragPropTo`, tính lại từ `gestureBase` mỗi lần di chuột), Shift hay ở khoảng chuyển thì dời cả bài (`shiftPropAll`); xoay 90° cùng quy tắc; nút "Giữ yên cả bài" (`holdPropStill`) đặt chỗ gốc bằng chỗ đang thấy rồi xoá chỗ riêng. + Đội hình chép chỗ, tạo khối giữa khoảng chuyển thì `seedPropSpots`; lật cả đội lật đạo cụ có đổi chỗ (`mirrorPropsIn`); xoá đạo cụ xoá chỗ riêng; thu sân kẹp; `normalizeProject` làm sạch (tệp cũ không đổi). Cảnh báo `propIssues` lấy mẫu người và đạo cụ cùng một tham số. Tên đạo cụ xếp bằng `layoutPropLabels` (dời hoặc ẩn khi chồng). Test: `propmove.test.ts`.
* Còn nghi: góc xoay riêng theo đội hình chỉ cho hộp; Phương án ▸ So sánh chỉ báo chung một dòng "đạo cụ" (không nói đội hình nào); Sửa tất cả và báo số cảnh báo sau thao tác (`hardIssues`) không tính đạo cụ; Ctrl C/V, thư viện đội hình không mang chỗ đạo cụ; tên đạo cụ chỉ né tên khác, chưa né chấm người; chưa thử trong trình duyệt.

Đợt 2026-10-19, học từ đối thủ (khảo sát `docs/doi-thu-va-khoang-trong.md`, 14 app; 2 agent song song):

* **Ghi chú riêng từng người trong từng đội hình** (`Formation.notes`, ô ở cuối khung vũ công, `setPersonNote`): hiện trong dòng nhắc Tôi là ai, ô của người đó ở ảnh vị trí, bản in. Chép dán chỗ đứng và + Đội hình mang theo ghi chú; xoá người thì xoá ghi chú.
* **Mốc đoạn nhạc có tên** (`Project.marks`, `marks.ts`): dải Mốc dưới thước, nút + và Gợi ý (từ chỗ nhạc đổi mạnh, `suggestMarkTimes` trong `autoplan.ts`), bấm đúp nhãn để đổi tên, kéo để dời, phím B thêm mốc, Shift [ ] nhảy mốc. Tên đoạn hiện trên đầu màn trình chiếu và ở ảnh vị trí từng người.
* Bẫy đã gặp: một worktree cũ còn junction trỏ vào `web/node_modules`, khi bị dọn đã xoá theo 67 gói (mất `@babel/core`, `.bin`). Cứu bằng `npm install --offline` (lấy từ cache, không tải mới). Luôn `rmdir` junction trước khi xoá worktree.

Đợt 2026-10-19, phần chót (commit d683178 tới 5c1dfda; 2 agent song song):

* **Xuất ảnh đội hình** (menu Tệp): một ảnh PNG cho đội hình tại vạch phát, hoặc mọi đội hình gói .zip (dùng lại `makeZip`). Ảnh rộng 1080, cao từ vuông tới 4:5, chữ to đọc được trên điện thoại, có mũi tên từ chỗ cũ. Phần thuần ở `export/imageSheet.ts`, vẽ bằng `drawPlanFrame`. Tên ngắn nằm trọn trong chấm thì không vẽ nhãn dưới chấm.
* **Rà lỗi:** đặt chỗ giữa khoảng chuyển gói thành một bước hoàn tác (`batch` trong `setPositionsNow`); ghi chú toàn khoảng trắng bị bỏ khi mở tệp; điểm Hình của tôi quá 1000 m bị bỏ (tránh NaN); cắt ghi chú trong video theo ký tự thật; ô ghi chú bôi đen được trên Safari.
* **Chia sẻ ảnh** (điện thoại, `navigator.share`) và **Chép ảnh** (máy tính, `ClipboardItem`); máy không hỗ trợ thì ẩn mục, bị từ chối thì tải ảnh xuống thay.
* **Phím tắt bị chặn** khi hộp Xuất video hoặc lớp Đang xử lý đang mở (`modalOpen` trong `ui/keys.ts`, cờ `ui.exportOpen` trong store). Thêm hộp thoại mới thì nhớ thêm vào `modalOpen`.
* **Ảnh vị trí từng người** (menu Tệp, `export/personSheet.ts`): mỗi vũ công một ảnh dọc 1080 rộng, lưới 2 cột các đội hình, người đó tô nổi kèm mũi tên riêng; nhiều đội hình thì chia trang -p1, -p2; gói .zip cả đội.
* **Rà lỗi đợt hai:** Esc ở popup chỉ đóng popup (`popupOpen` trong `ui/keys.ts`); khối mới không đè khối trước khi khoảng hở nhỏ; Xếp hàng trên sân hẹp không đảo thứ tự; thu nhỏ sân thì kéo người vào (`fitFormationsToStage`); `normalizeProject` làm sạch tệp hỏng (kẹp sân 1 tới 60 m, nhịp 20 tới 400, bỏ id trùng, sắp và đẩy khối chồng); `fuzz.test.ts` 3000 ca ngẫu nhiên.
* Còn nghi: trên điện thoại Esc của ngăn kéo trong App.tsx có thể đóng ngăn kéo khi đang mở menu; snapPos với bước 0 ra NaN (hiện chỉ gọi với hằng số). Cả hai đã gỡ ở lượt năm.

Đợt 2026-10-19, phần cuối (commit 7e04370, ef44de4; làm bằng 2 agent song song trong worktree):

* **Hình của tôi** (`Project.myShapes`, `captureShape` / `fitSavedShape` trong `model.ts`): lưu hình dạng nhóm (tương đối, không gắn người), áp lại quanh tâm nhóm, gán người theo đường gần nhất; lệch số người thì báo rõ.
* **Cảnh báo bị che** (kind `blocked`, `isSoft` trong `checks.ts`): người đứng sau lệch ngang dưới 0,35 m. Là loại nhẹ: không tính trong hintWarn và Sửa tất cả, không tô đỏ dòng thời gian; có nút **Đứng so le** (`staggerFix` trong `fixes.ts`). Vòng tròn số người chẵn luôn có vài chỗ bị che (thật vậy), nên bài mẫu mở ra có 3 cảnh báo nhẹ.

Đợt 2026-10-19, phần sau (commit ebfdbf1 tới f7e831f):

* **Thông báo có nút hành động:** sau Xếp nhanh, Lật, Dàn đều, Xoay, Giãn, Thu, Cánh gà, Nhân bản mà sinh thêm cảnh báo thì thông báo kèm nút Sửa tất cả (`hintWarn` trong `actions.ts`; Đổi chỗ và Dán chỉ báo số, không kèm nút).
* **Ctrl C / Ctrl V:** chép chỗ đứng của người đang chọn (hoặc cả đội) sang đội hình khác. Đang bôi đen chữ thì Ctrl C chép chữ như thường.
* **Ghi chú đội hình** (`Formation.note`): gõ trong thẻ Đội hình; hiện lúc Trình chiếu (khối chữ góc trên trái, `.rh-head`), trong bản in, trong video sơ đồ xuất ra, dấu ✎ trên khối dòng thời gian và trong danh sách đội hình.
* **Đổi chỗ** hai người (phím X), **Xoay** một phần tư vòng quanh tâm nhóm (phím R, Shift R ngược; `rotateGroup` tự thu và dời cho vừa sân), **Giãn / Thu** 15% quanh tâm (`scaleGroup`: dừng ở mép sân, không để ai sát dưới 0,5 m). Thanh chọn nổi dưới sơ đồ có thêm Đổi chỗ và Xoay; trên điện thoại các nút chỉ còn biểu tượng.

Đợt 2026-10-19, phần đầu (commit 0a9c461 tới 94d387d):

* **Sửa nhanh cảnh báo** (`fixes.ts`): Đổi chỗ cho gần (Hungarian quanh một đội hình), Đổi vai từ đây (khi đổi riêng làm đoạn sau xấu đi thì đổi vai cho mọi đội hình về sau), Nới khoảng chuyển (rời sớm, bắt về phách, không nới nếu thêm va), Sửa tất cả (có ở ngăn Cảnh báo và ô Cảnh báo trên sơ đồ). Test ngẫu nhiên 300 bài: không bao giờ tăng cảnh báo, giữ lúc tới, khối không chồng.
* **Trình chiếu:** góc Sau lưng (phím B); nhãn Khoá sửa tự nhấc lên khi bị thanh điều khiển đè; bố cục riêng cho điện thoại dựng đứng (sơ đồ nhỏ nằm trên thanh điều khiển, mặc định tắt) và nằm ngang (sơ đồ nhỏ bên phải).
* **Bố cục:** dòng thời gian chỉ lấy khoảng 2/5 khi cửa sổ thấp (`tlHeight` trong `layout.ts`); thanh trên không xuống dòng ở 1180 tới 1360 px; điện thoại thanh trên còn hai hàng; cửa sổ thấp thì nút sơ đồ cùng hàng nhãn trạng thái và sân chỉ chừa chỗ cho nút thật sự đè lên bề ngang của nó (`topExtra` trong `layout.ts`).
* **Học động tác trên điện thoại:** lời nhắc gương còn một câu.

Trước đó (commit 91f7646, 6616b4a, 74a796f):

* **Góc nhìn:** sơ đồ "Từ sân khấu" (phím O). Khung 3D thêm góc **Sau lưng**: thẻ là billboard nên khi camera ở sau thì lật texture (uniform `flipX`), tức như soi gương.
* **Canon theo đoạn:** `VDancer.canon = [{start, end, lag}]`. Trong đoạn, người vào sau đứng chờ ở khung đầu đoạn rồi múa trễ `lag`; hết đoạn khớp lại.
* **Đối xứng hai bên:** `VDancer.flip`; nút lật gương người bên phải nhóm.
* **Học động tác:** gương (M), chậm 0,25× tới 1× giữ cao độ, lặp A B, đếm 5678, bước khung, "Bám theo tôi" (khung vẽ tay, nội suy).
* Bộ lọc người múa chính khi tạo thẻ (commit e04225a).

## 6. Việc còn mở (gợi ý thứ tự)

1. **Bộ lọc tạo thẻ** còn lọt người xem khi chạm sát vũ công thật (khoảng 29 tới 30 s, 39 s, 40,5 tới 41,5 s của IMG_5116) và còn mẩu áo trắng bị cắt ở 28,5 s và 38,5 s. Đã thử "chỉ giữ mảng lớn nhất": làm mất chân, đã bỏ.
2. **Bám theo tôi** đang dùng khung vẽ tay; có thể thêm tự bám người (cần mô hình phát hiện người, phải xin phép người dùng trước khi tải).
3. **Người 3D**: chạy thử GVHMR trên máy 5060 thật (theo `docs/huong-dan-nguoi-3d-may-rtx.md`), kiểm trái phải và hướng; cho tệp động tác vào gói .zip; sau đó video cả đội → tự ra đội hình.
4. Thử trên **điện thoại thật** và với **nhiều video người khác nhau** (đến giờ chủ yếu thử bằng bản nhân bản của IMG_5116).

## 7. Bộ nhớ của Claude

Ghi chú chi tiết lịch sử (kể cả phần nghiên cứu V1 tới V65, AIST++, Gate 0, bài học từng đợt) có bản chép trong repo: `docs/ghi-chu-claude/lich-su-du-an.md` (chép từ bộ nhớ ngày 2026-10-24). Sang máy mới: đọc tệp này khi cần chi tiết; ghi thêm bài học mới vào bộ nhớ của máy đó và chép lại vào tệp này rồi đẩy lên.

Máy hỗ trợ có card RTX 5060: cài theo `docs/cai-may-ho-tro.md`.
