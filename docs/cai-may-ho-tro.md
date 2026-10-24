# Cài máy hỗ trợ (RTX 5060) để Claude làm thay

Làm một lần trên máy có card. Sau đó điều khiển Claude ở máy đó từ xa (máy khác hoặc điện thoại), Claude tự cài, chạy video, sửa lỗi, đẩy bản cải tiến lên GitHub.

## Người làm (khoảng 20 phút)

1. Cài **Git** (git-scm.com) và **Node.js** bản LTS (nodejs.org). Cài **Miniconda** (Python 3.10) cho phần GPU.
2. Mở PowerShell, lấy code về:

   ```bash
   git clone https://github.com/Phuoc2507/biendao.git D:\bien
   ```

3. Cài app **Claude** (claude.ai/download), đăng nhập, mở tab **Code**, chọn thư mục `D:\bien`.
4. Bật **Remote Control** cho phiên đó để điều khiển từ claude.ai ở máy khác. Để máy bật và nối mạng, tắt chế độ ngủ khi cắm điện.
5. Nhắn cho Claude ở máy này câu dưới đây.

## Câu nhắn đầu tiên cho Claude

> Đây là máy hỗ trợ văn nghệ có RTX 5060. Đọc BAN-GIAO.md và docs/huong-dan-nguoi-3d-may-rtx.md. Cài web (npm install trong web/) và chạy test; cài môi trường GVHMR theo hướng dẫn (hỏi tôi trước khi tải mô hình); chạy thử một video thẻ ra .motion.json. Lỗi thì tự sửa, commit thẳng master và git push.

## Những việc Claude không làm thay được

* Đăng nhập GitHub lần đầu khi `git push` (cửa sổ hiện ra, người bấm đăng nhập).
* Đăng ký tài khoản SMPL, SMPL-X và bấm đồng ý điều khoản (giấy phép phi thương mại).
* Đồng ý cho Claude chạy lệnh trên máy: người dùng máy phải cho phép.

## Hai máy dùng chung code

Máy nào sửa xong thì `git push`; máy kia trước khi làm thì `git pull`. Claude ở cả hai máy đều làm được việc này nếu được nhắn.
