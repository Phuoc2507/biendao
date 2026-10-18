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

### Nhân bản và múa canon

Một video có thể dùng cho nhiều người trên sân (ví dụ chỉ quay một bạn rồi nhân lên cả nhóm):

* Nút **nhân bản** (biểu tượng hai tờ giấy) ở dòng vũ công thêm một bản sao; **Shift bấm** để hỏi số người. Trong khung chi tiết vũ công có ô **Nhân bản thêm [n] người**. Nếu bản sao làm sinh thêm cảnh báo lúc chuyển đội hình, thông báo hiện kèm nút **Sửa tất cả** để xếp lại ngay.
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
4. Trong thẻ *Đội hình*: đổi tên, **ghi chú** cho người tập (vd "nhịp 5 quay người"; Enter để chốt, Shift Enter xuống dòng; ghi chú hiện lúc Trình chiếu và trong bản in), **Lật** trái phải, **Dàn đều**, đưa người vào **Cánh trái** hoặc **Cánh phải** (hai dải mờ hai bên sân khấu là cánh gà, người ở đó coi như chưa ra sân).
5. **Tự chia đội hình** (thẻ *Đội hình*): chọn **Mỗi … lượt 8** hoặc **Số đội hình**, bấm **Tạo**. App thay toàn bộ đội hình bằng một chuỗi hình xoay vòng (hàng ngang, chữ V, vòng tròn, hai hàng, đường chéo, so le, vòng cung) cho cả bài:
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

Góc trên phải sơ đồ có ba nút:

* **Tôi là ai…:** làm nổi một người, vẽ cả đường đi qua bài, mỗi chỗ đứng ghi số đội hình.
* **Bóng đội hình kế:** hiện mờ chỗ đứng ở đội hình sau, có mũi tên.
* **Cảnh báo:** danh sách ai va nhau (dưới 0,5 m), chồng lên nhau, hay phải chạy quá 1,5 m/s. Bấm một dòng để tua tới đó. Chỗ va nhau hiện dấu × đỏ, đoạn chạy quá nhanh tô đỏ trên sơ đồ. Dưới dòng cảnh báo có nút sửa nhanh (bấm xong có **Hoàn tác**):
  * **Đổi chỗ cho gần:** giữ nguyên các chỗ đứng của đội hình đó, chỉ đổi ai đứng chỗ nào để mỗi người đi đường gần nhất. Nút chỉ hiện khi đổi xong số cảnh báo giảm thật. Nếu bạn cố ý xếp ai đứng giữa thì kiểm lại sau khi bấm.
  * **Đổi vai từ đây:** hiện thay cho nút trên khi đổi riêng một đội hình lại làm đoạn ra khỏi nó xấu đi. Từ đội hình đó về sau, mỗi người nhận luôn các chỗ của người kia, nên các khoảng chuyển sau giữ y hình cũ, chỉ đổi tên người.
  * **Nới khoảng chuyển:** rời đội hình trước sớm hơn (bắt về phách) để ai cũng đi kịp; lúc tới đội hình mới vẫn đúng phách cũ. Đội hình trước quá ngắn thì app nới hết mức và báo còn thiếu.
  * **Sửa tất cả** (đầu danh sách, và đầu ô Cảnh báo trên sơ đồ): làm các việc trên cho mọi khoảng chuyển một lượt.
  * Sau khi **Xếp nhanh**, **Lật trái phải**, **Dàn đều**, **Cánh gà** hay **Nhân bản**, nếu sinh thêm cảnh báo thì thông báo hiện số cảnh báo mới kèm nút **Sửa tất cả**.

Khung 3D có các góc **Khán giả**, **Chéo**, **Trên cao** và **Sau lưng** (đứng sau đội nhìn ra khán giả, hình lật như soi gương để trái phải giống người múa, dễ tập theo). Nút **Đặt lại** đưa góc nhìn về vừa khít sân; kéo thẻ giữ **Alt** để đặt tự do không bám lưới.

### Lưu

* App **tự lưu** trong trình duyệt (góc trên có dấu ✓ "Đã lưu"; bấm vào để xem bài đang chiếm bao nhiêu chỗ), lưu ngay cả khi đóng hay chuyển thẻ.
* Lưu hỏng thì góc trên đổi thành ô đỏ **Không lưu được** và giữ nguyên tới khi lưu lại được. Bấm vào để xem lý do, **Lưu ra tệp** ngay hoặc **Thử lưu lại**. Hay gặp nhất là trình duyệt hết chỗ: xoá bớt video không dùng rồi thử lại.
* Chỉ **một thẻ trình duyệt** được tự lưu. Mở bài ở thẻ thứ hai thì thẻ đó báo và ngừng lưu; bấm **Dùng thẻ này** để chuyển quyền lưu sang, hoặc **Tải lại** để xem bản mới nhất.
* **Ctrl S** lưu ngay vào trình duyệt và ghi tệp dự án `ten-bai.choreo.json`. Chrome, Edge hỏi chỗ lưu ở lần đầu, các lần sau ghi đè im lặng vào đúng tệp đó ("Đã lưu vào …"). Trình duyệt khác thì tải xuống một lần; các lần Ctrl S sau chỉ lưu trong trình duyệt. **Tệp ▸ Lưu thành tệp khác…** để chọn tệp mới.
* Tệp `.choreo.json` chỉ chứa đội hình và thông tin, **không chứa video**. Muốn chép sang máy khác cho đủ cả nhạc và video: **Tệp ▸ Đóng gói cả video (.zip)…** ra một tệp `.zip` duy nhất (tối đa 4 GB).
* Mở trên máy mới: **Tệp ▸ Mở…** chọn tệp `.zip` (hoặc kéo thả tệp `.zip` vào cửa sổ), **không cần giải nén**. App chép video vào trình duyệt rồi mở bài; bấm Hoàn tác (Ctrl Z) nếu lỡ tay. Mở tệp `.choreo.json` thì thả lại thư mục thẻ và nhạc, app tự gắn theo tên tệp.
* **Tệp ▸ In tờ đội hình…**: in (hoặc lưu PDF) mỗi trang A4 hai đội hình, sơ đồ nhìn từ trên có tên từng người, mũi tên từ chỗ đứng trước, và bảng vị trí từng người. Phát cho cả đội.
* **Tệp ▸ Xuất video…**: ghi video `.mp4` (hoặc `.webm` nếu trình duyệt không ghi được MP4) kèm nhạc, góc khán giả 3D hoặc sơ đồ từ trên. Sơ đồ có thể tô đậm một người ("video riêng cho Lan") để gửi riêng. Video ghi theo thời gian thật: bài dài 3 phút thì mất 3 phút, phải **giữ tab mở**, chuyển tab là dừng. Esc hoặc Hủy để dừng.

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
| Esc | Bỏ chọn |
| Ctrl A | Chọn tất cả |
| Ctrl C / Ctrl V | Chép chỗ đứng lúc này của người đang chọn (không chọn ai thì cả đội), tua tới đội hình khác rồi dán vào; không có đội hình ở đó thì app tạo mới |
| M | Lật trái phải người đang chọn |
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
