# Hướng dẫn: Sân khấu thẻ video

Ứng dụng xếp đội hình cho tiết mục văn nghệ. Mỗi người được quay riêng một video,
xoá phông, rồi thành một "thẻ" đứng trên sân khấu ảo. Bạn kéo thẻ vào chỗ đứng cho
từng đội hình; khi phát nhạc, các thẻ tự trượt giữa các đội hình đúng theo nhạc,
và video trong thẻ múa khớp với nhạc.

Có hai phần:

1. **Công cụ tạo thẻ** (Python, chạy một lần trên máy tính): video gốc thành thẻ đã xoá phông, đã khớp nhạc.
2. **App sân khấu** (chạy trong Chrome): nạp thẻ và nhạc, xếp đội hình, trình chiếu để tập.

Không có thẻ vẫn dùng được app: thả thẳng video gốc vào (thẻ hiện cả nền), hoặc
thêm người giữ chỗ chưa có video để xếp đội hình trước.

---

## 1. Quay video

* **Mỗi video một người.** Tên tệp nên là tên người đó (`lan.mp4`, `mai.mp4`): tên này thành tên vũ công trong app.
* **Điện thoại đứng yên** (kê hoặc dùng chân máy), quay dọc, thấy **trọn người từ đầu tới chân**, chừa khoảng trống trên đầu và dưới chân.
* **Nền đơn giản**, khác màu áo; đủ sáng, tránh ngược sáng. Không để người khác đi ngang khung hình.
* **Bật nhạc thành tiếng khi quay** (loa ngoài). Công cụ nghe tiếng nhạc trong video để tự khớp với tệp nhạc gốc. Nếu không tiện bật nhạc, vỗ tay một cái thật rõ ngay đầu bài để dễ căn tay.
* Quay từ đầu bài (hoặc từ đoạn người đó xuất hiện) và quay dư một chút ở hai đầu.
* Định dạng nào điện thoại ra cũng được (MP4, MOV); công cụ mã hoá lại cho Chrome.

## 2. Tạo thẻ video (một lần)

### Cài đặt

Cần Python 3.10 trở lên. Trong thư mục `D:\bien`:

```bash
pip install numpy onnxruntime imageio-ffmpeg
```

* `imageio-ffmpeg` mang sẵn ffmpeg, không cần cài riêng (hoặc đặt biến môi trường `CHOREO_FFMPEG` trỏ tới `ffmpeg.exe` có sẵn).
* `onnxruntime` chỉ cần khi xoá phông.

Tải mô hình xoá phông RobustVideoMatting (khoảng 15 MB):

<https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx>

rồi đặt vào `D:\bien\models\rvm_mobilenetv3_fp32.onnx` (hoặc chỉ đường dẫn khác bằng `--model`).

### Chạy

```bash
python -m choreo.videocard --music nhac.mp3 --out the lan.mp4 mai.mp4 hoa.mp4
```

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--music tệp` | Nhạc gốc của tiết mục, để tự khớp thời gian từng video. Bỏ đi thì độ lệch bằng 0, căn tay trong app. |
| `--out thư_mục` | Thư mục ra (mặc định `the/`). |
| `--model tệp` | Đường dẫn mô hình `.onnx` (mặc định `models/rvm_mobilenetv3_fp32.onnx`). |
| `--height px` | Chiều cao mỗi nửa thẻ (mặc định 540). Máy yếu hạ xuống 360 cho nhẹ. |
| `--no-matting` | Không xoá phông, chỉ khớp nhạc và mã hoá lại. Không cần onnxruntime và mô hình. |
| `--all-people` | Giữ mọi người trong khung. Mặc định công cụ chỉ giữ **người múa chính** (người lớn nhất ở đầu video, bám theo vị trí và màu trang phục) và xoá bạn bè đứng xem, người đi ngang. |

Mỗi video ra hai tệp trong thư mục `--out`:

* `ten.card.mp4`: video đã xoá phông, cắt sát người (nửa trên là hình, nửa dưới là mặt nạ).
* `ten.card.json`: tên, thời lượng, **độ lệch so với nhạc**.

**Mẹo quay** cho thẻ sạch: người múa đứng gần máy hơn mọi người khác ngay từ giây đầu; người xem đứng xa, đừng đi ngang qua giữa máy và người múa. Lúc người múa đi chồng lên người khác trong khung, mặt nạ dính nhau nên thẻ hiện cả hai trong chốc lát. Quay cố định máy (kê lên bàn) thì vị trí người trong thẻ khớp với chuyển động thật hơn là cầm tay lia theo.

Khi chạy, công cụ in độ tin cậy khớp nhạc. Dòng nào ghi **THẤP** thì nên kiểm lại độ lệch trong app (mục 4). Xoá phông chạy bằng CPU, tốn khoảng vài phút cho mỗi phút video tuỳ máy; một video lỗi không làm dừng các video khác.

## 3. Mở app

```bash
cd web
npm install
npm run dev
```

Mở Chrome tới <http://localhost:5173/>. (App nhân vật 3D cũ vẫn ở <http://localhost:5173/3d.html>.)

Lần đầu mở, màn chào có ba lối vào:

* **Có video rồi:** chọn hoặc thả nhạc và các thẻ.
* **Chưa có video:** nhập số người múa, bấm Bắt đầu để xếp đội hình với người giữ chỗ, gắn video sau.
* **Xem bài mẫu:** sáu người múa quạt, sáu đội hình, dựng ngay trong trình duyệt để thử app.

Sau này muốn làm bài khác thì **Tệp ▸ Bài mới**.

## 4. Dùng app

### Bố cục

* **Thanh trên:** tên bài, menu Tệp, hoàn tác và làm lại, nút phát, đồng hồ và đếm phách (phách / lượt 8), nút bám lưới, chọn chế độ xem, Trình chiếu, Trợ giúp.
* **Cột trái:** thẻ *Vũ công* (nhạc, nhịp, danh sách người) và thẻ *Đội hình*.
* **Giữa:** sân khấu. *Sơ đồ* là nhìn từ trên xuống; *Khán giả* là nhìn từ hàng ghế khán giả; *Cả hai* là hai khung cạnh nhau. Khán giả luôn ở phía dưới sơ đồ.
* **Dưới:** dòng thời gian với sóng nhạc, vạch phách và các khối đội hình.

### Nạp nhạc và thẻ

Kéo thả **cả thư mục `the/` và tệp nhạc** vào cửa sổ app (thả thư mục hay chọn nhiều tệp đều được) (hoặc **Tệp ▸ Nạp video và nhạc…**). App tự đọc `.card.json` để lấy tên, độ lệch và biết thẻ đã xoá phông. Video gốc chưa qua công cụ cũng thả vào được.

### Nhịp

Ở thẻ *Vũ công*, mục Nhạc:

* Gõ số **BPM**, hoặc bấm **Gõ nhịp** theo nhạc 4 đến 8 lần.
* Phát tới đúng phách 1 của lượt đếm 8 đầu tiên rồi bấm **Đặt phách 1**.

Từ đó thanh trên đếm 1 tới 8, dòng thời gian có vạch phách, và mọi thao tác kéo thả bám theo phách khi bật bám lưới (N).

### Khớp video với nhạc

Chọn một vũ công trong danh sách:

* **Tự khớp**: app nghe tiếng trong video và tìm chỗ khớp với nhạc.
* Nút **−0.1, −0.01, +0.01, +0.1** chỉnh độ lệch bằng tay. Mẹo: bật Trình chiếu, nhìn bước chân rơi đúng phách.
* Ô **Video đã xoá phông** phải được tích cho thẻ ra từ công cụ (app tự tích khi có `.card.json`).
* **Cao thẻ** chỉnh chiều cao người trên sân khấu; chấm màu đổi màu nhận diện.

### Nhân bản và múa canon

Một video có thể dùng cho nhiều người trên sân (ví dụ chỉ quay một bạn rồi nhân lên cả nhóm):

* Nút **nhân bản** (biểu tượng hai tờ giấy) ở dòng vũ công thêm một bản sao; **Shift bấm** để hỏi số người. Trong khung chi tiết vũ công có ô **Nhân bản thêm [n] người**.
* Bản sao đứng **cạnh** bản gốc (cách ít nhất 0.8 m) ở mọi đội hình còn chỗ trên sân; bản gốc đang ở cánh gà hoặc sân đã kín thì bản sao vào cánh gà.
* Mỗi bản sao phát video **riêng**, nên chỉnh độ lệch từng người được.
* **Lệch canon**: chọn nhiều người (Shift bấm trong danh sách), ở khung *N người đang chọn* nhập số giây mỗi người (mặc định 1 phách nếu đã đặt nhịp, không thì 0.5 s), bấm **Lệch canon**. Theo thứ tự danh sách, người sau vào trễ hơn người trước đúng khoảng đó, người đầu giữ nguyên độ lệch. Hoàn tác được (Ctrl+Z).

### Đội hình

Mỗi đội hình là một **khối** trên dòng thời gian: trong khối mọi người đứng yên ở vị trí đã xếp; khoảng trống giữa hai khối là lúc **di chuyển**, app tự cho thẻ trượt mượt.

1. Kéo vạch phát tới lúc đội hình mới bắt đầu, bấm **+ Đội hình** (hoặc Enter). Đội hình mới chép vị trí đội hình trước để bạn sửa tiếp. Nếu sau đó còn đội hình khác, khối mới được nhét vào khoảng trống; chỉ khi quá chật app mới dời các khối sau và báo kèm nút Hoàn tác.
2. Kéo người trên sơ đồ tới chỗ mới. Kéo vùng trống để chọn nhiều người; Shift bấm để thêm bớt.
3. Kéo **mép khối** để đổi lúc bắt đầu, kết thúc; kéo **giữa khối** để dời cả khối. Khoảng giữa hai khối càng dài thì đi càng chậm.
4. Trong thẻ *Đội hình*: đổi tên, ghi chú, **Lật** trái phải, **Dàn đều**, đưa người vào **Cánh trái** hoặc **Cánh phải** (hai dải mờ hai bên sân khấu là cánh gà, người ở đó coi như chưa ra sân).
5. **Tự chia đội hình** (thẻ *Đội hình*): chọn **Mỗi … lượt 8** hoặc **Số đội hình**, bấm **Tạo**. App thay toàn bộ đội hình bằng một chuỗi hình xoay vòng (hàng ngang, chữ V, vòng tròn, hai hàng, đường chéo, so le, vòng cung) cho cả bài:
   * Có nhịp thì mỗi khối bắt đầu và kết thúc đúng vạch lượt 8, mọi người tới đội hình mới đúng phách 1; chưa đặt nhịp thì chia theo mốc 4 s.
   * Khoảng chuyển ít nhất 1 lượt 8 (hoặc 2 s), tự giãn khi phải đi xa để không ai chạy quá 1.5 m/s.
   * Người được gán vào chỗ gần nhất của hình sau để ít đi chéo nhau; nếu vẫn có hai người sát nhau dưới 0.5 m khi chuyển, app thử đổi chỗ, lật hình hoặc đổi sang hình khác. Không ai bị xếp vào cánh gà.
   * Đã thả nhạc thì điểm đổi đội hình được dời tới vạch lượt 8 gần chỗ nhạc đổi mạnh nhất (vào điệp khúc, nhạc to lên hay lắng xuống).
   * Đã có sẵn nhiều đội hình thì app vẫn thay và báo cảnh báo: bấm **Hoàn tác** hoặc **Ctrl Z** để lấy lại. Đây là bản nháp để sửa tiếp bằng tay.

### Trình chiếu để tập

Bấm **Trình chiếu** (F): toàn màn hình góc khán giả, có tên đội hình và đếm phách cỡ lớn. Chiếu lên tivi hoặc máy chiếu cho cả đội nhìn theo. Space phát, dừng; mũi tên hoặc PageUp, PageDown nhảy đội hình; Esc thoát.

### Lưu

* App **tự lưu** trong trình duyệt (góc trên ghi "Đã lưu").
* **Ctrl S** lưu ngay vào trình duyệt và ghi tệp dự án `ten-bai.choreo.json`. Chrome, Edge hỏi chỗ lưu ở lần đầu, các lần sau ghi đè im lặng vào đúng tệp đó ("Đã lưu vào …"). Trình duyệt khác thì tải xuống một lần; các lần Ctrl S sau chỉ lưu trong trình duyệt. **Tệp ▸ Lưu thành tệp khác…** để chọn tệp mới.
* Tệp `.choreo.json` chỉ chứa đội hình và thông tin, **không chứa video**. Muốn chép sang máy khác cho đủ cả nhạc và video: **Tệp ▸ Đóng gói cả video (.zip)…** ra một tệp `.zip` duy nhất (tối đa 4 GB).
* Mở trên máy mới: **Tệp ▸ Mở…** chọn tệp `.zip` (hoặc kéo thả tệp `.zip` vào cửa sổ), **không cần giải nén**. App chép video vào trình duyệt rồi mở bài; bấm Hoàn tác (Ctrl Z) nếu lỡ tay. Mở tệp `.choreo.json` thì thả lại thư mục thẻ và nhạc, app tự gắn theo tên tệp.
* **Tệp ▸ In tờ đội hình…**: in (hoặc lưu PDF) mỗi trang A4 hai đội hình, sơ đồ nhìn từ trên có tên từng người, mũi tên từ chỗ đứng trước, và bảng vị trí từng người. Phát cho cả đội.
* **Tệp ▸ Xuất video…**: ghi video `.mp4` (hoặc `.webm` nếu trình duyệt không ghi được MP4) kèm nhạc, góc khán giả 3D hoặc sơ đồ từ trên. Sơ đồ có thể tô đậm một người ("video riêng cho Lan") để gửi riêng. Video ghi theo thời gian thật: bài dài 3 phút thì mất 3 phút, phải **giữ tab mở**, chuyển tab là dừng. Esc hoặc Hủy để dừng.

## 5. Phím tắt

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| Home | Về đầu bài |
| ← → | Không chọn ai: lùi, tới một phách (Shift: một lượt 8). Đang chọn: dịch người 0,25 m (Shift: 1 m) |
| ↑ ↓ | Dịch người đang chọn lên, xuống |
| Enter hoặc + | Thêm đội hình sau vạch phát |
| Delete | Xoá khối đội hình đang chọn |
| [ ] | Nhảy tới đội hình trước, sau |
| Esc | Bỏ chọn |
| Ctrl A | Chọn tất cả |
| M | Lật trái phải người đang chọn |
| N | Bật, tắt bám lưới và phách |
| L | Lặp đoạn chuyển vào đội hình đang chọn (tập đi tập lại một chỗ di chuyển) |
| V | Đổi chế độ xem |
| Shift Z | Vừa khung sơ đồ |
| F | Trình chiếu |
| Ctrl Z, Ctrl Y | Hoàn tác, làm lại |
| Ctrl S | Lưu ngay (trình duyệt và tệp `.choreo.json`) |
| ? | Bảng phím tắt |

## 6. Gỡ rối

* **Thẻ đen hoặc trống:** bấm phát một lần (Chrome cần thao tác của người dùng trước khi phát video), hoặc tải lại trang.
* **Thẻ hiện cả nền:** video chưa qua xoá phông, hoặc chưa tích ô "Video đã xoá phông".
* **Thẻ có viền xám nửa dưới:** ngược lại, đang tích ô đó cho một video thường; bỏ tích.
* **Video lệch nhạc:** bấm Tự khớp; nếu vẫn lệch thì chỉnh tay bằng nút ±0.1 / ±0.01.
* **Công cụ báo thiếu ffmpeg, onnxruntime hoặc mô hình:** làm đúng câu lệnh nó in ra (mục 2).
