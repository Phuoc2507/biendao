# Dự án: Sân khấu thẻ video (văn nghệ khoa) + nghiên cứu múa 3D

Mở phiên mới thì **đọc `BAN-GIAO.md` trước**, làm tiếp từ mục "Việc còn mở". Chi tiết lịch sử: `docs/ghi-chu-claude/lich-su-du-an.md`.

* Trả lời tiếng Việt, văn xuôi không dùng gạch ngang. Người dùng ghét bị hỏi nhiều: tự quyết theo mặc định hợp lý, làm xong thì báo.
* `git pull` trước khi làm; commit thẳng nhánh master rồi `git push` (github.com/Phuoc2507/biendao). Lời commit tiếng Việt, cuối có dòng Co-Authored-By của Claude.
* Không đụng `web/src/sync.ts`, `web/src/App.tsx`, `web/src/main.tsx`.
* Không tự tải mô hình ML, tạo hay xoá máy ảo đám mây khi chưa được người dùng đồng ý.
* Làm xong phải tự kiểm trong app (trình duyệt) và chạy test (`npm test` trong `web/`, `python -m pytest` ở gốc).
