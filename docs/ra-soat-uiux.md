# Rà soát UI/UX: Sân khấu thẻ video

Ngày rà: 2026-10-12. Phạm vi: `web/src/stage/` (App, store, actions, model, clock, media, db, ui/*, stage.css), đối chiếu `docs/huong-dan-san-khau-the-video.md` và đặc tả `docs/superpowers/specs/2026-10-09-video-card-stage-design.md`. Lần rà này chỉ đọc mã, chưa chạy app; mục nào ghi "cần kiểm" là suy ra từ mã, chưa thử trên trình duyệt.

Người dùng đích: sinh viên tổ chức văn nghệ, không rành kỹ thuật, dùng laptop Chrome, chiếu lên tivi khi tập.

Ký hiệu:
- Cỡ việc: **S** (dưới 1 giờ), **M** (nửa ngày), **L** (từ 1 ngày trở lên).
- **[VÙNG media/clock]**, **[VÙNG duplicate]**, **[VÙNG autoplan]**: mục chạm vào phần hai agent khác đang sửa. Cần phối hợp hoặc làm sau khi họ merge.

---

## A. Nghiêm trọng

### A1. Ô số BPM, Rộng, Sâu kẹp giá trị ngay khi gõ, nên gần như không gõ tay được (S)
`ui/SidePanel.tsx:82-85` (BPM), `ui/SidePanel.tsx:361-366` (Rộng/Sâu sân khấu)

Mỗi phím gõ đều commit ngay một giá trị đã kẹp:
- Gõ BPM "120": phím "1" thành `max(30, 1)` = **30**, ô hiện "30". Gõ tiếp "2" thành "302" rồi bị kẹp còn 300. Người dùng không bao giờ gõ ra được 120.
- Gõ Rộng "12": phím "1" thành **4**, gõ tiếp "2" thành "42", tức sân khấu rộng 42 m (không có kẹp trên).
- Mỗi phím gõ còn là một bước hoàn tác.

Thuộc tính `min/max` của ô BPM (40–240) cũng không khớp với khoảng kẹp (30–300).

**Sửa:** dùng một ô số có nháp cục bộ, chỉ commit khi blur hoặc Enter:
```tsx
function NumField({ value, min, max, onCommit }: {...}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(",", "."));
    if (draft.trim() === "") onCommit(null);
    else if (Number.isFinite(n)) onCommit(Math.max(min, Math.min(max, n)));
    setDraft(null);
  };
  return <input type="text" inputMode="decimal" value={draft ?? (value ?? "")}
    onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setDraft(null); }} />;
}
```

### A2. Phím tắt chết sau khi bấm checkbox, thanh trượt hoặc ô chọn tốc độ. Trong Trình chiếu, mũi tên đổi tốc độ thay vì nhảy đội hình (S)
`ui/hooks.ts:23-28`, `ui/Present.tsx:88`, `ui/Timeline.tsx:184-185`

`isTyping` coi **mọi** `INPUT` và `SELECT` là đang gõ chữ. Bấm vào checkbox "Bám lưới", "Tên dưới mỗi người", thanh trượt "Cao thẻ" hay ô tốc độ thì focus nằm lại ở đó, và:
- Space không phát hoặc dừng nữa (checkbox bị bật/tắt thay vào đó).
- Ở Trình chiếu, chọn tốc độ 0.75× xong thì ←/→ đổi tốc độ, Space không phát. Đây đúng là lúc đang chiếu tivi cho cả đội xem.

**Sửa:**
```ts
const TEXT = new Set(["text", "number", "search", "email", "password", "url", "tel"]);
export const isTyping = (e: Event) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && TEXT.has((el as HTMLInputElement).type);
};
```
Thêm `onChange={(e) => { clock.setSpeed(...); e.currentTarget.blur(); }}` cho hai ô chọn tốc độ. Riêng phím Space khi focus đang ở một `<button>`: nên `blur()` nút sau khi bấm, hoặc gọi `preventDefault` ở keydown. Cần kiểm xem Chrome có vừa bật/tắt phát vừa kích hoạt nút hay không.

### A3. Video Chrome không đọc được (iPhone HEVC .mov) làm hỏng cả đợt nạp, thông báo không nói rõ cách xử lý (M) [VÙNG media/clock]
`actions.ts:381-394`, `actions.ts:280-308`, `media.ts:37-49`, `media.ts:63-81`

- Toàn bộ vòng nạp video nằm trong **một** `try`. Một tệp lỗi là các video sau không được nạp, và thông báo chỉ là "Lỗi khi nạp tệp: Không đọc được tệp media".
- Video HEVC từ iPhone có thể vẫn phát ra `loadedmetadata` (có tiếng) nhưng `videoWidth = 0`. App coi là thành công, nên thẻ trống hoặc đen, tỉ lệ khung rơi về 0.5 mặc định.
- Đặc tả §6 yêu cầu: "Thẻ báo 'Không phát được tệp này', không làm sập app". Hiện chưa làm.

**Sửa:**
- Bọc `try/catch` riêng cho **từng** video, gom tên tệp lỗi vào một thông báo cuối.
- Trong `registerVideo`, nếu `el.videoWidth === 0` thì ném lỗi rõ ràng: `Chrome không xem được hình của "${name}" (thường là video HEVC của iPhone). Hãy chạy công cụ thẻ video, hoặc đặt iPhone: Cài đặt ▸ Camera ▸ Định dạng ▸ Tương thích nhất.`
- Gỡ blob vừa `storeBlob` khi đăng ký video lỗi.

### A4. Mở dự án ở máy khác rồi thả lại video thì mất độ lệch đã căn tay (S)
`actions.ts:286-306`, `actions.ts:387-392`

Khi ghép video vào vũ công đã có `mediaName` trùng tên (đúng luồng "sang máy mới" trong hướng dẫn §4 Lưu), `attachVideo` tính lại `offsetSec`: lấy từ `.card.json`, tự khớp lại, hoặc đặt 0. Như vậy nó **ghi đè** độ lệch người dùng đã chỉnh bằng nút ±0.01 hay kéo dải video. Bài tập lại lệch nhịp mà không ai biết tại sao.

**Sửa:** truyền `target` vào `attachVideo`. Nếu `target.mediaName === file.name` và `target.durationSec > 0` thì giữ nguyên `offsetSec`/`alignConfident` của dự án, chỉ gắn `mediaId`.

### A5. Hoàn tác và mở dự án không đồng bộ bài nhạc (M) [VÙNG media/clock]
`actions.ts:479-485`, `App.tsx:66-69`, `media.ts:178-184`, `actions.ts:372-377`

- **Bài mới ▸ Hoàn tác:** `newProject` gọi `setMusic(null)`. Hoàn tác trả lại `musicId`, nhưng không ai nạp lại nhạc. Kết quả là mất sóng âm, bấm phát thì im lặng mà chạy bằng đồng hồ máy. Hộp xác nhận lại hứa "có thể Hoàn tác".
- **Thả nhạc mới ▸ Ctrl Z:** `project.musicId` quay về bài cũ nhưng `music.el` vẫn là bài mới.
- **Mở .choreo.json không có nhạc:** `loadMediaFor(null, …)` không làm gì, nên nhạc của bài trước vẫn phát.

`App.tsx` chỉ `resync()` khi `p.dancers` đổi.

**Sửa:** thêm một effect hoặc subscription theo `project.musicId`. Khi khác `music.id`, nạp bản ghi từ IndexedDB (`getMedia`) hoặc `setMusic(null)`. `newProject` thì không gọi `setMusic` trực tiếp nữa mà để effect đó lo.

### A6. Lỗi lưu bị ẩn trên laptop phổ biến; chưa xin lưu bền; thông báo đầy bộ nhớ bằng tiếng Anh (S)
`ui/TopBar.tsx:92-99`, `stage.css:115-116`, `actions.ts:399-401`, `actions.ts:417-421`

- `@media (max-width: 1240px) { .top .save { display:none } }` ẩn cả chữ "Lỗi lưu!". Laptop 1366 px khi chia đôi màn hình, hoặc cửa sổ không phóng to hết, sẽ **không bao giờ thấy lỗi lưu**.
- Lỗi lưu không đi kèm toast, không có gợi ý xuất JSON như đặc tả §6 yêu cầu.
- Chưa gọi `navigator.storage.persist()`, nên Chrome có thể tự xoá IndexedDB (cả video lẫn dự án) khi ổ đĩa đầy.
- Lỗi `QuotaExceededError` khi lưu video hiện nguyên văn tiếng Anh.

**Sửa:**
```css
@media (max-width:1240px){ .top .save:not(.error){display:none} }
```
```ts
// boot()
navigator.storage?.persist?.().catch(() => {});
// startAutosave .catch
.catch(() => { st().setUI({ saveState: "error" });
  st().notify("Không lưu được vào trình duyệt (có thể ổ đĩa đầy). Hãy dùng Tệp ▸ Lưu ra tệp để giữ bài.", { kind: "error" }); })
```
Đổi `err.name === "QuotaExceededError"` thành câu tiếng Việt. Có thể hiện dung lượng còn trống bằng `navigator.storage.estimate()` trong menu Tệp.

### A7. Delete/Backspace xoá cả đội hình khi người dùng đang chọn một vũ công (S)
`ui/shortcuts.ts:87-91`, `actions.ts:149`

Kéo một người trên sơ đồ sẽ tự đặt `selectedBlock` là đội hình hiện tại (`ensureHoldNow`). Người dùng chọn một bạn rồi bấm Delete vì nghĩ là "xoá bạn này", nhưng app xoá **cả đội hình** của mọi người. Backspace còn dễ bấm nhầm hơn. Có toast Hoàn tác nhưng chỉ hiện 6 giây.

**Sửa:** chỉ xoá đội hình khi không có vũ công nào đang được chọn, hoặc khi focus đang ở dải đội hình. Bỏ Backspace. Khi đang có người được chọn, báo: "Delete xoá đội hình đang chọn. Muốn xoá người, bấm thùng rác ở danh sách Vũ công."

---

## B. Nên sửa

### B1. Lựa chọn trỏ vào vũ công không còn nữa sau Hoàn tác, khiến mũi tên và phím M ném lỗi (S)
`store.ts:105-114`, `actions.ts:165-175`, `model.ts:537`, `model.ts:543`

Chuỗi gây lỗi: Thêm người (tự chọn người mới), Ctrl Z, rồi bấm mũi tên. Lúc này `cur[id]` là `undefined`, phép `cur[id][0]` ném TypeError, phím không có tác dụng gì. Lật hoặc Dàn đều cũng hỏng tương tự. Thanh HUD vẫn hiện "1 người".

**Sửa:** trong `undo`/`redo`/`load`, lọc `ui.selected` theo các id còn tồn tại, và đặt `selectedBlock = null` nếu khối đã mất. Nên phòng thêm trong `nudgeSelected` (`if (!cur[id]) continue`).

### B2. Thanh trượt "Cao thẻ", nút "Gõ nhịp" và ô BPM làm ngập lịch sử hoàn tác (S)
`ui/SidePanel.tsx:210-213`, `ui/SidePanel.tsx:89-95`

Kéo thanh trượt một lần tạo khoảng 20 bước hoàn tác. Lịch sử chỉ giữ 100 bước nên đẩy mất các thao tác xếp người thật. **Sửa:** `onPointerDown={() => st().beginGesture()}`, `onChange` dùng `st().live(...)`, `onPointerUp={() => st().endGesture()}`. Có thể tách thêm `liveDancer` không kèm `resync`. Với gõ nhịp, chỉ commit khi người dùng ngừng gõ khoảng 1.5 s.

### B3. Nạp N video tạo 2N+1 bước hoàn tác (M)
`actions.ts:302-306`, `actions.ts:376`

`attachVideo` gọi `addDancer`, đó là một commit, rồi `updateDancer`, thêm một commit nữa. Nhạc cũng là một commit riêng. Hoàn tác "lần nạp vừa rồi" phải bấm nhiều lần, có lúc giữa chừng lại ra vũ công tên "D3" chưa có video.

**Sửa:** thêm `st().batch(fn)`, chụp `past` một lần (giống `beginGesture` → `live` → `endGesture`), bọc cả `importFiles` vào đó và hiện toast "Đã nạp …" có nút Hoàn tác.

### B4. Mỗi lúc chỉ có một toast, thông báo quan trọng bị đè mất (S)
`store.ts:118-122`, `actions.ts:396-398`

Thả thư mục vừa có video khớp chưa chắc vừa có tệp lạ thì toast "Bỏ qua 2 tệp…" đè lên "3 video khớp nhạc chưa chắc…" ngay lập tức. **Sửa:** dùng hàng đợi toast (mảng, tối đa 3, xếp chồng), hoặc gộp `msgs` thành một thông báo nhiều dòng.

### B5. Video nạp trước nhạc thì đều hiện "⚠ chưa chắc", và không có nút "Khớp tất cả" (M) [VÙNG media/clock]
`actions.ts:289-296`, `actions.ts:372-378`

Thả video trước rồi mới thả nhạc (hoặc bắt đầu bằng nút "Chưa có video" rồi gắn dần) thì mọi video có `offsetSec=0` và `alignConfident=false`. Muốn khớp lại phải chọn từng người rồi bấm "Tự khớp". **Sửa:** khi nhạc vừa được nạp mà có video chưa từng khớp, tự hỏi "Khớp N video với nhạc mới?" hoặc tự chạy luôn. Thêm nút "Tự khớp tất cả" ở mục Nhạc.

### B6. Ctrl S tải ra một tệp mới mỗi lần bấm (S/M)
`ui/shortcuts.ts:28`, `actions.ts:455-460`

Sinh viên quen bấm Ctrl S liên tục, nên thư mục Downloads đầy `bai-mua (1).choreo.json`, `(2)`…, và Chrome có thể hỏi "tải nhiều tệp". Trong khi đó app đã tự lưu sẵn. **Sửa:** Ctrl S chỉ báo "Đã tự lưu trong trình duyệt ✓" và lưu ngay (bỏ debounce). Việc xuất tệp để ở menu, dùng `showSaveFilePicker` (Chrome có) để ghi đè đúng tệp đã chọn.

### B7. Màn chào không cho thấy nhạc đã nạp; thả mỗi bài nhạc thì vẫn ở màn chào (S)
`App.tsx:73-87`, `ui/EmptyState.tsx`

Màn chào chỉ dựa vào `dancers.length === 0`. Thả nhạc trước thì chỉ có một toast 3.5 s, màn hình không đổi, người dùng tưởng chưa nạp. **Sửa:** trong EmptyState hiện dòng "✓ Nhạc: tên bài (3:12). Giờ thả video từng người hoặc bấm Bắt đầu", và đổi nút ở bước 2 cho phù hợp.

### B8. Màn hẹp hoặc chia đôi màn hình: cột trái cố định, đầu dòng thời gian tràn, màn chào 2 cột chật (M)
`stage.css:36-44`, `stage.css:268`, `stage.css:328`, `store.ts:60`

- Cột trái luôn rộng 264 px. Lớp `.app.noside` có CSS nhưng **không chỗ nào dùng** (mã chết). Laptop 1366 px chia đôi còn khoảng 683 px, vùng chính chỉ còn khoảng 420 px.
- `.tl-head` không co. Dòng gợi ý dài ("Bấm khối đội hình để chọn · kéo mép…") đẩy nút phóng to/vừa khung ra ngoài khung nhìn.
- `.steps` ở màn chào luôn 2 cột.
- Chế độ xem mặc định chỉ chọn một lần lúc tải trang (`innerWidth >= 1280`), không đổi khi người dùng thay cỡ cửa sổ.

**Sửa:**
```css
@media (max-width: 900px){ .app{grid-template-columns:220px 1fr} .steps{grid-template-columns:1fr} }
.tl-head .dim{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```
Thêm nút ẩn/hiện cột trái dùng `.noside`. Khi cửa sổ hẹp hơn 900 px mà đang ở chế độ "Cả hai" thì tự chuyển sang "Sơ đồ".

### B9. Texture video: mỗi thẻ chép nguyên khung full-res lên GPU mỗi khung hình, bản nhân bản chép trùng lặp (M) [VÙNG media/clock] [VÙNG duplicate]
`ui/AudienceView.tsx:111-128`, `ui/AudienceView.tsx:153-166`

Video xếp chồng 1080×3840 thì mỗi thẻ cần khoảng 16 MB `drawImage` cộng `texImage2D` mỗi khung. Với 8–12 thẻ trên laptop chỉ có GPU tích hợp sẽ tụt khung hình và lệch tiếng. Bản nhân bản dùng chung `<video>` nhưng mỗi bản vẫn có canvas và texture riêng, chép lại cùng một khung.

**Sửa:**
- Giới hạn cỡ canvas (ví dụ cạnh dài tối đa 1024 px, `drawImage(v.el, 0, 0, cw, ch)`).
- Dùng chung texture theo `mediaId` (một Map đếm số tham chiếu, cập nhật một lần mỗi khung).
- Cân nhắc `requestVideoFrameCallback` để chỉ chép khi có khung mới.

Không quay lại dùng `VideoTexture` trực tiếp (xem bài học về khung rỗng ghi trong ghi chú của mã).

### B10. Thẻ Đội hình vẽ lại toàn bộ mỗi khung khi đang phát (S)
`ui/SidePanel.tsx:282`, `ui/SidePanel.tsx:298`

`FormationsTab` gọi `useTime()` chỉ để tô đội hình "cur". Kết quả là cả 7 hình mini SVG, các checkbox và ô sân khấu được vẽ lại 60 lần/giây. **Sửa:** tách một hook trả về chỉ số khối hiện tại, chỉ phát sự kiện khi chỉ số đó đổi:
```ts
const useHoldIndex = () => { const fs = useProject().formations;
  return useSyncExternalStore(subscribeClock, () => holdIndexAt(fs, clock.now())); };
```
`FormLane` (`Timeline.tsx:314`) và `TopBar.Clock` cũng làm tương tự được, nhưng ở đó ít phần tử nên không gấp.

### B11. Chỉnh độ lệch của bản nhân bản không có tác dụng gì thấy được (S) [VÙNG duplicate] [VÙNG media/clock]
`clock.ts:44-64`, `ui/SidePanel.tsx:166`, `ui/SidePanel.tsx:184`

Chỉ vũ công đầu tiên dùng một `<video>` mới điều khiển việc tua video đó. Ở bản "Lan 2", bấm ±0.01, kéo dải video hay bấm "Tự khớp" chỉ đổi con số, hình không đổi theo. **Sửa:** khi đổi `offsetSec` của một người thì áp cho mọi bản dùng chung `mediaId` (hoặc khoá ô chỉnh ở bản sao và ghi "dùng chung độ lệch với Lan"). Trong Inspector nên ẩn nút "Tự khớp" của bản sao.

### B12. Dòng thời gian lưu sai chiều cao vừa kéo (S)
`ui/Timeline.tsx:109-124`

Closure `up` dùng biến `height` của lần render lúc bắt đầu kéo, nên `localStorage` nhận chiều cao **trước khi kéo**. Tải lại trang thì chiều cao luôn chậm một nhịp. **Sửa:** giữ giá trị cuối trong biến `let last = h0`, cập nhật nó trong `move`, rồi lưu `last` ở `up`.

### B13. Mở app ở hai tab thì hai tab ghi đè dự án của nhau mà không báo (M)
`db.ts:49`, `actions.ts:410-423`

Cả hai tab cùng ghi khoá `"current"`. Người dùng hay mở thêm một tab để chiếu tivi, vậy là sửa ở tab này mất ở tab kia. **Sửa:** dùng `BroadcastChannel("choreo-stage")` hoặc `navigator.locks`. Nếu đã có tab khác đang mở thì hiện "App đang mở ở tab khác. Dùng tab này sẽ ghi đè" kèm nút "Dùng tab này".

### B14. Lúc khởi động: đọc dự án lỗi thì im lặng rồi tự lưu đè; "Đang mở…" không có tiến độ (S)
`actions.ts:425-443`, `App.tsx:71`

- `loadProject` lỗi (ví dụ IndexedDB bị tab khác chặn, hoặc `version` lạ) thì chỉ `console.warn`. Người dùng thấy màn chào và tưởng mất bài, thao tác tiếp theo sẽ ghi đè bản cũ.
- Nạp 12 video cùng lúc (mỗi video có thể mất 1.5 s vì `fixDuration`) mà chỉ có chữ "Đang mở…" mờ.

**Sửa:** báo lỗi bằng toast và tạm không autosave đến khi người dùng xác nhận. Trong lúc nạp, dùng `busy` có tiến độ `i/n`.

### B15. Trình chiếu: lỡ tay kéo chuột là lệch góc nhìn, không có nút đặt lại; `camReset` là mã chết (S)
`ui/Present.tsx:77`, `ui/AudienceView.tsx:413`, `store.ts:30`

Khi chiếu tivi, OrbitControls vẫn bật nên kéo chuột hay lăn bánh xe là góc nhìn đổi. `showTools=false` thì không còn nút về góc khán giả. `ui.camReset` không có chỗ nào tăng nó. **Sửa:** truyền `interactive` xuống để tắt `OrbitControls` (`enabled={interactive}`), hoặc thêm phím `C` hay nút "Góc khán giả" trong `.ctl` để tăng `camReset`.

### B16. Thả lại cùng tệp thì blob bị lưu thêm một bản trong IndexedDB (M) [VÙNG media/clock]
`media.ts:194-198`, `actions.ts:281`

Mỗi lần thả, `storeBlob` lại tạo một id mới. Thả lại cả thư mục thẻ để "gắn lại" là chiếm gấp đôi dung lượng cho đến lần khởi động sau. `replaceVideo` cũng không `forgetVideo` bản cũ, nên `<video>` và object URL cũ vẫn nằm trong RAM. **Sửa:** tạo khoá theo `name + size + lastModified`. Nếu đã có bản ghi trùng thì dùng lại id cũ.

### B17. Chữ trên dải video "chưa có video: thả tệp vào để gắn" chỉ sai cách làm (S)
`ui/Timeline.tsx:431`

Thả tệp vào dải đó **không** gắn video cho người đó. Lớp thả toàn cửa sổ ghép theo tên, hoặc theo người đầu tiên chưa có video. **Sửa:** cho `VidLane` bắt sự kiện `onDrop` riêng rồi gọi `replaceVideo(d.id, file)`, hoặc đổi chữ thành "chưa có video: chọn người rồi bấm Gắn video".

### B18. Một tệp .json lạ trong thư mục làm hỏng cả lần nạp (S)
`media.ts:235-237`, `actions.ts:368-371`

Mọi tệp `.json` không phải `.card.json` đều bị coi là dự án. `openProjectFile` ném lỗi thì video và nhạc đi cùng cũng không được nạp. **Sửa:** chỉ nhận `*.choreo.json`, hoặc kiểm `version`/`dancers` ngay lúc phân loại. Tệp không hợp lệ thì cho vào `unknown`.

### B19. "Tự khớp" không bắt lỗi (S)
`actions.ts:336-361`

Có `finally` nhưng không có `catch`. Nếu `fetch(blob)` hay `decodeAudio` hỏng thì lỗi thành unhandled rejection, người dùng không thấy thông báo nào. **Sửa:** thêm `catch (e) { st().notify("Không khớp được: …", { kind: "error" }) }`.

### B20. Khả năng tiếp cận (M)
- Thanh tab `role="tablist"` nhưng các nút thiếu `role="tab"` và `aria-selected` (`ui/SidePanel.tsx:27-37`).
- Dòng vũ công, dòng đội hình, dòng cảnh báo là `div onClick`, không Tab tới được, không bấm được bằng Enter (`ui/SidePanel.tsx:122-131`, `300-307`, `390-397`). Nên dùng `<button>` hoặc thêm `tabIndex=0` và `onKeyDown`.
- Các nút hành động của dòng vũ công chỉ hiện khi rê chuột (`stage.css:195-196`), người dùng bàn phím không thấy. Thêm `.ditem:focus-within .acts{display:flex}`.
- Modal hướng dẫn: không chuyển focus vào, không giữ focus trong modal, thiếu `aria-modal`, nút đóng thiếu `aria-label` (`ui/Overlays.tsx:159-161`).
- Màu `--dim` #5d6778 trên nền #161a21 chỉ đạt khoảng **3.1:1**, dưới chuẩn AA (4.5:1) cho chữ 11–12 px. Màu này dùng cho rất nhiều gợi ý (`stage.css:9`). Đề xuất nâng lên khoảng `#7a8496` (≈4.6:1).
- Ô chọn màu có `title` là mã hex "#ff5d6c", vô nghĩa với người dùng (`ui/SidePanel.tsx:217-222`). Nên thêm tên màu và `aria-pressed`.

### B21. Đồng hồ: phát lại sau khi nhạc đã hết thì dừng ngay (S) [VÙNG media/clock]
`clock.ts:80`, `clock.ts:109-116`

Gặp khi video hoặc đội hình kéo dài quá bài nhạc. Nhạc đã `ended`, người dùng tua tới quá cuối nhạc rồi bấm phát. `play()` không đặt lại `currentTime` (vì `t >= d`), nên `m.ended` vẫn là true và `tick` gọi `pause()` ngay khung đầu. **Sửa:** chỉ kiểm `m.ended` khi `t < m.duration`.

---

## C. Đánh bóng

| # | File:dòng | Vấn đề | Đề xuất | Cỡ |
|---|---|---|---|---|
| C1 | `ui/Timeline.tsx:145` | Nút "Bám" (tự cuộn theo vạch phát) trùng chữ với "Bám lưới" | Đổi thành "Tự cuộn" | S |
| C2 | `ui/hooks.ts:33` và `SidePanel.tsx:120,193`, `Timeline.tsx:467` | Dấu thập phân lẫn lộn: "1,5 m" chỗ này, "+0.25 s" chỗ khác | Thống nhất dấu phẩy kiểu Việt (`toFixed(2).replace(".", ",")`) | S |
| C3 | `ui/SidePanel.tsx:204` | "Video đã xoá phông (nửa dưới là mặt nạ)" là thuật ngữ khó hiểu | "Thẻ đã tách nền (tệp .card.mp4)" | S |
| C4 | `ui/TopBar.tsx:96` | "Lỗi lưu!" không nói phải làm gì | "Không lưu được", bấm vào thì mở gợi ý Lưu ra tệp | S |
| C5 | `ui/TopBar.tsx:84` | "Mở app nhân vật 3D cũ" gây rối cho người dùng đích | Ẩn sau `?dev` hoặc bỏ đi | S |
| C6 | `ui/TopBar.tsx:36-44` | Esc không đóng menu Tệp | Bắt Esc khi `open` | S |
| C7 | `ui/Present.tsx:30-32` | "Tiếp: Đội hình 3 trong 3.2 s" đổi số mỗi khung, mà dân múa đếm theo phách | Khi có BPM thì hiện "còn 1×8 + 4" (`fmtCounts`) | S |
| C8 | `ui/AudienceView.tsx:283`, `stage.css:371-384` | Sàn nâu tối, phông tối, máy chiếu dễ bị bệt màu | Thêm chế độ "Sáng cho máy chiếu" (sàn sáng, đèn mạnh hơn) | M |
| C9 | `ui/TopBar.tsx:116-120` | Xoá trắng tên bài thì ô hiện rỗng (không lưu, cũng không trả lại tên cũ) | Khi blur mà rỗng thì đặt lại `value = p.title` | S |
| C10 | `ui/Overlays.tsx:24-38` | Lớp "Đang xử lý" không huỷ được, khớp nhạc nhiều video lâu | Thêm nút "Dừng" (cờ huỷ kiểm giữa các video) | M |
| C11 | `actions.ts:329-334`, `media.ts:113-120` [VÙNG media] | Khớp nhạc giải mã **toàn bộ** âm thanh của video gốc (iPhone 500 MB) nên tab có thể tràn RAM | Chỉ giải mã đoạn đầu, hoặc dùng `.card.json` có sẵn `offsetSec` | M |
| C12 | `ui/AudienceView.tsx:194,227` | Kéo thẻ ở khung khán giả không có Alt để bỏ bám lưới, không có Cmd (metaKey), khác với sơ đồ | Làm giống `PlanView` | S |
| C13 | `docs/huong-dan-san-khau-the-video.md` (mục Trình chiếu) | Không nói phải kéo cửa sổ Chrome sang tivi (màn hình mở rộng) **trước** khi bấm F | Thêm 1–2 câu hướng dẫn và mẹo phím Win+Shift+→ | S |
| C14 | `ui/SidePanel.tsx:83` | BPM `min=40 max=240` nhưng kẹp 30–300 | Thống nhất (gộp với A1) | S |
| C15 | `actions.ts:417` | Tự lưu chờ 400 ms, đóng tab ngay sau khi sửa thì mất thao tác cuối | Lưu ngay ở `pagehide` và `visibilitychange` | S |
| C16 | `ui/shortcuts.ts:24-33` | Ctrl Z, Ctrl A vẫn chạy trong Trình chiếu nên có thể hoàn tác mà không thấy gì | Bỏ qua Ctrl khi `presenting` (trừ Ctrl S) | S |
| C17 | `ui/Overlays.tsx:118-152` | Bảng phím không có mục cho Trình chiếu (PageUp/PageDown, ←/→ nhảy đội hình) | Thêm nhóm "Khi trình chiếu" | S |

---

## Ghi chú phối hợp với các agent đang sửa song song

- **media.ts / clock.ts:** A3, A5, B5, B9 (một phần), B11, B16, B21, C11 đều chạm vào vùng này. A5 (đồng bộ nhạc theo `musicId`) nên đặt ở `App.tsx` hoặc `actions.ts` để ít đụng `media.ts`.
- **duplicate/canon:** B9 (texture dùng chung theo `mediaId`), B11 (độ lệch của bản sao).
- **autoplan (tự chia đội hình):** chưa thấy mã trong lần rà này. Nếu autoplan tạo nhiều đội hình trong một lần bấm thì nên dùng helper `batch` ở B3 để Hoàn tác một bước là gỡ hết. B1 (lọc lựa chọn sau Hoàn tác) và A7 (Delete) cũng ảnh hưởng tới luồng autoplan.
