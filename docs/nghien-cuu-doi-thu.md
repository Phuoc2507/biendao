# Nghiên cứu đối thủ: "Sân khấu thẻ video"

*Ngày khảo sát: 2026-10-12. Nguồn chủ yếu là trang App Store, trang chính thức, danh bạ phần mềm (Capterra/GetApp) và báo chuyên ngành múa. Bảng so sánh tự viết của các hãng (Choreoto, Stancz) có lợi cho chính họ nên chỉ dùng để biết họ **tuyên bố** những gì. Tìm kiếm không ra được thread Reddit nào (r/Dance, r/kpop, r/colorguard, r/marchingband), nên phần khen/chê dựa trên review App Store và bài báo, không có ý kiến cộng đồng Reddit. Giá cả thay đổi thường xuyên; mục nào chưa xác minh được thì ghi "?".*

Sản phẩm của ta: web app chạy trong Chrome, miễn phí, offline, không cần tài khoản. Mỗi vũ công tự quay video bằng điện thoại, app xoá phông rồi đặt thành **thẻ video phẳng** trên sân khấu 3D. Người dùng kéo thả đội hình trên timeline theo nhạc (khối giữ + chuyển động mượt), xem sơ đồ từ trên xuống hoặc từ phía khán giả, rồi trình chiếu để tập.

---

## 1. Bảng so sánh nhanh

| Sản phẩm | Nền tảng | Giá / mô hình | Timeline nhạc | Đếm 8 / BPM | Đường đi cong | 3D | Video trên sân khấu | Chia sẻ cho vũ công | Xuất | Cảnh báo va chạm | Không tài khoản / offline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **ArrangeUs** | iPad/iPhone, Mac M1, Android (theo Stancz) | Miễn phí + Premium IAP ($2.99–23.99) | Có (nhạc nền phải trả tiền) | Ít | Có | Không | Không | Gửi file, không bắt vũ công mua app | PDF | Không | Có / có |
| **Choreographic** | iPhone/iPad, Mac, Vision Pro, Android | Miễn phí + Pro $3.49/tháng, $24.99/năm | Có, chính xác 0,01s | Hiện chuyển cảnh theo từng nhịp | Có (cung, nhiều điểm) | **Có** | Chưa (người dùng đã xin) | Cộng tác thời gian thực, quyền theo thư mục | ? | Gián tiếp (xem đường trượt) | Cần tài khoản để sync; offline có |
| **Choreoto** | Web (desktop là chính); iOS TestFlight, Android đang test kín | Free (5 vũ công, 3 dự án) / Pro (giá chỉ hiện lúc thanh toán; Capterra ghi $7.99/tháng) | Có | **BPM + đếm** | Có, tránh vật cản | **Có** | **Có**: đặt video tập lên sân khấu, mocap bằng camera, video → sơ đồ | **Link riêng từng vũ công**, theo dõi ai đã xem/tập | MP4 cục bộ, "rehearsal pack" | "gỡ rối chuyển cảnh" | Có demo không tài khoản / ? |
| **mubo** (2025) | iPhone | Miễn phí, có quảng cáo + watermark; Pro ? | Có, sóng âm, tốc độ 0,5–2x | Không rõ | Có | Không | **Video tham chiếu tắt tiếng** chạy theo timeline (chỉ lưu trên máy) | PDF tờ tập, MP4, GIF | PDF/MP4/GIF | Không | Có / có |
| **mo-sim** | iPhone/iPad (Mac) | Miễn phí, mua 1 lần $3.99 (99 người) / $9.99 (200 người) | Có, sóng âm, lặp, cue | Không rõ | Có + hướng mặt | Không | Gắn video vào cảnh | ? | ? | Không | **Không tài khoản**, không thu dữ liệu |
| **Castograph** | iPhone/iPad (iOS 18.2+) | Miễn phí + Pro thuê bao | Có | ? | Có | Không | Nhập video từ Photos | — | PDF/ảnh/video (Pro) | **Có** (báo đường chồng nhau) | ? |
| **FODI** (K-pop, Hàn) | iOS, Android | Miễn phí + PRO thuê bao (~$3/tháng) | Có | ? | ? | Không | Nhúng YouTube | Chia sẻ nhạc + đội hình | ? | ? | ? |
| **Stancz** (Pháp) | Web + iOS + Android | Miễn phí 3 bài, sau đó €3.99/tháng, €29.99/năm | Có | ? | ? | ? | ? | Không sửa nhiều người cùng lúc | **Không xuất video/PDF** | ? | Cần tài khoản |
| **Croovoo** | Web/app | Từ ~$6 (?) | Có, mốc thời gian chính xác | ? | ? | ? | ? | **Link, không cần cài, không tài khoản** | ? | ? | ? |
| **StageKeep** | Web/mobile | Dùng thử, giá ? | Có | ? | Có | ? | Từng có kế hoạch chú thích video | Link không tài khoản (v1.5) | ? | "Auto Algorithm" tính chỗ trống | Cần đăng ký |
| **StageWrite** | iPad + web | Trước: $199.99 + add-on $49.99; nay ~ $5/người/tháng | Đếm/lời bài (add-on) | Có (Staging Score) | Ghi lại khi kéo | Không | Không | PDF/JPG qua email | PDF/JPG | Không | ? |
| **ChoreoRoom / Choreos / move2move** | iOS | $0.99 / miễn phí | Cơ bản | — | Choreos: có | Không | Không | Cơ bản | — | — | — |
| **DDance** | Web | Miễn phí | **Yếu** (theo đánh giá bên thứ ba) | — | ? | **Có**, có góc nhìn từ giám khảo | Không | Có | ? | ? | ? |
| **Pyware 3D** (marching) | Windows/Mac, iPad | $199/năm (Indoor) … $799/năm; vĩnh viễn $624–1.281 | Có | Có (bước/đếm) | Rất mạnh (xoắn ốc, morph, float) | **Có** | Không | Qua UDB | In "drill book" | **Có**: Virtual Clinic 4 bộ phân tích (bước quá dài, va chạm, đổi hướng đột ngột) | Cài máy, có license |
| **Ultimate Drill Book (UDBapp)** | iOS/Android | ~$5–20/người/mùa | Animation + nhạc | Toạ độ theo từng đếm, mốc giữa đường | (nhập từ Pyware) | Góc nhìn người diễn / đạo diễn | Không | **Mỗi người có "dot book" riêng** | — | — | Có chế độ offline |
| **OpenMarch** | Desktop (web tech) | **Miễn phí, mã nguồn mở** | Có | Có | ? | Không (tuyên bố có thể không bao giờ làm 3D) | Không | File | ? | ? | Có / có |

Không tìm thấy sản phẩm nào khớp chính xác các tên **"Formations (formationsapp)"**, **"Choreo Guide"**, **"Dance Designer / Dance Designer Pro"**, **"Dancer's Planner"**, **"Visual Choreography"**, **"Kinetic"**. Có thể chúng đã ngừng hoặc chỉ là tên gọi khác của các app ở trên. "FormationBuilder" gần nhất là công cụ miễn phí của Dance Teacher Web. Ngoài ra còn ChoreoMaker, Danceapp (danceapp.us, 3D), FORMI/Formi Studio (đã rút khỏi Google Play) và dự án nghiên cứu **ChoreoVis** (EuroGraphics 2024).

---

## 2. Từng đối thủ

**ArrangeUs.** Đây là app phổ biến nhất mảng này: 4,8★ từ khoảng 4,5 nghìn đánh giá. App thuần sơ đồ chấm 2D, gồm chuyển cảnh có animation, đặt tên và màu cho vũ công, ghi chú từng vị trí, đạo cụ, đường đi cong, **Ghost Dancers/Ghost Paths** (xem trước vị trí và đường sắp tới), preset hình tròn và hàng, thanh trượt để giãn/xoay cả cụm, tag và tìm kiếm.
*Khen:* tiết kiệm thời gian dàn dựng, hợp với show choir và nhạc kịch, gửi được cho đội trưởng mà họ không phải mua app, nhập nhạc vào là thấy chuyển cảnh mất bao lâu, nhà phát triển chịu nghe góp ý.
*Chê:* muốn có nhạc nền phải trả tiền; có lúc lỗi xoay vòng tròn; người nhận phải tự kiếm file nhạc riêng; trước đây không có cách hiện đường đi.
*Nên học:* ghost dancer/ghost path, thanh trượt giãn/xoay đội hình, preset hình học.
Nguồn: [App Store](https://apps.apple.com/us/app/arrangeus/id1502182540), [freeappsforme](https://freeappsforme.com/free-dance-formation-makers/).

**Choreographic: Dance Formation.** App có tính năng đầy đủ nhất trên điện thoại (4,7★, 285 đánh giá; Pro $3.49/tháng hoặc $24.99/năm). Có xem **3D**, xem trước đường đi 2D/3D, đường cong nhiều điểm, căn thời gian tới 0,01s, preset, lưu "crew" để dùng lại, nhóm màu, đạo cụ, ghi chú, cộng tác thời gian thực, phân quyền theo thư mục, sửa offline.
*Khen:* dễ dùng, thấy rõ đội hình khớp nhạc, thay được giấy bút.
*Chê:* bản đầu chưa có đường cong (đã thêm), lỗi playhead nhạc (đã sửa). **Có người dùng xin được gắn video clip vào vị trí trên sân khấu**, nghĩa là chính nhu cầu mà app ta giải quyết.
Nguồn: [App Store](https://apps.apple.com/us/app/-/id1608391996).

**Choreoto.** Đây là **đối thủ gần ta nhất**. App web, ưu tiên desktop; có xem từ trên xuống và 3D, BPM và đếm, **đặt video tập lên sân khấu**, mocap bằng camera, "video tập → sơ đồ chỉnh được" (Formation Trace), đường đi tránh vật cản, gỡ rối chuyển cảnh. Phần giao cho vũ công: mỗi người nhận **link riêng** có vị trí, đường đi, đếm, ghi chú, và chủ dự án theo dõi được ai đã xem, ai đã tập. Gói Free giới hạn 5 vũ công và 3 dự án, có "rehearsal pack" và xuất MP4. Pro có 100 vũ công, mocap, email/link chia sẻ. Bản mobile vẫn đang beta. Chưa có review độc lập nào (Capterra 0 đánh giá).
*Khác ta:* bắt buộc tài khoản và đồng bộ đám mây; gói miễn phí chỉ 5 người, trong khi tiết mục văn nghệ khoa thường 8–20 người; chưa có tiếng Việt; video là "tham chiếu", không phải mỗi vũ công là một thẻ đã xoá phông.
Nguồn: [choreoto.com](https://choreoto.com), [bảng giá](https://choreoto.com/pricing), [so sánh với ArrangeUs](https://choreoto.com/compare/arrangeus/), [Capterra](https://www.capterra.com/p/10045751/Choreoto/).

**mubo – formation editor** (ra mắt 16/10/2025, iPhone, nhà phát triển Hàn). Timeline keyframe trên sóng âm, đổi tốc độ 0,5–2x, 14 mẫu đội hình tự co giãn theo số người, nhóm vũ công để di chuyển cùng lúc, đạo cụ, **video tập tắt tiếng chạy theo timeline (không upload)**. Xuất **tờ tập PDF cho từng đội hình**, MP4 kèm nhạc, GIF để gửi nhóm chat; hoạt động offline. Bản miễn phí có quảng cáo và watermark. Chưa đủ review để đánh giá (1 lượt).
*Nên học:* GIF/MP4 gửi thẳng vào nhóm chat, tờ tập PDF, chỉnh tốc độ phát.
Nguồn: [mwm.ai](https://mwm.ai/apps/mubo-formation-editor/6753949227).

**mo-sim** (UGOKU, Nhật). Tính năng lõi miễn phí, **không cần tài khoản, không thu dữ liệu**; mua một lần $3.99 hoặc $9.99 tuỳ số vũ công. Đặt được thời điểm vào sân, điểm dừng, đường đi và **hướng mặt** của từng người; có cue marker, lặp đoạn, **Parallel Scenes** (so sánh các bản nháp), "Flow" (chuỗi di chuyển dùng lại được), **chế độ trình chiếu + khoá màn hình** để không lỡ tay sửa khi tập.
*Chê* (review 2019–2020): khó hiểu, giao diện lẫn tiếng Nhật, khó canh vũ công đi đúng lúc.
*Nên học:* chế độ trình chiếu có khoá, hướng mặt, phương án song song. Bài học ngược: giao diện chưa dịch hết là bị chê ngay.
Nguồn: [App Store](https://apps.apple.com/app/id1450170370).

**Castograph.** Sân khấu lưới 18×10, đường cong, **tự báo đường đi chồng nhau hoặc nguy cơ va chạm**, nhập nhạc hoặc video, lưu crew, mới thêm **mirror mode** (lật trái/phải, hữu ích khi tập trước gương), căn hàng, thùng rác. Muốn xuất PDF, ảnh hay video phải mua Pro.
Nguồn: [KultureGeek](https://www.iphoneaddict.fr/apps/productivite/castograph-dance-formation-170.html).

**FODI – Formation Director** (Hàn Quốc, xuất phát từ Apple Developer Academy POSTECH, đã gọi vốn seed năm 2025). Hướng tới K-pop: **thư viện đội hình theo số người trong nhóm**, animation chuyển động. Gói PRO có AI gợi ý đội hình, nhúng YouTube để học vũ đạo, chia sẻ nhạc cùng đội hình.
*Nên học:* mẫu đội hình theo số người; gắn link video gốc (MV hoặc dance practice) để học theo.
Nguồn: [App Store](https://apps.apple.com/us/app/%ED%8F%AC%EB%94%94-fodi-%EB%82%B4-%EC%86%90%EC%95%88%EC%9D%98-%ED%8F%AC%EB%A9%94%EC%9D%B4%EC%85%98-%EB%94%94%EB%A0%89%ED%84%B0/id6470155832?l=ko), [POSTECH](https://developeracademy.postech.ac.kr/en/copy-of-project/a6), [Wowtale](https://en.wowtale.net/2025/04/02/230756).

**Stancz** (Pháp). Chạy trên web, iOS và Android; miễn phí 3 bài, sau đó €3.99/tháng. Theo chính trang của họ: không sửa nhiều người cùng lúc, **không xuất video hay PDF**. Bảng so sánh của họ chỉ ra một điểm đáng chú ý: thị trường đang tách đôi, app có trình duyệt thì thiếu Android, app có Android thì thiếu trình duyệt.
Nguồn: [stancz.com/compare](https://stancz.com/compare).

**Croovoo.** Đặt vị trí theo lưới hoặc tự do, gắn mốc thời gian nhạc chính xác. Điểm đáng học nhất: **vũ công mở link là thấy vị trí của mình kèm nhạc, không cần cài app, không cần tài khoản**.
Nguồn: [Capterra](https://www.capterra.ca/software/1097794/Croovoo).

**StageKeep** (startup từ ĐH Toronto, từng hợp tác với đội Raptors Dance Pak). Đồng bộ đội hình với nhạc, có "Auto Algorithm" tính diện tích sân khấu và chỗ trống, thời gian cho từng người. Bản 1.5 thêm chia sẻ link không cần tài khoản; bản 2.0 dự định chú thích video theo mốc thời gian (chưa xác nhận đã ra). Hiện app chuyển hướng sang cộng tác sản xuất (bình luận cho cả ê-kíp ánh sáng, đạo diễn…).
Nguồn: [stagekeep.com](https://www.stagekeep.com), [U of T](https://entrepreneurs.utoronto.ca/startup/stagekeep/), [The Dance Current](https://thedancecurrent.com/article/toronto-born-choreography-app-levels-up/).

**StageWrite** (Jeff Whiting, phổ biến trong giới Broadway). Vẽ sân khấu và đạo cụ, kéo người diễn để ghi lại đường đi; add-on "Staging Score" ghi động tác theo **đếm hoặc lời bài**; in PDF/JPG.
*Khen:* biểu đồ trông chuyên nghiệp, nhân bản cảnh nhanh.
*Chê:* chỉ hợp khi đã lên kế hoạch dàn dựng trước, khó dùng khi ứng tác, giá cao ($199 trước đây).
Nguồn: [Dance Teacher](https://dance-teacher.com/technology-stagewrite-app/), [Dance Spirit](https://dancespirit.com/could-this-app-change-the-way-you-choreograph/), [Capterra](https://www.capterra.com.sg/software/1041072/stage-write).

**Pyware 3D** (tiêu chuẩn ngành marching band từ 1982). Thuê bao $199–799/năm hoặc license vĩnh viễn $624–1.281. Mạnh về công cụ hình học (morph, push, spiral, float) và đồng bộ audio. Đặc biệt có **Virtual Clinic**: 4 bộ phân tích quét drill để bắt bước quá dài, **va chạm** và đổi hướng đột ngột.
Nguồn: [Band Shoppe](https://www.bandshoppe.com/product/pyware-3d-basic-software/), [bảng giá Pyware](https://dev.pyware.com/?p=45428).

**Ultimate Drill Book (UDBapp Pro).** 4,8★ từ khoảng 2,3 nghìn đánh giá. Đây là **app phía người diễn**: xem animation kèm nhạc từ góc người diễn hoặc đạo diễn, chạm vào một người là thấy toạ độ "dot book" của họ, có mốc giữa đường, số đếm lúc qua vạch sân, ghi chú của ban huấn luyện, điểm danh, offline. Phí khoảng $5–20 mỗi người mỗi mùa.
*Khen:* "tiết kiệm thời gian khổng lồ" khi tìm được vị trí của chính mình.
Nguồn: [App Store](https://apps.apple.com/app/id1455826724), [Madison Scouts](https://forwardperformingarts.org/news/madison-scouts-partner-ultimate-drill-book-third-year), [Inside Higher Ed](https://www.insidehighered.com/news/2022/08/29/marching-bands-swap-sheet-music-smartphone-apps).

**OpenMarch.** Phần mềm drill **miễn phí, mã nguồn mở** (AGPL/GPL), xây bằng công nghệ web, nhắm tới khoảng 90% nhu cầu và nói thẳng có thể sẽ không bao giờ làm 3D.
Nguồn: [AlternativeTo](https://alternativeto.net/software/openmarch/about).

**DDance.** Web miễn phí, xem 3D nhiều góc kể cả góc giám khảo; theo đánh giá bên thứ ba, đồng bộ nhạc còn yếu.
Nguồn: [Dealroom](https://app.dealroom.co/companies/ddance).

**ChoreoVis** (nghiên cứu, EuroGraphics/CGF 2024). Web app có các khung xem vị trí, hướng, quỹ đạo, tư thế, **mức sử dụng sàn diễn và quãng đường di chuyển**; được làm cùng giáo viên múa. Đây là tham khảo học thuật cho phần "đánh giá đội hình".
Nguồn: [Eurographics DL](https://diglib.eg.org/items/ebb60750-d719-45cc-ae90-733ad77fdef5/full), [arXiv 2404.04100](https://export.arxiv.org/abs/2404.04100).

---

## 3. Khoảng trống thị trường và điểm khác biệt của ta

1. **Không ai biến mỗi vũ công thành một "thẻ video" đã xoá phông.** Các app khác đều dùng chấm tròn hoặc hình nộm. Chỗ có video thì đó chỉ là một video tham chiếu chung (mubo, mo-sim, Castograph) hoặc video đặt lên sân khấu kèm mocap (Choreoto). Người dùng Choreographic còn chủ động xin gắn clip vào vị trí, tức là có cầu thật. Với văn nghệ khoa, thẻ video giải quyết đúng vấn đề lớn nhất: **mọi người không tập cùng giờ được**, mỗi người quay ở nhà, ghép lại sẽ thấy cả đội "đứng chung sân khấu". Đây cũng là lý do StageKeep ra đời (xung đột lịch tập).
2. **Miễn phí thật, không tài khoản, offline, không giới hạn số người.** Choreoto Free chỉ cho 5 vũ công, Stancz 3 bài, Choreographic/Castograph/mubo khoá xuất file hoặc nhạc sau gói trả phí, ArrangeUs thu tiền nhạc nền. Chỉ mo-sim và OpenMarch có triết lý tương tự, nhưng mo-sim chỉ chạy iOS và OpenMarch dành cho marching.
3. **Chạy được trên laptop Windows và Android qua Chrome.** Đa số sinh viên Việt Nam dùng Android hoặc Windows, trong khi phần lớn đối thủ mạnh chỉ có iOS/iPad hoặc Mac M1. Chính Stancz cũng chỉ ra thị trường đang tách đôi giữa trình duyệt và Android.
4. **Tiếng Việt và ngữ cảnh văn nghệ trường.** Không đối thủ nào có tiếng Việt. Bài học từ mo-sim: giao diện chưa dịch hết là bị chê ngay.
5. **Riêng tư.** Video khuôn mặt sinh viên ở lại trên máy, không upload, giống điểm mubo nhấn mạnh. Ở trường học đây là lợi thế thuyết phục.
6. **Điểm yếu của ta so với đối thủ:** chưa có cách chia sẻ đẹp cho từng vũ công (Choreoto, Croovoo và UDB đều mạnh khoản này), chưa xuất video/PDF/GIF, chưa có đếm 8/BPM, chưa có cảnh báo va chạm, chưa có preset đội hình.

---

## 4. Đề xuất tính năng xếp ưu tiên (Top 10)

Độ khó: **S** = vài giờ đến 1 ngày, **M** = vài ngày, **L** = 1–2 tuần trở lên.

| # | Tính năng | Lợi ích cho văn nghệ khoa | Học từ | Độ khó |
|---|---|---|---|---|
| 1 | **Lưới đếm 8 theo BPM** trên timeline (gõ tap-tempo hoặc nhập BPM, đặt nhịp 1; khối giữ/chuyển tự bắt dính vào nhịp, hiển thị "8×3 nhịp 5") | Trưởng nhóm nói chuyện bằng "đếm" chứ không bằng giây. Khối bắt đúng nhịp, chuyển cảnh trúng phách, tập dễ hô. | Choreoto, Choreographic, StageWrite | M |
| 2 | **Xuất video MP4/WebM kèm nhạc** từ góc khán giả hoặc góc trên (MediaRecorder trên canvas) | Gửi thẳng vào nhóm Zalo/Messenger; ai không mở được app vẫn xem để tập. Đây là cách chia sẻ hợp nhất với sinh viên. | mubo, Choreoto, Castograph | M |
| 3 | **Chế độ "tôi là ai"**: chọn một vũ công, làm nổi thẻ đó, các thẻ khác mờ đi, hiện đường đi và số đếm của riêng người đó (kết hợp với mục 2 thành "video riêng cho từng người") | Mỗi bạn chỉ cần biết mình đứng đâu, đi lúc nào. Đây là tính năng UDB được khen nhiều nhất. | UDB, Choreoto (handoff) | S–M |
| 4 | **Ghost / xem trước đội hình kế**: bóng mờ vị trí kế tiếp và mũi tên đường đi khi đang sửa hoặc trình chiếu | Dàn dựng nhanh hơn, vũ công thấy trước mình sắp đi đâu. | ArrangeUs (Ghost Dancers/Paths), Choreographic | S |
| 5 | **Cảnh báo va chạm và đường đi quá xa**: tô đỏ hai thẻ quá gần nhau trong lúc chuyển, hoặc người phải đi quá dài trong số nhịp ngắn | Sân khấu hội trường trường thường nhỏ, cảnh đâm nhau hay lộ ra lúc tổng duyệt; bắt được sớm từ khi còn trên máy. Nối với hướng "tầng đánh giá" của đề tài. | Pyware Virtual Clinic, Castograph, ChoreoVis | M |
| 6 | **Mẫu đội hình theo số người + công cụ giãn/xoay/căn hàng** (hàng ngang, chữ V, tam giác, so le, vòng tròn; chọn nhiều thẻ để giãn đều, lật gương) | Dựng đội hình 12 người trong vài giây thay vì kéo từng thẻ. | FODI, mubo, ArrangeUs, Castograph (mirror) | S–M |
| 7 | **Chế độ tập**: tốc độ 0,5–1x, lặp đoạn A–B, đếm ngược "5-6-7-8", khoá chỉnh sửa, toàn màn hình máy chiếu, **lật gương** khi tập quay mặt vào gương | Dùng ngay trong phòng tập: chiếu lên tường hoặc TV, tập chậm đoạn khó. | mo-sim (presentation + khoá), mubo (tốc độ), Castograph (mirror) | S |
| 8 | **Gói dự án một file** (.zip gồm nhạc, video thẻ, đội hình) để chuyển qua USB/Drive/Zalo và mở lại offline | Trưởng ban văn nghệ và các nhóm truyền tay nhau dự án, không cần server hay tài khoản. Tránh lỗi ArrangeUs bị chê là nhạc không đi kèm file chia sẻ. | ArrangeUs (điểm bị chê), Croovoo | M |
| 9 | **Xuất tờ tập PDF/ảnh**: mỗi đội hình một trang có sơ đồ từ trên, tên vũ công, mốc đếm, ghi chú; in hoặc dán lên tường | Hữu ích trong buổi tổng duyệt, khi ánh sáng hoặc âm thanh cần biết cảnh nào, ai đứng đâu. | mubo, StageWrite, ArrangeUs | S–M |
| 10 | **Ghi chú và đạo cụ/mốc sân khấu**: ghi chú theo khối thời gian hoặc theo vũ công; đặt bục, micro, cánh gà, vạch đánh dấu (spike mark) có kích thước sân khấu thật của hội trường | Khớp với sân khấu thật của trường; ghi chú "bạn A nhớ cầm quạt" ngay trên timeline. | ArrangeUs, Choreographic, Choreoto (venue), StageKeep | S–M |

*Ngoài Top 10, để sau:* link chia sẻ cho từng vũ công kèm theo dõi "đã xem" (Choreoto/Croovoo; cần server, trái với hướng offline), cộng tác thời gian thực (Choreographic), AI gợi ý đội hình (FODI), tự dựng sơ đồ từ video tập (Choreoto Formation Trace; gần với hướng perception của đề tài, có giá trị nghiên cứu).
