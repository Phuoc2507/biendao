# Bàn giao: Sân khấu thẻ video (cập nhật 2026-10-19)

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
* Không tự tải mô hình ML hay tệp mới khi chưa được đồng ý; không tạo/xoá máy ảo đám mây khi chưa được đồng ý.

## 3. Chạy và kiểm

```bash
cd web && npm install
```

* Chạy app: `npm run dev` trong `web/` rồi mở http://localhost:5173/ (cấu hình sẵn ở `.claude/launch.json`, tên `web`). `index.html` vào app sân khấu `src/stage/main.tsx`.
* Test: `npm test` trong `web/` (node:test, hiện **197 test xanh**).
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

## 5. Đã xong gần nhất (commit 91f7646, 6616b4a, 74a796f)

* **Góc nhìn:** sơ đồ "Từ sân khấu" (phím O). Khung 3D thêm góc **Sau lưng**: thẻ là billboard nên khi camera ở sau thì lật texture (uniform `flipX`), tức như soi gương.
* **Canon theo đoạn:** `VDancer.canon = [{start, end, lag}]`. Trong đoạn, người vào sau đứng chờ ở khung đầu đoạn rồi múa trễ `lag`; hết đoạn khớp lại. Thứ tự: trái sang phải, phải sang trái, giữa trước, hàng đầu trước, theo danh sách; người cách nhau dưới 0,3 m theo tiêu chí vào cùng lượt.
* **Đối xứng hai bên:** `VDancer.flip`; nút lật gương người bên phải nhóm, nên 3 bản sao từ một video thành tổ hợp 3 người.
* **Học động tác:** gương (M), chậm 0,25× tới 1× giữ cao độ, lặp A B, đếm 5678, bước khung, "Bám theo tôi" (khung vẽ tay, nội suy). Đã thử với `IMG_5116.mov` thật, phát được trên Chrome.
* Bộ lọc người múa chính khi tạo thẻ (commit e04225a): trễ khi tách mảng dính, cắt bớt người xem lúc dính.

## 6. Việc còn mở (gợi ý thứ tự)

1. **Trình chiếu chưa có góc Sau lưng:** `ui/Present.tsx` có thể truyền `preset="back"` cho `AudienceView` (prop đã có sẵn) kèm một nút chọn góc.
2. **Bộ lọc tạo thẻ** còn lọt người xem khi chạm sát vũ công thật (khoảng 29 tới 30 s, 39 s, 40,5 tới 41,5 s của IMG_5116) và còn mẩu áo trắng bị cắt ở 28,5 s và 38,5 s. Đã thử "chỉ giữ mảng lớn nhất": làm mất chân, đã bỏ.
3. **Bám theo tôi** đang dùng khung vẽ tay; có thể thêm tự bám người (cần mô hình phát hiện người, phải xin phép người dùng trước khi tải).
4. **Nhìn thật từ sau lưng** (thấy lưng người múa) cần dựng tư thế 3D từ video: để sau, hiện app nói rõ là chưa làm được.
5. Thử trên **điện thoại thật** và với **nhiều video người khác nhau** (đến giờ chủ yếu thử bằng bản nhân bản của IMG_5116).

## 7. Bộ nhớ của Claude

Ghi chú chi tiết lịch sử (kể cả phần nghiên cứu V1 tới V65, AIST++, Gate 0) nằm ở `C:\Users\Admin\.claude\projects\D--bien\memory\`, tệp `choreo-sequencer-project.md`. Đổi tài khoản Claude trên **cùng máy** thì thư mục này thường vẫn còn; nếu không thấy, file bàn giao này đủ để làm tiếp phần app.
