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
* Máy có card đồ hoạ (ví dụ RTX 5060) thì thay `onnxruntime` bằng `onnxruntime-directml` (`pip uninstall onnxruntime` rồi `pip install onnxruntime-directml`) để xoá phông nhanh hơn nhiều. Công cụ tự dùng card và in ra dòng "xoá phông chạy trên: card đồ hoạ". Không cài thì vẫn chạy CPU như cũ.

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
| `--fixed-crop` | Một khung cắt cố định cả video (hợp vùng người qua mọi khung) — hợp với máy đặt chân máy đứng yên. Mặc định công cụ **cắt bám theo người từng khung** (kích thước thẻ vẫn cố định, chân giữ gần đáy thẻ) nên video cầm tay lia theo người vẫn cho vũ công to, nằm giữa thẻ. |

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

Nạp nhạc trước thì màn chào ghi tên bài nhạc, độ dài và nhịp, rồi nhắc bước tiếp theo là thả video từng người. Bài và video lưu ngay trong trình duyệt, không tải lên mạng; app xin trình duyệt giữ dữ liệu lâu dài để khỏi bị tự xoá khi máy đầy.

Sau này muốn làm bài khác thì **Tệp ▸ Bài mới**.

### Cài lên điện thoại, dùng trong phòng tập không có mạng

Bản build của app là một ứng dụng web cài được (PWA): mở được một lần khi có mạng thì app tự cất trang và mã chạy vào máy, lần sau mất wifi vẫn mở bình thường. Video và nhạc của bài vốn đã nằm trong trình duyệt nên không phải tải lại; app không cất thêm bản video nào.

1. Trên máy tính, trong thư mục `web`, dựng bản build rồi mở cho các máy trong cùng mạng LAN:

   ```bash
   npm run build
   npm run preview -- --host
   ```

   Màn hình in ra địa chỉ dạng `http://192.168.1.5:4173/`.
2. Trình duyệt chỉ cho chạy không cần mạng trên **https** hoặc **localhost**, nên địa chỉ `http://192.168.x.x` của LAN cần một trong các cách sau:
   * **Android, cắm cáp USB (dễ nhất):** bật Gỡ lỗi USB trên điện thoại, trên máy tính chạy `adb reverse tcp:4173 tcp:4173`, rồi trên điện thoại mở Chrome tới `http://localhost:4173/`.
   * **Android, qua wifi:** mở `chrome://flags`, tìm *Insecure origins treated as secure*, gõ đúng địa chỉ LAN (vd. `http://192.168.1.5:4173`), chọn Enabled rồi khởi động lại Chrome.
   * **iPhone, iPad:** Safari bắt buộc https có chứng chỉ hợp lệ. Cần đưa thư mục `web/dist` lên một chỗ có https (trang tĩnh bất kỳ) và mở từ đó một lần; sau đó dùng không cần mạng được.
3. Mở địa chỉ trên, chờ app hiện xong (lúc này app cất mọi thứ cần thiết). Rồi cài:
   * Chrome Android: menu ⋮ ▸ **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).
   * Safari iPhone: nút Chia sẻ ▸ **Thêm vào MH chính**.
4. Biểu tượng *Sân khấu* hiện trên màn hình chính, mở ra toàn màn hình như app thường. Thử tắt wifi rồi mở lại để chắc chắn.

Lưu ý:

* Bài lưu theo **địa chỉ** đã mở: `localhost:4173` và `192.168.1.5:4173` là hai chỗ lưu khác nhau. Luôn mở cùng một địa chỉ (cài từ biểu tượng là chắc nhất); muốn chuyển bài giữa hai chỗ thì dùng **Đóng gói** rồi Mở gói.
* Khi có bản build mới và máy đang có mạng, app báo **Có bản mới của app** kèm nút **Tải lại**. Bài đã tự lưu nên bấm Tải lại không mất gì; chưa bấm thì app cứ dùng bản cũ.
* Lúc chạy `npm run dev` app không cài phần chạy không mạng, để khỏi lẫn với nạp lại nóng khi sửa mã.

## 4. Dùng app

### Bố cục

* **Thanh trên:** nút ẩn hiện cột trái, tên bài, ô lưu, menu Tệp, hoàn tác và làm lại, nút phát, đồng hồ và đếm phách (phách / lượt 8), nút bám lưới, chọn chế độ xem, Trình chiếu, Trợ giúp. Cửa sổ hẹp thì chữ trên nút tự ẩn, chỉ còn biểu tượng (rê chuột để xem tên); xoá trắng tên bài thì app trả lại tên cũ.
* **Cột trái:** thẻ *Vũ công* (nhạc, nhịp, danh sách người) và thẻ *Đội hình*. Bấm nút ở góc trái thanh trên để ẩn hoặc hiện; app nhớ lựa chọn cho lần mở sau.
* **Giữa:** sân khấu. *Sơ đồ* là nhìn từ trên xuống; *Khán giả* là nhìn từ hàng ghế khán giả; *Cả hai* là hai khung cạnh nhau, vùng giữa cao mà hẹp (ví dụ cửa sổ chia đôi màn hình) thì tự xếp trên dưới. Khán giả ở phía dưới sơ đồ; nút **Từ sân khấu** (phím **O**) xoay sơ đồ để khán giả ở trên, trái phải đúng như người múa đứng trên sân nhìn ra.
* **Điện thoại:** thanh trên tách hai hàng (tên bài và tệp ở trên, phát và chế độ xem ở dưới); cột trái thành ngăn kéo, bấm nút góc trái để mở, chạm ra ngoài để đóng. Menu hiện từ đáy màn hình cho dễ bấm.
* **Dưới:** dòng thời gian với sóng nhạc, vạch phách và các khối đội hình.

### Nạp nhạc và thẻ

Kéo thả **cả thư mục `the/` và tệp nhạc** vào cửa sổ app (thả thư mục hay chọn nhiều tệp đều được) (hoặc **Tệp ▸ Nạp video và nhạc…**). App tự đọc `.card.json` để lấy tên, độ lệch và biết thẻ đã xoá phông. Video gốc chưa qua công cụ cũng thả vào được.

* Cả lượt thả là **một bước hoàn tác** (Ctrl Z bỏ hết), xong app báo một dòng tổng kết.
* Thả lại đúng tệp đã nạp thì app bỏ qua, không lưu lần hai. Tệp lạ (`.json` không phải thẻ hay dự án, ảnh…) bị bỏ qua kèm thông báo.
* Một video hỏng không chặn các video khác; video đó không được lưu.
* Đang nạp nhiều tệp, bấm **Dừng** trong hộp tiến độ để dừng sau tệp đang làm.

### Nhịp

Ở thẻ *Vũ công*, mục Nhạc:

* Gõ số **BPM** (30 đến 300) rồi bấm Enter, hoặc bấm **Gõ nhịp** theo nhạc 4 đến 8 lần (cả loạt gõ chỉ là một bước Hoàn tác).
* Phát tới đúng phách 1 của lượt đếm 8 đầu tiên rồi bấm **Đặt phách 1**.

Từ đó thanh trên đếm 1 tới 8, dòng thời gian có vạch phách, và mọi thao tác kéo thả bám theo phách khi bật bám lưới (N).

### Mốc đoạn nhạc

Dải **Mốc** nằm ngay dưới thước giờ của dòng thời gian, dùng để đặt tên các đoạn của bài ("Nhạc dạo", "Điệp khúc", "Đoạn rap"). Bấm **B** hoặc nút **+** để thêm mốc ở vạch phát; bấm đúp chỗ trống trên dải cũng được. Bấm vào nhãn để tua tới đó, bấm đúp để đổi tên, kéo để dời (bám phách khi bật bám lưới), bấm chuột phải hoặc nút × để xoá. **Shift [** và **Shift ]** nhảy tới mốc trước, sau, kể cả khi trình chiếu. Nút **Gợi ý mốc từ nhạc** (biểu tượng cạnh nút +) tìm chỗ nhạc đổi mạnh, có BPM thì đặt đúng vạch lượt 8, rồi thêm các mốc "Đoạn 1", "Đoạn 2"... ở chỗ chưa có mốc gần đó; mốc bạn đã đặt không bị ghi đè. Tên đoạn đang phát hiện ở đầu màn trình chiếu và trong dòng giờ của ảnh vị trí từng người.

### Khớp video với nhạc

Chọn một vũ công trong danh sách:

* **Tự khớp**: app nghe tiếng trong video và tìm chỗ khớp với nhạc.
* **Khớp tất cả** (cạnh tiêu đề danh sách vũ công): khớp lại những người còn dấu ⚠; không ai có dấu ⚠ thì khớp lại hết. Bản nhân bản cùng video giữ nguyên khoảng lệch canon.
* Thẻ có `.card.json` dùng luôn độ lệch trong đó, không phải nghe lại. Thay video bằng đúng tệp cũ thì giữ độ lệch đã căn.
* Đổi bài nhạc: app tự khớp lại những người chưa chắc; người đã căn tay hoặc đã khớp chắc thì giữ.
* Video quá lớn (trên 400 MB) hoặc không có tiếng thì app không tự khớp, hãy căn tay.
* Nút **−0,1, −0,01, +0,01, +0,1** chỉnh độ lệch bằng tay. Mẹo: bật Trình chiếu, nhìn bước chân rơi đúng phách.
* Ô **Thẻ đã tách nền (tệp .card.mp4)** phải được tích cho thẻ ra từ công cụ (app tự tích khi có `.card.json`).
* **Cao thẻ** chỉnh chiều cao người trên sân khấu (một lần kéo là một bước Hoàn tác); chấm màu đổi màu nhận diện.
* Các ô số (nhịp, số người nhân bản, giây canon, rộng, sâu sân khấu): gõ xong bấm **Enter** hoặc bấm ra ngoài mới chốt, **Esc** huỷ. Số lẻ gõ `1,5` hay `1.5` đều được; mũi tên lên, xuống đổi số trong ô (Shift: gấp 10) rồi vẫn Enter để chốt.

### Nhóm lưu sẵn

Văn nghệ hay chia nhóm (nam nữ, nhóm múa và nhóm hát, cánh A cánh B). Chọn từ 2 người (Shift bấm hoặc kéo khung) rồi bấm **Lưu nhóm** ở đầu danh sách *Vũ công*, gõ tên. Từ đó chạm **chip nhóm** (chấm màu, tên, số người) là chọn cả nhóm, chạm lần nữa thì bỏ chọn; trên máy tính bấm **Alt 1** đến **Alt 9** cho nhóm thứ 1 đến 9. Mũi tên bên chip mở menu: đổi tên, đổi màu, chỉ giữ người đang chọn, thêm hoặc bớt người đang chọn, xoá nhóm (người vẫn giữ nguyên). Một người ở được nhiều nhóm. Xoá vũ công thì người đó ra khỏi nhóm (nhóm hết người thì mất); nhân bản thì bản sao vào cùng nhóm với bản gốc. Ô **Viền theo nhóm** (thẻ *Đội hình*, mục *Hiển thị*, bật sẵn) vẽ vòng màu nhóm quanh chấm mỗi người trên sơ đồ, ảnh, bản in và video sơ đồ; người ở nhiều nhóm lấy màu nhóm đầu. Nhóm lưu trong tệp dự án.

### Nhân bản và múa canon

Một video có thể dùng cho nhiều người trên sân (ví dụ chỉ quay một bạn rồi nhân lên cả nhóm):

* Nút **nhân bản** (biểu tượng hai tờ giấy) ở dòng vũ công thêm một bản sao; **Shift bấm** để hỏi số người. Trong khung chi tiết vũ công có ô **Nhân bản thêm [n] người**. Nếu bản sao làm sinh thêm cảnh báo lúc chuyển đội hình, thông báo hiện kèm nút **Sửa tất cả** để xếp lại ngay.
* **Người dự bị, thay vai:** chọn một người, trong khung chi tiết mở mục **Người dự bị** và gõ tên (có thể chọn màu riêng) rồi bấm **Thêm dự bị**, tối đa 8 người. Bấm tên một người dự bị là người đó đóng vai trên toàn bài: giữ nguyên chỗ đứng, đường cong, hướng mặt, ghi chú, video; tên trên sơ đồ, ảnh, bản in, *Tôi là ai* đổi theo, ghi kèm "(thay Lan)" nếu bật ô *Ghi "(thay …)"*. Bấm tên người chính để đổi lại; mỗi lần đổi là một bước hoàn tác. Bản in có dòng *Người thay* ở đầu trang; nút *Đổi lại người chính cả đội* trả mọi vai về người chính. Dự án cũ mở ra vẫn y nguyên.
* Bản sao đứng **cạnh** bản gốc (cách ít nhất 0.8 m) ở mọi đội hình còn chỗ trên sân; bản gốc đang ở cánh gà hoặc sân đã kín thì bản sao vào cánh gà.
* Mỗi bản sao phát video **riêng**, nên chỉnh độ lệch từng người được.
* **Canon theo đoạn:** chọn nhiều người (Shift bấm trong danh sách). Ở khung *N người đang chọn: tổ hợp* đặt đoạn **Từ … tới …** (nút **Lấy đoạn hiện tại** lấy vùng lặp nếu có, không thì khối đội hình đang đứng ở vạch phát), chọn **Thứ tự** (trái sang phải, phải sang trái, giữa trước rồi hai bên, hàng đầu trước, theo danh sách) và **Mỗi lượt trễ** (1 phách, 2 phách hoặc tự nhập giây), bấm **Canon đoạn này**. Trong đoạn đó lượt sau đứng chờ rồi múa đúng động tác của mình trễ hơn lượt trước; hết đoạn cả nhóm khớp lại đồng loạt. Người đứng gần như cùng chỗ theo tiêu chí (ví dụ hai bạn đối xứng khi chọn *giữa trước*) vào cùng một lượt. Trên dòng thời gian mỗi đoạn canon có vạch *canon +… s*, phần gạch chéo là lúc đứng chờ. **Bỏ canon** trả đoạn đó về đồng loạt. Dùng được cả với người khác video.
* **Đối xứng hai bên (tổ hợp 3 người):** chọn nhóm rồi bấm **Đối xứng hai bên**: người bên phải giữa nhóm (khán giả nhìn) lật gương, người giữa và bên trái giữ nguyên. Ba bản nhân bản từ một video thành một tổ hợp soi gương; kết hợp canon *giữa trước* thì người giữa vào trước, hai bên vào sau cùng lúc. Từng người cũng có ô **Lật gương** trong khung chi tiết.
* **Canon cả bài:** trong mục gấp *Canon cả bài (lệch video)*, người sau lệch video trễ hơn người trước suốt cả bài (cách cũ). Hoàn tác được tất cả (Ctrl+Z).

### Đội hình

Mỗi đội hình là một **khối** trên dòng thời gian: trong khối mọi người đứng yên ở vị trí đã xếp; khoảng trống giữa hai khối là lúc **di chuyển**, app tự cho thẻ trượt mượt.

1. Kéo vạch phát tới lúc đội hình mới bắt đầu, bấm **+ Đội hình** (hoặc Enter). Đội hình mới chép vị trí đội hình trước để bạn sửa tiếp. Nếu sau đó còn đội hình khác, khối mới được nhét vào khoảng trống; chỉ khi quá chật app mới dời các khối sau và báo kèm nút Hoàn tác.
2. Kéo người trên sơ đồ tới chỗ mới. Kéo vùng trống để chọn nhiều người; Shift bấm để thêm bớt.
3. Kéo **mép khối** để đổi lúc bắt đầu, kết thúc; kéo **giữa khối** để dời cả khối. Khoảng giữa hai khối càng dài thì đi càng chậm.
4. Trong thẻ *Đội hình*: đổi tên, **ghi chú** cho người tập (vd "nhịp 5 quay người"; Enter để chốt, Shift Enter xuống dòng; ghi chú hiện lúc Trình chiếu, trong bản in, trong video sơ đồ xuất ra, và dấu ✎ trên khối ở dòng thời gian), **Lật** trái phải, **Dàn đều**, **Đổi chỗ** (chọn đúng 2 người, hoặc phím X; chỉ ở đội hình này), **Đổi vai cả bài** (Shift X: hai người đổi trọn đường đi cho nhau trên mọi đội hình, gồm chỗ đứng, đường cong, hướng mặt, ghi chú riêng; video, canon, nhóm vẫn theo người, không sinh cảnh báo mới), **Xoay** một phần tư vòng quanh tâm nhóm (phím R, Shift R xoay ngược; hàng ngang thành hàng dọc, quá dài thì tự thu cho vừa sân), **Giãn** hay **Thu** nhóm quanh tâm mỗi lần 15% (giãn dừng ở mép sân, thu không để ai sát nhau dưới nửa mét; chưa chọn ai thì áp cho cả đội đang trên sân), đưa người vào **Cánh trái** hoặc **Cánh phải** (hai dải mờ hai bên sân khấu là cánh gà, người ở đó coi như chưa ra sân).
   * **Ghi chú riêng từng người:** chọn một người, ở cuối khung chi tiết (thẻ *Vũ công*) có ô *Ghi chú riêng ở <tên đội hình>*, gắn với đội hình tại vạch phát (đang chuyển thì đội hình sắp tới). Vd "Lan cầm quạt đỏ", "Mai quỳ xuống nhịp 7". Enter để chốt, xoá hết chữ là bỏ ghi chú, Ctrl Z hoàn tác. Ghi chú hiện ở cuối dòng nhắc *Tôi là ai* lúc Trình chiếu (dấu ✎), trong ô của người đó ở ảnh vị trí từng người, và trong bản in (dưới tên đội hình và trong bảng vị trí). **+ Đội hình** chép luôn ghi chú riêng sang đội hình mới (đạo cụ thường còn cầm tiếp; sửa nếu không đúng); Ctrl C/V chép kèm ghi chú; nhân bản người thì bản sao có cùng ghi chú; xoá người thì xoá ghi chú của người đó. Tối đa 200 ký tự.
   * **Hướng mặt từng người:** mặc định ai cũng nhìn khán giả. Chọn một hay nhiều người rồi bấm phím **Q** (hoặc nút *Quay mặt* trên thanh chọn nổi dưới sơ đồ) để quay 45 độ sang phải của chính người múa, Shift Q (hoặc Shift bấm nút) quay sang trái. Muốn đặt thẳng một hướng thì chọn một người, trong khung chi tiết (thẻ *Vũ công*) có tám nút mũi tên *Hướng mặt ở <tên đội hình>*, mũi tên chỉ đúng chiều như trên sơ đồ. Hướng mặt gắn với đội hình tại vạch phát (đang chuyển thì đội hình sắp tới, giống ghi chú riêng), mỗi lần quay là một bước hoàn tác. Trên sơ đồ, người không nhìn khán giả có một tam giác trắng nhỏ ở mép chấm chỉ phía họ nhìn (người đang chọn thì luôn có tam giác mờ để biết đang quay về đâu); lúc chuyển đội hình tam giác xoay dần theo đường ngắn nhất. Tam giác cũng có trong ảnh gửi nhóm, ảnh vị trí từng người, video sơ đồ và bản in; người quay lưng có thêm chữ *lưng* (bản in ghi *LƯNG*) cạnh chấm cho dễ đọc khi in đen trắng, và bảng vị trí ghi thêm hướng (vd "giữa · quay lưng"). Dòng nhắc *Tôi là ai* lúc Trình chiếu cũng nói "quay lưng", "quay trái", "quay phải", "chéo phải"... khi người đó không nhìn khán giả. **Lật** trái phải thì hướng mặt đổi bên theo (quay phải thành quay trái), **Xoay** nhóm (R) thì ai cũng quay thêm 90 độ cùng chiều; **+ Đội hình**, Ctrl C/V và nhân bản người đều chép hướng mặt theo; **Đổi chỗ** (X) và **Đổi chỗ cho gần** đổi chỗ đứng kèm hướng mặt của chỗ đó (hướng mặt là một phần của hình, vd vòng tròn nhìn vào tâm), ghi chú riêng vẫn theo người.
5. **Hình của tôi** (thẻ *Đội hình*, dưới Xếp nhanh): xếp xong một đội hình ưng ý thì bấm **Lưu hình**, gõ tên (mặc định là tên đội hình tại vạch phát). App lưu **hình dạng** của nhóm đang chọn (chọn từ 2 người; chưa chọn thì cả đội trên sân, không tính người trong cánh gà hay đang ẩn), chỉ nhớ các chỗ so với tâm nhóm, không nhớ ai đứng đâu. Bấm một hình đã lưu để xếp lại như Xếp nhanh: hình đặt quanh tâm nhóm hiện tại (tràn mép thì tự dời vào sân), mỗi người vào chỗ gần mình nhất.
   * Nhóm **đông hơn** số chỗ của hình: những người đứng xa hình nhất giữ nguyên chỗ cũ, thông báo nói rõ mấy người.
   * Nhóm **ít hơn** số chỗ: dùng các chỗ gần tâm hình nhất, thông báo nói rõ.
   * Hình lưu **trong dự án**: đi theo tệp `.choreo.json` và gói `.zip`, mở bài khác thì thấy thư viện của bài đó. Dấu × ở góc mỗi hình để xoá; lưu hay xoá nhầm thì Ctrl Z.
   * **Thư viện** (ngay dưới Hình của tôi, bấm chữ Thư viện để mở): các hình dựng sẵn cho từ 3 tới 16 người, gồm kim cương, tam giác, tam giác ngược, chữ V, chữ W, khối so le kiểu 3-2-3, hai hàng so le, ba hàng so le, người giữa nổi (một người đứng trước, cả nhóm phía sau), vòng cung, đường chéo, mũi tên và hai nhóm hai bên. Ô chọn số người tự lấy số người đang chọn (chọn từ 2 người), chưa chọn thì cả đội trên sân; đổi ô đó để xem hình cho số người khác. Tua vạch phát tới chỗ có nhiều hay ít người trên sân hơn (người vào, ra cánh gà) thì ô tự đổi theo. Hình chỉ dựng cho đúng số người đang xem; lần đầu xem một số người có thể hiện chữ Đang dựng hình trong chốc lát. Mỗi ảnh nhỏ vẽ khán giả ở phía vạch dưới. Chỉ hiện những hình hợp với số người đó và vừa sân hiện tại, nên sân nhỏ thì ít hình hơn.
   * Bấm một hình để xếp y như bấm Hình của tôi: hình đặt quanh tâm nhóm, mỗi người vào chỗ gần mình nhất, thông báo có nút Hoàn tác và báo nếu sinh thêm cảnh báo. Trong mọi hình của thư viện, hai người cách nhau ít nhất 0,8 m, và nhìn từ khán giả mỗi người lệch ngang ít nhất 0,35 m so với người đứng ngay trước, nên không ai bị che hẳn. Nút dấu trang nhỏ ở góc mỗi hình chép hình đó vào Hình của tôi để giữ trong dự án.
6. **Tự chia đội hình** (thẻ *Đội hình*): chọn **Mỗi … lượt 8** hoặc **Số đội hình**, bấm **Tạo**. App thay toàn bộ đội hình bằng một chuỗi hình xoay vòng (hàng ngang, chữ V, vòng tròn, hai hàng, đường chéo, so le, vòng cung) cho cả bài:
   * Có nhịp thì mỗi khối bắt đầu và kết thúc đúng vạch lượt 8, mọi người tới đội hình mới đúng phách 1; chưa đặt nhịp thì chia theo mốc 4 s.
   * Khoảng chuyển ít nhất 1 lượt 8 (hoặc 2 s), tự giãn khi phải đi xa để không ai chạy quá 1.5 m/s.
   * Người được gán vào chỗ gần nhất của hình sau để ít đi chéo nhau; nếu vẫn có hai người sát nhau dưới 0.5 m khi chuyển, app thử đổi chỗ, lật hình hoặc đổi sang hình khác. Không ai bị xếp vào cánh gà.
   * Đã thả nhạc thì điểm đổi đội hình được dời tới vạch lượt 8 gần chỗ nhạc đổi mạnh nhất (vào điệp khúc, nhạc to lên hay lắng xuống).
   * Đã có sẵn nhiều đội hình thì app vẫn thay và báo cảnh báo: bấm **Hoàn tác** hoặc **Ctrl Z** để lấy lại. Đây là bản nháp để sửa tiếp bằng tay.

### Trình chiếu để tập

Bấm **Trình chiếu** (F): toàn màn hình góc khán giả, có tên đội hình, ghi chú của đội hình (lúc đang chuyển thì hiện ghi chú của đội hình sắp tới) và đếm phách cỡ lớn. Chiếu lên tivi hoặc máy chiếu cho cả đội nhìn theo. Space phát, dừng; mũi tên hoặc PageUp, PageDown nhảy đội hình; Esc thoát.

* **Chiếu lên tivi, máy chiếu:** cắm máy, chọn *Mở rộng* (Win P ▸ Extend). Kéo cửa sổ Chrome sang màn hình tivi (hoặc bấm **Win Shift →**) **rồi mới bấm F**, vì toàn màn hình mở trên màn hình đang chứa cửa sổ.
* **Đếm vào 5 · 6 · 7 · 8:** nút **5-6-7-8** (bật sẵn). Bấm phát thì app đếm bốn số theo nhịp bài (chưa đặt nhịp thì 0,6 s một số) rồi mới chạy nhạc. Space hoặc Esc để huỷ.
* **Khoá sửa:** lúc trình chiếu không kéo được người, góc dưới trái ghi *Khoá sửa*. Góc nhìn cũng khoá; nút ổ khoá mở cho xoay bằng chuột. Nút máy ảnh hoặc phím **C** đặt lại góc nhìn vừa khít sân.
* **Gương:** lật trái phải cả hình và sơ đồ nhỏ, để đội đứng quay mặt vào màn hình như soi gương.
* **Sau lưng** (phím **B**): đổi sang góc đứng sau lưng người múa nhìn ra khán giả, sơ đồ nhỏ cũng quay theo (khán giả ở trên). Trái phải trên màn hình và trong dòng nhắc khớp với tay trái tay phải của người múa, nên đứng quay lưng về màn hình vẫn tập theo được. Dòng nhắc luôn ghi rõ đang tính trái phải theo hướng người múa hay theo hướng khán giả.
* **Sáng:** sân sáng hơn, dễ nhìn trên máy chiếu yếu.
* **Tôi là ai:** chọn tên mình; người khác mờ đi, có vòng trắng dưới chân mình và dòng nhắc "bạn đứng ở đâu, còn bao lâu thì đi tới đâu".
* Dòng **Tiếp** đếm theo lượt 8 và phách (ví dụ *còn 1×8 + 4*); chưa đặt nhịp thì theo giây.

### Học động tác từ video cả đội

Bấm **Học động tác** (thanh trên, hoặc ở màn hình trống), mở hoặc kéo thả video cả đội múa quay từ phía trước. **Gương** (M, bật sẵn) lật trái phải để bạn làm theo như đứng sau lưng người múa; xem 0,25× tới 1× vẫn giữ cao độ nhạc; **Đặt A**, **Đặt B** ([ ]) để lặp một đoạn; **5-6-7-8** đếm vào theo BPM (gõ nhịp được) rồi mới phát; , . bước từng khung, ← → lùi tới 2 giây. **Bám theo tôi**: dừng lúc bạn đổi chỗ, kéo một khung quanh mình, app phóng to và dời theo, tự nối giữa các khung. App nhớ video và các khung cho lần sau. Nhìn thật từ sau lưng (thấy lưng người múa) cần dựng lại tư thế 3D, app chưa làm được.

### Xem và tập trên sơ đồ

Góc trên phải sơ đồ có ba nút xem và tập (thêm nút **Đạo cụ**, xem mục Đạo cụ và mốc sàn):

* **Tôi là ai…:** làm nổi một người, vẽ cả đường đi qua bài, mỗi chỗ đứng ghi số đội hình.
* **Bóng đội hình kế:** hiện mờ chỗ đứng ở đội hình sau, có mũi tên.
* **Cảnh báo:** danh sách ai va nhau (dưới 0,5 m), chồng lên nhau, bị che, hay phải chạy quá 1,5 m/s. Bấm một dòng để tua tới đó. Chỗ va nhau hiện dấu × đỏ, đoạn chạy quá nhanh tô đỏ trên sơ đồ.
  * **Bị che** (dấu ◐ xám, cảnh báo nhẹ): lúc đang giữ một đội hình, có người đứng trước (gần khán giả hơn quá 30 cm) mà lệch ngang với người sau chưa tới 35 cm, cỡ bề ngang vai, nên khán giả nhìn thẳng gần như không thấy người sau. Mỗi cặp một dòng, ví dụ "Lan bị Mai che (khán giả nhìn thẳng)". Người trong cánh gà và người đang ẩn không tính; lúc chuyển đội hình cũng không tính. Đang giữ đội hình đó thì sơ đồ nối hai người bằng vạch đứt xám. Hai hàng **So le** không bị báo; **Hai hàng** thẳng, **Vòng tròn** thì có, vì người phía sau thật sự đứng sau lưng người phía trước. Loại này không đếm vào thông báo sau khi xếp chỗ và không thuộc **Sửa tất cả**, vì nhiều khi bạn cố ý cho người nấp sau rồi mới hiện ra.
  * Dưới dòng cảnh báo có nút sửa nhanh (bấm xong có **Hoàn tác**):
  * **Đứng so le** (dòng bị che): dời người đứng sau sang ngang vừa đủ (cách người trước 40 cm theo bề ngang), giữ nguyên hàng trước sau. Nút chỉ hiện khi có chỗ trên sân mà không đứng chồng ai, không thêm cảnh báo lúc chuyển và bớt được chỗ bị che.
  * **Đổi chỗ cho gần:** giữ nguyên các chỗ đứng của đội hình đó, chỉ đổi ai đứng chỗ nào để mỗi người đi đường gần nhất. Nút chỉ hiện khi đổi xong số cảnh báo giảm thật. Nếu bạn cố ý xếp ai đứng giữa thì kiểm lại sau khi bấm.
  * **Đổi vai từ đây:** hiện thay cho nút trên khi đổi riêng một đội hình lại làm đoạn ra khỏi nó xấu đi. Từ đội hình đó về sau, mỗi người nhận luôn các chỗ của người kia, nên các khoảng chuyển sau giữ y hình cũ, chỉ đổi tên người.
  * **Nới khoảng chuyển:** rời đội hình trước sớm hơn (bắt về phách) để ai cũng đi kịp; lúc tới đội hình mới vẫn đúng phách cũ. Đội hình trước quá ngắn thì app nới hết mức và báo còn thiếu.
  * **Sửa tất cả** (đầu danh sách, và đầu ô Cảnh báo trên sơ đồ): làm các việc trên cho mọi khoảng chuyển một lượt.
  * Sau khi **Xếp nhanh**, xếp theo **Hình của tôi** hay **Thư viện**, **Lật trái phải**, **Dàn đều**, **Xoay**, **Giãn**, **Thu**, **Cánh gà** hay **Nhân bản**, nếu sinh thêm cảnh báo (không tính chỗ bị che) thì thông báo hiện số cảnh báo mới kèm nút **Sửa tất cả**. Đổi chỗ và Dán chỗ đứng (Ctrl V) chỉ báo số cảnh báo, không kèm nút, vì đổi chỗ cho gần sẽ xếp lại đúng những người bạn vừa cố ý đặt.

### Đường đi cong

Mặc định mỗi người đi thẳng từ chỗ đứng này sang chỗ đứng sau. Muốn đi vòng (lượn qua sau lưng bạn, vòng tránh bục, đi hình vòng cung):

* Đặt vạch phát vào lúc đang giữ một đội hình, chọn một người. Giữa mũi tên tới đội hình sau hiện một **núm tròn** nhỏ. Kéo núm đi: đường đi uốn cong qua đúng chỗ bạn kéo. Núm tô màu người đó là đường đang cong, núm rỗng là đường thẳng. Người đi rất ngắn thì núm được đẩy ra một bên đường (cách chấm người chừng 0,6 m) cho khỏi đè lên chấm; kéo núm đó thì đường đi qua đúng chỗ núm đang nằm. Người đi chưa tới 0,3 m mà chưa cong thì không hiện núm (coi như đứng yên).
* **Nhấp đúp** vào núm để cho người đó đi thẳng lại. Mọi thao tác đều Ctrl Z được.
* Đường cong chỉ một chỗ uốn (như cung tròn hay chữ C, không lượn chữ S). Cần lượn nhiều hơn thì thêm một đội hình trung gian: tạo đội hình ngay giữa đường cong thì đường được chẻ đôi, người vẫn đi đúng dáng cũ.
* Cảnh báo tính theo đường cong: va nhau, chạy quá nhanh (đường cong dài hơn nên phải chạy nhanh hơn), đi xuyên đạo cụ. Uốn đường quá sát người khác sẽ bị báo va dù đi thẳng thì không.
* Dời chỗ đứng hai đầu thì đường cong giữ dáng theo hai đầu mới. **Lật trái phải** lật luôn đường cong. **Xoay** và **Giãn / Thu** cho điểm uốn đi theo nửa phép xoay hay co giãn quanh tâm nhóm (một đầu đường đứng yên ở đội hình kia, một đầu đi theo nhóm), cả đường vào lẫn đường ra khỏi đội hình đó. **Đổi chỗ** hai người (phím X) và **Đổi chỗ cho gần** bỏ đường cong của những người bị đổi chỗ (dáng cũ vẽ cho chỗ cũ), họ đi thẳng lại. Xoá đội hình ở giữa thì đường cong của đội hình sau nối từ đội hình trước đó.
* **Ctrl C / Ctrl V** mang theo đường cong vào đội hình đang đứng của những người được chép. Dán sang đội hình khác thì đường được dời cho khớp chỗ đứng trước ở đội hình đích (giữ dáng theo dây cung mới). Dán vào đội hình đầu, hoặc người gần như đứng yên ở chỗ dán, thì không có đường cong. Người đi thẳng ở chỗ chép thì giữ nguyên đường cũ ở chỗ dán.
* Khung 3D, sơ đồ lúc phát (kể cả **Tôi là ai…**) và video sơ đồ cho người đi đúng theo đường cong; ảnh đội hình, ảnh vị trí từng người và bản in vẽ mũi tên cong. Video sơ đồ còn vẽ **mũi tên mờ** đường sắp đi (thẳng hay cong) trong lúc đang giữ một đội hình, giống ảnh đội hình nhưng nhạt hơn để không lấn chấm; video riêng một người chỉ vẽ mũi tên của người đó.

### Đạo cụ và mốc sàn

Nút **Đạo cụ** ở góc trên phải sơ đồ (trên điện thoại chỉ còn biểu tượng khối) thêm nhanh một món vào chỗ trống gần giữa sân (tính theo kích thước, không đè lên món đã đặt): **Micro đứng** (tròn 0,4 m), **Bục** (2 × 1 m), **Ghế** (0,5 × 0,5 m) hay **Mốc sàn** (dấu cộng vàng, tự đánh số 1, 2, 3... như dấu băng dính trên sàn tập). Mới thêm thì món đó đứng yên suốt bài; muốn nó đổi chỗ theo đội hình (dời bục ra sau ở đoạn 2, đưa micro vào giữa lúc hát) thì kéo nó lúc đang đứng ở đội hình đó (xem dưới).

* Kéo món đó trên sơ đồ để đặt chỗ (bám lưới 25 cm như người, giữ **Alt** để đặt tự do). Bấm vào món đó thì hiện thanh nhỏ phía dưới: đổi tên, đổi kích thước (mét), xoay 90°, **Xoá** (hoặc phím Delete), Esc để bỏ chọn. Mọi thao tác đều Ctrl Z được, mỗi lần kéo là một bước.
* **Đạo cụ đổi chỗ theo đội hình:** vạch phát nằm trong một đội hình thì kéo (hay xoay 90°) chỉ đổi chỗ món đó ở đội hình này; các đội hình khác giữ nguyên, lúc chuyển món đó trượt từ chỗ cũ sang chỗ mới cùng nhịp với người (như có người khiêng). Giữ **Shift** khi kéo (hay khi bấm xoay) để dời cả bài: chỗ ở mọi đội hình cùng dời một khoảng. Vạch phát đang ở khoảng chuyển thì kéo luôn là dời cả bài. Rê chuột lên đạo cụ, hay nhìn dòng chữ trên thanh nhỏ, để biết lúc này kéo sẽ đổi ở đâu. Lần đầu dời riêng ở một đội hình app nhắc kèm nút Hoàn tác.
* Nút **Giữ yên cả bài** (chỉ hiện khi món đó có đổi chỗ ở đâu đó): bỏ hết chỗ riêng, món đó đứng yên suốt bài đúng chỗ đang thấy ở vạch phát.
* **+ Đội hình** chép chỗ đạo cụ của đội hình đang đứng; tạo đội hình giữa khoảng chuyển thì đạo cụ đứng đúng chỗ đang trượt dở. **Lật trái phải** cả đội (không chọn ai, hay chọn hết) lật luôn các đạo cụ có đổi chỗ theo đội hình; món đứng yên cả bài (micro cố định, mốc sàn) không lật.
* Tên hai món sát nhau không còn đè chữ: tên tự dời sang dưới, trên, phải, trái; hết chỗ thì ẩn bớt (món đang chọn luôn có tên).
* Đạo cụ nằm dưới chấm người trên sơ đồ, có trong khung 3D (khối xám tối, mốc sàn phẳng trên sàn), ảnh đội hình, video sơ đồ và bản in, ở đúng chỗ của từng đội hình (video sơ đồ và 3D thấy đạo cụ trượt lúc chuyển). Thu nhỏ sân thì đạo cụ ngoài sân được kéo vào trong.
* Cảnh báo nhẹ **đi xuyên đạo cụ** (dấu □ cam): ai đứng trong bục, ghế, micro lúc giữ một đội hình (theo chỗ của món đó ở đội hình đó), hoặc lúc chuyển người và đạo cụ chạm nhau: người đi xuyên, hay đạo cụ dời qua chỗ người đang đứng yên ("Bục dời qua chỗ Lan"). Mốc sàn không bị báo. Loại này không thuộc **Sửa tất cả** (có khi bạn cố ý cho người bước lên bục): uốn đường đi vòng (xem mục Đường đi cong) hoặc thêm một đội hình trung gian.

Khung 3D có các góc **Khán giả**, **Chéo**, **Trên cao** và **Sau lưng** (đứng sau đội nhìn ra khán giả, hình lật như soi gương để trái phải giống người múa, dễ tập theo). Nút **Đặt lại** đưa góc nhìn về vừa khít sân; kéo thẻ giữ **Alt** để đặt tự do không bám lưới.

### Phương án song song

Muốn thử một cách khác cho đoạn 2 mà không mất bản đang ổn thì mở **Tệp ▸ Phương án…**. Gõ tên (để trống thì app đặt "Phương án A", "Phương án B"...) rồi bấm **Lưu phương án hiện tại**: app chụp lại cả bài lúc đó (đội hình, vũ công, ghi chú, mốc nhạc, đạo cụ) và cất trong trình duyệt ngay cạnh bài đang mở. Video và nhạc dùng chung với bài nên phương án gần như không tốn thêm chỗ.

Danh sách hiện mỗi phương án với giờ lưu, số đội hình và số người; phương án nào trùng hẳn bản đang làm thì ghi thêm "giống bản đang làm". Bấm **Mở** để chuyển cả bài sang phương án đó. Nếu bản đang làm chưa có trong danh sách, app tự cất nó thành phương án "Trước khi đổi" trước khi chuyển (lần sau là "Trước khi đổi 2"), nên không bao giờ mất bản đang làm; lỡ tay thì Ctrl Z cũng đưa lại được. Nút bút chì để đổi tên (Enter nhận, Esc bỏ), nút thùng rác để xoá: app hỏi lại trước khi xoá, và thông báo sau khi xoá có nút **Hoàn tác** để lấy lại phương án vừa xoá.

Bấm **So sánh** ở một phương án để xem mở nó thì bài đổi những gì so với bản đang làm: đội hình thêm, bớt, đổi tên hay đổi giờ; ai dời chỗ ở đội hình nào và dời bao nhiêu mét; hai người đổi chỗ cho nhau thì ghi gọn một dòng "Lan đổi chỗ với Mai"; ghi chú đội hình, ghi chú từng người và đường đi cong đổi ra sao; vũ công thêm bớt, nhịp, cỡ sân. Bấm lại So sánh để gập. Phương án chỉ nằm trong trình duyệt này; muốn mang sang máy khác thì mở phương án đó rồi Lưu ra tệp hoặc Đóng gói như bình thường.

### Lưu

* App **tự lưu** trong trình duyệt (góc trên có dấu ✓ "Đã lưu"; bấm vào để xem bài đang chiếm bao nhiêu chỗ), lưu ngay cả khi đóng hay chuyển thẻ.
* Lưu hỏng thì góc trên đổi thành ô đỏ **Không lưu được** và giữ nguyên tới khi lưu lại được. Bấm vào để xem lý do, **Lưu ra tệp** ngay hoặc **Thử lưu lại**. Hay gặp nhất là trình duyệt hết chỗ: xoá bớt video không dùng rồi thử lại.
* Chỉ **một thẻ trình duyệt** được tự lưu. Mở bài ở thẻ thứ hai thì thẻ đó báo và ngừng lưu; bấm **Dùng thẻ này** để chuyển quyền lưu sang, hoặc **Tải lại** để xem bản mới nhất.
* **Ctrl S** lưu ngay vào trình duyệt và ghi tệp dự án `ten-bai.choreo.json`. Chrome, Edge hỏi chỗ lưu ở lần đầu, các lần sau ghi đè im lặng vào đúng tệp đó ("Đã lưu vào …"). Trình duyệt khác thì tải xuống một lần; các lần Ctrl S sau chỉ lưu trong trình duyệt. **Tệp ▸ Lưu thành tệp khác…** để chọn tệp mới.
* Tệp `.choreo.json` chỉ chứa đội hình và thông tin, **không chứa video**. Muốn chép sang máy khác cho đủ cả nhạc và video: **Tệp ▸ Đóng gói cả video (.zip)…** ra một tệp `.zip` duy nhất (tối đa 4 GB).
* Mở trên máy mới: **Tệp ▸ Mở…** chọn tệp `.zip` (hoặc kéo thả tệp `.zip` vào cửa sổ), **không cần giải nén**. App chép video vào trình duyệt rồi mở bài; bấm Hoàn tác (Ctrl Z) nếu lỡ tay. Mở tệp `.choreo.json` thì thả lại thư mục thẻ và nhạc, app tự gắn theo tên tệp.
* **Tệp ▸ In tờ đội hình…**: in (hoặc lưu PDF) mỗi trang A4 hai đội hình, sơ đồ nhìn từ trên có tên từng người, mũi tên từ chỗ đứng trước, và bảng vị trí từng người. Phát cho cả đội.
* **Tệp ▸ Xuất ảnh đội hình này (.png)**: một ảnh PNG (rộng 1080, vuông hoặc dọc 4:5) của đội hình tại vạch phát, để gửi Zalo, Messenger cho cả nhóm. Ảnh có tên bài, số thứ tự và tên đội hình, thời điểm và nhịp bắt đầu, ghi chú của đội hình (nếu có), sơ đồ nhìn từ trên với cánh gà, chấm tên từng người, mũi tên từ chỗ đứng ở đội hình trước, chữ KHÁN GIẢ ở đáy ảnh. Vạch phát đang nằm giữa hai đội hình thì lấy đội hình gần hơn; trước bài lấy đội hình đầu, sau bài lấy đội hình cuối.
* **Tệp ▸ Chia sẻ ảnh đội hình này…**: chỉ hiện trên máy có bảng chia sẻ nhận được tệp ảnh (điện thoại, máy tính bảng, một số trình duyệt máy tính). Bấm vào thì máy mở bảng chia sẻ với đúng ảnh như mục Xuất ảnh ở trên, chọn Zalo hay Messenger rồi chọn nhóm để gửi. Đóng bảng chia sẻ thì không có gì xảy ra. Nếu máy từ chối mở bảng chia sẻ thì app tải ảnh xuống thay.
* **Tệp ▸ Chép ảnh đội hình này**: chỉ hiện trên trình duyệt chép được ảnh vào bộ nhớ tạm (thường là máy tính). Bấm vào thì ảnh đội hình tại vạch phát nằm sẵn trong bộ nhớ tạm, mở khung chat Zalo hay Messenger rồi dán bằng Ctrl V, không cần tìm tệp trong thư mục Tải xuống. Chép không được thì app báo lỗi.
* **Tệp ▸ Xuất ảnh tất cả đội hình (.zip)**: mỗi đội hình một ảnh như trên, gói chung một tệp `.zip` (giải nén ra rồi gửi cả loạt ảnh). Tên ảnh theo dạng `Tên-bài-01-Tên-đội-hình.png`, không có dấu cách.
* **Tệp ▸ Xuất ảnh vị trí từng người (.zip)**: mỗi người một ảnh dọc riêng để gửi tin nhắn riêng qua Zalo. Đầu ảnh ghi "Vị trí của Lan", tên bài và số đội hình; dưới là lưới 2 cột, mỗi ô một sơ đồ nhỏ của một đội hình, có số thứ tự, tên đội hình, giờ bắt đầu (và 8 thứ mấy, phách mấy nếu đã đặt nhịp). Trong mỗi ô, người đó có chấm to hơn với vòng trắng, kèm mũi tên từ chỗ đứng ở đội hình trước; người khác mờ đi, chỉ còn chữ tắt trong chấm. Ảnh rộng 1080, cao tối đa 1920 (cỡ màn hình điện thoại), khoảng 8 đội hình một ảnh với sân 10 × 6 m; bài nhiều đội hình hơn thì chia đều thành vài ảnh, tên thêm `-p1`, `-p2`. Tên ảnh theo dạng `Tên-bài-vi-tri-Lan.png`; hai người trùng tên thì người sau thêm `-2`. Người đang ẩn không có ảnh. Cả loạt ảnh gói chung một tệp `.zip`.
* **Tệp ▸ Xuất ảnh vị trí của Lan (.png)**: chỉ hiện khi đang chọn đúng một người (không ẩn). Xuất riêng ảnh vị trí của người đó như trên; nếu phải chia nhiều ảnh thì gói thành một tệp `.zip`.
* **Tệp ▸ Xuất video…**: ghi video kèm nhạc, góc khán giả 3D hoặc sơ đồ từ trên. Sơ đồ có thể tô đậm một người ("video riêng cho Lan") để gửi riêng.
  * **Đoạn**: chọn nhanh **Cả bài**, **Vùng lặp** (chỉ hiện khi đã đặt vùng lặp bằng phím L), **Đội hình tại vạch phát** (từ lúc rời đội hình trước, tức cả khoảng chuyển vào, tới hết đội hình đang đứng; đang ở giữa khoảng chuyển thì lấy đội hình sắp tới) hoặc **Mốc đoạn nhạc** (chỉ hiện khi đã có mốc: từ mốc chứa vạch phát tới mốc sau, mốc cuối thì tới hết bài). Hai ô **Từ** và **tới** hiện giờ của đoạn đã chọn và sửa tay được: gõ `1:05.5` hoặc `65`, Enter hay bấm ra ngoài để nhận, gõ sai thì ô trả lại giờ cũ. Đoạn ngắn nhất nửa giây. Một đoạn 10 giây quanh chỗ khó là tệp nhẹ, gửi Zalo nhanh và xem lặp lại được.
  * **Tên tệp** có thêm tên đoạn: `Tên-bài-Chữ-V.webm` khi chọn theo đội hình, `Tên-bài-Điệp-khúc.webm` khi chọn theo mốc, `Tên-bài-0m10s-0m25s.webm` khi chọn vùng lặp hay sửa tay; cả bài thì chỉ có tên bài. Video riêng cho một người thêm tên người đó ở cuối.
  * **Sơ đồ từ trên dựng nhanh hơn thời gian thực** trên Chrome và Edge bản mới (trình duyệt có WebCodecs): app vẽ từng khung theo giờ của bài chứ không chờ bài phát, mã hoá cả hình lẫn nhạc rồi ghép thành tệp `.webm`. Bài 3 phút thường xong trong vài chục giây; thanh tiến độ báo phần trăm và nhanh gấp mấy lần. Trong lúc dựng chuyển sang tab khác vẫn được, và bấm Hủy hoặc Esc để dừng. Trình duyệt thiếu bộ mã thì app tự chuyển sang cách ghi theo thời gian thật như dưới đây và báo một dòng.
  * **Khán giả 3D** vẫn ghi theo thời gian thật (cần video thẻ chạy đúng nhịp): đoạn dài bao nhiêu thì chờ bấy nhiêu, phải **giữ tab mở**, chuyển tab là dừng. Ra tệp `.mp4`, hoặc `.webm` nếu trình duyệt không ghi được MP4. Esc hoặc Hủy để dừng.

## 5. Phím tắt

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| Home, End | Về đầu, về cuối bài |
| ← → | Không chọn ai: lùi, tới một phách (Shift: một lượt 8). Đang chọn: dịch người 0,25 m (Shift: 1 m) |
| ↑ ↓ | Dịch người đang chọn lên, xuống |
| Enter hoặc + | Thêm đội hình sau vạch phát |
| Delete | Xoá đội hình vừa bấm chọn (khối trên dòng thời gian hoặc dòng trong thẻ Đội hình). Đang chọn người thì Delete không xoá gì, chỉ nhắc: xoá người bằng nút thùng rác ở danh sách Vũ công |
| [ ] | Nhảy tới đội hình trước, sau |
| Shift [ / Shift ] | Nhảy tới mốc đoạn nhạc trước, sau |
| B | Thêm mốc đoạn nhạc ở vạch phát |
| Esc | Bỏ chọn |
| Ctrl A | Chọn tất cả |
| Alt 1..9 | Chọn nhóm lưu sẵn thứ 1 đến 9 (bấm lại để bỏ chọn) |
| Ctrl C / Ctrl V | Chép chỗ đứng lúc này của người đang chọn (không chọn ai thì cả đội), tua tới đội hình khác rồi dán vào; không có đội hình ở đó thì app tạo mới |
| M | Lật trái phải người đang chọn |
| X | Hai người đang chọn đổi chỗ cho nhau |
| R / Shift R | Xoay nhóm đang chọn (chưa chọn ai thì cả đội trên sân) một phần tư vòng theo / ngược chiều kim đồng hồ |
| Q / Shift Q | Người đang chọn quay mặt 45 độ sang phải / sang trái của chính họ (ở đội hình tại vạch phát) |

| N | Bật, tắt bám lưới và phách |
| O | Sơ đồ nhìn từ khán giả hoặc từ sân khấu |
| B | (Trình chiếu) góc Sau lưng người múa; C đặt lại góc nhìn |
| L | Lặp đoạn chuyển vào đội hình đang chọn (tập đi tập lại một chỗ di chuyển) |
| V | Đổi chế độ xem |
| Shift Z | Vừa khung dòng thời gian |
| F | Trình chiếu |
| Ctrl Z, Ctrl Y | Hoàn tác, làm lại |
| Ctrl S | Lưu ngay (trình duyệt và tệp `.choreo.json`) |
| ? | Bảng phím tắt |

Khi đang gõ trong ô chữ hay ô số, phím tắt tạm nghỉ (trừ Ctrl S: chốt ô rồi lưu). Vừa bấm chuột vào ô đánh dấu, thanh kéo hay nút thì Space, mũi tên vẫn là phím tắt; đi tới bằng Tab thì phím thuộc về ô đó. Tab tới dòng vũ công, dòng đội hình, khối trên dòng thời gian hay dòng cảnh báo rồi bấm Enter để chọn.

**Khi trình chiếu** chỉ nhận các phím dưới (không sửa được gì, Ctrl Z cũng tắt):

| Phím | Việc |
|---|---|
| Space | Phát / dừng |
| ← → hoặc PageUp, PageDown | Đội hình trước, sau |
| Home, End | Về đầu, về cuối bài |
| Shift [ / Shift ] | Mốc đoạn nhạc trước, sau |
| Esc hoặc F | Thoát trình chiếu |

## 6. Gỡ rối

* **Thẻ đen hoặc trống:** bấm phát một lần (Chrome cần thao tác của người dùng trước khi phát video), hoặc tải lại trang.
* **Thẻ hiện cả nền:** video chưa qua xoá phông, hoặc chưa tích ô "Thẻ đã tách nền (tệp .card.mp4)".
* **Thẻ có viền xám nửa dưới:** ngược lại, đang tích ô đó cho một video thường; bỏ tích.
* **Góc trên ghi "Không lưu được":** bài vẫn còn trên màn hình nhưng chưa vào trình duyệt. Bấm Ctrl S để lưu ra tệp trước, rồi xoá bớt video hoặc dọn chỗ trống cho máy.
* **Video lệch nhạc:** bấm Tự khớp; nếu vẫn lệch thì chỉnh tay bằng nút ±0,1 / ±0,01.
* **Gõ số vào ô mà không thấy đổi:** bấm Enter hoặc bấm ra ngoài ô để chốt; gõ sai (chữ, để trống) thì ô tự trả về số cũ.
* **Bấm Delete mà không xoá:** đang chọn người thì Delete không xoá gì; bấm vào khối đội hình trước rồi mới Delete.
* **"Không mở được … (trình duyệt không giải mã được)" hoặc "không có hình":** video quay bằng HEVC (iPhone mặc định). Đổi sang H.264 bằng `python -m choreo.videocard`, hoặc trên iPhone chọn **Cài đặt › Camera › Định dạng › Tương thích nhất** rồi quay lại.
* **Mở app thấy "Video/nhạc đã lưu không mở được":** trình duyệt đã xoá bớt dữ liệu. Thả lại các tệp đó, app tự gắn theo tên.
* **Báo "Không đọc được bài đã lưu":** app ngừng tự lưu để khỏi ghi đè. Bấm **Tải bản cũ về máy** để giữ bản cũ, rồi **Tải lại**; vẫn lỗi thì chọn **Vẫn tự lưu** và làm bài mới.
* **Công cụ báo thiếu ffmpeg, onnxruntime hoặc mô hình:** làm đúng câu lệnh nó in ra (mục 2).
