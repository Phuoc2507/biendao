# Sân khấu thẻ video: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng app Chrome xếp đội hình bằng thẻ video đã xoá phông, thẻ tự trượt khớp nhạc, cùng công cụ Python tạo thẻ.

**Architecture:** Hai phần độc lập nối nhau bằng cặp file `x.card.mp4` + `x.card.json`. Phần Python (`choreo/videocard/`) có lõi thuần numpy (khớp nhạc, khung bao) test bằng pytest, phần nặng (onnxruntime, ffmpeg) import có bảo vệ. Phần web (`web/src/stage/`) có lõi thuần TypeScript không import gì (`model.ts`, `timing.ts`) test bằng `node --test` (Node 24 chạy thẳng `.ts`, không cần tải thêm thư viện), giao diện React + R3F + zustand.

**Tech Stack:** Python 3.10, numpy, pytest; React 18, @react-three/fiber 8, drei 9, three 0.169, zustand 4, Vite 5, TypeScript 5, Node 24 test runner.

**Ràng buộc môi trường (kiểm tra 2026-10-09):** máy chưa có ffmpeg, onnxruntime, imageio-ffmpeg; không tải gì khi chưa được người dùng cho phép. Vì vậy phần chạy thật của công cụ Python chỉ kiểm được sau khi người dùng cài; app web phải tự thử được bằng **vũ công mẫu tạo ngay trong trình duyệt** (canvas + MediaRecorder + OfflineAudioContext), cũng là trạng thái "dùng thử" cho người mới mở app.

---

## Cấu trúc file

```
choreo/videocard/__init__.py      gói, không import nặng
choreo/videocard/align.py         onset_envelope, estimate_offset -> (offset_sec, confidence)
choreo/videocard/crop.py          BBoxAccumulator, padded_crop
choreo/videocard/ffio.py          tìm ffmpeg, đọc khung, tách tiếng, ghi video
choreo/videocard/matting.py       RVMSession (onnxruntime, giữ trạng thái hồi quy)
choreo/videocard/cli.py           main(argv)
choreo/videocard/__main__.py      python -m choreo.videocard
tests/test_videocard_align.py
tests/test_videocard_crop.py
tests/test_videocard_cli.py       chỉ phần không cần ffmpeg (thiếu phụ thuộc -> mã 2)

web/index.html                    -> src/stage/main.tsx (app mới)
web/3d.html                       -> src/main.tsx (app cũ, nguyên vẹn)
web/vite.config.ts                multi-page
web/src/stage/model.ts            kiểu + hàm thuần đội hình (không import)
web/src/stage/model.test.ts
web/src/stage/timing.ts           videoTarget, snap, định dạng thời gian (không import)
web/src/stage/timing.test.ts
web/src/stage/store.ts            zustand: project, ui, history
web/src/stage/db.ts               IndexedDB
web/src/stage/media.ts            registry phần tử video/audio, nạp tệp, sóng âm
web/src/stage/clock.ts            đồng hồ nhạc + đồng bộ video
web/src/stage/demo.ts             tạo vũ công mẫu và nhạc mẫu
web/src/stage/App.tsx, main.tsx, stage.css
web/src/stage/components/StageView.tsx, PlanLayer.tsx, CardLayer.tsx,
  StageFloor.tsx, Timeline.tsx, DancerList.tsx, Toolbar.tsx, EmptyState.tsx
```

## Task 1: Khớp nhạc (`align.py`), TDD

**Files:** Create `choreo/videocard/__init__.py`, `choreo/videocard/align.py`; Test `tests/test_videocard_align.py`.

API:
```python
FRAME_RATE = 100  # khung đường bao mỗi giây
def resample_linear(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray
def onset_envelope(x: np.ndarray, sr: int) -> np.ndarray      # độ dài ~ len(x)/sr*100
def estimate_offset(video_audio, sr_v, music, sr_m) -> tuple[float, float]
# trả (offset_sec, confidence). offset_sec = thời điểm trong nhạc khi video bắt đầu.
```

Test cases (tín hiệu tổng hợp: chuỗi "tiếng gõ" có khoảng cách ngẫu nhiên, tạo bằng seed cố định):
- [ ] video là đoạn nhạc cắt từ giây 3.27 → offset ≈ 3.27 (sai < 0.02).
- [ ] video có 1.5 s im lặng/ồn trước khi nhạc bắt đầu → offset ≈ −1.5.
- [ ] thêm nhiễu trắng SNR 0 dB và nhân biên độ 0.3 → vẫn đúng < 0.02.
- [ ] tần số lấy mẫu khác nhau (video 44100, nhạc 48000) → vẫn đúng.
- [ ] nhạc tuần hoàn đều tuyệt đối (metronome) → confidence < 1.5.
- [ ] tín hiệu ngẫu nhiên → confidence ≥ 1.5.
- [ ] Chạy `.venv/Scripts/python -m pytest tests/test_videocard_align.py -q` thấy FAIL, viết code, thấy PASS, commit.

Thuật toán: mono, đổi về 8000 Hz, STFT cửa sổ 512 bước 80 (100 khung/s), log(1+|X|), flux = tổng phần dương của sai phân theo tần số, trừ trung bình trượt 0.5 s, kẹp ≥ 0, chuẩn hoá z. Tương quan chéo đầy đủ bằng rfft (độ dài đệm luỹ thừa 2). Độ trễ ở đỉnh, tinh chỉnh dưới khung bằng nội suy parabol. Confidence = đỉnh 1 / đỉnh 2 ngoài ±0.5 s.

## Task 2: Khung bao (`crop.py`), TDD

API:
```python
class BBoxAccumulator:
    def __init__(self, thresh: float = 0.5): ...
    def add(self, alpha: np.ndarray) -> None     # alpha HxW float 0..1
    @property
    def bbox(self) -> tuple[int, int, int, int] | None  # x0, y0, x1, y1 (x1, y1 loại trừ)
def padded_crop(bbox, w, h, side=0.04, top=0.04, bottom=0.01) -> tuple[int, int, int, int]
# trả (x, y, cw, ch) chẵn, nằm trong ảnh; lề tính theo chiều cao bbox
```
Test: một khung có hình chữ nhật, hai khung có hai hình rời nhau (hợp), khung rỗng → None, lề + kẹp mép ảnh, kích thước chẵn. Commit.

## Task 3: ffio, matting, CLI

- `ffio.find_ffmpeg()`: biến môi trường `CHOREO_FFMPEG`, rồi `shutil.which("ffmpeg")`, rồi `imageio_ffmpeg.get_ffmpeg_exe()`; không có thì `None`.
- `ffio.probe(path)` đọc kích thước, fps, thời lượng từ stderr của `ffmpeg -i`.
- `ffio.read_audio(path, sr=8000)` → `ffmpeg -i x -ac 1 -ar 8000 -f f32le -` ; không có tiếng → `None`.
- `ffio.frames(path, w, h)` đọc rawvideo rgb24 theo khung qua pipe.
- `ffio.Writer(path, w, h, fps, crf)` ghi rawvideo rgb24 qua pipe ra H.264 yuv420p.
- `matting.RVMSession(model_path)`: onnxruntime CPU, đầu vào `src` float32 NCHW 0..1, `r1i..r4i`, `downsample_ratio`; trả `fgr`, `pha`.
- `cli.main(argv)`: `--music`, `--out`, `--model` (mặc định `models/rvm_mobilenetv3_fp32.onnx`), `--height 540`, danh sách video. Thiếu phụ thuộc → in hướng dẫn, trả 2. Mỗi video: khớp nhạc, lượt 1 matting ghi `tmp_rgb.mp4` + `tmp_a.mp4` (crf 12) và gom bbox, lượt 2 ffmpeg `crop,scale=-2:H` cho cả hai rồi `vstack`, ghi json. Lỗi một video không dừng video khác.
- Test `tests/test_videocard_cli.py`: thiếu ffmpeg/onnxruntime (monkeypatch `find_ffmpeg` trả None) → mã 2 và thông báo có chữ `pip install`; `card_meta(...)` tạo đúng khoá json. Commit.

## Task 4: Khung app mới, tách trang 3D cũ

- `web/3d.html` (chép index cũ, sửa tiêu đề), `web/index.html` trỏ `src/stage/main.tsx`.
- `vite.config.ts`: `build.rollupOptions.input = { main: index.html, legacy: 3d.html }`. Xoá `web/vite.config.js` cũ (tạo bởi `tsc -b`, gitignore, Vite ưu tiên file .js).
- `tsconfig.json`: `exclude: ["src/**/*.test.ts"]`.
- `package.json`: `"test": "node --test src/stage/"`.
- Kiểm: `npm run build` xanh, `/3d.html` hiện app cũ. Commit.

## Task 5: Lõi thuần `model.ts`, `timing.ts`, TDD bằng node --test

`model.ts`:
```ts
export type Vec2 = [number, number];
export interface VDancer { id; name; color; mediaId; stacked; offsetSec; durationSec; aspect; cardHeight; hidden; alignConfident }
export interface Formation { id: string; start: number; end: number; pos: Record<string, Vec2> }
export interface StageSize { width: number; depth: number }
export interface Project { version: 1; stage: StageSize; musicId: string | null; musicName: string; bpm: number | null; dancers: VDancer[]; formations: Formation[] }
export const smoothstep: (u: number) => number
export function lineup(ids: string[], stage: StageSize): Record<string, Vec2>
export function holdIndexAt(fs: Formation[], t: number): number           // -1 nếu ở chỗ trống
export function poseAt(fs: Formation[], id: string, t: number): Vec2 | null
export function posesAt(fs, ids, t, stage): Record<string, Vec2>         // dùng lineup khi chưa có đội hình
export function clampToStage(p: Vec2, stage): Vec2
export function snapPos(p: Vec2, step: number): Vec2
export function moveDancers(fs, t, ids, delta, ...): { formations; createdId | null }  // sửa khối ở t hoặc tạo khối mới tại t
export function addFormationAfter(fs, t, ids, stage, newId): { formations; jumpTo: number }
export function setBlockTimes(fs, id, start, end, minLen = 0.2): Formation[]          // kẹp không vượt khối bên
export function moveBlock(fs, id, newStart): Formation[]
export function deleteFormation(fs, id): Formation[]
export function addDancerToAll(fs, id, stage): Formation[]   // chỗ trống gần cánh trái
export function removeDancerFromAll(fs, id): Formation[]
export function checkInvariants(p: Project): string[]       // rỗng là hợp lệ
```
`timing.ts`: `videoTarget(tMusic, offsetSec, durationSec) -> { time, inRange }`, `snapTime(t, bpm, step=0.1)`, `fmtTime(t) -> "m:ss.d"`, `beatCount(t, bpm, firstBeat=0) -> 1..8`.

Test (mỗi mục một `test()`): poseAt trước/trong/giữa/sau; giữa khoảng trống đúng nửa đường khi u = 0.5; smoothstep(0)=0, (1)=1, đối xứng; moveDancers trong khối sửa đúng khối; ở chỗ trống tạo khối mới dài ≤ 1 s không đè khối sau; addFormationAfter dời khối sau khi chật; setBlockTimes kẹp; addDancerToAll và removeDancerFromAll giữ bất biến; videoTarget kẹp hai đầu. Chạy `npm test` FAIL → code → PASS → commit.

## Task 6: store, db, media, clock, demo

- `store.ts`: `project`, `ui { view: 'plan'|'audience', selected: string[], selectedBlock: string|null, pathMode: 'all'|'selected'|'off', speed, loop {a,b,on}, presenting, saveState }`, `time`, `playing`; hành động `commit(mutator)` ghi lịch sử (tối đa 100) sau mỗi thao tác hoàn tất, `beginGesture/endGesture` để kéo nhiều khung chỉ tính một bước, `undo/redo`.
- `db.ts`: `openDB`, `putMedia(id, blob)`, `getMedia(id)`, `deleteMedia(id)`, `saveProject(p)`, `loadProject()`.
- `media.ts`: `registerVideo(id, blob)` tạo `<video muted playsInline preload=auto>`; `getVideo(id)`; `setMusic(blob)`; `peaks(audioBuffer, n)`; `importFiles(FileList)` ghép cặp `.card.mp4`/`.card.json` theo tên gốc.
- `clock.ts`: `useClock()` một vòng rAF duy nhất: đang phát thì `time = audio.currentTime` (không nhạc thì đồng hồ performance.now), áp vòng lặp A–B, đồng bộ từng video theo `videoTarget`, ngưỡng lệch 0.08 s; `seek(t)`, `play()`, `pause()`, `setSpeed(r)`.
- `demo.ts`: `makeDemoMusic(sec, bpm)` → WAV blob (kick + hi-hat + hợp âm đơn giản qua OfflineAudioContext); `makeDemoCard(name, color, sec)` → vẽ hình người que phong cách hoá lên canvas xếp chồng (nửa trên màu, nửa dưới mặt nạ trắng), ghi bằng MediaRecorder (mp4 nếu hỗ trợ, nếu không webm); chạy song song.

## Task 7: Giao diện

- `StageView`: Canvas, camera trực giao (plan) hoặc phối cảnh (audience) theo `ui.view`, OrbitControls giới hạn ở audience.
- `StageFloor`: sàn kích thước sân khấu, lưới 0.5 m/1 m, mép trước vàng, số 0, 2, 4… hai bên, đường tâm, chữ KHÁN GIẢ.
- `PlanLayer`: chấm màu + chữ cái, vòng nét đứt đội hình trước, đường đi; kéo bằng sự kiện con trỏ trên mặt sàn vô hình; Shift chọn nhiều; Alt tự do; khung chọn chữ nhật khi kéo vùng trống.
- `CardLayer`: shader xếp chồng (`stacked`) hoặc thường, `alphaTest 0.5`, đáy chạm sàn, bóng mềm hình đĩa, tên nhỏ dưới chân khi chọn.
- `Timeline`: canvas vẽ sóng âm, khối đứng (màu theo thứ tự, số thứ tự đội hình), khối trượt gạch chéo ghi thời lượng, nhịp đếm 1–8 khi có BPM, vạch đỏ; kéo mép/giữa khối, kéo vạch, cuộn ngang bằng con lăn + Shift, phóng to Ctrl + con lăn.
- `DancerList`: thẻ tên, màu, ẩn/hiện, chỉnh offset (thanh trượt ±5 s và nút ±0.05), chiều cao thẻ, xoá; chấm cảnh báo khi `alignConfident=false`.
- `Toolbar`: phát/dừng, thời gian, tốc độ, A/B/lặp, Tab góc nhìn, nút "+ Đội hình", hoàn tác/làm lại, trạng thái lưu, menu (nhập tệp, xuất JSON, kích thước sân khấu, BPM, xoá dự án).
- `EmptyState`: kéo thả tệp hoặc "Dùng thử với vũ công mẫu"; hướng dẫn 3 bước.
- Trình chiếu: Fullscreen API, ẩn bảng, thanh phát tự ẩn sau 2 s.

## Task 8: Kiểm trong trình duyệt

- [ ] `npm run dev`, mở `/`, bấm dùng thử, kiểm đọc console không lỗi.
- [ ] Kéo chấm, tạo 3 đội hình, phát, thấy thẻ trượt; đo FPS bằng `requestAnimationFrame` trong 5 s với 8 thẻ.
- [ ] Tải lại trang: dự án còn nguyên (IndexedDB).
- [ ] Ctrl+Z, Ctrl+Y; F trình chiếu; `/3d.html` vẫn chạy.
- [ ] Chụp màn hình gửi người dùng.

## Task 9: Hướng dẫn sử dụng

`docs/huong-dan-san-khau-the-video.md`: cách quay (đứng yên chỗ, điện thoại dựng đứng, nền trơn, bật nhạc to), lệnh cài và tạo thẻ, cách dùng app, phím tắt.
