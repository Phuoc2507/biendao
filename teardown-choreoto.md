# Teardown đối thủ: Choreoto (choreoto.com)

Ngày khảo sát: 2026-09-30. Nguồn: trang chủ + demo miễn phí (`/app/?demo=default`,
tự chuyển sang workspace `/mobile/.../stage?view=3d`). Quan sát trực tiếp.

## 1. Câu hỏi cốt lõi cần xác minh (từ báo cáo nghiên cứu)
> "Avatar chuyển động THẬT hay chỉ là marker vị trí di chuyển giữa các đội hình?"

**Kết luận: avatar chuyển động THẬT.** Trong demo, các nhân vật 3D người đầy đủ
(có trang phục cách điệu — "Chrome Tigress") đổi tư thế múa động theo thời gian khi
phát (đối chiếu hai khung hình cách nhau: tư thế thân/tay/chân khác hẳn, có động tác
ngả người/sàn). KHÔNG phải chấm-vị-trí trượt giữa các formation. Đây là mocap tạo
chuyển động thân người rồi phát trên timeline.

## 2. Choreoto ĐÃ có gì (trùng dự án của ta tới đâu)
Gần như trùng toàn bộ lõi mà ta hình dung cho sequencer:
- **Motion capture bằng camera**: "Capture moves in 3D with your camera, or place
  rehearsal video directly on stage." → dùng **một camera điện thoại** (marketing
  luôn nói "your camera" số ít). Cũng cho đặt video tập thẳng lên sân khấu.
- **Sân khấu 3D đầy đủ** (nhà hát: ghế khán giả, loa, màn hình) + xem từ mọi góc,
  có nút **Top / Camera 1** (chuyển góc nhìn) và **track Camera** trên timeline.
- **Timeline theo nhịp**: đếm 1–8, mốc 8-count (5,9,13,…), khối "MOVE" cho từng vũ
  công, nút **Add move**, đồng bộ nhạc ("Song"), undo/redo, play/stop/volume.
- **Dancer Paths**: đường đi + mũi tên trên sàn giữa các vị trí (giống hệt ta).
- **Personal rehearsal view (điểm đau nhất)**: "Every dancer gets the exact rehearsal
  view they need." Mỗi vũ công có **phòng riêng Top+3D** làm nổi vị trí/đường đi/đếm
  nhịp/ghi chú của chính họ; **private link** riêng từng người không lộ liên hệ cả
  đội; trạng thái **Opened / Reviewed / Rehearsed** reset mỗi bản revision.
- Công cụ đội hình: Dancers, Focus, Names, Venue, Layout, Colors, Party.
- Nền tảng: web + **beta mobile** (iOS TestFlight, Android closed testing). Có Free/Pro.

## 3. HỆ QUẢ CHO LUẬN VĂN (quan trọng — phải điều chỉnh khung novelty)
Phần "personalized practice view" mà ta từng coi là điểm nhấn **đã tồn tại thương mại
ở Choreoto** (dưới dạng phòng web tương tác + private link). Sự khác biệt "xuất video
POV/mirror riêng" của ta so với "phòng Top+3D riêng" của họ là **mỏng** — cùng giải
một nhu cầu. Web sequencer của ta về bản chất là bản dựng lại (đơn giản hơn) lõi
Choreoto → **KHÔNG phải đóng góp mới**. Nó là **lớp trình diễn / demonstrator** của
luận văn, không phải novelty.

**Novelty thật buộc phải nằm ở tầng PERCEPTION + ĐÁNH GIÁ, không ở app:**
1. **Bắt chuyển động 2 CAMERA với độ chính xác ĐO ĐƯỢC trên múa thật.** Choreoto dùng
   1 camera tiêu dùng, KHÔNG công bố độ chính xác cho múa, gần như chắc chắn yếu ở
   xoay người/quay lưng/động tác sàn (đúng điểm yếu 1-cam đã tổng hợp). Đóng góp của
   ta: nghiên cứu độ chính xác 2-view (MPJPE/PA-MPJPE trên múa thật), **hướng dẫn đặt
   góc máy**, sync audio + tự calib không genlock. Đây là thứ Choreoto không có/không khai.
2. **Mở & tái lập được** (open pipeline, có eval) so với SaaS đóng của Choreoto.
3. Định vị lại tuyên bố: KHÔNG nói "làm được personalized view" (đã có); mà nói
   "**nâng chất lượng nguồn** cho các công cụ dạng này bằng bắt 2-cam chính xác hơn,
   có đo lường, cho người thường bằng 2 điện thoại."

## 4. Prior-art bổ sung Choreoto tự nêu
Họ so sánh với **Choreographic** và **ArrangeUs** ("Best dance formation apps:
Compare Choreoto, Choreographic, and ArrangeUs by workflow fit"). → cần rà thêm 2
đối thủ này (nhiều khả năng thiên về vẽ đội hình thuần, không mocap).

## 5. So sánh 3 đối thủ (đã rà 2026-09-30)
| Sản phẩm | Mocap chuyển động thân? | Đội hình 3D + đường + sync nhạc | Personal view/vai | Nền tảng |
|---|---|---|---|---|
| **Choreoto** | **CÓ** (1 camera) — avatar chuyển động thật | Có | **Có** (phòng riêng + private link + trạng thái) | Web + beta mobile, Free/Pro |
| Choreographic | KHÔNG (chỉ chuyển cảnh đội hình) | Có + cộng tác thời gian thực | Không rõ | Mobile (iOS/Android) |
| ArrangeUs | KHÔNG | Có (formation-first, preset) | Không | Mobile (iOS/Android) |

→ Chỉ **Choreoto** là đối thủ thật cho hướng mocap. Hai app kia là "vẽ đội hình"
thuần (đã commoditize) — KHÔNG cạnh tranh ở tầng bắt chuyển động. Điều này CỦNG CỐ
kết luận: đừng cạnh tranh mảng đội hình; giá trị của ta ở **chất lượng nguồn mocap**.

## 6. Prior-art học thuật lộ ra khi tìm (cần đọc cho phần Perception của luận văn)
- **DanceSculpt** (Tandfonline 2024): dựng lại vũ công 3D từ video — sát lõi mocap.
- **DanceCamAnimator** (arXiv 2409.14925): tổng hợp camera 3D cho múa theo keyframe —
  liên quan phần "góc nhìn/camera" của sequencer.
- **DanceCrafter** (arXiv): sinh vũ đạo điều khiển bằng text — tham chiếu, không trùng.
- (Đã có trong báo cáo: MAMMA 4-iPhone→SMPL-X, DanceNet3D 29 cam→3DGS.)

## 7. Kết luận điều chỉnh khung luận văn (chốt)
1. **Choreoto = sản phẩm thương mại gần nhất**, đã có mocap 1-cam + personal view →
   ta KHÔNG khai novelty ở tính năng app.
2. **Novelty = tầng perception + đánh giá**: bắt 2-camera cho múa, ĐO độ chính xác
   (MPJPE/PA-MPJPE/foot-slip trên múa thật), hướng dẫn đặt góc máy, sync+calib không
   genlock, pipeline MỞ tái lập được — những thứ sản phẩm đóng của Choreoto không công bố.
3. Web sequencer = **demonstrator** minh hoạ ứng dụng của nguồn mocap chất lượng cao,
   không phải đóng góp khoa học độc lập.

## 8. Việc theo dõi tiếp
- [ ] Đọc DanceSculpt + DanceCamAnimator, đưa vào "Công trình liên quan".
- [ ] Tìm số liệu độ chính xác Choreoto có công bố không (để làm mốc đối chứng).
- [x] Viết lại tuyên bố novelty trong `de-cuong-do-an-tot-nghiep.md` theo mục 7.
      → Đề cương §2.5 (không tuyên bố "đầu tiên") + §6 (novelty = hệ thống + khả
      dụng + đánh giá) đã đóng khung đúng; §5.4 bổ sung bằng chứng hình học định
      lượng cho tầng perception (thực nghiệm 2-view tổng hợp).
