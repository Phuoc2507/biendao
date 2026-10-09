# Đặc tả: Sân khấu thẻ video (xếp đội hình cho văn nghệ khoa)

Ngày: 2026-10-09 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Biên đạo quay **từng vũ công riêng** bằng một điện thoại, xoá phông, rồi đưa mỗi
người vào app thành một **thẻ video** đứng trên sân khấu ảo. Biên đạo kéo thẻ để
xếp đội hình theo thời gian của bài nhạc; app **tự cho thẻ trượt** giữa các đội
hình, mọi video phát khớp với nhạc. Chạy trên **Chrome, laptop**.

Dùng vào ngày tập: biên đạo xếp đội hình, rồi **trình chiếu** cho cả nhóm xem.

Bài báo (tầng perception đa camera) tạm gác; app này ưu tiên trước vì có hạn diễn.

### Không làm ở bản này

Đường cong, cảnh báo va chạm, mỗi người rời chỗ lệch giờ (sóng), chế độ gương,
chia sẻ qua link, chạy trên điện thoại, ghép nhiều bài nhạc. Xuất ra video là mục
cuối, chỉ làm nếu còn thời gian (mục 9).

## 2. Các quyết định đã chốt

| Vấn đề | Chốt |
|---|---|
| Bố cục | Một khung sân khấu, phím Tab đổi góc **từ trên xuống (sửa)** và **khán giả (xem)** |
| Quay phim | Mỗi người đứng tại chỗ múa, có bật nhạc to để micro thu được |
| Xoá phông | Lệnh Python chạy offline trên laptop (CPU), không làm trong Chrome |
| Định dạng thẻ | MP4 H.264 **xếp chồng**: nửa trên là hình, nửa dưới là mặt nạ; shader ghép lại |
| Khớp nhạc | Tự động bằng tương quan chéo tiếng nhạc; sửa tay được |
| Đường đi | Thẳng, có tăng tốc và giảm tốc (smoothstep) |
| Sân khấu | Mặc định rộng 10 m, sâu 6 m, sửa được; thiết kế cho tối đa khoảng 10 người |
| App cũ | Giữ nguyên mọi file, chuyển sang `/3d.html`; app mới là trang chính `/` |

Lý do chọn MP4 xếp chồng thay vì WebM nền trong suốt: laptop dùng Intel UHD 730,
giải mã H.264 bằng phần cứng nên chạy 8 đến 10 video cùng lúc vẫn mượt; lớp
trong suốt của WebM VP9 phải giải mã bằng CPU. Định dạng xếp chồng cũng chạy được
ở mọi trình duyệt.

## 3. Kiến trúc tổng quát

```
Điện thoại ──► video gốc (mp4) ─┐
File nhạc gốc (mp3/m4a/wav) ────┼─► choreo/videocard (Python, offline)
                                │      ├─ khớp nhạc  → offsetSec
                                │      ├─ xoá phông (RVM ONNX, CPU)
                                │      └─ cắt khung sát người, mã hoá
                                ▼
                 <ten>.card.mp4 + <ten>.card.json
                                │  kéo thả vào app
                                ▼
web/ (trang chính "/") ── store mới ── IndexedDB (tự lưu video, nhạc, đội hình)
```

## 4. Công cụ xoá phông: `choreo/videocard/`

Gói Python mới, chia nhỏ để test được:

| File | Việc | Phụ thuộc |
|---|---|---|
| `align.py` | Tính độ lệch giữa tiếng trong video và nhạc gốc | numpy |
| `crop.py` | Tìm khung bao người hợp nhất qua mọi khung hình | numpy |
| `matting.py` | Chạy RobustVideoMatting bản ONNX, giữ trạng thái hồi quy giữa các khung | onnxruntime (import có bảo vệ) |
| `ffio.py` | Đọc khung hình, tách tiếng, mã hoá MP4 qua ffmpeg | imageio-ffmpeg (có sẵn ffmpeg) |
| `cli.py` | Lệnh `python -m choreo.videocard --music bai.mp3 a.mp4 b.mp4 --out the/` | các file trên |

**Khớp nhạc (`align.py`).** Hai tín hiệu được đổi về mono 8 kHz. Mỗi tín hiệu lấy
đường bao onset (spectral flux log năng lượng, 100 khung mỗi giây), chuẩn hoá,
rồi tương quan chéo bằng FFT. Đỉnh cao nhất cho độ lệch. Độ tin cậy là tỉ số đỉnh
cao nhất trên đỉnh cao thứ hai (ngoài vùng ±0.5 s quanh đỉnh chính). Tỉ số dưới
1.5 thì in cảnh báo, ghi `alignConfident: false` để app nhắc biên đạo căn tay.

Quy ước: `offsetSec` là **thời điểm trong bài nhạc khi video bắt đầu**. Thời gian
video = thời gian nhạc − `offsetSec`. Video bật quay trước khi nhạc chạy thì
`offsetSec` âm.

**Xoá phông (`matting.py`).** Mô hình RVM mobilenetv3 fp32, `downsample_ratio`
tự chọn theo độ phân giải (0.25 cho 1080p). Mặt nạ alpha 0..1.

**Cắt khung (`crop.py`).** Hai lượt, matting chỉ chạy một lần. Lượt 1 chạy
matting, ghi hai file tạm toàn khung (hình màu và mặt nạ, chất lượng cao), đồng
thời gộp khung bao của vùng alpha > 0.5 qua mọi khung hình. `crop.py` chỉ tính
khung bao có lề: trái, phải, trên 4%; dưới 1% để chân nằm sát đáy thẻ; kẹp trong
ảnh; kích thước làm tròn chẵn. Lượt 2 gọi ffmpeg cắt cả hai file tạm theo đúng
khung bao đó, co về cao 540 px, rồi xếp chồng dọc (`vstack`).

**Đầu ra mỗi video.**
* `<ten>.card.mp4`: H.264 yuv420p, 30 fps, mỗi nửa cao 540 px (tổng 1080 px),
  nửa trên là hình màu, nửa dưới là mặt nạ xám. Không có tiếng.
* `<ten>.card.json`:

```json
{ "format": "choreo-card", "version": 1, "name": "Lan",
  "stacked": true, "fps": 30, "durationSec": 182.4,
  "width": 300, "height": 540,
  "offsetSec": 3.27, "alignConfident": true }
```

**Thời gian chạy ước tính.** Khoảng 5 đến 10 phút cho một video 3 phút trên CPU.

**Cài đặt.** `pip install onnxruntime imageio-ffmpeg`. File mô hình RVM ONNX tải
từ trang phát hành chính thức của RobustVideoMatting. **Hỏi người dùng trước khi
tải.** RVM theo giấy phép GPL 3.0: chỉ gọi như công cụ bên ngoài, không chép code
vào repo; đồ án phi thương mại.

## 5. App web

### 5.1 Tổ chức file

* `web/index.html` → `src/stage/main.tsx` (app mới).
* `web/3d.html` → `src/main.tsx` (app cũ, **không sửa file nào trong `src/` cũ**).
* `vite.config.ts` thêm `build.rollupOptions.input` cho hai trang.
* Code mới nằm trong `web/src/stage/`:

| File | Việc |
|---|---|
| `main.tsx`, `App.tsx` | Điểm vào, bố cục khung, phím tắt |
| `model.ts` | Kiểu dữ liệu và các hàm thuần: `poseAt`, `formationAt`, tạo, sửa, xoá đội hình |
| `store.ts` | zustand: dự án, lựa chọn, chế độ xem, lịch sử hoàn tác |
| `media.ts` | Nạp thẻ (mp4 + json), giải mã nhạc, tính sóng âm |
| `clock.ts` | Đồng hồ chính theo nhạc, đồng bộ mọi video |
| `db.ts` | Bọc IndexedDB gọn (không thêm thư viện) |
| `components/StageView.tsx` | Canvas R3F, đổi hai camera |
| `components/PlanLayer.tsx` | Góc từ trên: chấm màu, bóng mờ, đường đi, kéo thả |
| `components/CardLayer.tsx` | Góc khán giả: thẻ video với shader xếp chồng |
| `components/Timeline.tsx` | Sóng âm, khối đứng, khối trượt, vạch thời gian |
| `components/DancerList.tsx` | Danh sách vũ công bên trái |
| `components/Toolbar.tsx` | Phát, tốc độ, vòng lặp A–B, trình chiếu, trạng thái lưu |

### 5.2 Dữ liệu

```ts
interface VDancer {
  id: string; name: string; color: string;
  mediaId: string;        // khoá blob video trong IndexedDB
  stacked: boolean;       // true: có mặt nạ; false: video thường (hiện cả nền)
  offsetSec: number;      // xem quy ước ở mục 4
  durationSec: number; aspect: number; // rộng / cao của một nửa
  cardHeight: number;     // mét, mặc định 1.9, chỉnh 1.2..2.4
  hidden: boolean;
}
interface Formation {
  id: string;
  start: number; end: number;            // giây; khối đứng [start, end]
  pos: Record<string, [number, number]>; // dancerId -> [x, z] mét
}
interface Project {
  version: 1; stage: { width: number; depth: number };
  musicId: string | null; bpm: number | null;
  dancers: VDancer[]; formations: Formation[];
}
```

**Bất biến (giữ trong mọi hàm sửa):**
1. `formations` sắp tăng theo `start`; `start <= end`; `end[k] <= start[k+1]`.
2. Mọi đội hình có vị trí của **mọi** vũ công. Thêm vũ công thì chèn vào mọi đội
   hình (ở chỗ trống gần cánh gà trái); xoá vũ công thì xoá khỏi mọi đội hình.
3. Toạ độ kẹp trong sân khấu.

Quy ước sân khấu giữ như app cũ: khán giả ở phía +Z, x dương là bên phải khán giả.

### 5.3 Tính vị trí theo thời gian: `poseAt(formations, id, t)`

* Không có đội hình: trả `null`, thẻ đứng ở vị trí xếp hàng mặc định (`lineup`:
  một hàng ngang ở z = 0, cách nhau 1 m, căn giữa, theo thứ tự danh sách).
* `t` trước khối đầu: vị trí khối đầu. Sau khối cuối: vị trí khối cuối.
* `t` trong khối đứng `k`: vị trí của `k`.
* `t` trong khoảng trống giữa `k` và `k+1`: nội suy tuyến tính hai vị trí với hệ
  số `smoothstep((t − end[k]) / (start[k+1] − end[k]))`.

### 5.4 Sửa đội hình

* **Kéo chấm** trong góc từ trên. Nếu vạch thời gian nằm trong khối đứng `k` thì
  sửa `k`. Nếu không, tạo đội hình mới tại vạch: `start = t`,
  `end = min(t + 1 s, start của khối sau)`, vị trí lấy từ `poseAt` của mọi người,
  rồi áp phần kéo.
* **Nút "+ Đội hình"** (luôn hiện): nếu vạch đang ở khối `k`, tạo khối mới bắt đầu
  sau `end[k]` 2 giây và dài 2 giây (dời các khối sau nếu không đủ chỗ), chép vị
  trí của `k`, rồi đưa vạch tới khối mới. Nếu vạch ở chỗ trống, làm như kéo chấm
  (chưa có đội hình nào thì vị trí lấy từ `lineup`). Đây là thao tác duy nhất
  được dời vạch thời gian.
* Bám lưới 0.5 m; giữ Alt để tự do. Shift + bấm để chọn nhiều người; kéo một
  người thì cả nhóm đã chọn cùng dời.
* Bóng mờ: vòng nét đứt ở vị trí đội hình trước; đường mảnh từ vị trí trước tới
  vị trí hiện tại và đường đậm từ hiện tại tới đội hình sau. Tuỳ chọn hiện đường:
  Luôn, Chỉ người đang chọn, Tắt.
* Mép trước sân khấu: vạch vàng đậm ghi KHÁN GIẢ, số 0 ở giữa, 2, 4, 6… ra hai
  bên mỗi mét. Có đường tâm dọc.

### 5.5 Dải thời gian

* Vẽ sóng âm (đỉnh tính lại mỗi lần mở app từ blob nhạc, không lưu vào dự án).
* Bấm một khối đứng để chọn nó (viền sáng); Delete xoá khối đang chọn.
* Khối đứng là khối màu đặc, khoảng trống giữa hai khối là khối gạch chéo (lúc
  trượt) ghi thời lượng.
* Kéo mép khối để đổi `start` hoặc `end`, kéo giữa khối để dời cả khối. Không cho
  vượt khối bên cạnh. Bám 0.1 s, hoặc bám phách nếu đã nhập BPM.
* Bấm hoặc kéo trên sóng âm để tua. Vạch thời gian đỏ, dày 3 px. Sửa đội hình không
  bao giờ làm vạch tự nhảy (trừ nút "+ Đội hình").
* `overscroll-behavior: none` để cuộn ngang không làm Chrome lùi trang.

### 5.6 Phát đồng bộ (`clock.ts`)

* Phần tử `<audio>` của bài nhạc là đồng hồ chính, `preservesPitch = true`.
* Hàm thuần `videoTarget(tMusic, offsetSec, durationSec)` trả thời gian video kẹp
  trong `[0, durationSec − 0.04]` và cờ "đang trong đoạn có hình".
* Mỗi khung hình khi đang phát: với từng video, đặt `playbackRate` bằng tốc độ;
  nếu ngoài đoạn có hình thì dừng ở khung đầu hoặc cuối; nếu lệch quá 0.08 s thì
  gán lại `currentTime`.
* Khi dừng hoặc tua: gán thẳng `currentTime` của mọi video.
* Video luôn tắt tiếng (tránh chặn tự phát của Chrome, tiếng chỉ từ bài nhạc).
* Tốc độ 0.5×, 0.75×, 1×. Vòng lặp A–B: nút Đặt A, Đặt B, bật tắt lặp.

### 5.7 Hai góc nhìn

* **Từ trên (sửa):** camera trực giao nhìn thẳng xuống, khán giả ở cạnh dưới màn
  hình. Mỗi vũ công là chấm tròn màu riêng có chữ cái đầu và tên. Không vẽ video.
* **Khán giả (xem):** camera phối cảnh ở (0, 1.6, 9) nhìn (0, 1, 0), xoay ngang
  giới hạn ±40°. Thẻ là mặt phẳng cao `cardHeight`, rộng theo `aspect`, đáy chạm
  sàn, luôn quay ra khán giả. Shader lấy màu ở nửa trên, alpha ở nửa dưới, dùng
  `alphaTest 0.5` và ghi chiều sâu để người gần che người xa đúng mà không cần sắp
  xếp. Bóng mềm dưới chân. Dùng lại cách chiếu sáng của `Stage.tsx` cũ (chép sang,
  không import để app cũ độc lập).
* **Trình chiếu (phím F):** toàn màn hình, góc khán giả, ẩn mọi bảng, chỉ còn
  thanh phát tự ẩn.

### 5.8 Nạp tư liệu

* Kéo thả hoặc chọn tệp. Một cặp `x.card.mp4` + `x.card.json` thành một vũ công.
  Một mp4 lẻ không có json thì nạp như video thường (`stacked: false`,
  `offsetSec: 0`) để thử nhanh.
* Một tệp âm thanh thành bài nhạc (thay bài cũ thì hỏi xác nhận).
* `alignConfident: false` thì hiện chấm cảnh báo cạnh tên vũ công, bảng bên trái
  có thanh trượt chỉnh `offsetSec` từng 0.01 s.

### 5.9 Lưu và hoàn tác

* IndexedDB tên `choreo-stage`, hai kho: `media` (blob theo id) và `project` (một
  bản ghi). Tự lưu sau 500 ms kể từ thay đổi cuối; góc trên hiện "Đang lưu…" hoặc
  "Đã lưu".
* Lịch sử hoàn tác: chụp `{dancers, formations}` mỗi khi một thao tác kết thúc
  (thả chuột, bấm nút), tối đa 100 bước. Ctrl+Z hoàn tác, Ctrl+Y làm lại.
* Nút xuất JSON dự án (không kèm video) để lưu dự phòng.

### 5.10 Phím tắt

Space phát/dừng · ←/→ tua 0.1 s (Shift: 1 s) · [ ] khối trước/sau · Tab đổi góc
nhìn · Ctrl+Z / Ctrl+Y · Delete xoá khối đang chọn · F trình chiếu. Bỏ qua khi con
trỏ đang ở ô nhập.

## 6. Xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Thiếu onnxruntime hoặc file mô hình | CLI báo rõ lệnh cài và đường dẫn mô hình, thoát mã 2 |
| Video không có tiếng | Bỏ khớp nhạc, `offsetSec: 0`, `alignConfident: false` |
| Không tìm thấy người (alpha rỗng) | Báo lỗi cho video đó, xử lý tiếp video khác |
| Chrome không giải mã được tệp | Thẻ báo "Không phát được tệp này", không làm sập app |
| IndexedDB đầy hoặc bị chặn | Hiện "Không lưu được", app vẫn chạy, gợi ý xuất JSON |
| Dự án có `version` lạ | Từ chối nạp, giữ dự án hiện tại |

## 7. Kiểm thử

* **pytest** (`tests/test_videocard_align.py`, `tests/test_videocard_crop.py`):
  khớp nhạc trên tín hiệu tổng hợp (chuỗi xung có độ lệch biết trước, dương, âm,
  có nhiễu, khác tần số lấy mẫu; sai số dưới 20 ms) và cờ tin cậy thấp khi tín
  hiệu tuần hoàn đều; khung bao trên mặt nạ tổng hợp, lề và làm tròn chẵn. Phần
  matting chỉ test khi có onnxruntime (bỏ qua có điều kiện).
* **vitest** (thêm làm devDependency của `web/`): `poseAt` (trước, trong, giữa,
  sau, smoothstep đối xứng), các hàm sửa đội hình giữ đủ ba bất biến, `videoTarget`.
* **Thử thật trên Chrome:** 8 thẻ cùng phát, đo khung hình mỗi giây (mục tiêu từ
  30 trở lên trên laptop này), lệch hình và tiếng sau 3 phút không quá 0.1 s.
* Toàn bộ pytest cũ vẫn xanh; `/3d.html` vẫn chạy như trước.

## 8. Rủi ro

* **Trang phục truyền thống và đạo cụ** (quạt, nón, tà áo dài): RVM có thể cắt hụt.
  Giảm thiểu: thử sớm với một video thật trước khi quay cả nhóm; nếu hụt nhiều thì
  hạ ngưỡng alpha hoặc dùng video thường (`stacked: false`).
* **Thời gian xoá phông trên CPU:** 10 người có thể mất 1 đến 2 giờ; chạy qua đêm
  được, hoặc dùng lại cách thuê GPU đã có trong runbook GCP.
* **Khớp nhạc sai do tiếng ồn phòng tập:** có cờ tin cậy và thanh chỉnh tay.

## 9. Thứ tự làm

1. Công cụ Python: khớp nhạc và cắt khung kèm test, rồi matting và CLI.
2. Khung app mới, tách `/3d.html`, nạp thẻ, góc khán giả, phát đồng bộ.
3. Góc từ trên, dải thời gian, sửa đội hình.
4. Lưu IndexedDB, hoàn tác.
5. Trình chiếu, phím tắt, vòng lặp A–B.
6. Nếu còn thời gian: xuất video (ghi canvas kèm tiếng nhạc qua MediaRecorder).
